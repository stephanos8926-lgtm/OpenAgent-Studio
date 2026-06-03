import fs from "fs";
import path from "path";
import { logger } from "../utils/logger.js";
import { agentHooksService } from "./AgentHooksService.js";

export interface ToolExecutionEvent {
  toolName: string;
  input: any;
  output?: any;
  error?: any;
  success: boolean;
  latencyMs: number;
  timestamp: number;
}

export interface TurnEvent {
  threadId: string;
  timestamp: number;
  latencyMs: number;
  modelName: string;
  inputTokenCount?: number;
  outputTokenCount?: number;
  status: "success" | "error";
  error?: string;
}

export interface LearnedLesson {
  id: string;
  timestamp: number;
  toolName: string;
  failingInput: any;
  errorSnippet: string;
  successfulInput: any;
  resolutionApproach: string;
  fileAffected?: string;
}

export interface TelemetryMetrics {
  totalApiRequests: number;
  totalClientTurns: number;
  totalAgentRuns: number;
  totalErrors: number;
  toolStats: Record<string, {
    calls: number;
    successes: number;
    failures: number;
    totalLatencyMs: number;
    avgLatencyMs: number;
  }>;
  aggregatedPerformanceLogs: Array<{
    type: string;
    message: string;
    timestamp: number;
    duration?: number;
  }>;
}

class TelemetryService {
  private static instance: TelemetryService;
  private metricsPath: string;
  private lessonsPath: string;
  private metrics: TelemetryMetrics;
  private lessons: LearnedLesson[] = [];
  
  // In-memory sliding window of recent tool calls per thread for F2S transition learning
  private toolHistory: Record<string, ToolExecutionEvent[]> = {};
  
  // Temporary storage of starting timestamps for tracking latency of active segments
  private activeTimestamps: Map<string, number> = new Map();

  private constructor() {
    const dataDir = path.join(process.cwd(), ".data");
    this.metricsPath = path.join(dataDir, "telemetry_metrics.json");
    this.lessonsPath = path.join(dataDir, "learned_lessons.json");

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.metrics = this.loadMetrics();
    this.lessons = this.loadLessons();
    this.setupHooks();
  }

  public static getInstance(): TelemetryService {
    if (!TelemetryService.instance) {
      TelemetryService.instance = new TelemetryService();
    }
    return TelemetryService.instance;
  }

  /**
   * Safe JSON data Loader for Telemetry Metrics
   */
  private loadMetrics(): TelemetryMetrics {
    try {
      if (fs.existsSync(this.metricsPath)) {
        const raw = fs.readFileSync(this.metricsPath, "utf-8");
        return JSON.parse(raw);
      }
    } catch (err: any) {
      logger.error({ err }, "[Telemetry] Failed to load telemetry metrics file. Re-initializing.");
    }

    return {
      totalApiRequests: 0,
      totalClientTurns: 0,
      totalAgentRuns: 0,
      totalErrors: 0,
      toolStats: {},
      aggregatedPerformanceLogs: []
    };
  }

  /**
   * Safe JSON data Loader for Learned Lessons
   */
  private loadLessons(): LearnedLesson[] {
    try {
      if (fs.existsSync(this.lessonsPath)) {
        const raw = fs.readFileSync(this.lessonsPath, "utf-8");
        return JSON.parse(raw);
      }
    } catch (err: any) {
      logger.error({ err }, "[Telemetry] Failed to load learned lessons database. Re-initializing.");
    }
    return [];
  }

  /**
   * Flushes telemetry metrics to disk safely
   */
  public saveMetrics() {
    try {
      fs.writeFileSync(this.metricsPath, JSON.stringify(this.metrics, null, 2), "utf-8");
    } catch (err: any) {
      logger.error({ err }, "[Telemetry] Failed to save telemetry metrics file.");
    }
  }

