import { spawn, ChildProcess } from "child_process";
import { IContainer, IContainerProcess, SpawnOptions } from "./interface.js";
import { IFileSystem } from "../vfs/index.js";

class HostContainerProcess implements IContainerProcess {
  private child: ChildProcess;

  constructor(child: ChildProcess) {
    this.child = child;
  }

  onData(callback: (data: string) => void): void {
    this.child.stdout?.on("data", (chunk) => callback(chunk.toString()));
    this.child.stderr?.on("data", (chunk) => callback(chunk.toString()));
  }

  onExit(callback: (code: number | null) => void): void {
    this.child.on("close", (code) => callback(code));
  }

  onError(callback: (err: Error) => void): void {
    this.child.on("error", callback);
  }

  write(data: string): void {
    this.child.stdin?.write(data);
  }

  kill(signal: NodeJS.Signals = "SIGTERM"): void {
    this.child.kill(signal);
  }
}

export class HostContainer implements IContainer {
  readonly type = "host";
  private vfs: IFileSystem;

  constructor(vfs: IFileSystem) {
    this.vfs = vfs;
  }

  async executeCommand(
    command: string,
    args: string[],
    options?: SpawnOptions
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      const execCwd = options?.cwd || process.cwd();
      const cp = spawn(command, args, {
        cwd: execCwd,
        shell: options?.shell ?? true,
        env: {
          ...process.env,
          ...options?.env,
        },
      });

      let stdout = "";
      let stderr = "";

      cp.stdout?.on("data", (data) => (stdout += data.toString()));
      cp.stderr?.on("data", (data) => (stderr += data.toString()));

      cp.on("close", (code) => {
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 0,
        });
      });

      cp.on("error", (err) => {
        resolve({
          stdout,
          stderr: err.message,
          exitCode: -1,
        });
      });
    });
  }

  async spawnProcess(
    command: string,
    args: string[],
    options?: SpawnOptions
  ): Promise<IContainerProcess> {
    const execCwd = options?.cwd || process.cwd();
    const cp = spawn(command, args, {
      cwd: execCwd,
      shell: options?.shell ?? true,
      env: {
        ...process.env,
        ...options?.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        FORCE_COLOR: "1",
      },
    });

    return new HostContainerProcess(cp);
  }

  getFileSystem(): IFileSystem {
    return this.vfs;
  }
}
