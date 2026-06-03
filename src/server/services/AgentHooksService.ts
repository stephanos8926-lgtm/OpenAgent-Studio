import { BaseMessage, SystemMessage } from "@langchain/core/messages";
import { logger } from "../utils/logger.js";
import { IFileSystem } from "./vfs/index.js";
import { semanticMapService } from "./SemanticMapService.js";

export type HookStage =
  | "session_start"
  | "turn_start"
  | "pre_tool_use"
  | "post_tool_use"
  | "post_turn"
  | "post_session";

export interface SessionContext {
  threadId: string;
  messages: BaseMessage[];
  vfs?: IFileSystem;
}

export interface TurnContext {
  threadId: string;
  inputState: any;
  vfs?: IFileSystem;
}

export interface ToolUseContext {
  threadId: string;
  toolName: string;
  input: any;
  output?: any;
  error?: any;
}

export type HookCallback<T> = (context: T) => Promise<void> | void;

class AgentHooksService {
  private static instance: AgentHooksService;
  
  // Callbacks registered per stage
  private callbacks: Record<HookStage, HookCallback<any>[]> = {
    session_start: [],
    turn_start: [],
    pre_tool_use: [],
    post_tool_use: [],
    post_turn: [],
    post_session: [],
  };

  // State state per threadId
  // Tracks consecutive failures count for each tool
  private consecutiveFailures: Record<string, Record<string, number>> = {};
  
  // Tracks last injection turn index to avoid repeated bloat
  private lastInjectionTurn: Record<string, Record<string, number>> = {};

  private constructor() {
    this.setupBuiltInHooks();
  }

  public static getInstance(): AgentHooksService {
    if (!AgentHooksService.instance) {
      AgentHooksService.instance = new AgentHooksService();
    }
    return AgentHooksService.instance;
  }

  /**
   * Registers a callback for a specific hook stage.
   */
  public registerHook<T>(stage: HookStage, callback: HookCallback<T>) {
    this.callbacks[stage].push(callback);
    logger.info(`[AgentHooks] Registered hook for stage: ${stage}`);
  }

  /**
   * Triggers a specific stage's callbacks.
   */
  public async trigger<T>(stage: HookStage, context: T): Promise<void> {
    const stageCallbacks = this.callbacks[stage];
    if (stageCallbacks.length === 0) return;

    logger.debug(`[AgentHooks] Triggering stage: ${stage}`);
    for (const callback of stageCallbacks) {
      try {
        await callback(context);
      } catch (err: any) {
        logger.error({ err, stage }, "[AgentHooks] Error running hook callback");
      }
    }
  }

