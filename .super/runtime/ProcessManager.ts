import { ISystemDB, ProcessLog } from './db.js';

export interface ProcessMeta {
  pid: number;
  ppid: number;
  command: string;
  status: 'RUNNING' | 'SLEEPING' | 'ZOMBIE' | 'STOPPED';
  cpu: number;
  memory: number; // in Kilobytes
  startTime: string;
  cycleBudget?: number;
}

/**
 * SuperOS Process Table and Lifecycle Manager
 */
export class ProcessManager {
  private db: ISystemDB;
  private pidsTable = new Map<number, ProcessMeta>();
  private pidCounter = 100; // Application PIDs start at 100

  constructor(db: ISystemDB) {
    this.db = db;
    // Add PID 1 (init / Kernel parent system process) by default
    this.spawnInitProcess();
  }

  private spawnInitProcess() {
    const initProc: ProcessMeta = {
      pid: 1,
      ppid: 0,
      command: 'sbin/init',
      status: 'RUNNING',
      cpu: 0.1,
      memory: 2048, // 2MB
      startTime: new Date().toISOString()
    };
    this.pidsTable.set(1, initProc);
    this.syncProcessToDB(initProc).catch(() => {});
  }

  /**
   * Spawns a new process entry
   */
  public async spawn(command: string, ppid = 1, budget = 1000): Promise<ProcessMeta> {
    const pid = this.pidCounter++;
    
    const proc: ProcessMeta = {
      pid,
      ppid,
      command,
      status: 'RUNNING',
      cpu: Math.random() * 5 + 1, // Simulated CPU load
      memory: Math.floor(Math.random() * 1024 + 512), // KBs
      startTime: new Date().toISOString(),
      cycleBudget: budget
    };

    this.pidsTable.set(pid, proc);
    await this.syncProcessToDB(proc);
    return proc;
  }

  /**
   * Terminates or transposes a process to ZOMBIE or dead.
   */
  public async terminate(pid: number): Promise<void> {
    if (pid === 1) {
      throw new Error('[Kernel Exception] SIGKILL forbidden on PID 1 (init PID). Terminating parent system process halts operating state.');
    }
    const proc = this.pidsTable.get(pid);
    if (proc) {
      proc.status = 'ZOMBIE';
      proc.cpu = 0;
      await this.syncProcessToDB(proc);
      
      // Delay deletion to represent zombie tracking cleanup period
      setTimeout(async () => {
        this.pidsTable.delete(pid);
        await this.db.deleteProcess(pid);
      }, 5000);
    }
  }

  /**
   * Clear all simulated workloads except init
   */
  public async clearAll(): Promise<void> {
    const pids = Array.from(this.pidsTable.keys());
    for (const pid of pids) {
      if (pid !== 1) {
        this.pidsTable.delete(pid);
      }
    }
    await this.db.clearProcesses();
    const init = this.pidsTable.get(1);
    if (init) await this.syncProcessToDB(init);
  }

  /**
   * Sync active process blocks to WAL Database structure
   */
  private async syncProcessToDB(proc: ProcessMeta): Promise<void> {
    const log: ProcessLog = {
      pid: proc.pid,
      ppid: proc.ppid,
      command: proc.command,
      status: proc.status,
      cpu: proc.cpu,
      memory: proc.memory,
      startTime: proc.startTime
    };
    await this.db.saveProcess(log);
  }

  /**
   * Evaluates process telemetry readings (re-simulating random resources usage shifts)
   */
  public tick(): void {
    for (const [pid, proc] of this.pidsTable.entries()) {
      if (pid === 1) continue;
      if (proc.status === 'RUNNING') {
        // Dynamic shifting CPU/Memory telemetry to simulate live machine resources consumption
        proc.cpu = parseFloat((Math.random() * 12 + 1).toFixed(1));
        const deltaMem = Math.floor(Math.random() * 40 - 20); // fluctuate meme memory size
        proc.memory = Math.max(256, proc.memory + deltaMem);
        this.syncProcessToDB(proc).catch(() => {});
      }
    }
  }

  /**
   * Expose list of live active Process IDs
   */
  public getActivePids(): number[] {
    return Array.from(this.pidsTable.keys());
  }

  public getProcessList(): ProcessMeta[] {
    return Array.from(this.pidsTable.values());
  }
}
export default ProcessManager;
