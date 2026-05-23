import fs from 'fs';
import path from 'path';

// Define DB Log Structure
export interface OSBootLog {
  id?: number;
  timestamp: string;
  runlevel: number;
  description: string;
}

export interface ProcessLog {
  pid: number;
  ppid: number;
  command: string;
  status: string; // 'RUNNING' | 'SLEEPING' | 'ZOMBIE' | 'STOPPED'
  cpu: number;
  memory: number;
  startTime: string;
}

export interface CronLog {
  id?: number;
  jobId: string;
  triggerTime: string;
  status: string; // 'SUCCESS' | 'FAILURE' | 'RUNNING'
  exitCode: number;
  logOutput: string;
}

export interface VFSRegistry {
  path: string;
  content: string;
  mimeType: string;
  size: number;
  isDirectory: number; // 0 | 1
  updatedAt: string;
}

// Database interface for the OS runtime
export interface ISystemDB {
  initialize(): Promise<void>;
  logBoot(entry: OSBootLog): Promise<number>;
  getBootLogs(): Promise<OSBootLog[]>;
  saveProcess(proc: ProcessLog): Promise<void>;
  getProcesses(): Promise<ProcessLog[]>;
  deleteProcess(pid: number): Promise<void>;
  clearProcesses(): Promise<void>;
  logCron(log: CronLog): Promise<number>;
  getCronLogs(): Promise<CronLog[]>;
  saveVFSFile(file: VFSRegistry): Promise<void>;
  loadVFSFiles(): Promise<VFSRegistry[]>;
  deleteVFSFile(filePath: string): Promise<void>;
}

/**
 * Robust JSON-WAL flatfile Database implementation used as high-speed standalone backup/failover
 */
class FailoverWALDatabase implements ISystemDB {
  private dbPath: string;
  private walPath: string;
  private data: {
    boot_logs: OSBootLog[];
    processes: Record<number, ProcessLog>;
    cron_logs: CronLog[];
    vfs_files: Record<string, VFSRegistry>;
  };

  constructor() {
    this.dbPath = path.join(process.cwd(), '.super', 'data', 'system_state.json');
    this.walPath = path.join(process.cwd(), '.super', 'data', 'system_state.wal');
    this.data = {
      boot_logs: [],
      processes: {},
      cron_logs: [],
      vfs_files: {}
    };
  }

  public async initialize(): Promise<void> {
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Playback WAL file if exists to guarantee transactions
    this.readStore();
    this.recoverWAL();
  }