  /**
   * Private: Register built-in helper hooks for analyzing failures and injecting hints.
   */
  private setupBuiltInHooks() {
    // 1. Post Tool Use Hook: Analyze results & track failures with backoff
    this.registerHook<ToolUseContext>("post_tool_use", async (ctx) => {
      const { threadId, toolName, output, error } = ctx;
      
      if (!this.consecutiveFailures[threadId]) {
        this.consecutiveFailures[threadId] = {};
      }

      const isFailure = error || 
        (typeof output === "string" && (
          output.startsWith("Error:") || 
          output.includes("failure") || 
          output.includes("[Error Code") ||
          output.includes("not found")
        ));

      if (isFailure) {
        this.consecutiveFailures[threadId][toolName] = (this.consecutiveFailures[threadId][toolName] || 0) + 1;
        logger.warn(
          `[AgentHooks] Detected failure for tool '${toolName}'. Consecutive failure count: ${this.consecutiveFailures[threadId][toolName]}`
        );
      } else {
        // Reset count on successful tool usage
        if (this.consecutiveFailures[threadId][toolName] > 0) {
          logger.info(`[AgentHooks] Tool '${toolName}' executed successfully. Resetting consecutive failure count to 0.`);
        }
        this.consecutiveFailures[threadId][toolName] = 0;
      }
    });

    // 2. Session Start Hook: Analyze consecutive failures and auto inject tailored context with backoff
    this.registerHook<SessionContext>("session_start", async (ctx) => {
      const { threadId, messages, vfs } = ctx;
      if (!vfs) return;

      const failures = this.consecutiveFailures[threadId];
      if (!failures) return;

      if (!this.lastInjectionTurn[threadId]) {
        this.lastInjectionTurn[threadId] = {};
      }

      for (const [toolName, count] of Object.entries(failures)) {
        if (count === 0) continue;

        // Exponential backoff selection algorithm:
        // We only inject on count = 1, count = 2, count = 4, count = 8...
        // Formula: count is power of 2
        const shouldInject = (count & (count - 1)) === 0;

        if (!shouldInject) {
          logger.info(`[AgentHooks] Backing off context injection for failed tool '${toolName}' (Consecutive Count: ${count}) to avoid context bloat.`);
          continue;
        }

        logger.info(`[AgentHooks] Injecting recovery context for failed tool '${toolName}' (Consecutive Count: ${count})`);

        let dynamicRemedy = "";

        if (toolName === "edit_file") {
          dynamicRemedy = await this.diagnoseEditFileFailure(vfs);
        } else if (toolName === "apply_patch") {
          dynamicRemedy = await this.diagnoseApplyPatchFailure(vfs);
        } else if (toolName === "shell_exec") {
          dynamicRemedy = `\n[Agent Hooks Diagnostic]: We noted multiple terminal compile or build errors. Please execute:
1. 'index' to verify exports & paths.
2. Check if a dependency is missing in package.json. If so, inform the system/user.`;
        }

        if (dynamicRemedy) {
          try {
            const { telemetryService } = await import("./TelemetryService.js");
            const matchingLessons = telemetryService.matchLessonsForFailure(toolName, dynamicRemedy);
            if (matchingLessons.length > 0) {
              dynamicRemedy += `\n\n🛡️ [PROACTIVE SELF-EVOLUTION GUIDANCE - LEARNED PATTERNS]:\n` +
                matchingLessons.slice(0, 3).map((l, idx) => {
                  return `Instance #${idx + 1}:\n` +
                    `- Error Context: "${l.errorSnippet}"\n` +
                    `- Proven Solution Strategy: ${l.resolutionApproach}\n` +
                    `- Correct Struct Format: ${JSON.stringify(l.successfulInput)}`;
                }).join("\n\n");
            }
          } catch (telemetryErr) {
            // Ignore telemetry import issues
          }

          const sysMsg = new SystemMessage(
            `⚠️ [HOOKS SYSTEM: AUTO INTEGRITY RESTORATIVE MODULE] (Turn failure offset: ${count})\n${dynamicRemedy}\n` +
            `*NOTE: To avoid bloated context limits, this advisor uses an exponential backoff sequence and will suppress repeating hints unless changes occur.*`
          );
          messages.push(sysMsg);
        }
      }
    });
  }

  /**
   * Scans VFS and recent logs to find where edit_file target strings might have mismatched.
   */
  private async diagnoseEditFileFailure(vfs: IFileSystem): Promise<string> {
    try {
      // Find files in VFS to see if there is any close match
      const files = await vfs.getFiles();
      const filePaths = Object.keys(files);
      
      let hint = `\n[Agent Hooks Diagnostic - Edit File Repair Plan]:\n`;
      hint += `- Available paths: ${filePaths.slice(0, 15).join(", ")}${filePaths.length > 15 ? "..." : ""}\n`;
      hint += `- Sibling files & interfaces: You can retrieve a list of all symbols globally by calling the 'index' tool.\n`;
      hint += `- Recommendations:\n`;
      hint += `  1. If you are struggling to find the exact line match due to formatting or spaces, read the file first using 'read_file'.\n`;
      hint += `  2. Alternatively, invoke 'get_semantic_map' to inspect AST exports before editing.\n`;
      hint += `  3. If there are multiple changes, prefer assembling a unified git diff and calling 'apply_patch'.`;
      return hint;
    } catch {
      return "";
    }
  }

  /**
   * Scans VFS to diagnose a failing patch diff.
   */
  private async diagnoseApplyPatchFailure(vfs: IFileSystem): Promise<string> {
    return `\n[Agent Hooks Diagnostic - Apply Patch Repair Plan]:\n` +
      `- Standard Git diff patches are sensitive to exact leading spaces and whitespace.\n` +
      `- Recommendations:\n` +
      `  1. Run 'read_file' on the target file to verify its exact content.\n` +
      `  2. Rebuild your unified patch with sufficient context lines starting with space (usually 3 lines of context above and below edits is standard).\n` +
      `  3. Avoid editing line headers manually; write a clean diff block and pass it directly to 'apply_patch'.`;
  }
}

export const agentHooksService = AgentHooksService.getInstance();
