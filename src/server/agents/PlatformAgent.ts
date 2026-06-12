import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, AIMessage, HumanMessage, BaseMessage } from "@langchain/core/messages";
import { getConfig } from "../config/index.js";

/**
 * PlatformAgent - The "Service Layer" monitor.
 * This agent is responsible for monitoring the health of the Swarm backend itself,
 * repairing broken configuration, and ensuring security constraints are upheld.
 * It's isolated from user requests and acts as an "Autonomic Nervous System".
 */
export class PlatformAgent {
  private model: ChatOpenAI;
  
  constructor(openRouterKey: string) {
    const config = getConfig();
    const isGeminiKey = openRouterKey.startsWith("AIzaSy") || !openRouterKey.startsWith("sk-");
    
    if (isGeminiKey) {
      this.model = new ChatOpenAI({
        apiKey: openRouterKey,
        configuration: {
          baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
        },
        modelName: "gemma-2-27b-it",
        temperature: 0,
      });
    } else {
      this.model = new ChatOpenAI({
        apiKey: openRouterKey,
        configuration: {
          baseURL: "https://openrouter.ai/api/v1",
        },
        modelName: "google/gemma-2-27b-it",
        temperature: 0,
      });
    }
  }

  async runHealthCheck(systemState: any): Promise<{ repair_needed: boolean; actions: string[] }> {
    const prompt = `
    You are the PLATFORM ARCHITECT. 
    Review the current internal state of the DeepAgent Swarm and determine if any self-repair actions are required.
    
    AUDIT TYPE: ${systemState.context || 'on-demand'}
    HEALTH FLAGS:
    1. Stuck message queues: ${systemState.messageCount || 'unknown'}
    2. VFS integrity: ${systemState.vfsSize || 'unknown'} files tracked.
    3. Error rates: ${systemState.errorCount || 0} recent failures.

    Check for:
    - VFS corruption or excessive file sizes (potential loops).
    - Unresponsive agent threads.
    - Security vulnerabilities in the recent tool usage history.

    Return a JSON response:
    {
      "repair_needed": boolean,
      "actions": string[]
    }
    `;

    try {
      const response = await this.model.invoke([new SystemMessage(prompt)]);
      const content = response.content.toString();
      // Simple parser for safety
      const matches = content.match(/\{[\s\S]*\}/);
      if (matches) {
          return JSON.parse(matches[0]);
      }
      return { repair_needed: false, actions: [] };
    } catch (e) {
      console.error("PlatformAgent Error:", e);
      return { repair_needed: false, actions: ["Error in Platform Monitor loop"] };
    }
  }

  async summarizeTechnicalContext(history: string): Promise<string> {
    const prompt = `
    You are the PLATFORM SUMMARIZER.
    The conversation history is too long and needs compression. 
    Your goal is to create a "Technical State Summary" that allows sub-agents (Planner, Coder, Auditor) to continue work without seeing the full log.

    GUIDELINES:
    1. PRESERVE FILE STATES: List which files were recently modified, created, or deleted.
    2. PRESERVE ERRORS: If there are active build/lint errors, list the specific messages and line numbers.
    3. PRESERVE PROGRESS: Contrast what was requested vs what has been completed so far.
    4. PRESERVE GOALS: Clearly state the current high-level objective and the next immediate technical steps.
    5. BE CONCISE: Use bullet points. Focus purely on technical data, not conversational filler.

    HISTORY TO SUMMARIZE:
    ${history}
    
    Return the summary (max 500 tokens). Do NOT use conversational intro/outro.
    `;
    
    try {
      const response = await this.model.invoke([new SystemMessage(prompt)]);
      return response.content.toString();
    } catch (e) {
      console.error("Summarization Error:", e);
      return "Critical state preserved: Context compressed due to length.";
    }
  }
}
