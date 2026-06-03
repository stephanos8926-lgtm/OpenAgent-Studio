export interface IFileSystem {
  readonly type: 'memory' | 'host';
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
  private vfs: Record<string, string>;

  constructor(initialVfs: Record<string, string> = {}) {
    this.vfs = initialVfs;
  }

  async readFile(path: string): Promise<string | null> {
    return this.vfs[path] !== undefined ? this.vfs[path] : null;
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.vfs[path] = content;
  }

  async deleteFile(path: string): Promise<boolean> {
    if (this.vfs[path] !== undefined) {
      delete this.vfs[path];
      return true;
    }
    return false;
  }

  async listFiles(): Promise<string[]> {
    return Object.keys(this.vfs);
  }

  async getFiles(): Promise<Record<string, string>> {
     return this.vfs;
  }
}