  /**
   * Flushes lessons registry to disk safely
   */
  public saveLessons() {
    try {
      fs.writeFileSync(this.lessonsPath, JSON.stringify(this.lessons, null, 2), "utf-8");
    } catch (err: any) {
      logger.error({ err }, "[Telemetry] Failed to save learned lessons file.");
    }
  }

  /**
   * Setup AgentHook stage subscribers to feed trace events directly into the telemetry collector.
   */
  private setupHooks() {
    // Stage 1: Turn Start
    agentHooksService.registerHook<any>("turn_start", (ctx) => {
      this.activeTimestamps.set(`turn_${ctx.threadId}`, Date.now());
      this.metrics.totalClientTurns++;
      this.metrics.totalAgentRuns++;
      this.logTelemetryEvent("system_turn", `Agent turn started for session: ${ctx.threadId}`);
      this.saveMetrics();
    });

    // Stage 2: Pre-tool use: record tool execution start
    agentHooksService.registerHook<any>("pre_tool_use", (ctx) => {
      const key = `tool_${ctx.threadId}_${ctx.toolName}`;
      this.activeTimestamps.set(key, Date.now());
    });

    // Stage 3: Post-tool use: collect duration, error, inputs, output, and apply logic for F2S self-evolution
    agentHooksService.registerHook<any>("post_tool_use", (ctx) => {
      const { threadId, toolName, input, output, error } = ctx;
      const key = `tool_${threadId}_${toolName}`;
      const start = this.activeTimestamps.get(key) || Date.now();
      const latencyMs = Date.now() - start;

      const success = !error && !(
        typeof output === "string" && (
          output.startsWith("Error:") || 
          output.includes("failure") ||
          output.includes("[Error Code") ||
          output.includes("not found in file") ||
          output.includes("Failed to match")
        )
      );

      const errorMsg = error || (success ? undefined : String(output));

      this.registerToolExecution(threadId, {
        toolName,
        input,
        output,
        error: errorMsg,
        success,
        latencyMs,
        timestamp: Date.now()
      });
    });

    // Stage 4: Post-turn
    agentHooksService.registerHook<any>("post_turn", (ctx) => {
      const start = this.activeTimestamps.get(`turn_${ctx.threadId}`) || Date.now();
      const latencyMs = Date.now() - start;
      
      this.logTelemetryEvent("turn_completed", `Turn finished for ${ctx.threadId}`, latencyMs);
      this.saveMetrics();
    });
  }

  /**
   * Log atomic system metrics to logs database feed
   */
  private logTelemetryEvent(type: string, message: string, duration?: number) {
    this.metrics.aggregatedPerformanceLogs.unshift({
      type,
      message,
      timestamp: Date.now(),
      duration
    });

    // Limit log length to last 200 events to prevent massive JSON expansion
    if (this.metrics.aggregatedPerformanceLogs.length > 200) {
      this.metrics.aggregatedPerformanceLogs.pop();
    }
  }

  /**
   * Registers a client HTTP API request trace
   */
  public registerApiRequest(method: string, url: string, status: number, latencyMs: number) {
    this.metrics.totalApiRequests++;
    if (status >= 400) {
      this.metrics.totalErrors++;
    }
    
    // Log slow API routes
    if (latencyMs > 1000) {
      this.logTelemetryEvent("slow_api", `Slow request detected: ${method} ${url} completed in ${latencyMs}ms`, latencyMs);
    }
    
    this.saveMetrics();
  }

