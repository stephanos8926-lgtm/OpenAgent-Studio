import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, Annotation, END, START } from "@langchain/langgraph";
import { HumanMessage, SystemMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

// Define the State structure for our Event-Driven Pipeline
export const SwarmState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  tasks: Annotation<{ id: string; description: string; status: "pending" | "in_progress" | "complete" }[]>({
    reducer: (x, y) => [...x, ...y], // Simple append for demo
    default: () => [],
  }),
  environment_health: Annotation<"healthy" | "degraded" | "failing">({
    reducer: (x, y) => y, // Overwrite
    default: () => "healthy",
  }),
  build_logs: Annotation<string>({
    reducer: (x, y) => y, // Overwrite
    default: () => "",
  }),
  security_alerts: Annotation<string[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
});

/**
 * Creates the Subagent Mesh Event Pipeline.
 * 
 * Free Tool-Calling Models utilized via OpenRouter:
 * 1. google/gemini-2.0-flash:free -> Orchestrator (Large Context, Fast Routing)
 * 2. qwen/qwen-2.5-coder-32b-instruct:free -> Worker Node (Specialized Code Gen)
 * 3. meta-llama/llama-3.3-70b-instruct:free -> Security/Health Auditor (Deep Reasoning)
 */
export function createSwarmPipeline(openRouterKey: string, vfsRef: Record<string, string>) {

  // Tools
  const write_file = tool(
    async ({ path, content }) => {
      vfsRef[path] = content;
      return `Successfully wrote ${path}`;
    },
    {
      name: "write_file",
      description: "Write content to a file in the workspace.",
      schema: z.object({
        path: z.string(),
        content: z.string(),
      }),
    }
  );

  const tools = [write_file];

  // Model Initialization
  const orchestratorModel = new ChatOpenAI({
    openAIApiKey: openRouterKey,
    configuration: { baseURL: "https://openrouter.ai/api/v1" },
    modelName: "google/gemini-2.0-flash:free",
    temperature: 0.1,
  });

  const workerModel = new ChatOpenAI({
    openAIApiKey: openRouterKey,
    configuration: { baseURL: "https://openrouter.ai/api/v1" },
    modelName: "qwen/qwen-2.5-coder-32b-instruct:free",
    temperature: 0.1,
  });

  const securityModel = new ChatOpenAI({
    openAIApiKey: openRouterKey,
    configuration: { baseURL: "https://openrouter.ai/api/v1" },
    modelName: "meta-llama/llama-3.3-70b-instruct:free",
    temperature: 0.1,
  });

  // Nodes
  async function orchestrator(state: typeof SwarmState.State) {
    const sysPrompt = new SystemMessage(
      "You are the Main Platform Orchestrator. Evaluate the user request. " +
      "If the user wants a large app, decompose it into smaller tasks by outputting a JSON task list. " +
      "If the environment is degraded, inform the user."
    );
    // Simple pass-through for demo purposes
    const response = await orchestratorModel.invoke([sysPrompt, ...state.messages]);
    return { messages: [response] };
  }

  async function taskDecomposer(state: typeof SwarmState.State) {
    // Break down complex user requests into discrete actionable tasks
    return { };
  }

  async function workerMesh(state: typeof SwarmState.State) {
    const sysPrompt = new SystemMessage("You are a Qwen Coder Subagent. Write code using tools.");
    const workerWithTools = workerModel.bindTools(tools);
    const response = await workerWithTools.invoke([sysPrompt, ...state.messages]);
    return { messages: [response] };
  }

  async function healthAndSecurityMonitor(state: typeof SwarmState.State) {
    // This node acts as an auditor. Evaluates build logs / code security.
    const sysPrompt = new SystemMessage("You are a Llama Security Auditor. Evaluate the current code.");
    // Evaluate logic here...
    return { environment_health: "healthy" as const };
  }

  // Define Graph Edges (Routing Logic)
  function orchestratorRouter(state: typeof SwarmState.State) {
    const lastMsg = state.messages[state.messages.length - 1];
    if ((lastMsg as any).tool_calls?.length) {
      // For now, in a real system we would route to tasks or tools
      return "workerMesh";
    }
    // We can conditionally route to Security Check or End
    return "__end__";
  }

  function workerRouter(state: typeof SwarmState.State) {
    // After doing work, go to health monitor
    return "healthAndSecurityMonitor";
  }

  // Construct the StateGraph
  const workflow = new StateGraph(SwarmState)
    .addNode("orchestrator", orchestrator)
    .addNode("taskDecomposer", taskDecomposer)
    .addNode("workerMesh", workerMesh)
    .addNode("healthAndSecurityMonitor", healthAndSecurityMonitor)
    .addEdge(START, "orchestrator")
    // Note: To fully implement LangGraph React Agent tool-execution loops you'd add ToolNode here
    .addConditionalEdges("orchestrator", orchestratorRouter)
    .addConditionalEdges("workerMesh", workerRouter)
    .addEdge("healthAndSecurityMonitor", "orchestrator"); // Loop back to orchestrator for decision

  // Compile it
  const swarmApp = workflow.compile();

  return swarmApp;
}
