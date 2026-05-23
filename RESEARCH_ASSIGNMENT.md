# Research Assignment: Free OpenRouter Models & LangGraph Event-Driven Swarm Architecture

## Part 1: Free Models on OpenRouter with Tool Calling Support
Based on recent capabilities provided by OpenRouter, the platform offers several high-quality "free" endpoint models that explicitly support **function/tool calling**. To build a robust multi-agent swarm without incurring costs, we can pair specialized tasks with these models:

### 1. `google/gemini-2.0-flash:free` & `google/gemini-2.0-flash-lite-preview-02-05:free`
*   **Role in Swarm:** Main Platform Orchestrator & Task Decomposer.
*   **Why:** Gemini 2.0 Flash models feature massive context windows (up to 1M tokens), high speed, and native, reliable JSON schema and tool-calling capabilities. It excels at consuming large amounts of logs (for health/build monitoring) and delegating tasks.

### 2. `meta-llama/llama-3.3-70b-instruct:free`
*   **Role in Swarm:** Security Auditor & Health Moniter.
*   **Why:** Llama 3.3 70B provides near state-of-the-art analytical reasoning. It is ideal for security evaluations, deep code auditing, and interpreting complex build failures where logical deduction is paramount. It supports tool calling natively.

### 3. `qwen/qwen-2.5-coder-32b-instruct:free`
*   **Role in Swarm:** Code Generator / Worker Node.
*   **Why:** Qwen 2.5 Coder is explicitly trained for software development tasks. It is arguably the best free coding model and works perfectly as the "worker" in the subagent mesh, utilizing file-writing tools to execute tasks.

### 4. `mistralai/mistral-nemo:free` (12B) / `mistralai/mistral-7b-instruct:free`
*   **Role in Swarm:** Fast, simple API interaction subagents or routing classifiers.
*   **Why:** Very low latency and strict adherence to system prompts. 

---

## Part 2: LangGraph Event-Driven Pipeline Architecture
To solve for long-horizon tasks and agentic swarms, we must move away from a traditional linear chain to a cyclic, state-managed **StateGraph** in LangGraph.

### System State Design
The environment state will serve as the "event bus" for the pipeline:
```typescript
interface SwarmState {
    messages: BaseMessage[];
    pending_tasks: Task[];
    completed_tasks: Task[];
    environment_health: "healthy" | "degraded" | "failing";
    build_logs: string;
    security_alerts: string[];
    current_assignee: string;
}
```

### The Nodes (Agent Mesh)
1.  **Platform Orchestrator (The Supervisor):** 
    Uses `gemini-2.0-flash:free`. Triggers on entirely new user requests. It reviews the `SwarmState` and decides whether to route to the Task Decomposer, or directly alert the user of Health/Security issues.
2.  **Task Decomposer (The Planner):** 
    Uses `llama-3.3-70b-instruct:free`. Takes a long-horizon user request (e.g., "Build a full stack Next.js app") and breaks it into discrete `Task` objects pushed to `pending_tasks`.
3.  **Subagent Mesh Manager:** 
    Pops the next task from `pending_tasks`. Routes the task to a specialized functional agent:
    *   *Code-Gen Subagent* (`qwen-2.5-coder-32b-instruct:free`) -> creates/edits files.
    *   *CLI Subagent* -> executes shell commands (e.g., npm install).
4.  **Health & Build Monitor:** 
    A background/cyclic node that triggers after file modifications. It reads build logs and environment status. If failures are detected, it updates `environment_health` and generates an auto-fix task for the Subagent Mesh.
5.  **Security Auditor:** 
    A gatekeeper node that runs before returning control to the user. Uses Llama-3.3 to flag potential vulnerabilities in the newly written code.

### Execution Flow (Event Loop)
1. **Event:** User sends message -> Node: **Orchestrator**.
2. **Event:** Task is too large -> Node: **Decomposer** creates a task graph.
3. **Event:** Tasks exist -> Node: **Subagent Manager** delegates to **Worker Subagents**.
4. **Event:** Worker finishes tool call (e.g. `write_file`) -> Node: **Health Monitor** checks compilation.
5. **Event:** Compilation fails -> **Health Monitor** adds an error resolution task back to the queue.
6. **Event:** Tasks queue empty & Compiled successfully -> Node: **Security Auditor**.
7. **Event:** Audit passes -> Node: **Orchestrator** summarizes for the user.

---

## Part 3: Implementation Strategy using `@langchain/langgraph`
To support this in your NodeJS/Express backend (`server.ts`):
1. **Initialize Multi-LLMs**: Instantiate different `ChatOpenAI` models passing the `baseURL: "https://openrouter.ai/api/v1"`.
2. **Define State**: Use `Annotation.Root({ ... })` to define the shared state object.
3. **Build Graph**: Connect the nodes. `graph.addNode("orchestrator", orchestratorFunction)`, etc.
4. **Conditional Edges**: Add logic that checks `state.pending_tasks.length > 0` to decide if the swarm needs to keep looping or if it's done.

This swarm topology allows the system to autonomously course-correct, delegate, and run iteratively—the core requirements of "long-horizon" agentic systems.