  /**
   * Registers a tool execution in telemetry metrics and searches for corrective Self-Evolution F2S patterns.
   */
  private registerToolExecution(threadId: string, event: ToolExecutionEvent) {
    const { toolName, success, latencyMs, error } = event;

    // Load or initialize tool stats
    if (!this.metrics.toolStats[toolName]) {
      this.metrics.toolStats[toolName] = {
        calls: 0,
        successes: 0,
        failures: 0,
        totalLatencyMs: 0,
        avgLatencyMs: 0
      };
    }

    const stat = this.metrics.toolStats[toolName];
    stat.calls++;
    if (success) {
      stat.successes++;
    } else {
      stat.failures++;
      this.metrics.totalErrors++;
    }
    stat.totalLatencyMs += latencyMs;
    stat.avgLatencyMs = Math.round(stat.totalLatencyMs / stat.calls);

    this.logTelemetryEvent(
      success ? "tool_success" : "tool_failure",
      `Tool '${toolName}' executed with status: ${success ? "SUCCESS" : "FAILURE"}. Duration: ${latencyMs}ms.`,
      latencyMs
    );

    // Save atomic stats
    this.saveMetrics();

    // Setup history for this thread to detect Fail-to-Success (F2S) Self-Evolution transitions
    if (!this.toolHistory[threadId]) {
      this.toolHistory[threadId] = [];
    }

    const history = this.toolHistory[threadId];
    history.push(event);

    // Track last 10 entries of history per thread to keep sliding memory size bounded
    if (history.length > 10) {
      history.shift();
    }

    // Attempt to learn if this successful tool run corrected a previous failure
    if (success) {
      this.checkAndLearnF2STransition(threadId, event);
    }
  }

  /**
   * Scans history to identify if a successful action resolved a preceding failure.
   * If found, distills the corrective technique and writes it as an AI Evolved Memory (Lesson Learned).
   */
  private checkAndLearnF2STransition(threadId: string, successEvent: ToolExecutionEvent) {
    const history = this.toolHistory[threadId];
    if (!history || history.length < 2) return;

    // Look backward from the end
    // The last item is the successful execution itself (history[history.length - 1])
    // Find if there is a recent failure for a related tool with the same target context
    const successFilePath = this.extractFilePath(successEvent.input);

    for (let i = history.length - 2; i >= 0; i--) {
      const priorEvent = history[i];

      // If the prior event was a failure and touches the same context/file
      if (!priorEvent.success) {
        const priorFilePath = this.extractFilePath(priorEvent.input);
        const isSameFileOrContext = priorFilePath && successFilePath && priorFilePath === successFilePath;
        const isSameToolType = priorEvent.toolName === successEvent.toolName || 
                             (["edit_file", "apply_patch", "write_file"].includes(priorEvent.toolName) && 
                              ["edit_file", "apply_patch", "write_file"].includes(successEvent.toolName));

        if (isSameFileOrContext || (isSameToolType && !priorFilePath && !successFilePath)) {
          // Transition found: Failure followed by Success!
          // We have a Fail-to-Success correction! Let's distill it
          const lessonExists = this.lessons.some(
            l => l.toolName === priorEvent.toolName && 
                 l.errorSnippet === this.truncateError(priorEvent.error) &&
                 JSON.stringify(l.successfulInput) === JSON.stringify(successEvent.input)
          );

          if (!lessonExists) {
            const lessonId = `lesson_${Math.floor(Math.random() * 1000000)}`;
            const fileAffected = priorFilePath || successFilePath || undefined;

            let resolutionApproach = "Modified parameters and surrounding context to ensure perfect parsing syntax.";
            if (priorEvent.toolName === "edit_file" && successEvent.toolName === "edit_file") {
              resolutionApproach = "Adjusted search targets to exact line-by-line whitespace matching, or isolated edits into smaller chunks.";
            } else if (priorEvent.toolName === "edit_file" && successEvent.toolName === "apply_patch") {
              resolutionApproach = "Migrated from custom surgical word replacement to standard robust Git unified patch applier.";
            } else if (priorEvent.toolName === "apply_patch" && successEvent.toolName === "edit_file") {
              resolutionApproach = "Swapped fuzzy unified patch with precise chunk editing to bypass spacing target offsets.";
            } else if (priorEvent.toolName === "apply_patch" && successEvent.toolName === "apply_patch") {
              resolutionApproach = "Added standard Git header markers and context lines (lines starting with ' ') around custom changes to improve sliding match ratio.";
            } else if (priorEvent.toolName === "shell_exec" && successEvent.toolName === "write_file") {
              resolutionApproach = "Corrected a syntax/compilation failure by rewriting module exports cleanly.";
            }

            const newLesson: LearnedLesson = {
              id: lessonId,
              timestamp: Date.now(),
              toolName: priorEvent.toolName,
              failingInput: priorEvent.input,
              errorSnippet: this.truncateError(priorEvent.error),
              successfulInput: successEvent.input,
              resolutionApproach,
              fileAffected
            };

            this.lessons.unshift(newLesson);
            
            // Cap lessons database at last 50 entries to keep it active and dense
            if (this.lessons.length > 50) {
              this.lessons.pop();
            }

            this.saveLessons();
            logger.info(
              { tool: priorEvent.toolName, file: fileAffected },
              `[Telemetry] Auto-learned a corrective self-evolution pattern. Written to Lessons storage.`
            );
            this.logTelemetryEvent(
              "self_evolution_memory_crystallized",
              `Crystallized learned correction pattern for tool '${priorEvent.toolName}' on target '${fileAffected || "general"}'`
            );
            this.saveMetrics();
          }
          break; // Found matching pair; stop scanning further back
        }
      }
    }
  }

