import fs from 'fs';
import path from 'path';
import { getDatabase, ISystemDB, OSBootLog, CronLog } from './db.js';
import { VirtualFilesystem, MemoryFileSystemAdapter } from './VFS.js';
import { ProcessManager, ProcessMeta } from './ProcessManager.js';
import { CronDaemon } from './CronDaemon.js';
import { VirtualMachine, Instruction } from './VM.js';
import { SuperCompiler } from './Compiler.js';

/**
 * SuperOS Master System Orchestrator (Hypervisor API)
 * Coordinates and exposes API vectors for all subsystems
 */
export class SuperOS {
  private static instance: SuperOS | null = null;

  public db!: ISystemDB;
  public vfs!: VirtualFilesystem;
  public processManager!: ProcessManager;
  public cronDaemon!: CronDaemon;
  public kernel!: any; // Dynamically avoiding circular typing on boot-loaded loaders
  public vm!: VirtualMachine;

  private isStarted = false;

  private constructor() {}

  /**
   * Singleton pattern to prevent duplicate DB locks on simultaneous UI/API hooks
   */
  public static async getInstance(): Promise<SuperOS> {
    if (!SuperOS.instance) {
      SuperOS.instance = new SuperOS();
      await SuperOS.instance.bootstrap();
    }
    return SuperOS.instance;
  }

  /**
   * Cold start bootstrapping of absolute system pipelines
   */
  private async bootstrap(): Promise<void> {
    if (this.isStarted) return;

    // 1. Initialize DB Persistence
    this.db = await getDatabase();

    // 2. Initialize Process Manager
    this.processManager = new ProcessManager(this.db);

    // 3. Initialize VFS running in RAM Adapter by default
    const ramAdapter = new MemoryFileSystemAdapter();
    this.vfs = new VirtualFilesystem(ramAdapter, () => this.processManager.getActivePids());

    // 4. Initialize Cron Daemon
    this.cronDaemon = new CronDaemon(this.processManager, this.db);

    // 5. Initialize Virtual Machine CPU simulator
    this.vm = new VirtualMachine();

    // 6. Dynamic lazy loading to resolve physical circular boot bindings
    const { Kernel } = await import('./Kernel.js');
    this.kernel = new Kernel(this.db, this.vfs, this.processManager, this.cronDaemon);

    this.isStarted = true;
  }

  /**
   * Primary boot execution
   */
  public async powerOn(): Promise<void> {
    if (this.kernel.getSystemState() === 'HALTED') {
      await this.kernel.boot(3);
    }
  }

  /**
   * Clean power down sequence
   */
  public async powerOff(): Promise<void> {
    if (this.kernel.getSystemState() === 'RUNNING') {
      await this.kernel.transitionToRunlevel(0);
    }
  }

  /**
   * Soft reload lifecycle transition
   */
  public async reboot(): Promise<void> {
    if (this.kernel.getSystemState() === 'RUNNING') {
      await this.kernel.transitionToRunlevel(6);
    }
  }

  /**
   * Compiles and executes custom assembly text directly on our CPU
   */
  public async executeAssembly(assemblyCode: string, budget = 200): Promise<{
    pid: number;
    cycles: number;
    stdout: string[];
    registers: number[];
    isCrashed: boolean;
  }> {
    // 1. Spawning VM process runner entry
    const proc = await this.processManager.spawn('bin/vmasm --execute', 1, budget);
    
    try {
      // 2. Compiler execution phase
      const instructions = SuperCompiler.compile(assemblyCode);
      
      // 3. Load program and run CPU cycles
      this.vm.loadProgram(instructions);
      const endState = this.vm.run(budget);

      // Save execution data to syslog stream
      this.kernel.writeSyslog(`[VM execution] Assembly CPU task completed. PID: ${proc.pid}, Cycles: ${endState.cycles}`);

      // Gracefully clear process entry
      await this.processManager.terminate(proc.pid);

      return {
        pid: proc.pid,
        cycles: endState.cycles,
        stdout: endState.stdout,
        registers: endState.registers,
        isCrashed: endState.halted && endState.stdout.some(line => line.includes('PANIC') || line.includes('ERROR'))
      };
    } catch (e: any) {
      await this.processManager.terminate(proc.pid);
      return {
        pid: proc.pid,
        cycles: 0,
        stdout: [`[COMPILER ERROR] Compilation aborted: ${e.message}`],
        registers: [0, 0, 0, 0],
        isCrashed: true
      };
    }
  }

  /**
   * Read physical log files
   */
  public readLogFile(pPath: string, maxLength = 50): string[] {
    const targetPath = path.join(process.cwd(), '.super', 'logs', pPath);
    if (!fs.existsSync(targetPath)) return [];
    try {
      const text = fs.readFileSync(targetPath, 'utf8');
      const lines = text.split('\n').filter(Boolean);
      return lines.slice(-maxLength); // Return tail lines
    } catch {
      return [];
    }
  }

  /**
   * Read the persistent DB boot metrics table
   */
  public async queryBootHistory(): Promise<OSBootLog[]> {
    return this.db.getBootLogs();
  }

  /**
   * Read historical cron scheduler log logs from relational schema
   */
  public async querySchedulerLogs(): Promise<CronLog[]> {
    return this.db.getCronLogs();
  }
}
export default SuperOS;
