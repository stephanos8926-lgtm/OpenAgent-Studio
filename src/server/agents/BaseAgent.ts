import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";
import { BaseCheckpointSaver } from "@langchain/langgraph";
import { StructuredTool } from "@langchain/core/tools";

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
 * Intercepts tool calls for auditing and security enforcement.
 */
export function wrapWithWarden(tools: StructuredTool[]): StructuredTool[] {
  return tools.map((tool) => {
    const originalCall = tool.call.bind(tool);
    
    // Simple Warden Logic: Block dangerous shell patterns
    if (tool.name === 'shell_exec') {
       tool.call = async (args: any, config?: any) => {
         const { command } = args;
         const dangerousPatterns = ['rm -rf /', 'mkfs', 'dd if=', ':(){ :|:& };:'];
         if (dangerousPatterns.some(p => command.includes(p))) {
           throw new Error(`[Security Warden] Blocked potentially destructive command: ${command}`);
         }
         return originalCall(args, config);
       };
    }
    
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
