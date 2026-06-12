import Database from 'better-sqlite3';
import chokidar from 'chokidar';
import fs from 'fs/promises';
import fsSync from 'fs';
import { blake3 } from '@noble/hashes/blake3.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import path from 'path';
import { log } from '../../observability/Logger.js';

export class FileTracker {
  private db: Database.Database;
  private watcher: any = null;
  private basePath: string;
  private debounceMap = new Map<string, NodeJS.Timeout>();

  constructor(basePath: string) {
    this.basePath = basePath;
    
    // Ensure the base workspace directory exists synchronously before initializing SQLite
    try {
      fsSync.mkdirSync(this.basePath, { recursive: true });
    } catch (err: any) {
      log.error('FileTracker', 'Failed to create tracking directory synchronously', { err, basePath: this.basePath });
    }

    const dbPath = path.join(this.basePath, '.vfs_tracking.db');
    
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = -2000');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS file_hashes (
        filepath TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `);
  }

  // The Strict Do-Not-Track (DNT) List
  private shouldTrack(filepath: string): boolean {
    const ignoredPatterns = [
      /node_modules/, /bower_components/, /\.pnpm-store/,
      /\.cache/, /\.next/, /\.nuxt/, /^dist\//, /^build\//, /^out\//,
      /\.DS_Store/, /thumbs\.db/, /\.tmp$/, /\.swp$/, /\.log$/,
      /\.git\//, /\.vfs_tracking\.db/
    ];
    
    const relativePath = path.relative(this.basePath, filepath);
    for (const pattern of ignoredPatterns) {
      if (pattern.test(relativePath)) return false;
    }
    return true;
  }

  public async startTracking() {
    this.watcher = chokidar.watch(this.basePath, {
      ignored: [
        '**/node_modules/**', '**/bower_components/**', '**/.pnpm-store/**',
        '**/.cache/**', '**/.next/**', '**/.nuxt/**', '**/dist/**', '**/build/**', '**/out/**',
        '**/.DS_Store', '**/thumbs.db', '**/*.tmp', '**/*.swp', '**/*.log',
        '**/.git/**', '**/.vfs_tracking.db*'
      ],
      persistent: true,
      ignoreInitial: false
    });

    this.watcher.on('add', (fp: string) => this.debouncedProcessFile(fp));
    this.watcher.on('change', (fp: string) => this.debouncedProcessFile(fp));
    this.watcher.on('unlink', (fp: string) => this.handleUnlink(fp));
  }

  private debouncedProcessFile(filepath: string) {
    if (!this.shouldTrack(filepath)) return;
    
    if (this.debounceMap.has(filepath)) {
      clearTimeout(this.debounceMap.get(filepath));
    }
    
    this.debounceMap.set(filepath, setTimeout(() => {
      this.debounceMap.delete(filepath);
      this.processFile(filepath).catch(err => log.error('FileTracker', 'Error processing file', { err, filepath }));
    }, 200)); // 200ms debounce
  }

  private async processFile(filepath: string) {
    try {
      const content = await fs.readFile(filepath);
      const hash = bytesToHex(blake3(content));
      const relativePath = path.relative(this.basePath, filepath);
      const stmt = this.db.prepare('INSERT OR REPLACE INTO file_hashes (filepath, hash, timestamp) VALUES (?, ?, ?)');
      stmt.run(relativePath, hash, Date.now());
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
         log.warn('FileTracker', `Failed to hash ${filepath}`, { error: err.message });
      }
    }
  }

  private handleUnlink(filepath: string) {
    const relativePath = path.relative(this.basePath, filepath);
    const stmt = this.db.prepare('DELETE FROM file_hashes WHERE filepath = ?');
    stmt.run(relativePath);
  }

  public getKnownHash(relativePath: string): string | null {
    const stmt = this.db.prepare('SELECT hash FROM file_hashes WHERE filepath = ?');
    const row = stmt.get(relativePath) as any;
    return row ? row.hash : null;
  }
  
  public getSnapshot(): Record<string, string> {
     const stmt = this.db.prepare('SELECT filepath, hash FROM file_hashes');
     const rows = stmt.all() as Array<{filepath: string, hash: string}>;
     const result: Record<string, string> = {};
     for (const r of rows) result[r.filepath] = r.hash;
     return result;
  }

  public stopTracking() {
    if (this.watcher) {
      this.watcher.close();
    }
    this.db.close();
  }
}
