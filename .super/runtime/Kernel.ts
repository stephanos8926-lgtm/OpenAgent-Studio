import fs from 'fs';
import path from 'path';
import { ISystemDB } from './db.js';
import { VirtualFilesystem } from './VFS.js';
import { ProcessManager } from './ProcessManager.js';
import { CronDaemon } from './CronDaemon.js';

export type OSState = 'BOOTING' | 'RUNNING' | 'SHUTTING_DOWN' | 'HALTED';

/**
 * SuperOS Main Operating System Kernel
 * Coordinates Runlevels, Boot stages, device mountpoints and Daemon heartbeats
 */
export class Kernel {
  private db: ISystemDB;
  private vfs: VirtualFilesystem;
  private processManager: ProcessManager;
  private cronDaemon: CronDaemon;
  
  private currentRunlevel = 0;
  private systemState: OSState = 'HALTED';
  private bootLogPath: string;
  private syslogPath: string;
  private tickIntervalHandle: NodeJS.Timeout | null = null;

  constructor(
    db: ISystemDB,
    vfs: VirtualFilesystem,
    processManager: ProcessManager,
    cronDaemon: CronDaemon
  ) {
    this.db = db;
    this.vfs = vfs;
    this.processManager = processManager;
    this.cronDaemon = cronDaemon;
    
    this.bootLogPath = path.join(process.cwd(), '.super', 'logs', 'boot.log');
    this.syslogPath = path.join(process.cwd(), '.super', 'logs', 'syslog');

    // Assure directory structure exists
    const logDir = path.dirname(this.bootLogPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  /**
   * Orchestrates Stage 1 & Stage 2 Bootloader procedures transitioning to Target Runlevel
   */
  public async boot(targetRunlevel = 3): Promise<void> {
    if (this.systemState !== 'HALTED') {
      throw new Error(`[Kernel Panic] Attempted to boot a system already in state: ${this.systemState}`);
    }

    this.systemState = 'BOOTING';
    this.writeBootLog('\n─────────────────── STARTING SYSTEM BOOT ───────────────────');
    this.writeBootLog('Initializing SuperOS Stage 1 Bootloader: loading GRUB modules...');
    this.writeBootLog('Kernel payload mapped. Probing CPU architectures and page indices...');
    
    // Register Boot record inside relational central database
    await this.db.logBoot({
      timestamp: new Date().toISOString(),
      runlevel: targetRunlevel,
      description: `Init boot cycle targeting level ${targetRunlevel}.`
    });

    // Mount System Virtual directories
    this.writeBootLog('Mounting filesystems: virtual /proc directories mapping dynamically...');
    await this.vfs.mkdir('/proc');
    await this.vfs.mkdir('/bin');
    await this.vfs.mkdir('/etc');
    await this.vfs.mkdir('/tmp');
    await this.vfs.mkdir('/var/log');

    // Inject base config files into the Virtual OS File tree
    this.writeBootLog('Configuring system environment constants: linking /etc/hosts, /etc/resolv.conf');
    await this.vfs.writeFile('/etc/hosts', '127.0.0.1  localhost\n10.0.0.1   superos-virtual-node\n');
    await this.vfs.writeFile('/etc/resolv.conf', 'nameserver 8.8.8.8\nnameserver 8.8.4.4\n');
    await this.vfs.writeFile('/etc/version', 'SuperOS 1.0.0-LTS (Kernel v6.5.0)\n');

    // Phase transition to selected runlevel
    await this.transitionToRunlevel(targetRunlevel);
    
    this.systemState = 'RUNNING';
    this.writeBootLog('────────────────── BOOT PROCESS ACCOMPLISHED ──────────────────');
    this.writeSyslog('[Kernel] Init system online. All virtual microservices healthy.');
    
    // Launch regular Kernel Tick loops (telemetry simulation and resources fluctuation)
    this.startKernelTicks();
  }

  /**
   * Coordinates Runlevel configuration changes
   */
  public async transitionToRunlevel(runlevel: number): Promise<void> {
    const previous = this.currentRunlevel;
    this.writeBootLog(`Entering execution Target Runlevel: [Runlevel ${runlevel}]`);
    
    // Runlevel 0: Terminate system
    if (runlevel === 0) {
      await this.shutdownProcedure();
      this.currentRunlevel = 0;
      return;
    }

    // Runlevel 1: Single user diagnostics mode
    if (runlevel === 1) {
      this.writeBootLog('[Single-User Mode] Network listeners suspended. Terminal locked strictly to single active maintenance console.');
      this.cronDaemon.stop();
      this.currentRunlevel = 1;
      return;
    }

    // Runlevel 3: Full Multi-User CLI (Default active daemon operations)
    if (runlevel === 3) {
      this.writeBootLog('[Multi-User CLI] Launching network configurations, device nodes, and crontabs...');
      
      // Load cron system schedules
      this.cronDaemon.loadCrontab();
      this.cronDaemon.start();

      this.currentRunlevel = 3;
      return;
    }

    // Runlevel 6: Hot transition reboot pipeline
    if (runlevel === 6) {
      this.writeBootLog('Initiating System Reboot Sequence (Runlevel 6)...');
      await this.shutdownProcedure();
      this.currentRunlevel = 0;
      this.systemState = 'HALTED';
      
      // Auto-retrigger boot sequence immediately
      await this.boot(3);
      return;
    }

    throw new Error(`[Kernel Panic] Requested Runlevel '${runlevel}' is unrecognized. Target levels are limited to: (0, 1, 3, 6)`);
  }

  /**
   * Graceful service teardowns saving VFS buffers
   */
  private async shutdownProcedure(): Promise<void> {
    this.systemState = 'SHUTTING_DOWN';
    this.writeBootLog('SIGTERM dispatched to all active worker processes...');
    this.writeBootLog('Deactivating Job Scheudlers & Cron Daemons...');
    
    this.cronDaemon.stop();
    await this.processManager.clearAll();
    this.stopKernelTicks();

    this.writeBootLog('Commiting Virtual Filesystem snapshot caches to primary SQLite database registers...');
    // Simulated flushing write blocks ...
    
    this.writeBootLog('Unmounting root directories. Virtual /proc tables deleted.');
    this.writeBootLog('ACPI: Powering down CPU matrices. System halted.');
    
    await this.db.logBoot({
      timestamp: new Date().toISOString(),
      runlevel: 0,
      description: 'System completely halted safely.'
    });

    this.systemState = 'HALTED';
  }

  /**
   * Spawns core telemetry heartbeat
   */
  private startKernelTicks(): void {
    if (this.tickIntervalHandle) return;
    this.tickIntervalHandle = setInterval(() => {
      // Fluctuate CPU/Memory loads of all process nodes
      this.processManager.tick();
      this.writeSyslog(`[Kernel Heartbeat] CPU: ${(Math.random() * 12 + 1).toFixed(1)}% | RAM: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)}MB / 128MB`);
    }, 5000);
  }

  /**
   * Cancels telemetry ticks
   */
  private stopKernelTicks(): void {
    if (this.tickIntervalHandle) {
      clearInterval(this.tickIntervalHandle);
      this.tickIntervalHandle = null;
    }
  }

  private writeBootLog(text: string): void {
    const formatted = `[${new Date().toISOString()}] ${text}\n`;
    fs.appendFileSync(this.bootLogPath, formatted, 'utf8');
  }

  private writeSyslog(text: string): void {
    const formatted = `[${new Date().toISOString()}] ${text}\n`;
    fs.appendFileSync(this.syslogPath, formatted, 'utf8');
  }

  public getRunlevel(): number {
    return this.currentRunlevel;
  }

  public getSystemState(): OSState {
    return this.systemState;
  }
}
export default Kernel;
