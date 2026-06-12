// File: src/server/services/AgentLoggerService.ts

import fs from "fs";
import path from "path";
import { logger } from "../utils/logger.js";

export interface AgentOperationLog {
  id: string;
  threadId: string;
  timestamp: number;
  category: "ORCHESTRATOR" | "PLANNER" | "CODER" | "AUDITOR" | "VFS" | "COMPILER" | "SYSTEM";
  message: string;
  status: "INFO" | "SUCCESS" | "WARNING" | "ERROR";
  duration?: number;
  metadata?: any;
}

class AgentLoggerService {
  private static instance: AgentLoggerService;
  private logsPath: string;
  private logsCache: AgentOperationLog[] = [];

  private constructor() {
    const dataDir = path.join(process.cwd(), ".data");
    this.logsPath = path.join(dataDir, "agent_operations.json");

    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch (err) {
        logger.error({ err }, "[AgentLogger] Failed to create data directory.");
      }
    }

    this.logsCache = this.loadLogs();
  }

  public static getInstance(): AgentLoggerService {
    if (!AgentLoggerService.instance) {
      AgentLoggerService.instance = new AgentLoggerService();
    }
    return AgentLoggerService.instance;
  }

  /**
   * Reads logs from persistent storage (fallback to memory cache on failure)
   */
  private loadLogs(): AgentOperationLog[] {
    try {
      if (fs.existsSync(this.logsPath)) {
        const raw = fs.readFileSync(this.logsPath, "utf-8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (err: any) {
      logger.error({ err }, "[AgentLogger] Failed to load agent operation logs. Re-initializing.");
    }
    return [];
  }

  /**
   * Persists log records safely to the disk
   */
  private saveLogs() {
    try {
      fs.writeFileSync(this.logsPath, JSON.stringify(this.logsCache, null, 2), "utf-8");
    } catch (err: any) {
      logger.error({ err }, "[AgentLogger] Failed to write agent operation logs file.");
    }
  }

  /**
   * Logs a new agent occurrence or system-wide milestone
   */
  public logEvent(
    threadId: string,
    category: AgentOperationLog["category"],
    message: string,
    status: AgentOperationLog["status"],
    duration?: number,
    metadata?: any
  ): AgentOperationLog {
    const logItem: AgentOperationLog = {
      id: `agent-log-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      threadId: threadId || "system-general",
      timestamp: Date.now(),
      category,
      message,
      status,
      duration,
      metadata
    };

    // Store in unshifted position for quick newest-first listing
    this.logsCache.unshift(logItem);

    // Keep logs cap to avoid unlimited sizing (e.g. 500 logs)
    if (this.logsCache.length > 500) {
      this.logsCache.pop();
    }

    this.saveLogs();

    logger.info(
      { threadId, category, status, duration },
      `[AgentLogger] [${category}] [${status}] ${message}`
    );

    return logItem;
  }

  /**
   * Query in-memory/disk logs with comprehensive filtering
   */
  public getLogs(filters?: {
    threadId?: string;
    status?: string;
    category?: string;
    query?: string;
    limit?: number;
  }): AgentOperationLog[] {
    let result = [...this.logsCache];

    if (!filters) return result;

    if (filters.threadId) {
      result = result.filter(log => log.threadId === filters.threadId);
    }

    if (filters.status && filters.status !== "ALL") {
      result = result.filter(log => log.status === filters.status);
    }

    if (filters.category && filters.category !== "ALL") {
      result = result.filter(log => log.category === filters.category);
    }

    if (filters.query) {
      const q = filters.query.toLowerCase();
      result = result.filter(
        log =>
          log.message.toLowerCase().includes(q) ||
          log.category.toLowerCase().includes(q) ||
          log.threadId.toLowerCase().includes(q)
      );
    }

    if (filters.limit && filters.limit > 0) {
      result = result.slice(0, filters.limit);
    }

    return result;
  }

  /**
   * Purges all agent logs databases completely
   */
  public clearLogs() {
    this.logsCache = [];
    this.saveLogs();
    logger.info("[AgentLogger] Cleared all recorded agent operation logs.");
  }
}

export const agentLoggerService = AgentLoggerService.getInstance();
