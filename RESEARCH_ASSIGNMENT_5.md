# Research Assignment 5: LangChain "Deep Agents" SDK Overview

Based on the documentation provided for the `deepagents` OSS SDK by LangChain, this package formalizes exactly the architecture we've been attempting to reverse-engineer to achieve parity with Bolt.diy and AI Studio.

## Core Capabilities of Deep Agents SDK

The documentation outlines several crucial pillars for "Deep Agents":

### 1. Planning and Task Decomposition
Instead of purely reactive loops (like standard React Agents), Deep Agents explicitly separate the **Planning** phase from the **Execution** phase. Long-horizon tasks are broken into sub-tasks, tracked in the agent's state, and pursued systematically.

### 2. Context Management
Deep Agents implement automatic context-window management, likely through techniques like semantic AST generation (which we just added) and context summarization (Reflexion) to avoid flooding the LLM with the entire VFS at once.

### 3. Shell Execution & Interpreters
Securely running shell commands (`npm install`, `npm run dev`) and code interpreters (Python/JS runtimes) to verify code compilation and evaluate outputs automatically.

### 4. Pluggable Filesystem Backends & Permissions
Deep Agents interface with Virtual File Systems (VFS) or Physical/Ephemeral paths, while enforcing robust permission models (e.g., restricting destructive commands or write-access to specific scopes).

### 5. Subagent Spawning
The orchestrator dynamically spins up specialized workers (e.g., a Qwen-coder agent for writing React components, and a Llama-3.3 agent for auditing security).

### 6. Long-term Memory & Human-in-the-loop
Persisting the agent's trajectory using Checkpointers (like `MemorySaver`) enabling pausing state execution to ask the user for approval on specific high-risk tasks.

### 7. Skills
Giving the agent composable functional blocks (Skills) so it knows *how* to implement specific patterns without relying strictly on internal weights.

---

## What We Need to Do Next to Reach Complete Parity

Our current implementation in `server.ts` uses `createReactAgent` with a monolithic set of tools and a basic `MemorySaver`. While a massive improvement over our V1, it is missing the formal **Subagent Spawning** and **Planning/Task Decomposition** found in the Deep Agents SDK. 

### Final Sprint Implementation Goals:
1. **Ditch the Monolith (`createReactAgent`):** Build a custom `StateGraph` in LangGraph that formally implements the Orchestrator -> Planner -> Worker Mesh loop we designed in `src/lib/agents/swarm.ts`.
2. **True Reactive Frontend Terminal:** Upgrade the React UI (`Workspace.tsx`) to handle streaming Terminal Logs from the backend so that `npm install` and build tasks are rendered visually in real-time.
3. **Pluggable File System:** Ensure our temporary directory mounting in our `shell_exec` tool is robust enough to act as a proper WebContainer alternative. 
4. **Human-in-the-Loop:** Introduce backend states that pause waiting for a POST request when the agent tries to run potentially dangerous actions (like deleting multiple files).
