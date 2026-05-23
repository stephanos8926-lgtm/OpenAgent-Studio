import fs from 'fs';
import path from 'path';
import { ProcessManager } from './ProcessManager.js';
import { ISystemDB, CronLog } from './db.js';

export interface CronJobConfig {
  id: string;
  schedule: string; // "*/10 * * * * *" (Second, Minute, Hour, Day of Month, Month, Day of Week)
  description: string;
  command: string;
}

/**
 * SuperOS Job Scheduling Daemon
 */
export class CronDaemon {
  private configPath: string;
  private processManager: ProcessManager;
  private db: ISystemDB;
  private jobs: CronJobConfig[] = [];
  private logPath: string;
  private intervalHandle: NodeJS.Timeout | null = null;

  constructor(processManager: ProcessManager, db: ISystemDB) {
    this.processManager = processManager;
    this.db = db;
    this.configPath = path.join(process.cwd(), '.super', 'config', 'crontab.json');
    this.logPath = path.join(process.cwd(), '.super', 'logs', 'cron.log');
    
    // Ensure logs folder exists
    const logDir = path.dirname(this.logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  /**
   * Loads configurations from crontab file
   */
  public loadCrontab(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf8');
        this.jobs = JSON.parse(raw);
        this.writeLog(`[CronDaemon] Loaded ${this.jobs.length} scheduled cron jobs from config.`);
      } else {
        this.writeLog(`[CronDaemon] crontab configuration file missing at ${this.configPath}. Free load.`);
      }
    } catch (e: any) {
      this.writeLog(`[CronDaemon] Error reading cron jobs list: ${e.message}`);
    }
  }

  /**
   * Starts the 1-second system clock evaluation heartbeat
   */
  public start(): void {
    if (this.intervalHandle) return;
    this.writeLog('[CronDaemon] Cron job daemon heartbeat pipeline initialized.');
    
    this.intervalHandle = setInterval(() => {
      this.tick();
    }, 1000);
  }

  /**
   * Gracefully shuts down cron processing
   */
  public stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      this.writeLog('[CronDaemon] Cron processing daemon stopped.');
    }
  }

  /**
   * Checks jobs against current timestamp values
   */
  private tick(): void {
    const now = new Date();
    const second = now.getSeconds();
    const minute = now.getMinutes();
    const hour = now.getHours();
    const date = now.getDate();
    const month = now.getMonth() + 1;
    const dayOfWeek = now.getDay();

    for (const job of this.jobs) {
      if (this.matchesSchedule(job.schedule, second, minute, hour, date, month, dayOfWeek)) {
        this.triggerJob(job).catch(() => {});
      }
    }
  }

  /**
   * Expression matcher for Standard and Second-level Cron syntax
   */
  private matchesSchedule(
    schedule: string,
    second: number,
    minute: number,
    hour: number,
    date: number,
    month: number,
    dayOfWeek: number
  ): boolean {
    const fields = schedule.split(/\s+/);
    if (fields.length < 5) return false;

    // Standard 5 fields can default second check to 0
    let secMatch = true;
    let minField = fields[0];
    let hrField = fields[1];
    let dateField = fields[2];
    let moField = fields[3];
    let dowField = fields[4];

    if (fields.length >= 6) {
      secMatch = this.matchesField(fields[0], second);
      minField = fields[1];
      hrField = fields[2];
      dateField = fields[3];
      moField = fields[4];
      dowField = fields[5];
    } else {
      secMatch = (second === 0); // Minute level runs on top of minute
    }

    return (
      secMatch &&
      this.matchesField(minField, minute) &&
      this.matchesField(hrField, hour) &&
      this.matchesField(dateField, date) &&
      this.matchesField(moField, month) &&
      this.matchesField(dowField, dayOfWeek)
    );
  }

  private matchesField(field: string, value: number): boolean {
    if (field === '*') return true;
    
    // Slash match (increment steps e.g. "*/10")
    if (field.startsWith('*/')) {
      const step = parseInt(field.substring(2), 10);
      return !isNaN(step) && value % step === 0;
    }
    
    // Specific numeric value match
    const num = parseInt(field, 10);
    if (!isNaN(num)) {
      return num === value;
    }

    return false;
  }

  /**
   * Spawns a scheduled trigger routine on Process table and DB logs
   */
  private async triggerJob(job: CronJobConfig): Promise<void> {
    const logTime = new Date().toISOString();
    this.writeLog(`[CronDaemon] Initiating scheduled system task: '${job.id}' (${job.command})`);
    
    // Spawn corresponding process tree handle
    const pMeta = await this.processManager.spawn(`cron:${job.id} --run`, 1);
    
    // Simulating job execution logs and telemetry
    setTimeout(async () => {
      let exitCode = 0;
      let status = 'SUCCESS';
      let outcomeText = `Job completed successfully. System status stable. Code ${exitCode}.`;

      if (job.command === 'syscheck') {
        outcomeText = `Syscheck completed. Clean memory registers. Active PIDs count: ${this.processManager.getActivePids().length}`;
      } else if (job.command === 'checkpoint_fs') {
        outcomeText = `VFS Snapshot serialized. Committed 15 virtual file nodes to JSON.`;
      } else if (job.command === 'logrotate') {
        outcomeText = `Logrotate processed. Rotated 3 syslog streams, truncated older entries.`;
      } else if (job.id === 'cron_vm_job') {
        // VM calculation simulation
        exitCode = 0;
        outcomeText = `[VM RUNTIME] Bytecode trace executing successfully. PID: ${pMeta.pid}. Cycle count: 42. Output: Metric R1=500`;
      }

      // Log to file
      this.writeLog(`[CronDaemon] Task accomplished: '${job.id}' (PID ${pMeta.pid}). Output: ${outcomeText}`);

      // Log to relational central database
      const cLog: CronLog = {
        jobId: job.id,
        triggerTime: logTime,
        status,
        exitCode,
        logOutput: outcomeText
      };
      await this.db.logCron(cLog);

      // Clean running process tree row
      await this.processManager.terminate(pMeta.pid);
    }, 3000);
  }

  private writeLog(text: string): void {
    const formatted = `[${new Date().toISOString()}] ${text}\n`;
    fs.appendFileSync(this.logPath, formatted, 'utf8');
  }

  public getJobs(): CronJobConfig[] {
    return this.jobs;
  }
}
export default CronDaemon;
