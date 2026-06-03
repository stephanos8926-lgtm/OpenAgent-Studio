import { IFileSystem } from "../vfs/index.js";

export interface SpawnOptions {
  cwd?: string;
  env?: Record<string, string>;
  shell?: boolean | string;
}

export interface IContainerProcess {
  onData(callback: (data: string) => void): void;
  onExit(callback: (code: number | null) => void): void;
  onError(callback: (err: Error) => void): void;
  write(data: string): void;
  kill(signal?: string): void;
  resize?(cols: number, rows: number): void;
}

export interface IContainer {
  readonly type: 'host' | 'webcontainer';
  executeCommand(
    command: string, 
    args: string[], 
    options?: SpawnOptions
  ): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  
  spawnProcess(
    command: string, 
    args: string[], 
    options?: SpawnOptions
  ): Promise<IContainerProcess>;
  
  getFileSystem(): IFileSystem;
}
