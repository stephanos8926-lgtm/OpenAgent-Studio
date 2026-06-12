import { IFileSystem, HostVFS, InMemoryVFS } from './index.js';
import { RemoteMCPVFS } from './RemoteMCPVFS.js';
import { FileTracker } from './FileTracker.js';
import { BackupService } from './BackupService.js';
import path from 'path';
import fs from 'fs/promises';
import { blake3 } from '@noble/hashes/blake3.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { log } from '../../observability/Logger.js';
import { VFSIOException } from '../../observability/Errors.js';

export interface VfsConfig {
  backend: 'host' | 'memory' | 'remote';
  basePath: string; // The sandboxed host directory, e.g. ./.workspaces/
  failoverPolicy: 'flush' | 'isolate'; // flush syncs memory to disk, isolate discards
}

export class VfsManager implements IFileSystem {
  private activeBackend: IFileSystem;
  private hostVfs: HostVFS;
  private memVfs: InMemoryVFS;
  private remoteVfs: RemoteMCPVFS;
  private tracker: FileTracker;
  private backup: BackupService;
  private config: VfsConfig;

  constructor(config: VfsConfig) {
    this.config = config;
    
    this.hostVfs = new HostVFS(config.basePath);
    this.memVfs = new InMemoryVFS();
    this.remoteVfs = new RemoteMCPVFS();
    
    this.tracker = new FileTracker(config.basePath);
    this.backup = new BackupService(config.basePath);
    
    // Default to mapped backend
    if (config.backend === 'remote') {
      this.activeBackend = this.remoteVfs;
    } else if (config.backend === 'memory') {
      this.activeBackend = this.memVfs;
    } else {
      this.activeBackend = this.hostVfs;
    }
  }
  
  public get type(): 'memory' | 'host' | 'remote' {
    return this.activeBackend.type as any;
  }
  
  public async initialize() {
    // ensure base path exists
    await fs.mkdir(this.config.basePath, { recursive: true });
    await this.tracker.startTracking();
    await this.backup.initialize();
    
    // Background worker to check hashes periodically
    setInterval(() => this.runIntegrityCheck(), 60000).unref();
  }

  public async switchBackend(newBackend: 'memory' | 'host' | 'remote') {
    if (this.config.backend === newBackend) return;
    
    try {
      if (this.config.backend === 'memory' && newBackend === 'host') {
         if (this.config.failoverPolicy === 'flush') {
            await this.flushMemoryToHost();
         }
      } else if (this.config.backend === 'host' && newBackend === 'memory') {
         if (this.config.failoverPolicy === 'flush') {
            await this.loadHostToMemory();
         }
      }
      this.config.backend = newBackend;
      if (newBackend === 'memory') this.activeBackend = this.memVfs;
      else if (newBackend === 'remote') this.activeBackend = this.remoteVfs;
      else this.activeBackend = this.hostVfs;
      
      log.info('VfsManager', 'Switched backend successfully', { newBackend });
    } catch (err: any) {
      log.error('VfsManager', 'VFS Frontend switch failover failed', { err, newBackend });
      throw new VFSIOException(`Failed to switch backend to ${newBackend}`, {
        component: 'VfsManager',
        vfsPath: this.config.basePath,
        error: err.message
      });
    }
  }

  private async flushMemoryToHost() {
    const files = await this.memVfs.getFiles();
    for (const [filepath, content] of Object.entries(files)) {
      await this.hostVfs.writeFile(filepath, content);
    }
  }
  
  private async loadHostToMemory() {
    const files = await this.hostVfs.getFiles();
    for (const [filepath, content] of Object.entries(files)) {
      await this.memVfs.writeFile(filepath, content);
    }
  }

  public async readFile(p: string): Promise<string | null> {
    return this.activeBackend.readFile(p);
  }

  public async writeFile(p: string, content: string): Promise<void> {
    await this.activeBackend.writeFile(p, content);
    
    // Do atomic backup if it's the host mapped
    if (this.config.backend === 'host') {
      try {
        await this.backup.createBackup(p, content);
      } catch(e) {
        // fail silently for backups
      }
    }
  }

  public async deleteFile(p: string): Promise<boolean> {
    return this.activeBackend.deleteFile(p);
  }

  public async listFiles(): Promise<string[]> {
    return this.activeBackend.listFiles();
  }

  public async getFiles(): Promise<Record<string, string>> {
     return this.activeBackend.getFiles();
  }
  
  // Workspace Tracking Service & Self-Healing Interactivity
  public async runIntegrityCheck() {
    if (this.config.backend !== 'host') return; // only run on persistent host files
    
    const knownHashes = this.tracker.getSnapshot();
    for (const [relativePath, expectedHash] of Object.entries(knownHashes)) {
       try {
         const content = await this.hostVfs.readFile(relativePath);
         if (content === null) continue; // File deleted, will be handled by watcher
         
         const currentHash = bytesToHex(blake3(new TextEncoder().encode(content)));
         if (currentHash !== expectedHash) {
            log.warn('VfsManager', `[VFS Integrity Alert] Tampering or corruption detected in: ${relativePath}`, {
              expectedHash,
              currentHash,
              path: relativePath
            });
         }
       } catch (err: any) {
         log.error('VfsManager', `Integrity check failed to read ${relativePath}`, { err });
       }
    }
  }
}
