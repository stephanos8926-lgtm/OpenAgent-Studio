# Enterprise Design Specification: DeepAgent IDE

## 1. System Architecture Overview
The DeepAgent IDE is designed as a decoupled, standard Client-Server architecture. This segregation enforces a clear boundary between the presentation layer (Client) and the execution/orchestration layer (Backend API Service). 

By treating the backend as a distinct REST/WebSocket API Service, we ensure that:
*   The frontend remains a lightweight, reactive SPA (Single Page Application).
*   The backend can scale independently, handle intensive LangGraph computations, and manage the Virtual File System (VFS) or physical execution environments.

---

## 2. Backend Design (API Service)

The backend acts as an API-first service, exposing endpoints and streams for the frontend to consume. 

### Proposed Directory Structure:
```text
/src
  /server
    /core           # Application bootstrapping, DI Containers, Server instantiation
    /middleware     # Express middlewares (Logging, Error Handling, Auth, Validation)
    /utils          # Singleton Loggers, generic utilities
    /services
      /vfs          # Virtual File System definitions (IFileSystem interface)
      /execution    # Shell execution and Docker/Temp-dir management
    /agents
      /mesh         # Subagent Swarm definitions (LangGraph StateGraphs)
      /tools        # Polymorphic tool definitions (shell, edit, list)
    /routes         # API Endpoint controllers (e.g., /api/chat, /api/fs)
```

### Key Paradigms:
1.  **API Controllers & Routes:** `server.ts` will strictly be an entry point that registers routes defined in `src/server/routes/`. 
2.  **Stateless/Stateful REST & SSE:** The `/api/chat` endpoint is an EventStream (SSE) for streaming LangGraph tool calls and tokens. Future endpoints like `/api/fs` will be standard REST for fetching/updating literal files avoiding the LLM route.
3.  **The "Deep Agents" Implementation:** We use `@langchain/langgraph` to build customized Planners, Checkpointers, and Checkpoint Savers natively in Node.js TypeScript.

---

## 3. Frontend Design (Client SPA)

The frontend is a React application built with Vite, consuming the Backend API Service.

### Proposed Directory Structure:
```text
/src
  /client
    /components     # React UI components (Chat, Workspace, Terminal)
    /lib            # Zustand Store for state, API clients wrapper
    /hooks          # Custom React hooks
    /styles         # Tailwind configuration & global CSS
```

### Key Paradigms:
1.  **API Client Layer:** All HTTP/SSE calls to the backend should be abstracted into a service class or custom hooks (e.g., `useChatAPI()`), separating transport from UI logic.
2.  **Global Store (Zustand):** Manages the VFS local mirror state, terminal logs, and chat messages.
3.  **Reactive Editors & Terminals:** Using Monaco Editor and xterm.js synced to the Zustand store.

---

## 4. Design Patterns & Best Practices

To future-proof the application, we employ several industry-standard design patterns across both stacks:

### A. Polymorphism & Class Templates (interfaces)
**The Virtual File System (VFS):** We will define an `IFileSystem` interface. 
*   `InMemoryVFS` (Current): Implements `IFileSystem` using a Javascript Object.
*   `HostVFS` (Future): Implements `IFileSystem` to interact with physical OS directories using `fs/promises`.
This allows the LangGraph agents to run in either sandbox without changing their tool implementations.

### B. The Singleton Pattern
*   **Logging Service (`Logger`):** Guaranteed single instance of `pino` across the backend.
*   **Checkpointer (`MemorySaver` / `PgSaver`):** Single instance managing thread persistence.
*   **App Store:** Zustand acts as our singleton state tree on the client.

### C. The Factory Pattern
*   **Agent Spawning:** `AgentFactory.createRunner('coder' | 'planner' | 'auditor')` will return dynamically configured Langchain Chat models with pre-bound system prompts and tools.
*   **Tool Factory:** Dynamically generating Zod schemas based on the target `IFileSystem`.

### D. Middleware & Interceptors
1.  **Request Logging:** Every HTTP request hits a `pino-http` middleware to track `req_id`, latency, and payload size.
2.  **Global Error Handling:** Centralized error middleware formats errors standardly: `{ error: true, code: '...', message: '...' }` preventing raw stack traces from leaking to the frontend.
3.  **State/Validation:** Zod parsing middleware injected before controller execution.
