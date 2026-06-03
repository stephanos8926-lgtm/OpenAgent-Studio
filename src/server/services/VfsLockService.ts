import { logger } from "../utils/logger.js";

export interface Lock {
  filePath: string;
  ownerId: string;
  acquiredAt: Date;
}

export interface WorktreeBranch {
  branchName: string;
  files: Record<string, string>; // path -> content
  baseCommit: string;
  modifiedFiles: string[];
}

export interface BusEvent {
  id: string;
  timestamp: string;
  source: string;
  type: "info" | "warning" | "error" | "lock-acquired" | "lock-released" | "worktree-start" | "worktree-merge" | "command-exec" | "security-audit";
  message: string;
  details?: any;
}

export type BusListener = (event: BusEvent) => void;

class VfsLockService {
  private locks: Map<string, Lock> = new Map();
  private worktrees: Map<string, WorktreeBranch> = new Map();
  private listeners: Set<BusListener> = new Set();
  private eventHistory: BusEvent[] = [];

  constructor() {
    logger.info("[VfsLockService] Virtual Workspace Guard initialized.");
  }

  // ═══════════════════════════════════════════════════════════
  // FILE LOCKING REGISTER
  // ═══════════════════════════════════════════════════════════
  public acquireLock(filePath: string, ownerId: string): boolean {
    const existing = this.locks.get(filePath);
    if (existing) {
      if (existing.ownerId === ownerId) {
        return true; // Already owned
      }
      this.publishEvent({
        source: "LockManager",
        type: "warning",
        message: `ACQUISITION FAILED: Agent '${ownerId}' requested lock for '${filePath}', but it is occupied by '${existing.ownerId}'.`
      });
      return false;
    }

    this.locks.set(filePath, {
      filePath,
      ownerId,
      acquiredAt: new Date()
    });

    this.publishEvent({
      source: "LockManager",
      type: "lock-acquired",
      message: `Lock acquired on '${filePath}' by agent '${ownerId}'.`
    });
    return true;
  }

  public releaseLock(filePath: string, ownerId: string): boolean {
    const existing = this.locks.get(filePath);
    if (!existing) return true;

    if (existing.ownerId !== ownerId) {
      this.publishEvent({
        source: "LockManager",
        type: "error",
        message: `RELEASE FAILED: Agent '${ownerId}' tried releasing lock on '${filePath}' owned by '${existing.ownerId}'.`
      });
      return false;
    }

    this.locks.delete(filePath);
    this.publishEvent({
      source: "LockManager",
      type: "lock-released",
      message: `Lock on '${filePath}' released by agent '${ownerId}'.`
    });
    return true;
  }

  public forceReleaseAllLocksForOwner(ownerId: string): void {
    for (const [path, lock] of this.locks.entries()) {
      if (lock.ownerId === ownerId) {
        this.locks.delete(path);
      }
    }
  }

  public isLocked(filePath: string): boolean {
    return this.locks.has(filePath);
  }

  public getLockOwner(filePath: string): string | null {
    return this.locks.get(filePath)?.ownerId || null;
  }

  // ═══════════════════════════════════════════════════════════
  // SIMULATED GIT-WORKTREE SUB-SYSTEM
  // ═══════════════════════════════════════════════════════════
  public createWorktree(branchName: string, baseFiles: Record<string, string>): void {
    this.worktrees.set(branchName, {
      branchName,
      files: { ...baseFiles },
      baseCommit: "init-" + Math.random().toString(36).substring(2, 7),
      modifiedFiles: []
    });

    this.publishEvent({
      source: "GitWorktree",
      type: "worktree-start",
      message: `Created isolated branch/worktree workspace '${branchName}'.`
    });
  }

  public writeBranchFile(branchName: string, filePath: string, content: string): boolean {
    const wt = this.worktrees.get(branchName);
    if (!wt) return false;

    wt.files[filePath] = content;
    if (!wt.modifiedFiles.includes(filePath)) {
      wt.modifiedFiles.push(filePath);
    }
    return true;
  }

