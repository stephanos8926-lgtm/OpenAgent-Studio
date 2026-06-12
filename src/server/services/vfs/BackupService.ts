import fs from 'fs/promises';
import path from 'path';
import * as crypto from 'crypto';

export class BackupService {
  private backupDir: string;
  
  constructor(basePath: string) {
    this.backupDir = path.join(basePath, '.vfs_backups');
  }

  public async initialize() {
    await fs.mkdir(this.backupDir, { recursive: true });
  }

  // Atomic Backup Job Service
  public async createBackup(filepath: string, content: string): Promise<string> {
     // atomic write: write-to-temp-then-rename
     await this.initialize();
     const filename = path.basename(filepath);
     const safeFilename = crypto.randomUUID() + '-' + filename;
     const tempBackupPath = path.join(this.backupDir, `${safeFilename}.tmp`);
     const finalBackupPath = path.join(this.backupDir, `${safeFilename}.bak`);
     
     await fs.writeFile(tempBackupPath, content, 'utf8');
     await fs.rename(tempBackupPath, finalBackupPath);
     return finalBackupPath;
  }

  public async restoreBackup(backupPath: string, targetPath: string): Promise<void> {
     await fs.copyFile(backupPath, targetPath);
  }
}
