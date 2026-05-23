import { StateGraph, Annotation, messagesStateReducer } from "@langchain/langgraph";
import { BaseMessage, SystemMessage, AIMessage, HumanMessage, RemoveMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { IFileSystem } from "../services/vfs/index.js";
import { createTools } from "./tools/index.js";
import { sharedCheckpointer } from "./AgentFactory.js";
import { getCoderPrompt, getPlannerPrompt, getAuditorPrompt } from "../config/prompts.js";
import { getConfig } from "../config/index.js";
import { PlatformAgent } from "./PlatformAgent.js";
import { AgentTier, createDeepAgent } from "./BaseAgent.js";
import { logger } from "../utils/logger.js";

export interface Task {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  dependencies: string[];
}

// 1. Define State
export const DeepAgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  summary_context: Annotation<string>({
    reducer: (state, update) => update,
    default: () => "",
  }),
  task_dag: Annotation<Task[]>({
    reducer: (state, update) => {
      // Basic merge strategy for DAG updates
      const newState = [...state];
      update.forEach(u => {
        const idx = newState.findIndex(t => t.id === u.id);
        if (idx >= 0) newState[idx] = { ...newState[idx], ...u };
        else newState.push(u);
      });
      return newState;
    },
    default: () => [],
  }),
  environment_health: Annotation<'good' | 'failing' | 'unknown'>({
    reducer: (state, update) => update, // overwrite
    default: () => 'unknown',
  }),
  current_agent: Annotation<'orchestrator' | 'planner' | 'coder' | 'auditor' | undefined>({
    reducer: (state, update) => update,
    default: () => undefined,
  }),
  execution_mode: Annotation<'plan' | 'normal' | 'yolo'>({
    reducer: (state, update) => update,
    default: () => 'normal',
  }),
});

function createModel(modelName: string, temperature: number, openRouterKey: string) {
  return new ChatOpenAI({
    openAIApiKey: openRouterKey,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://deepagent.ide",
        "X-Title": "DeepAgent IDE",
      }
    },
    modelName: modelName,
    temperature: temperature,
    modelKwargs: {
       "route": "fallback"
    }
  });
}

