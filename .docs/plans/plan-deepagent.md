# DeepAgent IDE Roadmap

## Goal
Build a web-based IDE powered by advanced AI coding assistants. DeepAgent leverages LangGraph to provide autonomous agents that can plan, code, and audit projects directly in the browser or on the host using a unified interface and backend execution.

## Stack
- Frontend: React 18, Vite, Tailwind CSS, Monaco Editor, Lucide React
- Backend: Node.js, Express, LangGraph, LangChain, @google/genai, OpenRouter
- State: Zustand (Frontend)

## Milestones
1. [x] Basic UI with resizable panes, Monaco Editor, File Tree
2. [x] Backend agent structure (AgentFactory, LangGraph)
3. [x] Agent Server Event stream interface implementation (SSE)
4. [x] Sandboxed shell execution support (InMemoryVFS logic + temp dirs)
5. [x] Code execution on HostVFS for local deployment mode
6. [x] Configuration loading (`deepagent.config.json` and env vars)
7. [x] Proper prompt configurations and roles (coder, planner, auditor)
8. [ ] Advanced Terminal UI with real-time feedback
9. [ ] Multi-agent collaboration interface (Plan, Code, Audit)
10. [ ] VFS persistence (IndexedDB for web, real FS for local)

## Open Questions
- How to better surface the outputs of shell execution in the UI?
- How to securely manage OpenRouter API keys locally versus web mode?
- Is it possible to stream the terminal output line-by-line during long-running tasks like `npm install`?
