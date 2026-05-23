import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { SystemMessage } from "@langchain/core/messages";
import { IFileSystem } from "../services/vfs/index.js";
import { createTools } from "./tools/index.js";
import { getConfig } from "../config/index.js";
import { getCoderPrompt, getPlannerPrompt, getAuditorPrompt } from "../config/prompts.js";
import { persistenceService } from "../services/PersistenceService.js";

/**
 * Singleton Checkpointer for the whole backend: Persistent SQLite
 */
export const sharedCheckpointer = persistenceService.getSaver();

export type AgentRole = "coder" | "planner" | "auditor";

/**
 * AgentFactory dynamically constructs LangGraph agents with role-specific system prompts
 * and tools, bound to the provided VFS.
 */
export class AgentFactory {
  static createRunner(role: AgentRole, vfs: IFileSystem, openRouterKey: string, modelName: string) {
    const config = getConfig();
    const tools = createTools(vfs);
    
    // Choose tools based on role if necessary (currently coder gets all tools)
    let selectedTools;
    let systemPrompt = "";
    let temperature = config.agent.coderTemperature;

    switch (role) {
      case "coder":
        selectedTools = tools;
        systemPrompt = getCoderPrompt();
        temperature = config.agent.coderTemperature;
        break;

      case "planner":
        selectedTools = tools.filter(t => ["list_dir", "read_file", "get_semantic_map"].includes(t.name));
        systemPrompt = getPlannerPrompt();
        temperature = config.agent.plannerTemperature;
        break;

      case "auditor":
        selectedTools = tools.filter(t => ["list_dir", "read_file", "shell_exec"].includes(t.name));
        systemPrompt = getAuditorPrompt();
        // Fallback or explicit temperature
        break;
        
      default:
        throw new Error(`Invalid role: ${role}`);
    }

    const llm = new ChatOpenAI({
      openAIApiKey: openRouterKey,
      configuration: {
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": "https://deepagent.ide",
          "X-Title": "DeepAgent IDE",
        }
      },
      modelName: modelName || config.agent.defaultModel,
      temperature,
      modelKwargs: {
         "route": "fallback"
      }
    });

    return createReactAgent({
      llm,
      tools: selectedTools,
      checkpointSaver: sharedCheckpointer,
      messageModifier: new SystemMessage(systemPrompt)
    });
  }
}