  /**
   * Helper: Extracts file paths from diverse tool input layouts
   */
  private extractFilePath(input: any): string | null {
    if (!input || typeof input !== "object") return null;
    return input.path || input.filePath || input.newFile || input.file || null;
  }

  /**
   * Helper: Simplifies lengthy logs for neat cataloging
   */
  private truncateError(err: any): string {
    if (!err) return "unknown error";
    const str = String(err);
    if (str.length > 150) {
      return str.substring(0, 150) + "...";
    }
    return str;
  }

  /**
   * API: Retrieves current metrics object
   */
  public getMetricsData(): TelemetryMetrics {
    return this.metrics;
  }

  /**
   * API: Retrieves lessons registry
   */
  public getLessonsData(): LearnedLesson[] {
    return this.lessons;
  }

  /**
   * API: Search/Retrieve appropriate correction hints matching recent failure errors
   */
  public matchLessonsForFailure(toolName: string, errorString: string): LearnedLesson[] {
    const lowerError = errorString.toLowerCase();
    return this.lessons.filter(lesson => {
      if (lesson.toolName !== toolName) return false;
      const snippet = lesson.errorSnippet.toLowerCase();
      return lowerError.includes(snippet) || snippet.includes(lowerError) || 
             (toolName === "edit_file" && (lowerError.includes("target") || lowerError.includes("match")));
    });
  }

  /**
   * API: Prunes stale telemetry logs older than retentionDays
   */
  public pruneStaleMetrics(retentionDays: number = 7) {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const initialCount = this.metrics.aggregatedPerformanceLogs.length;
    this.metrics.aggregatedPerformanceLogs = this.metrics.aggregatedPerformanceLogs.filter(
      log => log.timestamp >= cutoff
    );
    const prunedCount = initialCount - this.metrics.aggregatedPerformanceLogs.length;
    if (prunedCount > 0) {
      this.saveMetrics();
      logger.info(`[Telemetry] Pruned ${prunedCount} stale performance logs older than ${retentionDays} days.`);
    } else {
      logger.info(`[Telemetry] No stale logs found to prune (retention: ${retentionDays} days).`);
    }
  }

  /**
   * API: Reset all statistics and memory maps
   */
  public resetRegistry() {
    this.metrics = {
      totalApiRequests: 0,
      totalClientTurns: 0,
      totalAgentRuns: 0,
      totalErrors: 0,
      toolStats: {},
      aggregatedPerformanceLogs: []
    };
    this.lessons = [];
    this.saveMetrics();
    this.saveLessons();
    logger.info("[Telemetry] Fully reset telemetry performance stats and learned lessons databases.");
  }
}

export const telemetryService = TelemetryService.getInstance();