  private readStore() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const raw = fs.readFileSync(this.dbPath, 'utf8');
        this.data = JSON.parse(raw);
      }
    } catch (e) {
      console.error('[FailoverDB] Failed to read database, starting clean', e);
    }
  }

  private recoverWAL() {
    try {
      if (fs.existsSync(this.walPath)) {
        const walContent = fs.readFileSync(this.walPath, 'utf8');
        const transactions = walContent.split('\n').filter(Boolean);
        let recoveredCount = 0;
        
        for (const tx of transactions) {
          const payload = JSON.parse(tx);
          this.applyTransaction(payload.type, payload.entity, false);
          recoveredCount++;
        }
        
        if (recoveredCount > 0) {
          console.log(`[FailoverDB] WAL recovered ${recoveredCount} pending transactions.`);
          this.commit();
        }
      }
    } catch (e) {
      console.error('[FailoverDB] WAL recovery failed, resetting log', e);
    } finally {
      this.clearWAL();
    }
  }

  private async writeWAL(type: string, entity: any): Promise<void> {
    const walRecord = JSON.stringify({ type, entity, t: Date.now() }) + '\n';
    await fs.promises.appendFile(this.walPath, walRecord, 'utf8');
  }

  private clearWAL() {
    try {
      if (fs.existsSync(this.walPath)) {
        fs.unlinkSync(this.walPath);
      }
    } catch (e) {
      // Ignore
    }
  }

  private applyTransaction(type: string, entity: any, writeLog = true) {
    if (writeLog) {
      this.writeWAL(type, entity).catch(() => {});
    }

    switch (type) {
      case 'BOOT_LOG':
        const boot = entity as OSBootLog;
        boot.id = this.data.boot_logs.length + 1;
        this.data.boot_logs.push(boot);
        break;
      case 'PROCESS_SAVE':
        const p = entity as ProcessLog;
        this.data.processes[p.pid] = p;
        break;
      case 'PROCESS_DELETE':
        delete this.data.processes[entity.pid];
        break;
      case 'PROCESS_CLEAR':
        this.data.processes = {};
        break;
      case 'CRON_LOG':
        const cron = entity as CronLog;
        cron.id = this.data.cron_logs.length + 1;
        this.data.cron_logs.push(cron);
        break;
      case 'VFS_SAVE':
        const file = entity as VFSRegistry;
        this.data.vfs_files[file.path] = file;
        break;
      case 'VFS_DELETE':
        delete this.data.vfs_files[entity.path];
        break;
    }
    
    // Commit to disk
    this.commit();
  }

  private commit() {
    try {
      fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf8');
      this.clearWAL();
    } catch (e) {
      console.error('[FailoverDB] Commit failed', e);
    }
  }

  public async logBoot(entry: OSBootLog): Promise<number> {
    this.applyTransaction('BOOT_LOG', entry);
    return this.data.boot_logs.length;
  }

  public async getBootLogs(): Promise<OSBootLog[]> {
    this.readStore();
    return this.data.boot_logs;
  }

  public async saveProcess(proc: ProcessLog): Promise<void> {
    this.applyTransaction('PROCESS_SAVE', proc);
  }

  public async getProcesses(): Promise<ProcessLog[]> {
    this.readStore();
    return Object.values(this.data.processes);
  }

  public async deleteProcess(pid: number): Promise<void> {
    this.applyTransaction('PROCESS_DELETE', { pid });
  }

  public async clearProcesses(): Promise<void> {
    this.applyTransaction('PROCESS_CLEAR', {});
  }

  public async logCron(log: CronLog): Promise<number> {
    this.applyTransaction('CRON_LOG', log);
    return this.data.cron_logs.length;
  }

  public async getCronLogs(): Promise<CronLog[]> {
    this.readStore();
    return this.data.cron_logs;
  }

  public async saveVFSFile(file: VFSRegistry): Promise<void> {
    this.applyTransaction('VFS_SAVE', file);
  }

  public async loadVFSFiles(): Promise<VFSRegistry[]> {
    this.readStore();
    return Object.values(this.data.vfs_files);
  }

  public async deleteVFSFile(filePath: string): Promise<void> {
    this.applyTransaction('VFS_DELETE', { path: filePath });
  }
}

/**
 * Dynamic native SQLite3 module loader wrapper
 */
class SQLiteDatabase implements ISystemDB {
  private db: any = null;
  private dbFilePath: string;

  constructor() {
    this.dbFilePath = path.join(process.cwd(), '.super', 'data', 'system_state.db');
  }

