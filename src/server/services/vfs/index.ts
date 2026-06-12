import { Volume, createFsFromVolume } from 'memfs';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fsImpl from 'fs/promises';

export interface IFileSystem {
  readonly type: 'memory' | 'host' | 'remote';
  readonly basePath?: string;
  readFile(path: string): Promise<string | null>;
  writeFile(path: string, content: string): Promise<void>;
  deleteFile(path: string): Promise<boolean>;
  listFiles(): Promise<string[]>;
  getFiles(): Promise<Record<string, string>>;
}

export class HostVFS implements IFileSystem {
  readonly type = 'host';
  readonly basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  private async getSecurePath(filePath: string): Promise<string> {
    const path = await import('path');
    const resolvedPath = path.resolve(this.basePath, filePath);
    if (!resolvedPath.startsWith(path.resolve(this.basePath))) {
      throw new Error(`Access denied: path traversal detected for ${filePath}`);
    }
    return resolvedPath;
  }

  async readFile(filePath: string): Promise<string | null> {
    try {
      const fs = await import('fs/promises');
      const fullPath = await this.getSecurePath(filePath);
      return await fs.readFile(fullPath, 'utf8');
    } catch {
      return null;
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const fullPath = await this.getSecurePath(filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf8');
  }

  async deleteFile(filePath: string): Promise<boolean> {
    try {
      const fs = await import('fs/promises');
      const fullPath = await this.getSecurePath(filePath);
      await fs.rm(fullPath, { force: true });
      return true;
    } catch {
      return false;
    }
  }

  async listFiles(): Promise<string[]> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const files: string[] = [];
    async function walk(dir: string) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
           const fullPath = path.join(dir, entry.name);
           if (entry.isDirectory()) {
             // Exclude typical large dirs
             if (!['node_modules', '.git', 'dist'].includes(entry.name)) {
                await walk(fullPath);
             }
           } else {
             files.push(fullPath);
           }
        }
      } catch {
        // Handle no-access gracefully
      }
    }
    
    await walk(this.basePath);
    // Return paths relative to basePath
    return files.map(f => path.relative(this.basePath, f));
  }

  async getFiles(): Promise<Record<string, string>> {
     const files = await this.listFiles();
     const map: Record<string, string> = {};
     for (const f of files) {
       const content = await this.readFile(f);
       if (content !== null) map[f] = content;
     }
     return map;
  }
}

export class InMemoryVFS implements IFileSystem {
  readonly type = 'memory';
  private vol: typeof Volume.prototype;
  private mfs: any;
  private saveStatePath: string | null = null;

  constructor(initialVfs: Record<string, string> = {}) {
    this.vol = new Volume();
    // Reconstruct nested volume strictly using absolute paths
    const volData: Record<string, string> = {};
    for (const [p, content] of Object.entries(initialVfs)) {
      const absPath = p.startsWith('/') ? p : '/' + p;
      volData[absPath] = content;
    }
    this.vol.fromJSON(volData, '/');
    this.mfs = createFsFromVolume(this.vol).promises;
  }

  setSaveStatePath(savePath: string) {
    this.saveStatePath = savePath;
  }

  private normalizePath(p: string) {
    if (p.startsWith('/')) {
      return p;
    }
    return '/' + p;
  }

  async readFile(p: string): Promise<string | null> {
    try {
      const content = await this.mfs.readFile(this.normalizePath(p), 'utf8');
      return content as string;
    } catch {
      return null;
    }
  }

  async writeFile(p: string, content: string): Promise<void> {
    const normalized = this.normalizePath(p);
    await this.mfs.mkdir(path.dirname(normalized), { recursive: true });
    await this.mfs.writeFile(normalized, content, 'utf8');
  }

  async deleteFile(p: string): Promise<boolean> {
    try {
      await this.mfs.rm(this.normalizePath(p), { force: true, recursive: true });
      return true;
    } catch {
      return false;
    }
  }

  async listFiles(): Promise<string[]> {
    const files: string[] = [];
    const walk = async (dir: string) => {
      try {
        const entries = await this.mfs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
           const fullPath = path.join(dir, (entry as any).name);
           if ((entry as any).isDirectory()) {
              await walk(fullPath);
           } else {
             files.push(fullPath.replace(/^\//, ''));
           }
        }
      } catch {
        // Handle gracefully
      }
    };
    
    await walk('/');
    return files;
  }

  async getFiles(): Promise<Record<string, string>> {
     const data = this.vol.toJSON();
     const files: Record<string, string> = {};
     for (const [p, content] of Object.entries(data)) {
       if (content !== null && content !== undefined) {
         files[p.replace(/^\//, '')] = content;
       }
     }
     return files;
  }
  
  // Serializes the memory tree to disk with a cryptographic hash for data integrity
  async serializeToDisk(): Promise<void> {
    if (!this.saveStatePath) return;
    
    const files = await this.getFiles();
    const payload = JSON.stringify(files);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(payload);
    const hash = hashSum.digest('hex');
    
    const snapshot = {
      hash,
      timestamp: Date.now(),
      data: files
    };
    
    await fsImpl.mkdir(path.dirname(this.saveStatePath), { recursive: true });
    await fsImpl.writeFile(this.saveStatePath, JSON.stringify(snapshot, null, 2), 'utf8');
  }
  
  // Restore the state from disk, verifying the hash to ensure corruption free read
  async restoreFromDisk(): Promise<boolean> {
    if (!this.saveStatePath) return false;
    
    try {
      const content = await fsImpl.readFile(this.saveStatePath, 'utf8');
      const snapshot = JSON.parse(content);
      
      const hashSum = crypto.createHash('sha256');
      hashSum.update(JSON.stringify(snapshot.data));
      const hash = hashSum.digest('hex');
      
      if (hash !== snapshot.hash) {
        console.warn("VFS integrity check failed - hash mismatch in snapshot.");
        return false;
      }
      
      this.vol.reset();
      
      const volData: Record<string, string> = {};
      for (const [p, fileContent] of Object.entries(snapshot.data)) {
        const absPath = p.startsWith('/') ? p : '/' + p;
        volData[absPath] = fileContent as string;
      }
      this.vol.fromJSON(volData, '/');
      return true;
    } catch {
      return false;
    }
  }
}

