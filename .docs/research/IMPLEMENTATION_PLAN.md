# Implementation Plan: True Agentic IDE

Based on our Deep Dive and our recent `MARKET_GAP_ANALYSIS.md`, here is the actionable path to achieve absolute feature parity with top-tier AI coding platforms (AI Studio, Bolt.diy, Cursor, Claude Code).

## Phase 1: Context Pipeline Efficiency & Swarm Creation
**Status:** ✅ Completed
*   **Remove VFS dumping:** Stopped passing the entire file system in the System Prompt.
*   **Swarm Graph (LangGraph):** Implemented multi-node StateGraph (Orchestrator -> Planner -> Coder -> Auditor).
*   **Granular Roles & Tools:** Planners have read access, Coders have write, Auditors have validation and execution flow.
*   **Context Compression:** Implemented basic context pruning when message queues exceed limits.

## Phase 2: Terminal Execution & Environment Health
**Status:** 🏗️ In Progress
*   **Implement `shell_exec` Tool:** Enabled safe shell execution with a PTY streaming wrapper.
*   **Streaming UI:** Begun plumbing terminal events to the frontend via Server Sent Events (`type: 'pty'`).
*   **Auto-Healing Loop:** Added conditional edges that route failed auditor states (e.g. `environment_health === 'failing'`) back to the Coder for automatic error correction.
*   *Next:* Complete real `xterm.js` integration in the frontend for live interactive shell preview.

## Phase 3: Advanced File Interactions & AST (The "Cursor" Path)
**Status:** ⏳ Pending
*   **Interactive Diffs:** Add UI in Monaco Editor to Approve/Reject incoming agent changes.
*   **Implement `edit_file` / Patching:** Move away from rewriting whole files toward targeted substring/diff patching.
*   **Tree-sitter Semantic Maps:** Implement a background parse that provides the agent a semantic tree of the workspace (classes, functions, exports).

## Phase 4: Frontend UI / UX Upgrades
**Status:** ⏳ Pending
*   **Multi-Agent Visualization:** Expose the internal state of the LangGraph node transitions to the end user (e.g. "Orchestrator routed to Coder...").
*   **Human-in-the-Loop:** Leverage LangGraph breakpoints to pause execution on destructive commands.
*   **Workspace Synchronization:** Fully polish VFS <> Host Sync. We added a `/save` endpoint, but need robust, bidirectional file watchers.

---
## Immediate Next Steps (Getting to Work)
1. Fix the terminal UI using `xterm.js` in `Workspace.tsx` to handle VT100 colors and proper streaming.
2. Build the Multi-Agent Visualization pane to display thoughts, plans, and active node status.
3. Investigate Tree-sitter for creating the `get_semantic_map` tool.
