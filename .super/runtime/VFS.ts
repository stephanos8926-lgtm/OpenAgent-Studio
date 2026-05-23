import fs from 'fs';
import path from 'path';

export interface VFSStat {
  isFile: boolean;
  isDirectory: boolean;
  size: number;
  mtime: Date;
  isReadOnly: boolean;
}

export interface IFileSystemAdapter {
  readFile(vPath: string): Promise<string>;
  writeFile(vPath: string, content: string): Promise<void>;
  mkdir(vPath: string): Promise<void>;
  readdir(vPath: string): Promise<string[]>;
  exists(vPath: string): Promise<boolean>;
  stat(vPath: string): Promise<VFSStat | null>;
  rm(vPath: string): Promise<void>;
}

/**
 * In-Memory (RAM) storage adapter representing disk volumes
 */
export class MemoryFileSystemAdapter implements IFileSystemAdapter {
  private files = new Map<string, { content: string; mtime: Date; isReadOnly: boolean }>();
  private dirs = new Set<string>();

  constructor() {
    // Add default system directories matching standard Linux distributions
    this.dirs.add('/');
    this.dirs.add('/bin');
    this.dirs.add('/etc');
    this.dirs.add('/proc');
    this.dirs.add('/root');
    this.dirs.add('/var');
    this.dirs.add('/var/log');
    this.dirs.add('/tmp');
  }

  public async readFile(vPath: string): Promise<string> {
    const file = this.files.get(vPath);
    if (!file) throw new Error(`ENOENT: no such file or directory, open '${vPath}'`);
    return file.content;
  }

  public async writeFile(vPath: string, content: string): Promise<void> {
    // Recursively check and construct parent folder nodes
    const dir = path.dirname(vPath);
    if (dir !== '/' && !this.dirs.has(dir)) {
      await this.mkdir(dir);
    }
    this.files.set(vPath, {
      content,
      mtime: new Date(),
      isReadOnly: false
    });
  }

  public async mkdir(vPath: string): Promise<void> {
    const cleanPath = vPath === '/' ? '/' : vPath.replace(/\/$/, '');
    this.dirs.add(cleanPath);
    
    // Auto populate nested folders upward
    const parent = path.dirname(cleanPath);
    if (parent !== '/' && !this.dirs.has(parent)) {
      await this.mkdir(parent);
    }
  }

  public async readdir(vPath: string): Promise<string[]> {
    const parentPath = vPath.endsWith('/') ? vPath : vPath + '/';
    const entries = new Set<string>();

    for (const d of this.dirs) {
      if (d !== vPath && d.startsWith(vPath)) {
        const sub = d.slice(vPath === '/' ? 1 : vPath.length + 1).split('/')[0];
        if (sub) entries.add(sub);
      }
    }

    for (const f of this.files.keys()) {
      if (f.startsWith(vPath)) {
        const relative = f.slice(vPath === '/' ? 1 : vPath.length + 1);
        if (relative && !relative.includes('/')) {
          entries.add(relative);
        }
      }
    }

    return Array.from(entries);
  }

  public async exists(vPath: string): Promise<boolean> {
    return this.dirs.has(vPath) || this.files.has(vPath);
  }

  public async stat(vPath: string): Promise<VFSStat | null> {
    if (this.dirs.has(vPath)) {
      return {
        isFile: false,
        isDirectory: true,
        size: 4096,
        mtime: new Date(),
        isReadOnly: false
      };
    }
    const file = this.files.get(vPath);
    if (file) {
      return {
        isFile: true,
        isDirectory: false,
        size: Buffer.byteLength(file.content),
        mtime: file.mtime,
        isReadOnly: file.isReadOnly
      };
    }
    return null;
  }

  public async rm(vPath: string): Promise<void> {
    if (this.files.has(vPath)) {
      this.files.delete(vPath);
      return;
    }
    if (this.dirs.has(vPath)) {
      for (const f of this.files.keys()) {
        if (f.startsWith(vPath + '/')) this.files.delete(f);
      }
      for (const d of Array.from(this.dirs)) {
        if (d.startsWith(vPath + '/')) this.dirs.delete(d);
      }
      this.dirs.delete(vPath);
    }
  }
}

