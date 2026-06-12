import { StateGraph, Annotation, messagesStateReducer } from "@langchain/langgraph";
import { BaseMessage, SystemMessage, AIMessage, HumanMessage, RemoveMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { IFileSystem } from "../services/vfs/index.js";
import { createTools } from "./tools/index.js";
import { sharedCheckpointer } from "./AgentFactory.js";
import { getCoderPrompt, getPlannerPrompt, getAuditorPrompt } from "../config/prompts.js";
import { getConfig } from "../config/index.js";
import { PlatformAgent } from "./PlatformAgent.js";
import { AgentTier, createDeepAgent } from "./BaseAgent.js";
import { logger } from "../utils/logger.js";
import { agentHooksService } from "../services/AgentHooksService.js";
import { vfsLockService } from "../services/VfsLockService.js";
import { agentLoggerService } from "../services/AgentLoggerService.js";

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
  current_agent: Annotation<'orchestrator' | 'planner' | 'coder' | 'auditor' | 'reviewer' | undefined>({
    reducer: (state, update) => update,
    default: () => undefined,
  }),
  execution_mode: Annotation<'plan' | 'normal' | 'yolo'>({
    reducer: (state, update) => update,
    default: () => 'normal',
  }),
});

function createModel(modelName: string, temperature: number, openRouterKey: string) {
  const isGeminiKey = openRouterKey.startsWith("AIzaSy") || !openRouterKey.startsWith("sk-");
  
  if (isGeminiKey) {
    let sanitizedModelName = modelName.replace("models/", "").replace("google/", "");
    if (!sanitizedModelName.toLowerCase().includes("gemini")) {
      sanitizedModelName = "gemini-3.5-flash";
    }
    return new ChatOpenAI({
      apiKey: openRouterKey,
      configuration: {
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      },
      modelName: sanitizedModelName,
      temperature: temperature,
    });
  }

  return new ChatOpenAI({
    apiKey: openRouterKey,
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
export function createSwarmGraph(vfs: IFileSystem, openRouterKey: string, modelName?: string) {
  const config = getConfig();
  const tools = createTools(vfs);
  
  const orchestratorPrompt = "You are the Orchestrator. Direct the user query to 'planner', 'coder', or 'auditor' by returning a structured plan.";

  // Create sub-agents using standard React agent or simple LLM wrappers
  const plannerModel = createModel("google/gemma-4-31b-it", config.agent.plannerTemperature, openRouterKey);
  const selectedModel = modelName || config.agent.defaultModel || "openrouter/owl-alpha";
  const coderModel = createModel(selectedModel, config.agent.coderTemperature, openRouterKey);
  const auditorModel = createModel("meta-llama/llama-3.3-70b-instruct", 0.1, openRouterKey);
  const reviewerModel = createModel("google/gemma-4-31b-it", 0.1, openRouterKey);

  // Tools limits per agent (Limiting reviewer from write parameters)
  const basePlannerTools = tools.filter(t => ["list_dir", "read_file", "get_semantic_map"].includes(t.name));
  const baseCoderTools = tools;
  const baseAuditorTools = tools.filter(t => ["list_dir", "read_file", "shell_exec"].includes(t.name));
  const baseReviewerTools = tools.filter(t => ["list_dir", "read_file", "get_semantic_map", "semanticSearch", "tool_search", "grep_ast", "find_symbol_references"].includes(t.name));

  // Initialize intermediate references to close dependencies
  let plannerAgent: any;
  let coderAgent: any;
  let auditorAgent: any;
  let reviewerAgent: any;

  // Multi-threaded agent caller tool setup
  const call_sub_agent = tool(
    async ({ agent_type, instructions, context_mode, parallel_calls }, { configurable }) => {
      const threadId = configurable?.thread_id;

      const executeSingleAgent = async (type: "planner" | "coder" | "auditor" | "reviewer", inst: string, mode: "none" | "compressed") => {
        let targetAgent;
        let roleName = "";
        
        if (type === 'planner') {
          targetAgent = plannerAgent;
          roleName = "Strategic Planner";
        } else if (type === 'coder') {
          targetAgent = coderAgent;
          roleName = "Code Generator";
        } else if (type === 'auditor') {
          targetAgent = auditorAgent;
          roleName = "Security & QA Auditor";
        } else if (type === 'reviewer') {
          targetAgent = reviewerAgent;
          roleName = "Code Reviewer";
        } else {
          return `Error: Unknown agent type '${type}'. Valid types are: planner, coder, auditor, reviewer.`;
        }

        let contextPrefix = "";
        if (mode === 'compressed' && threadId) {
          try {
            const threadConfig = { configurable: { thread_id: threadId } };
            const state = await sharedCheckpointer.getTuple(threadConfig) as any;
            const msgs = (state?.checkpoint?.channel_values?.messages || state?.values?.messages) as BaseMessage[] | undefined;
            if (msgs && msgs.length > 0) {
              const recentMsgs = msgs.slice(-10);
              const historyStr = recentMsgs.map(m => `[${m._getType()}]: ${m.content.toString().substring(0, 300)}`).join('\n');
              
              const summarizerModel = createModel("google/gemma-4-31b-it", 0, openRouterKey);
              const summaryResponse = await summarizerModel.invoke([
                new SystemMessage("Summarize the following developer conversation history to capture key tasks, resolved issues, files modified, and open items. Keep it technical, dense, and under 250 words."),
                new HumanMessage(historyStr)
              ]);
              contextPrefix = `CONTEXT SUMMARY OF PREVIOUS TURNS:\n${summaryResponse.content.toString()}\n\n`;
            }
          } catch (err: any) {
            logger.error({ err }, "Failed to compress history context for sub-agent call");
            contextPrefix = `[Context fetch failed, executing with instructions only]\n\n`;
          }
        }

        const finalPrompt = `${contextPrefix}TASK INSTRUCTIONS:\n${inst}`;
        
        await agentHooksService.trigger("turn_start", {
          threadId: threadId || "sub-agent-call",
          inputState: { messages: [new HumanMessage(finalPrompt)] },
          vfs,
        });

        agentLoggerService.logEvent(
          threadId || "sub-agent-call",
          type.toUpperCase() as any,
          `Initiating sub-agent execution for [${roleName}] with instruction preview: "${inst.substring(0, 100)}..."`,
          "INFO"
        );

        const startAgent = Date.now();
        let result;
        try {
          result = await targetAgent.invoke({
            messages: [new HumanMessage(finalPrompt)]
          });
        } catch (err: any) {
          const duration = Date.now() - startAgent;
          agentLoggerService.logEvent(
            threadId || "sub-agent-call",
            type.toUpperCase() as any,
            `Sub-agent [${roleName}] execution threw error: "${err.message}"`,
            "ERROR",
            duration
          );
          throw err;
        }
        
        const duration = Date.now() - startAgent;
        const lastMsg = result.messages[result.messages.length - 1];
        
        agentLoggerService.logEvent(
          threadId || "sub-agent-call",
          type.toUpperCase() as any,
          `Sub-agent [${roleName}] completed run successfully.`,
          "SUCCESS",
          duration,
          { responseLength: lastMsg.content.toString().length }
        );

        return `### Sub-Agent [${roleName}] Output:\n${lastMsg.content.toString()}`;
      };

      if (parallel_calls && parallel_calls.length > 0) {
        logger.info(`Running ${parallel_calls.length} sub-agents in parallel...`);
        const promises = parallel_calls.map(call => 
          executeSingleAgent(call.agent_type, call.instructions, call.context_mode || 'none')
            .catch(err => `Error executing parallel sub-agent (${call.agent_type}): ${err.message}`)
        );
        const results = await Promise.all(promises);
        return results.map((res, idx) => `## Parallel Agent Call #${idx + 1} (${parallel_calls[idx].agent_type}):\n${res}`).join('\n\n');
      } else {
        return await executeSingleAgent(agent_type, instructions, context_mode || 'none');
      }
    },
    {
      name: "call_sub_agent",
      description: "Invoke a specialized sub-agent (planner, coder, auditor, reviewer) in either sequential or parallel mode. Can be called with either zero context or a compressed version of recent conversation history.",
      schema: z.object({
        agent_type: z.enum(['planner', 'coder', 'auditor', 'reviewer']).describe("The role/agent to invoke for this task."),
        instructions: z.string().describe("Specific instructions/prompts detailing the task to be performed by the sub-agent."),
        context_mode: z.enum(['none', 'compressed']).default('none').describe("Choose 'none' for zero-context instructions, or 'compressed' to include a dense, compiled summary of the recent conversation history."),
        parallel_calls: z.array(z.object({
          agent_type: z.enum(['planner', 'coder', 'auditor', 'reviewer']),
          instructions: z.string(),
          context_mode: z.enum(['none', 'compressed']).optional()
        })).optional().describe("If provided, the listed agent calls will be executed concurrently using parallel multi-threaded style async execution. The root 'agent_type'/'instructions' are ignored when this list is populated.")
      })
    }
  );

  // Instantiating final bounded agents
  plannerAgent = createDeepAgent({
    llm: plannerModel,
    tools: [...basePlannerTools, call_sub_agent],
    manifest: {
      tier: AgentTier.TIER_1_CORE,
      role: "Strategic Planner",
      capabilities: ["DAG decomposition", "Asset mapping", "Implementation strategy", "Sequential/Parallel agent execution"]
    },
    systemPrompt: getPlannerPrompt()
  });

  coderAgent = createDeepAgent({
    llm: coderModel,
    tools: [...baseCoderTools, call_sub_agent],
    manifest: {
      tier: AgentTier.TIER_1_CORE,
      role: "Code Generator",
      capabilities: ["VFS modification", "UI development", "Refactoring", "Sequential/Parallel agent execution"]
    },
    systemPrompt: getCoderPrompt()
  });

  auditorAgent = createDeepAgent({
    llm: auditorModel,
    tools: [...baseAuditorTools, call_sub_agent],
    manifest: {
      tier: AgentTier.TIER_2_SPECIALIZED,
      role: "Security & QA Auditor",
      capabilities: ["Build verification", "Static analysis", "Vulnerability scanning", "Sequential/Parallel agent execution"]
    },
    systemPrompt: getAuditorPrompt()
  });

  reviewerAgent = createDeepAgent({
    llm: reviewerModel,
    tools: [...baseReviewerTools, call_sub_agent],
    manifest: {
      tier: AgentTier.TIER_2_SPECIALIZED,
      role: "Code Reviewer & Quality Auditor",
      capabilities: ["Static analysis", "Code style review", "Token optimization"]
    },
    systemPrompt: "You are the Code Reviewer agent. Review the provided code and context for correctness, formatting, potential bugs, style issues, and performance optimizations. Provide clear feedback and constructive recommendations. Do NOT make modifications to the system yourself — you possess read-only permissions and must report observations back."
  });

  const orchestratorModel = createModel("google/gemma-4-31b-it", 0, openRouterKey);

  // 3. Define Nodes
  const orchestratorNode = async (state: typeof DeepAgentState.State, config?: any) => {
    let returnedMessages: BaseMessage[] = [];
    let updatedSummary = state.summary_context;
    const threadId = config?.configurable?.thread_id || "system-general";

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

    // Dynamic Task Complexity Discernment Analysis
    const complexityPrompt = `
    You are the SWARM ORCHESTRATOR. Analyze the user request for architectural and execution complexity.
    Classify the task into one of two tiers:
    - 'simple': Minor code tweaks, text edit, styling adjustments, adding single assets, single-view calculator/todo lists, simple visual tweaks, single simple questions. Bypasses multi-agent planning.
    - 'complex': Large code features, multi-file refactoring, systems architecture, adding new major pages, database connections, parallel tasks.
    
    Respond in strict JSON:
    {
      "complexity": "simple" | "complex",
      "rationale": "One-sentence rationale explaining the classification decision"
    }
    `;

    let complexity = "simple";
    let rationale = "Defaulting to direct execution for speed.";
    try {
      const classificationRes = await orchestratorModel.invoke([
        new SystemMessage(complexityPrompt),
        ...state.messages.slice(-2) // last 2 messages for instant decision
      ]);
      
      const cleaned = classificationRes.content.toString().trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (parsed.complexity === "complex") {
          complexity = "complex";
        }
        rationale = parsed.rationale || rationale;
      }
    } catch (err) {
      // Ignore and fallback to simple
    }

    const decision = complexity === "complex" ? "planner" : "coder";

    // Publish to central message bus
    vfsLockService.publishEvent({
      source: "Orchestrator",
      type: "info",
      message: `Task complexity assessed as [${complexity.toUpperCase()}]. Routing directly to [${decision.toUpperCase()}]. Rationale: ${rationale}`
    });

    agentLoggerService.logEvent(
      threadId,
      "ORCHESTRATOR",
      `Assessed task complexity as ${complexity.toUpperCase()} (Rationale: ${rationale}). Routing dynamic execution path to: ${decision.toUpperCase()}`,
      "SUCCESS",
      undefined,
      { complexity, rationale, nextAgent: decision }
    );

    returnedMessages.push(new AIMessage(`[Orchestrator] Task Complexity: **${complexity.toUpperCase()}**.\n*Routing to ${decision === "planner" ? "Strategic Planner for layout decomposition" : "Code Generator directly (fast execution path)"}*.\n*Rationale: ${rationale}*`));

    return { 
        current_agent: decision, 
        messages: returnedMessages,
        summary_context: updatedSummary
    };
  };

  const plannerNode = async (state: typeof DeepAgentState.State, config?: any) => {
    const threadId = config?.configurable?.thread_id || "system-general";
    agentLoggerService.logEvent(
      threadId,
      "PLANNER",
      "Strategic planner node active. Drafting project structure and task breakdown schema.",
      "INFO"
    );

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

    agentLoggerService.logEvent(
      threadId,
      "PLANNER",
      `Planning formulated successfully. Formed dynamic Task DAG with ${newTasks.length} milestone items.`,
      newTasks.length > 0 ? "SUCCESS" : "WARNING",
      undefined,
      { taskCount: newTasks.length }
    );

    return { 
      messages: res.messages,
      task_dag: newTasks
    };
  };

  const coderNode = async (state: typeof DeepAgentState.State, config?: any) => {
    const threadId = config?.configurable?.thread_id || "system-general";
    agentLoggerService.logEvent(
      threadId,
      "CODER",
      `Code Generator node active. Creating/updating file structures inside isolated virtual namespace.`,
      "INFO"
    );

    const contextMessages = (state.summary_context || "").length > 0 ? [new SystemMessage(`CONTEXT SUMMARY: ${state.summary_context}`)] : [];
    const res = await coderAgent.invoke({ 
      messages: [...contextMessages, ...state.messages] 
    }, { runName: "coder" });

    agentLoggerService.logEvent(
      threadId,
      "CODER",
      `Code execution phase finalized. Virtual file system adjustments successfully recorded.`,
      "SUCCESS"
    );

    return { messages: res.messages };
  };

  const auditorNode = async (state: typeof DeepAgentState.State, config?: any) => {
    const threadId = config?.configurable?.thread_id || "system-general";
    agentLoggerService.logEvent(
      threadId,
      "AUDITOR",
      "Security & Quality Auditor node active. Testing build soundness & static code checking.",
      "INFO"
    );

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
    
    agentLoggerService.logEvent(
      threadId,
      "AUDITOR",
      `Security/QA verification finalized. Direct test status is: ${isFailing ? "FAILING (re-triggering remedial generation)" : "GOOD (passed compliance check)"}.`,
      isFailing ? "ERROR" : "SUCCESS",
      undefined,
      { environment_health: isFailing ? "failing" : "good" }
    );

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

  const graph = builder.compile({ 
    checkpointer: sharedCheckpointer,
  });
  return graph;
}