// 2. Custom StateGraph Engine
export function createSwarmGraph(vfs: IFileSystem, openRouterKey: string) {
  const config = getConfig();
  const tools = createTools(vfs);
  
  const orchestratorPrompt = "You are the Orchestrator. Direct the user query to 'planner', 'coder', or 'auditor' by returning a structured plan.";

  // Create sub-agents using standard React agent or simple LLM wrappers
  const plannerModel = createModel("google/gemini-2.0-flash-lite-preview-02-05:free", config.agent.plannerTemperature, openRouterKey);
  const coderModel = createModel("qwen/qwen-2.5-coder-32b-instruct", config.agent.coderTemperature, openRouterKey);
  const auditorModel = createModel("meta-llama/llama-3.3-70b-instruct", 0.1, openRouterKey);

  const plannerTools = tools.filter(t => ["list_dir", "read_file", "get_semantic_map"].includes(t.name));
  const coderTools = tools;
  const auditorTools = tools.filter(t => ["list_dir", "read_file", "shell_exec"].includes(t.name));

  const plannerAgent = createDeepAgent({
    llm: plannerModel,
    tools: plannerTools,
    manifest: {
      tier: AgentTier.TIER_1_CORE,
      role: "Strategic Planner",
      capabilities: ["DAG decomposition", "Asset mapping", "Implementation strategy"]
    },
    systemPrompt: getPlannerPrompt()
  });

  const coderAgent = createDeepAgent({
    llm: coderModel,
    tools: coderTools,
    manifest: {
      tier: AgentTier.TIER_1_CORE,
      role: "Code Generator",
      capabilities: ["VFS modification", "UI development", "Refactoring"]
    },
    systemPrompt: getCoderPrompt()
  });

  const auditorAgent = createDeepAgent({
    llm: auditorModel,
    tools: auditorTools,
    manifest: {
      tier: AgentTier.TIER_2_SPECIALIZED,
      role: "Security & QA Auditor",
      capabilities: ["Build verification", "Static analysis", "Vulnerability scanning"]
    },
    systemPrompt: getAuditorPrompt()
  });

  const orchestratorModel = createModel("google/gemini-2.0-flash-lite-preview-02-05:free", 0, openRouterKey);

  // 3. Define Nodes
  const orchestratorNode = async (state: typeof DeepAgentState.State) => {
    let returnedMessages: BaseMessage[] = [];
    let updatedSummary = state.summary_context;

    // Context Compression: If we have too many messages, use PlatformAgent to summarize
    if (state.messages.length > 20) {
      const platformAgent = new PlatformAgent(openRouterKey);
      
      // We summarize older messages but keep the most recent 5 for immediate context
      const messagesToSummarize = state.messages.slice(0, -5);
      
      // Include existing summary in the summarization process to carry forward context
      const fullHistoryStr = (updatedSummary ? `PREVIOUS SUMMARY: ${updatedSummary}\n\n` : "") + 
                             messagesToSummarize.map(m => `[${m._getType()}]: ${m.content}`).join('\n');
      
      updatedSummary = await platformAgent.summarizeTechnicalContext(fullHistoryStr);
      
      const toRemove = messagesToSummarize
        .filter(m => m.id)
        .map(m => new RemoveMessage({ id: m.id as string }));
      
      returnedMessages.push(...toRemove);
      returnedMessages.push(new AIMessage(`[Platform Architect] Compressed long-horizon context. Technical state preserved in summary.`));
    }

    // LLM decides to route to planner if it's the very first request or high level planning.
    // Otherwise router chooses coder directly.
    const sysPrompt = "You are the Orchestrator. Decide if the user request requires high level planning (route to 'planner') or direct coding (route to 'coder'). Reply ONLY with 'planner' or 'coder'.";
    
    const response = await orchestratorModel.invoke([
        new SystemMessage(sysPrompt),
        ...(updatedSummary ? [new SystemMessage(`SUMMARY OF PREVIOUS TURNS: ${updatedSummary}`)] : []),
        ...state.messages.slice(-3) // Last few messages to decide
    ], { runName: "orchestrator" });
    
    const decision = response.content.toString().toLowerCase().includes("planner") ? "planner" : "coder";

    returnedMessages.push(new AIMessage(`[Orchestrator] Routing task to ${decision}...`));

    return { 
        current_agent: decision, 
        messages: returnedMessages,
        summary_context: updatedSummary
    };
  };

  const plannerNode = async (state: typeof DeepAgentState.State) => {
    const contextMessages = (state.summary_context || "").length > 0 ? [new SystemMessage(`CONTEXT SUMMARY: ${state.summary_context}`)] : [];
    const res = await plannerAgent.invoke({ 
      messages: [...contextMessages, ...state.messages] 
    }, { runName: "planner" });

    // Attempt to extract Task DAG from Planner output
    let newTasks: Task[] = [];
    try {
      const lastMsg = res.messages[res.messages.length - 1].content.toString();
      const jsonMatch = lastMsg.match(/\{[\s\S]*"tasks"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed.tasks)) {
           newTasks = parsed.tasks.map((t: any) => ({
             id: t.id || `task-${Math.random().toString(36).substr(2, 5)}`,
             description: t.description || t.name || "Untitled task",
             status: 'pending',
             dependencies: t.dependencies || []
           }));
        }
      }
    } catch (err: any) {
      logger.error({ err }, "Failed to parse Task DAG from planner output");
    }

    return { 
      messages: res.messages,
      task_dag: newTasks
    };
  };

  const coderNode = async (state: typeof DeepAgentState.State) => {
    const contextMessages = (state.summary_context || "").length > 0 ? [new SystemMessage(`CONTEXT SUMMARY: ${state.summary_context}`)] : [];
    const res = await coderAgent.invoke({ 
      messages: [...contextMessages, ...state.messages] 
    }, { runName: "coder" });
    return { messages: res.messages };
  };

  const auditorNode = async (state: typeof DeepAgentState.State) => {
    const contextMessages = (state.summary_context || "").length > 0 ? [new SystemMessage(`CONTEXT SUMMARY: ${state.summary_context}`)] : [];
    // Automatically prompt the auditor to run verification commands
    const verificationPrompt = new HumanMessage("System Instruction: Automatically run 'npm run build' or 'npm run lint' to verify code integrity. If failure occurs, list the specific errors and set the health status to FAILING.");
    
    const res = await auditorAgent.invoke({ 
      messages: [...contextMessages, ...state.messages, verificationPrompt] 
    }, { runName: "auditor" });
    
    const lastMsgContent = res.messages[res.messages.length - 1].content.toString().toLowerCase();
    
    // If auditor finds issues, flags failure, or shell_exec returned error codes
    const isFailing = 
      lastMsgContent.includes("fail") || 
      lastMsgContent.includes("error") || 
      lastMsgContent.includes("issue") ||
      lastMsgContent.includes("[error code");
    
    return { 
        messages: res.messages, 
        environment_health: isFailing ? 'failing' : 'good' 
    };
  };

  // 4. Build Graph
  const builder = new StateGraph(DeepAgentState)
    .addNode("orchestrator", orchestratorNode)
    .addNode("planner", plannerNode)
    .addNode("coder", coderNode)
    .addNode("auditor", auditorNode)
    
    .addEdge("__start__", "orchestrator")
    
    .addConditionalEdges("orchestrator", (state) => {
       if (state.current_agent === 'planner') return "planner";
       return "coder";
    })
    
    .addEdge("planner", "coder")
    .addEdge("coder", "auditor")
    
    .addConditionalEdges("auditor", (state) => {
       if (state.environment_health === 'failing') return "coder";
       return "__end__";
    });

  const graph = builder.compile({ checkpointer: sharedCheckpointer });
  return graph;
}
