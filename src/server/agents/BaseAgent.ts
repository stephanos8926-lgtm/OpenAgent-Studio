import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";
import { BaseCheckpointSaver } from "@langchain/langgraph";
import { StructuredTool } from "@langchain/core/tools";
import { agentHooksService } from "../services/AgentHooksService.js";

export enum AgentTier {
  TIER_1_CORE = "TIER_1_CORE", // Planner, Coder
  TIER_2_SPECIALIZED = "TIER_2_SPECIALIZED", // Auditor
  TIER_3_INTERNAL = "TIER_3_INTERNAL", // Platform, Maintenance
}

export interface AgentManifest {
  tier: AgentTier;
  role: string;
  capabilities: string[];
}

/**
 * Enterprise Warden Tool Wrapper
 * Intercepts tool calls for auditing, metrics, hooks integration and security enforcement.
 */
export function wrapWithWarden(tools: StructuredTool[]): StructuredTool[] {
  return tools.map((tool) => {
    const originalCall = tool.call.bind(tool);
    
    // Wrap the call to hook pre and post execute
    tool.call = async (args: any, config?: any) => {
      const threadId = config?.configurable?.thread_id || "unknown-session";
      
      // 1. Trigger pre_tool_use hook
      await agentHooksService.trigger("pre_tool_use", {
        threadId,
        toolName: tool.name,
        input: args,
      });

      // Warden Logic: Block dangerous shell patterns
      if (tool.name === 'shell_exec') {
         const { command } = args;
         const dangerousPatterns = ['rm -rf /', 'mkfs', 'dd if=', ':(){ :|:& };:'];
         if (dangerousPatterns.some(p => command.includes(p))) {
           const wardenErr = new Error(`[Security Warden] Blocked potentially destructive command: ${command}`);
           await agentHooksService.trigger("post_tool_use", {
             threadId,
             toolName: tool.name,
             input: args,
             error: wardenErr.message,
           });
           throw wardenErr;
         }
      }

      try {
        const output = await originalCall(args, config);
        
        // 2. Trigger post_tool_use hook upon success
        await agentHooksService.trigger("post_tool_use", {
          threadId,
          toolName: tool.name,
          input: args,
          output,
        });

        return output;
      } catch (err: any) {
        const errorMsg = err?.message || String(err);
        
        // 3. Trigger post_tool_use hook upon error
        await agentHooksService.trigger("post_tool_use", {
          threadId,
          toolName: tool.name,
          input: args,
          error: errorMsg,
        });

        throw err;
      }
    };
    
    return tool;
  });
}

/**
 * StandardDeepAgent factory helper
 */
export function createDeepAgent({
  llm,
  tools,
  manifest,
  systemPrompt,
  checkpointer
}: {
  llm: ChatOpenAI;
  tools: StructuredTool[];
  manifest: AgentManifest;
  systemPrompt: string;
  checkpointer?: BaseCheckpointSaver;
}) {
  const modPrompt = `
AGENT MANIFEST:
- Tier: ${manifest.tier}
- Role: ${manifest.role}
- Capabilities: ${manifest.capabilities.join(", ")}

STANDARDS MANDATE:
- You must prioritize system integrity.
- You must use the Security Warden protected tools.
- All technical state changes must be reported.

${systemPrompt}
`;

  return createReactAgent({
    llm,
    tools: wrapWithWarden(tools),
    messageModifier: new SystemMessage(modPrompt),
    checkpointSaver: checkpointer,
  });
}