/**
 * Host Disk storage adapter, chaining physical file operations
 */
export class PhysicalFileSystemAdapter implements IFileSystemAdapter {
  private baseHostPath: string;

  constructor(hostDir: string) {
    this.baseHostPath = path.resolve(hostDir);
    if (!fs.existsSync(this.baseHostPath)) {
      fs.mkdirSync(this.baseHostPath, { recursive: true });
    }
  }

  private resolveToHost(vPath: string): string {
    const clean = path.normalize(vPath).replace(/^(\.\.(\/|\\|$))+/, '');
    return path.join(this.baseHostPath, clean);
  }

  public async readFile(vPath: string): Promise<string> {
    const hp = this.resolveToHost(vPath);
    return fs.promises.readFile(hp, 'utf8');
  }

  public async writeFile(vPath: string, content: string): Promise<void> {
    const hp = this.resolveToHost(vPath);
    const parent = path.dirname(hp);
    if (!fs.existsSync(parent)) {
      await fs.promises.mkdir(parent, { recursive: true });
    }
    await fs.promises.writeFile(hp, content, 'utf8');
  }

  public async mkdir(vPath: string): Promise<void> {
    const hp = this.resolveToHost(vPath);
    await fs.promises.mkdir(hp, { recursive: true });
  }

  public async readdir(vPath: string): Promise<string[]> {
    const hp = this.resolveToHost(vPath);
    return fs.promises.readdir(hp);
  }

  public async exists(vPath: string): Promise<boolean> {
    const hp = this.resolveToHost(vPath);
    return fs.existsSync(hp);
  }

  public async stat(vPath: string): Promise<VFSStat | null> {
    const hp = this.resolveToHost(vPath);
    try {
      const s = await fs.promises.stat(hp);
      return {
        isFile: s.isFile(),
        isDirectory: s.isDirectory(),
        size: s.size,
        mtime: s.mtime,
        isReadOnly: false
      };
    } catch {
      return null;
    }
  }

  public async rm(vPath: string): Promise<void> {
    const hp = this.resolveToHost(vPath);
    if (fs.existsSync(hp)) {
      const s = await fs.promises.stat(hp);
      if (s.isDirectory()) {
        await fs.promises.rm(hp, { recursive: true, force: true });
      } else {
        await fs.promises.unlink(hp);
      }
    }
  }
}

/**
 * SuperOS Virtual File System Layer with /proc Dynamic Interceptor
 */
export class VirtualFilesystem {
  private adapter: IFileSystemAdapter;
  private activePids: () => number[]; // Callback resolving active PIDs from the state table
  private chrootPrefix = '/';

  constructor(adapter: IFileSystemAdapter, activePidsResolver: () => number[]) {
    this.adapter = adapter;
    this.activePids = activePidsResolver;
  }

  /**
   * Safe path mapping validating Chroot boundaries
   */
  private sanitizePath(vPath: string): string {
    let collapsed = path.normalize(vPath).replace(/\\/g, '/');
    if (!collapsed.startsWith('/')) {
      collapsed = '/' + collapsed;
    }
    // Chroot containment preventing directory breaches:
    const clean = collapsed.replace(/^(\.\.(\/|$))+/, '/');
    return clean;
  }

