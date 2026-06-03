# DeepAgent IDE: Feature Parity Research & Competitive Analysis

## 1. Competitive Overview
This document evaluates DeepAgent IDE against leading AI coding agents and environments: **Bolt.diy**, **AI Studio (Build Mode)**, **Claude Code**, **Qwen-Code-CLI**, and **DeepAgent SDK**.

| Feature | Bolt.diy | AI Studio | Claude Code | DeepAgent IDE (Current) | Parity Gap |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Agent Architecture** | Plan-Execute | Single Model | High-Horizon CLI | Multi-Agent Swarm (LangGraph) | ✅ Leading |
| **Terminal** | WebContainer | Basic | Native Local | xterm.js (Streaming) | ⚠️ Streaming needs VT100 stability |
| **Environment Check** | Auto npm install | Managed | Manual/CLI | Auditor-Led Auto-Healing | ✅ Implemented |
| **Context Optimization** | File Dumping | Massive Context | Semantic/Tags | AST Semantic Mapping | ⚠️ Needs automated indexing (pre-emptive) |
| **UX / UI** | Visual Sidebar | Google Standard | CLI Only | Monaco + Custom UI | ✅ Strong Base |
| **Multi-Agent Visualization** | Limited | None | None | Hidden in Logs | ❌ Missing UI representation of Swarm state |

---

## 2. Deep Dive: Where to Improve

### A. Semantic Indexing & "Code Intelligence" (Claude Code / Cursor Parity)
*   **Gap:** Currently, `get_semantic_map` must be manually called by the agent. 
*   **Improvement:** Implement a background "Indextor" agent (or process) that maintains an up-to-date Semantic Map of the entire workspace in the StateGraph, allowing the Orchestrator to route based on function signatures without any tool calls.

### B. Terminal Interaction (Bolt.diy Parity)
*   **Gap:** Our `shell_exec` is purely one-way streaming. We don't support interactive terminal inputs (e.g., answering "Y/n" prompts in the UI).
*   **Improvement:** Upgrade the PTY implementation to support bidirectional socket communication through the server to the frontend `xterm.js`.

### C. Swarm Visualization (Bolt.diy / Devin Parity)
*   **Gap:** Users can't see the "thinking" of the Planner vs the Coder vs the Auditor in a structured way.
*   **Improvement:** Build a "Swarm Console" in the UI that shows the active LangGraph node and the current "Task Queue".

### D. Long-Horizon Tasks & Persistence (Claude Code Parity)
*   **Gap:** State persists during a session, but complex "Plan -> Execute -> Audit -> Fail -> Repair -> Audit -> Pass" loops can consume massive tokens.
*   **Improvement:** Implement "Checkpoint Compression" where intermediate tool outputs are summarized by the PlatformAgent before the next iteration, keeping ONLY the current file versions and the final error/success summary.

---

## 3. Implementation Roadmap to Parity
1.  **[High Priority]** Bidirectional PTY for interactive terminal.
2.  **[High Priority]** "Swarm Radar" UI component for agent visibility.
3.  **[Medium Priority]** Background AST indexing (Tree-sitter daemon).
4.  **[Low Priority]** One-click "Deploy to Cloud Run" orchestration.