  public async initialize(): Promise<void> {
    const dataDir = path.dirname(this.dbFilePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Dynamic execution import to avoid compiler errors on missing drivers in specific container tiers
    const driverPackage = 'sqlite3';
    const sqlite3Module = await import(driverPackage);
    const sqlite3 = (sqlite3Module as any).default || sqlite3Module;
    
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbFilePath, async (err: any) => {
        if (err) return reject(err);
        
        try {
          // Enable WAL journaling for maximum transaction throughput and crash resilience
          await this.execSQL("PRAGMA journal_mode=WAL;");
          await this.execSQL("PRAGMA synchronous=NORMAL;");
          
          await this.execSQL(`
            CREATE TABLE IF NOT EXISTS os_boot_log (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              timestamp TEXT NOT NULL,
              runlevel INTEGER NOT NULL,
              description TEXT NOT NULL
            );
          `);

          await this.execSQL(`
            CREATE TABLE IF NOT EXISTS process_table (
              pid INTEGER PRIMARY KEY,
              ppid INTEGER NOT NULL,
              command TEXT NOT NULL,
              status TEXT NOT NULL,
              cpu REAL NOT NULL,
              memory REAL NOT NULL,
              startTime TEXT NOT NULL
            );
          `);

          await this.execSQL(`
            CREATE TABLE IF NOT EXISTS cron_log (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              jobId TEXT NOT NULL,
              triggerTime TEXT NOT NULL,
              status TEXT NOT NULL,
              exitCode INTEGER NOT NULL,
              logOutput TEXT NOT NULL
            );
          `);

          await this.execSQL(`
            CREATE TABLE IF NOT EXISTS vfs_registry (
              path TEXT PRIMARY KEY,
              content TEXT NOT NULL,
              mimeType TEXT NOT NULL,
              size INTEGER NOT NULL,
              isDirectory INTEGER NOT NULL,
              updatedAt TEXT NOT NULL
            );
          `);

          resolve();
        } catch (setupErr) {
          reject(setupErr);
        }
      });
    });
  }

  private execSQL(sql: string, params: any[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, (err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private runSQL(sql: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (this: any, err: any) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  private allSQL(sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err: any, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  public async logBoot(entry: OSBootLog): Promise<number> {
    const res = await this.runSQL(
      `INSERT INTO os_boot_log (timestamp, runlevel, description) VALUES (?, ?, ?)`,
      [entry.timestamp, entry.runlevel, entry.description]
    );
    return res.lastID;
  }

  public async getBootLogs(): Promise<OSBootLog[]> {
    const rows = await this.allSQL("SELECT * FROM os_boot_log ORDER BY id ASC");
    return rows.map(r => ({
      id: r.id,
      timestamp: r.timestamp,
      runlevel: r.runlevel,
      description: r.description
    }));
  }

  public async saveProcess(proc: ProcessLog): Promise<void> {
    await this.execSQL(
      `INSERT OR REPLACE INTO process_table (pid, ppid, command, status, cpu, memory, startTime) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [proc.pid, proc.ppid, proc.command, proc.status, proc.cpu, proc.memory, proc.startTime]
    );
  }

  public async getProcesses(): Promise<ProcessLog[]> {
    const rows = await this.allSQL("SELECT * FROM process_table");
    return rows.map(r => ({
      pid: r.pid,
      ppid: r.ppid,
      command: r.command,
      status: r.status,
      cpu: r.cpu,
      memory: r.memory,
      startTime: r.startTime
    }));
  }

  public async deleteProcess(pid: number): Promise<void> {
    await this.execSQL("DELETE FROM process_table WHERE pid = ?", [pid]);
  }

  public async clearProcesses(): Promise<void> {
    await this.execSQL("DELETE FROM process_table");
  }

  public async logCron(log: CronLog): Promise<number> {
    const res = await this.runSQL(
      `INSERT INTO cron_log (jobId, triggerTime, status, exitCode, logOutput) VALUES (?, ?, ?, ?, ?)`,
      [log.jobId, log.triggerTime, log.status, log.exitCode, log.logOutput]
    );
    return res.lastID;
  }

  public async getCronLogs(): Promise<CronLog[]> {
    const rows = await this.allSQL("SELECT * FROM cron_log ORDER BY id DESC");
    return rows.map(r => ({
      id: r.id,
      jobId: r.jobId,
      triggerTime: r.triggerTime,
      status: r.status,
      exitCode: r.exitCode,
      logOutput: r.logOutput
    }));
  }

  public async saveVFSFile(file: VFSRegistry): Promise<void> {
    await this.execSQL(
      `INSERT OR REPLACE INTO vfs_registry (path, content, mimeType, size, isDirectory, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`,
      [file.path, file.content, file.mimeType, file.size, file.isDirectory, file.updatedAt]
    );
  }

  public async loadVFSFiles(): Promise<VFSRegistry[]> {
    const rows = await this.allSQL("SELECT * FROM vfs_registry");
    return rows.map(r => ({
      path: r.path,
      content: r.content,
      mimeType: r.mimeType,
      size: r.size,
      isDirectory: r.isDirectory,
      updatedAt: r.updatedAt
    }));
  }

  public async deleteVFSFile(filePath: string): Promise<void> {
    await this.execSQL("DELETE FROM vfs_registry WHERE path = ?", [filePath]);
  }
}

// Master Instance Factory Exporter
export async function getDatabase(): Promise<ISystemDB> {
  const sqliteDB = new SQLiteDatabase();
  try {
    await sqliteDB.initialize();
    console.log('[SQLiteServer] Native WAL-SQLite engine operational on system_state.db.');
    return sqliteDB;
  } catch (e) {
    console.warn('[SQLiteServer] Driver binary loading failed or restricted by sandboxing. Activating high-speed transactional JSON-WAL failover daemon.', e);
    const failoverDB = new FailoverWALDatabase();
    await failoverDB.initialize();
    return failoverDB;
  }
}
