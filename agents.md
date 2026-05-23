# DeepAgent Knowledge Base

## Meta-Instructions
- Use `.docs/plans/plan-deepagent.md` for project milestones and roadmap.
- Use `.docs/status-deepagent.json` for tracking task states.
- The backend relies on a custom Vite + Express setup (`server.ts`).
- Ensure all file operations target `InMemoryVFS` for browser setups or `HostVFS` for actual file system operations.

## Learned Patterns

[2026-05-18] FEATURE: File Tree directories grouping
- We implemented a hierarchical recursive structure to map `path/to/file.ts` into actual visually collapsible folders in `Workspace.tsx`. Required using a separate recursive tree building rather than just mapping standard flat VFS strings.

[2026-05-18] BUG-PATTERN: Monaco Editor sync loop
- Directly passing `vfs[activeFile]` as `value` to `<Editor>` can sometimes cause cursor position loss if updated on every keystroke through global state. We transitioned to `defaultValue` with `onMount` reference updating to perform push edits on external system changes instead.

[2026-05-18] FEATURE: `shell_exec` agent sandboxing implementation
- The `shell_exec` tool can operate in memory by creating `tempDir`, wiring the VFS state into actual files, running commands via `execPromise`, syncing the result lockfiles/package files, and deleting the temp directory. This works well for `npm i` and lightweight tasks in an ephemeral mode.

## Backend Finalization Roadmap & Guide

### Overview
To achieve true feature parity with top-tier AI IDEs (Bolt.diy, AI Studio, Claude Code), we must transition our Express backend from simply wrapping `createReactAgent` to a fully autonomous, long-horizon **"Deep Agent" StateGraph**. 

### Phase 1: LangGraph Swarm Topology & State Management
1. **Custom StateGraph Engine:** Scrap the monolithic agent in favor of a multi-node Graph (Orchestrator -> Planner -> Worker -> Auditor).
2. **State Design:** The graph state must contain `messages`, `pending_tasks`, `completed_tasks`, and `environment_health`.
3. **Session Memory & Checkpointing:** Implement `@langchain/langgraph` `MemorySaver` properly to retain session memory and enable "Human in the Loop" breakpoints (asking user before destructive actions).
4. **Subagent Spawning:** Route specific nodes to specific OpenRouter free tools:
   - Planner/Orchestrator: `gemini-2.0-flash`
   - Coder Worker: `qwen-2.5-coder-32b-instruct`
   - Security Auditor: `llama-3.3-70b-instruct`

### Phase 2: Advanced Context & Tools Efficiency
1. **Remove Full VFS Context:** Completely eliminate injecting `vfs` keys/values into the prompt. Force the agent to rely on `list_dir` and `read_file`.
2. **Targeted Edits:** Add or enforce an `edit_file` tool that uses precise diffs or targeted replacements instead of full file rewrites. 
3. **Semantic Mapping (Tree-sitter):** Add a background AST parser that generates a semantic map (classes, exports) of the workspace to save tokens.
4. **Context Compression:** Summarize old message turns every N steps. 

### Phase 3: True Execution Engine & Reactive UI
1. **Streaming Terminal (Pty):** Upgrade `shell_exec` to multiplex pseudo-terminal (`pty`) streams over WebSockets. Update the React frontend (`Workspace.tsx`) to render these using `xterm.js` so build progress bars are visible live.
2. **File System Watchers:** Integrate `chokidar` (if using `HostVFS`) to alert the frontend when files change, avoiding manual tree recalculations.
3. **Continuous Auto-healing Loop:** The Auditor node automatically runs `npm run lint` or `npm run build` using the shell tools. If it fails, the error goes directly back into the task queue without user intervention.

### Development Guide (Rules of the Swarm)
- **Always preserve checkpoints:** Never wipe LangGraph threads unless the user explicitly resets the session.
- **Tools must be pure functions:** `read_file`, `write_file`, and `shell_exec` must never hold their own state. Let LangGraph handle the state.
- **Fail fast on shell execution:** Ensure `execPromise` timeouts are generous but strict to avoid infinite hanging loops.

## Reflection Checkpoints
[2026-05-18] Core functionality is heavily geared towards backend execution. Agents use tools like `read_file` and `shell_exec` seamlessly. Future focuses feature expanding terminal visualization strings into actual UI.
[2026-05-18] Checkpoint 2: LangGraph integration is complete. We now have a true Swarm (Orchestrator -> Planner -> Coder -> Auditor) interacting automatically. Added "Save All" button to sync VFS modified state with HostFS environment. `MARKET_GAP_ANALYSIS.md` created to map parity with Qwen-CLI, DeepAgent SDK, Bolt.diy and Claude Code.
[2026-05-18] Checkpoint 3: Extended Auditor agent to automatically run build/lint verification using `shell_exec`. Implemented auto-healing loop in StateGraph (Auditor Failure -> Coder Repair). Completed initial Feature Parity research document detailing gaps in semantic indexing and terminal interactivity.
[2026-05-18] Checkpoint 4: Implemented advanced context compression using PlatformAgent. When conversation history exceeds 20 messages, the Service Layer summary logic condenses intermediate turns into a concise state summary, preserving technical context (file states, tasks, errors) while drastically reducing orchestrator overhead.
[2026-05-18] Checkpoint 5: Implemented `SchedulerService` using `node-cron`. The Platform Architect now runs an automated maintenance loop every 30 minutes. Added `schedule_task` tool, allowing agents and users to register recurring background jobs for long-horizon monitoring and self-healing. Added "Maintenance" dashboard to the Workspace UI.
[2026-05-18] Checkpoint 6: Refined Context Compression to use a persistent `summary_context` in the StateGraph. This ensures that technical state (build errors, file modifications) is explicitly carried forward and injected into sub-agent system prompts, preventing context loss during long-horizon pruning.
[2026-05-18] Checkpoint 7: Absorbed RapidWebs Enterprise Standards. Implemented Tiered Agent Architecture (Tier 1-3), Security Warden tool wrapping to intercept destructive commands, and formal Task DAG state management in LangGraph. Planner now enforces DAG decomposition before Coder execution.
[2026-05-19] Checkpoint 8: Implemented Swarm Observability via the Mesh Controller UI. The platform now streams real-time agent activation telemetry and Task DAG progress over SSE. Updated Planner to explicitly parse DAG JSON from outputs, enabling hierarchical task tracking and visual state feedback for the user.
[2026-05-19] Checkpoint 9: Implemented SQL-based State Persistence. Switched from ephemeral `MemorySaver` to `SqliteSaver` (PersistenceService). LangGraph agent states, conversation history, and Task DAGs now survive container resets and environment recycling by writing to `.data/swarm_state.db`.
[2026-05-20] Checkpoint 10: Fixed the stateless API POST /chat boundary context-compression bug. When frontend message history with freshly mapped IDs is submitted, we now query the persistence layer checkpoint (`getState`) to align state index on matching type/role and trimmed content. This ensures we feed *only* new increments to the graph, enabling pruned messages to disappear permanently and preventing duplicating messages upon consecutive prompts. We also ensured the orchestrator prompt immediately consumes the `updatedSummary` when pruning runs.
[2026-05-20] Checkpoint 11: Corrected a fatal top-level race condition where `AgentFactory.ts` was importing and calling `.getSaver()` synchronously inside top-level execution before `PersistenceService` had completed initial boot in `startServer()`. By updating `PersistenceService` to lazily instantiate `SqliteSaver` upon the first request (and securely guarding the helper within the class getter runtime), we've made the system completely resilient to modular evaluation orders and solved the "failed to initialize applet error".