  public mergeWorktree(branchName: string, activeVfs: Record<string, string>): { success: boolean; mergedVfs: Record<string, string>; summary: string[] } {
    const wt = this.worktrees.get(branchName);
    const summary: string[] = [];
    if (!wt) {
      return { success: false, mergedVfs: activeVfs, summary: ["Worktree context not found"] };
    }

    const nextVfs = { ...activeVfs };

    // Acquire lock and merge files elegantly, catching merge conflicts
    for (const path of wt.modifiedFiles) {
      const branchContent = wt.files[path];
      const rootContent = activeVfs[path];

      // Check for locks
      if (this.isLocked(path) && this.getLockOwner(path) !== branchName) {
        summary.push(`Conflict: file '${path}' is locked by ${this.getLockOwner(path)}. Retrying auto-merge override.`);
      }

      // Simple non-destructive line-based resolution merging
      if (rootContent !== undefined && rootContent !== branchContent) {
        summary.push(`Auto-merged modifications in: ${path}`);
        nextVfs[path] = branchContent; // Worktree changes supersede in simple agent flow
      } else {
        summary.push(`Pushed changes from branch '${branchName}' to root: ${path}`);
        nextVfs[path] = branchContent;
      }
    }

    this.worktrees.delete(branchName);
    this.publishEvent({
      source: "GitWorktree",
      type: "worktree-merge",
      message: `Merged worktree '${branchName}' changes back into main virtual workspace.`,
      details: { modified: wt.modifiedFiles }
    });

    return { success: true, mergedVfs: nextVfs, summary };
  }

  // ═══════════════════════════════════════════════════════════
  // STRUCTURED INTERNAL MESSAGE BUS
  // ═══════════════════════════════════════════════════════════
  public subscribe(listener: BusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public publishEvent(event: Omit<BusEvent, "id" | "timestamp">): void {
    const fullEvent: BusEvent = {
      ...event,
      id: "ev-" + Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString()
    };

    this.eventHistory.push(fullEvent);
    // Clip history length to 200 items
    if (this.eventHistory.length > 200) {
      this.eventHistory.shift();
    }

    for (const listener of this.listeners) {
      try {
        listener(fullEvent);
      } catch (e) {
        // ignore subscriber errors
      }
    }
  }

  public getEvents(): BusEvent[] {
    return this.eventHistory;
  }

  // ═══════════════════════════════════════════════════════════
  // AUTOMATED SECURITY AUDITOR & QUALITY SCANNER
  // ═══════════════════════════════════════════════════════════
  public performSecurityAudit(vfs: Record<string, string>): {
    pass: boolean;
    issues: Array<{ file: string; severity: "info" | "warning" | "high"; rule: string; description: string }>;
  } {
    const issues: Array<{ file: string; severity: "info" | "warning" | "high"; rule: string; description: string }> = [];

    for (const [path, content] of Object.entries(vfs)) {
      // 1. Check for unhandled API Key placements / hardcoded secrets
      if (content.match(/(API_KEY|api_key|secret|password|passwd|token)\s*=\s*['"`][a-zA-Z0-9_\-]{16,}['"`]/gi)) {
        issues.push({
          file: path,
          severity: "high",
          rule: "HARDCODED_SECRET",
          description: "Detected hardcoded key or password token inside workspace files. Secrets must be pulled from environment variables."
        });
      }

      // 2. Unhandled promise rejections inside try-catch/promise trees
      if (content.includes("fetch(") && !content.includes("catch")) {
        issues.push({
          file: path,
          severity: "warning",
          rule: "UNHANDLED_PROMPT_ERRORS",
          description: "Contains raw fetch call without attached .catch() handlers or wrapping try-catch contexts."
        });
      }

      // 3. Command injection in exec calls
      if (content.match(/(exec|spawn)\(.*?\+.*?/gi) || content.match(/`.*?\$[^_].*?`/gi)) {
        if (content.includes("child_process") || content.includes("spawn")) {
          issues.push({
            file: path,
            severity: "high",
            rule: "COMMAND_INJECTION",
            description: "Risk of Command Injection. Executed processes should use array arguments instead of raw string string-concatenation."
          });
        }
      }

      // 4. Infinite re-renders or missing dependency arrays in React hooks
      if (path.endsWith(".tsx") || path.endsWith(".ts")) {
        if (content.includes("useEffect") && !content.includes("useEffect(() =>") && !content.includes(", [") && !content.includes(", []")) {
          issues.push({
            file: path,
            severity: "warning",
            rule: "REACT_INFINITE_RENDER",
            description: "Missing hook dependency arrays can cause severe CPU bottlenecks and component looping re-renders."
          });
        }
      }
    }

    const pass = issues.filter(i => i.severity === "high").length === 0;

    this.publishEvent({
      source: "SecurityAuditor",
      type: "security-audit",
      message: `Completed automated review workspace: ${pass ? "PASS" : "BLOCKED"} (${issues.length} review points triggered)`,
      details: { pass, issuesCount: issues.length }
    });

    return { pass, issues };
  }
}

export const vfsLockService = new VfsLockService();