  /**
   * Dynamic /proc intercept checker
   */
  private getProcContent(cleanPath: string): string | null {
    if (cleanPath === '/proc/cpuinfo') {
      return `processor\t: 0\nvendor_id\t: GenuineIntel\ncpu family\t: 6\nmodel name\t: Simulated Core(TM) SuperCPU v1.0\ncpu cores\t: 2\nbclks\t\t: 100MHz\n`;
    }
    if (cleanPath === '/proc/meminfo') {
      const memLimit = 128 * 1024 * 1024; // 128MB
      const inUse = Math.floor(process.memoryUsage().heapUsed);
      return `MemTotal\t: ${Math.floor(memLimit / 1024)} kB\nMemFree\t\t: ${Math.floor((memLimit - inUse) / 1024)} kB\nBuffers\t\t: 2048 kB\nCached\t\t: 12288 kB\nActive\t\t: ${Math.floor(inUse / 1024)} kB\n`;
    }
    if (cleanPath === '/proc/version') {
      return `Linux version 6.5.0-superos (gcc version 13.2.0) #1 SMP PREEMPT_DYNAMIC May 2026\n`;
    }

    // Process tracking tables mapping: /proc/<PID>/status
    const pidMatch = cleanPath.match(/^\/proc\/(\d+)\/status$/);
    if (pidMatch) {
      const targetPid = parseInt(pidMatch[1]);
      const pids = this.activePids();
      if (pids.includes(targetPid)) {
        return `Name\t\t: proc_${targetPid}\nState\t\t: R (running)\nTgid\t\t: ${targetPid}\nPid\t\t: ${targetPid}\nPPid\t\t: 1\nThreads\t\t: 1\n`;
      }
    }

    return null;
  }

  public async readFile(vPath: string): Promise<string> {
    const clean = this.sanitizePath(vPath);
    const procData = this.getProcContent(clean);
    if (procData !== null) return procData;

    return this.adapter.readFile(clean);
  }

  public async writeFile(vPath: string, content: string): Promise<void> {
    const clean = this.sanitizePath(vPath);
    if (clean.startsWith('/proc/')) {
      throw new Error(`EACCES: permission denied, write '${clean}'`);
    }
    return this.adapter.writeFile(clean, content);
  }

  public async mkdir(vPath: string): Promise<void> {
    const clean = this.sanitizePath(vPath);
    if (clean.startsWith('/proc/')) {
      throw new Error(`EACCES: permission denied, mkdir '${clean}'`);
    }
    return this.adapter.mkdir(clean);
  }

  public async readdir(vPath: string): Promise<string[]> {
    const clean = this.sanitizePath(vPath);
    
    // Dynamic generation of /proc directories
    if (clean === '/proc') {
      const baseProc = ['cpuinfo', 'meminfo', 'version'];
      const processPids = this.activePids().map(p => p.toString());
      return [...baseProc, ...processPids];
    }
    
    const procPidMatch = clean.match(/^\/proc\/(\d+)$/);
    if (procPidMatch) {
      const targetPid = parseInt(procPidMatch[1]);
      if (this.activePids().includes(targetPid)) {
        return ['status'];
      }
    }

    return this.adapter.readdir(clean);
  }

  public async exists(vPath: string): Promise<boolean> {
    const clean = this.sanitizePath(vPath);
    if (clean === '/proc' || clean === '/proc/cpuinfo' || clean === '/proc/meminfo' || clean === '/proc/version') {
      return true;
    }
    const pidMatch = clean.match(/^\/proc\/(\d+)(\/status)?$/);
    if (pidMatch) {
      const targetPid = parseInt(pidMatch[1]);
      return this.activePids().includes(targetPid);
    }
    return this.adapter.exists(clean);
  }

  public async stat(vPath: string): Promise<VFSStat | null> {
    const clean = this.sanitizePath(vPath);
    
    // Intercepted statistics
    const isProc = clean === '/proc' || clean.match(/^\/proc\/(\d+)$/);
    if (isProc) {
      return {
        isFile: false,
        isDirectory: true,
        size: 0,
        mtime: new Date(),
        isReadOnly: true
      };
    }
    const procContent = this.getProcContent(clean);
    if (procContent !== null) {
      return {
        isFile: true,
        isDirectory: false,
        size: Buffer.byteLength(procContent),
        mtime: new Date(),
        isReadOnly: true
      };
    }

    return this.adapter.stat(clean);
  }

  public async rm(vPath: string): Promise<void> {
    const clean = this.sanitizePath(vPath);
    if (clean.startsWith('/proc')) {
      throw new Error(`EACCES: permission denied, unlink '${clean}'`);
    }
    return this.adapter.rm(clean);
  }

  /**
   * Swapping backend adapters seamlessly
   */
  public setAdapter(newAdapter: IFileSystemAdapter): void {
    this.adapter = newAdapter;
  }
}
