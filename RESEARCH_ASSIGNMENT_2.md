# Deep Dive Research Assignment: AI Coding Agents Feature Parity & Context Pipelines

## 1. Feature Parity Matrix

The ecosystem of AI coding assistants is evolving rapidly. We analyzed key tools like **Google AI Studio (Build Mode)**, **Bolt.diy / Bolt.new**, **Claude Code / Cursor**, and **Gemini-CLI / Qwen-Code-CLI**.

### Core Platform Capabilities
| Feature | AI Studio (Build) | Bolt.diy | Claude Code / Cursor | Our IDE (Target) |
| :--- | :--- | :--- | :--- | :--- |
| **Orchestration** | Agentic Loop | Basic LLM Chain | Multi-Agent/Routing | **LangGraph Swarm** |
| **Execution Env** | Sandboxed Cloud Run | WebContainer (WASM) | Local File System | **In-Memory VFS + Local Node** |
| **Preview/Render**  | Iframe Live Render | Split Iframe | Localhost Browser | **Integrated Iframe** |
| **Terminal Access** | Managed (`npm run`) | Full Web-based shell | Full Local Shell | **Proxied Terminal** |
| **Version Control** | Basic Export | Git Integration | Full Git Integration | **Git Tracker / History** |

### Advanced Agent Tools
To achieve parity, our agent requires a comprehensive set of tools beyond basic file read/write:
1. `edit_file` / `multi_edit_file`: Replacing precise chunks (diff-based) instead of full-file rewriting.
2. `shell_exec`: Executing `npm install`, testing, or running background dev servers.
3. `search_web` & `read_url`: Fetching documentation dynamically when APIs change.
4. `grep_search`: Finding usages of variables or components across the workspace.
5. `list_dir` / `view_file`: Exploring the workspace without consuming massive tokens.
6. `lint_applet` / `compile_applet`: Checking syntax and build errors automatically.

### Token Consumption & Advanced Context Pipelines
Modern coding agents hit context limits quickly. We must implement advanced context pipelines:
1. **Semantic Code Maps (Tree-sitter/Ctags):** Instead of feeding entire files, maintain a lightweight map of exports, classes, and function signatures.
2. **Context Compression (Reflexion & Summarization):** Every $N$ turns, a background task condenses older messages into a "session summary" while keeping code diffs exact.
3. **Context Caching:** (e.g., Gemini's System Instruction Caching) Pre-loading the VFS and large framework docs to save 90% in token ingestion costs.
4. **.docs / agents.md Paradigm:** A persistent memory directory where the agent writes ADRs (Architecture Decision Records) and learned rules, reading them on session start to maintain long-horizon coherence.

## 2. Token Optimization Strategies
* **Diff-based Edits:** The agent outputs unified diffs or targeted replacement chunks rather than complete files.
* **Lazy Loading:** Files are only loaded into context when explicitly requested via a `read_file` tool, rather than passing the entire VFS in the system prompt.
* **Token Budgeting:** The Orchestrator agent dynamically allocates token budgets to worker nodes.

## 3. The Path to Parity
To bring our current project up to speed, we need to transition our basic LangGraph backend to an advanced **Read-Analyze-Write-Execute** loop.

1. **Terminal / Execution Tools:** Allow the backend to run commands `child_process.exec` so the agent can install dependencies.
2. **Advanced Tools Extension:** Upgrade our current `write_file`/`delete_file` with `edit_file` (chunk replacement) and `shell_exec`.
3. **Reactive Preview:** Fix our iframe preview to actually serve the Vite process dynamically instead of manually injecting raw HTML.
4. **Context Management Layer:** Remove the massive `fileTreeContext` dump and force the agent to use `explore_directory` and `read_file` tools.
