// File: src/lib/store.tsx

import React, { useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import { create } from 'zustand';
import { 
  TelemetryLog, 
  SystemMetrics, 
  TaskNode, 
  WorkspaceFile, 
  ChatMessage,
  LessonLearned,
  AgentOperationLog
} from '../types';
import { getStoredChat, saveChatHistory } from './db';
import { 
  saveWorkspaceFilesToSQLite, 
  loadWorkspaceFilesFromSQLite, 
  saveSystemConfigToSQLite, 
  loadSystemConfigFromSQLite,
  loadLessonsFromSQLite,
  saveLessonToSQLite,
  deleteLessonFromSQLite
} from './sqlite';

// Seed files in the virtual IDE backup
const INITIAL_FILES: WorkspaceFile[] = [
  {
    name: 'src',
    path: 'src',
    isDirectory: true,
    children: [
      {
        name: 'App.tsx',
        path: 'src/App.tsx',
        isDirectory: false,
        content: `export default function App() {\n  return (\n    <div className="flex bg-slate-950 text-white min-h-screen items-center justify-center">\n      <h1 className="text-2xl font-bold">New Agentic App</h1>\n    </div>\n  );\n}`
      },
      {
        name: 'main.tsx',
        path: 'src/main.tsx',
        isDirectory: false,
        content: `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\nimport './index.css';\n\nReactDOM.createRoot(document.getElementById('root')!).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);`
      },
      {
        name: 'index.css',
        path: 'src/index.css',
        isDirectory: false,
        content: `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n`
      }
    ]
  },
  {
    name: 'index.html',
    path: 'index.html',
    isDirectory: false,
    content: `<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Sandbox App</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>`
  },
  {
    name: 'package.json',
    path: 'package.json',
    isDirectory: false,
    content: `{\n  "name": "sandbox-app",\n  "private": true,\n  "version": "0.0.0",\n  "type": "module",\n  "scripts": {\n    "dev": "vite",\n    "build": "tsc -b && vite build"\n  },\n  "dependencies": {\n    "react": "^18.3.1",\n    "react-dom": "^18.3.1"\n  },\n  "devDependencies": {\n    "@types/react": "^18.3.3",\n    "@types/react-dom": "^18.3.0",\n    "@vitejs/plugin-react": "^4.3.1",\n    "autoprefixer": "^10.4.19",\n    "postcss": "^8.4.38",\n    "tailwindcss": "^3.4.4",\n    "typescript": "^5.2.2",\n    "vite": "^5.3.4"\n  }\n}`
  }
];

const INITIAL_TASKS: TaskNode[] = [
  { id: 't1', label: 'Route Strategy Verification', status: 'completed', assignedTo: 'orchestrator' },
  { id: 't2', label: 'DAG Dependency Planning', status: 'completed', assignedTo: 'planner' },
  { id: 't3', label: 'VFS Code Assembly', status: 'in_progress', assignedTo: 'coder' },
  { id: 't4', label: 'Semantic Compliance Scan', status: 'pending', assignedTo: 'auditor' },
  { id: 't5', label: 'Sandbox Warm Boot', status: 'pending', assignedTo: 'platform' }
];

export interface TelemetryPoint {
  step: string;
  "Prompt Tokens": number;
  "Completion Tokens": number;
  "Latency ms": number;
}

export interface AppStoreState {
  // Swarm Status States
  swarmState: {
    activeAgent: string;
    tasks: TaskNode[];
    health: 'good' | 'failing';
  };
  metrics: SystemMetrics;
  telemetryTimeline: TelemetryPoint[];
  terminalLogs: string[];
  logs: TelemetryLog[];
  activeBreakpoint: string | null;
  compilingState: 'idle' | 'running' | 'success' | 'failed';
  compilePercent: number;
  compileMessage: string;
  hmrUpdates: any[];
  showSettingsModal: boolean;
  socket: any;

  // Persistent SQL/IndexedDB states
  files: WorkspaceFile[];
  activeFile: WorkspaceFile | null;
  chatMessages: ChatMessage[];
  lessons: LessonLearned[];
  agentLogs: AgentOperationLog[];
  yoloMode: boolean;
  openRouterKey: string;
  modelName: string;
  apiProvider: 'google' | 'openrouter';

  // State Action methods
  loadAgentLogs: (filters?: { threadId?: string; status?: string; category?: string; query?: string; limit?: number }) => Promise<void>;
  clearAgentLogs: () => Promise<void>;
  loadLessons: () => Promise<void>;
  addLesson: (category: string, errorPattern: string, discoveredConstraint: string, remedialAction: string) => Promise<void>;
  deleteLesson: (id: string) => Promise<void>;
  setHmrUpdates: (val: any[] | ((prev: any[]) => any[])) => void;
  setCompilingState: (state: 'idle' | 'running' | 'success' | 'failed') => void;
  setCompilePercent: (percent: number) => void;
  setCompileMessage: (msg: string) => void;
  setYoloMode: (val: boolean) => void;
  setOpenRouterKey: (val: string) => void;
  setModelName: (val: string) => void;
  setApiProvider: (val: 'google' | 'openrouter') => void;
  setShowSettingsModal: (val: boolean) => void;
  setBreakpoint: (id: string | null) => void;
  setSwarmState: (state: any) => void;
  setActiveFile: (file: WorkspaceFile | null) => void;
  updateFileContent: (path: string, newContent: string) => void;
  proposeFileChange: (path: string, proposedContent: string) => void;
  clearFileProposal: (path: string) => void;
  appendTerminalLine: (line: string) => void;
  clearTerminal: () => void;
  sendChatMessage: (content: string) => void;
  injectLogEvent: (severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL', origin: 'IDE_SYSTEM' | 'USER_APPLICATION', module: string, message: string, detail?: string) => void;
  simulateCompileAction: (simulateBuildFailure: boolean) => Promise<void>;
  testAppRuntimeCrash: () => void;
  resetTelemetryStats: () => void;
  
  // Handlers to link WebSocket events to Zustand
  setSocketInstance: (s: any) => void;
  setTasksList: (tasks: TaskNode[]) => void;
  setActiveAgentName: (name: string) => void;
  
  // Database Initializer
  initDatabaseState: () => Promise<void>;
}

const findAppFile = (nodes: WorkspaceFile[]): WorkspaceFile | null => {
  for (const node of nodes) {
    if (node.path === 'src/App.tsx') return node;
    if (node.children) {
      const found = findAppFile(node.children);
      if (found) return found;
    }
  }
  return null;
};

const generateId = () => {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 9) + '-' + Math.random().toString(36).substring(2, 9);
};

// 2. High-performance Zustand Store Creation
export const useAppStore = create<AppStoreState>((set, get) => ({
  swarmState: {
    activeAgent: 'coder',
    tasks: INITIAL_TASKS,
    health: 'good'
  },
  metrics: {
    cpuUsage: 34,
    memoryUsage: 256,
    activeAgent: 'coder',
    health: 'good',
    networkLatency: 45,
    buildSuccessCount: 8,
    buildFailureCount: 1,
    appErrorCount: 3,
    ideErrorCount: 2,
    totalTokensUsed: 14500
  },
  telemetryTimeline: [],
  terminalLogs: [
    'Initializing LangGraph control plane gateway...',
    'Cluster auth verification: COMPLETED',
    'Virtual File System (VFS) mounted with in-browser SQLite',
    'Type checking completed successfully. No warnings.',
    'Dev Server listening on http://0.0.0.0:3000',
    'Ready for code simulation actions.'
  ],
  logs: [
    {
      id: 'l1',
      timestamp: new Date(Date.now() - 30000).toISOString(),
      severity: 'INFO',
      origin: 'IDE_SYSTEM',
      module: 'SemanticMapService',
      message: 'Recursively scanned 8 workspace files under root folder.'
    },
    {
      id: 'l2',
      timestamp: new Date(Date.now() - 25000).toISOString(),
      severity: 'INFO',
      origin: 'IDE_SYSTEM',
      module: 'WorkspaceLinter',
      message: 'TSX static type-checking parsed successfully.'
    }
  ],
  activeBreakpoint: null,
  compilingState: 'idle',
  compilePercent: 0,
  compileMessage: '',
  hmrUpdates: [],
  showSettingsModal: false,
  socket: null,

  files: INITIAL_FILES,
  activeFile: INITIAL_FILES[0].children![0], // Default Active File is App.tsx
  chatMessages: [],
  lessons: [],
  agentLogs: [],
  yoloMode: false,
  openRouterKey: '',
  modelName: 'gemma-4-31b-it',
  apiProvider: 'google',

  // Actions
  loadAgentLogs: async (filters) => {
    try {
      const queryParams = new URLSearchParams();
      if (filters) {
        if (filters.threadId) queryParams.append('threadId', filters.threadId);
        if (filters.status) queryParams.append('status', filters.status);
        if (filters.category) queryParams.append('category', filters.category);
        if (filters.query) queryParams.append('query', filters.query);
        if (filters.limit) queryParams.append('limit', String(filters.limit));
      }
      const res = await fetch(`/api/agent/logs?${queryParams.toString()}`);
      const data = await res.json();
      if (data.success && data.logs) {
        set({ agentLogs: data.logs });
      }
    } catch (err) {
      console.error("Failed to load agent logs:", err);
    }
  },

  clearAgentLogs: async () => {
    try {
      const res = await fetch('/api/agent/logs/clear', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        set({ agentLogs: [] });
      }
    } catch (err) {
      console.error("Failed to clear agent logs:", err);
    }
  },

  loadLessons: async () => {
    try {
      const dbLessons = await loadLessonsFromSQLite();
      set({ lessons: dbLessons });
    } catch (err) {
      console.error("Failed to load lessons from SQLite:", err);
    }
  },

  addLesson: async (category, errorPattern, discoveredConstraint, remedialAction) => {
    const newLesson: LessonLearned = {
      id: 'l-' + generateId(),
      category,
      errorPattern,
      discoveredConstraint,
      remedialAction,
      createdAt: new Date().toISOString()
    };
    try {
      await saveLessonToSQLite(newLesson);
      const updated = [newLesson, ...get().lessons];
      set({ lessons: updated });
      get().appendTerminalLine(`Saved lesson learned to SQLite: ${category} - ${errorPattern}`);
    } catch (err) {
      console.error("Failed to save lesson to SQLite:", err);
    }
  },

  deleteLesson: async (id) => {
    try {
      await deleteLessonFromSQLite(id);
      const updated = get().lessons.filter(l => l.id !== id);
      set({ lessons: updated });
      get().appendTerminalLine(`Deleted lesson learned from SQLite: ${id}`);
    } catch (err) {
      console.error("Failed to delete lesson from SQLite:", err);
    }
  },

  setHmrUpdates: (val) => {
    if (typeof val === 'function') {
      set((state) => ({ hmrUpdates: val(state.hmrUpdates) }));
    } else {
      set({ hmrUpdates: val });
    }
  },
  setCompilingState: (state) => set({ compilingState: state }),
  setCompilePercent: (percent) => set({ compilePercent: percent }),
  setCompileMessage: (msg) => set({ compileMessage: msg }),
  
  setYoloMode: (val) => {
    set({ yoloMode: val });
    saveSystemConfigToSQLite({ yoloMode: val });
  },
  
  setOpenRouterKey: (val) => {
    set({ openRouterKey: val });
    saveSystemConfigToSQLite({ openRouterKey: val });
  },
  
  setModelName: (val) => {
    set({ modelName: val });
    saveSystemConfigToSQLite({ modelName: val });
  },
  
  setApiProvider: (val) => {
    set({ apiProvider: val });
    saveSystemConfigToSQLite({ apiProvider: val });
  },
  
  setShowSettingsModal: (val) => set({ showSettingsModal: val }),
  setBreakpoint: (id) => set({ activeBreakpoint: id }),
  
  setSwarmState: (state) => set((prev) => ({
    swarmState: {
      activeAgent: state.activeAgent ?? prev.swarmState.activeAgent,
      tasks: state.tasks ?? prev.swarmState.tasks,
      health: state.health ?? prev.swarmState.health
    }
  })),

  setActiveFile: (file) => {
    set({ activeFile: file });
    if (file && !file.isDirectory) {
      get().appendTerminalLine(`Opened file: ${file.path}`);
    }
  },

  updateFileContent: (filePath, newContent) => {
    const { files, activeFile, socket } = get();
    const updateInTree = (nodes: WorkspaceFile[]): WorkspaceFile[] => {
      return nodes.map(node => {
        if (node.path === filePath) {
          return { ...node, content: newContent };
        }
        if (node.children) {
          return { ...node, children: updateInTree(node.children) };
        }
        return node;
      });
    };
    
    const updatedFiles = updateInTree(files);
    let updatedActiveFile = activeFile;
    if (activeFile && activeFile.path === filePath) {
      updatedActiveFile = { ...activeFile, content: newContent };
    }

    set({ files: updatedFiles, activeFile: updatedActiveFile });
    get().appendTerminalLine(`Updated file content: ${filePath}`);

    // Persist changes to client-side SQLite Workspace File module
    saveWorkspaceFilesToSQLite(updatedFiles);

    if (socket) {
      socket.emit('file_change', { path: filePath, content: newContent });
    }
  },

  proposeFileChange: (filePath, proposedContent) => {
    const { files, activeFile } = get();
    const updateInTree = (nodes: WorkspaceFile[]): WorkspaceFile[] => {
      return nodes.map(node => {
        if (node.path === filePath) {
          return { ...node, proposedContent };
        }
        if (node.children) {
          return { ...node, children: updateInTree(node.children) };
        }
        return node;
      });
    };
    
    const updatedFiles = updateInTree(files);
    let updatedActiveFile = activeFile;
    if (activeFile && activeFile.path === filePath) {
      updatedActiveFile = { ...activeFile, proposedContent };
    }

    set({ files: updatedFiles, activeFile: updatedActiveFile });
    get().appendTerminalLine(`Agent proposed change for: ${filePath}`);
    
    saveWorkspaceFilesToSQLite(updatedFiles);
  },

  clearFileProposal: (filePath) => {
    const { files, activeFile } = get();
    const updateInTree = (nodes: WorkspaceFile[]): WorkspaceFile[] => {
      return nodes.map(node => {
        if (node.path === filePath) {
          return { ...node, proposedContent: undefined };
        }
        if (node.children) {
          return { ...node, children: updateInTree(node.children) };
        }
        return node;
      });
    };
    
    const updatedFiles = updateInTree(files);
    let updatedActiveFile = activeFile;
    if (activeFile && activeFile.path === filePath) {
      updatedActiveFile = { ...activeFile, proposedContent: undefined };
    }

    set({ files: updatedFiles, activeFile: updatedActiveFile });
    saveWorkspaceFilesToSQLite(updatedFiles);
  },

  appendTerminalLine: (line) => {
    set((state) => ({
      terminalLogs: [...state.terminalLogs, `[${new Date().toLocaleTimeString()}] ${line}`]
    }));
  },

  clearTerminal: () => set({ terminalLogs: [] }),

  sendChatMessage: async (content) => {
    if (!content.trim()) return;

    const userMsg: ChatMessage = {
      id: 'c-' + generateId(),
      role: 'user',
      content,
      timestamp: new Date().toISOString()
    };

    const currentChat = [...get().chatMessages, userMsg];
    set({ chatMessages: currentChat });
    saveChatHistory(currentChat);

    // Compute flat VFS from nested files
    const flatVfs: Record<string, string> = {};
    const flatten = (nodes: WorkspaceFile[]) => {
      for (const node of nodes) {
        if (!node.isDirectory && node.content !== undefined) {
          flatVfs[node.path] = node.content;
        }
        if (node.children) flatten(node.children);
      }
    };
    flatten(get().files);

    const requestBody = {
      messages: currentChat,
      vfs: flatVfs,
      openRouterKey: get().openRouterKey,
      apiProvider: get().apiProvider,
      modelName: get().modelName,
      executionMode: get().yoloMode ? 'yolo' : 'normal',
      threadId: 'default-thread-id'
    };

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!res.ok) {
        get().appendTerminalLine(`[ERROR] API request failed: ${res.statusText}`);
        return;
      }
      
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      
      const aiMsgId = 'c-' + generateId();
      set((state) => ({
        chatMessages: [...state.chatMessages, {
          id: aiMsgId,
          role: 'assistant',
          content: '',
          timestamp: new Date().toISOString()
        }]
      }));

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunkStr = decoder.decode(value, { stream: true });
        const lines = chunkStr.split('\n\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (dataStr === '[DONE]') break;
            
            try {
              const data = JSON.parse(dataStr);
              if (data.type === 'token') {
                set((state) => ({
                  chatMessages: state.chatMessages.map(m => 
                    m.id === aiMsgId ? { ...m, content: m.content + data.content } : m
                  )
                }));
              } else if (data.type === 'pty') {
                get().appendTerminalLine(data.content.trim());
              } else if (data.type === 'swarm') {
                if (data.activeAgent) {
                  get().setActiveAgentName(data.activeAgent);
                }
                if (data.tasks) {
                  get().setTasksList(data.tasks.map((t: any) => ({
                    id: t.id || t.name,
                    label: t.description || t.name,
                    status: 'pending',
                    assignedTo: data.activeAgent || 'orchestrator'
                  })));
                }
              } else if (data.type === 'proposal') {
                get().appendTerminalLine(`[ORCHESTRATOR] Agent proposed file change to: ${data.path}`);
              } else if (data.type === 'error') {
                get().appendTerminalLine(`[ERROR] Agent stream: ${data.message}`);
              }
            } catch (e) {
              // ignore partial chunks
            }
          }
        }
      }

      // Final persistence sync back to IndexedDB for the newly downloaded AI message response
      saveChatHistory(get().chatMessages);

    } catch (err: any) {
      get().appendTerminalLine(`[API Error] ${err.message}`);
    }
  },

  injectLogEvent: (severity, origin, module, message, detail) => {
    const newLog: TelemetryLog = {
      id: 'l-' + Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      severity,
      origin,
      module,
      message,
      detail
    };

    set((state) => ({ logs: [newLog, ...state.logs] }));

    fetch('/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newLog)
    }).catch(() => {
      // Silently ignore telemetry transmission failures in local-only environments
    });
  },

  simulateCompileAction: async (simulateBuildFailure) => {
    set({
      compilePercent: 10,
      compileMessage: 'Requesting async compile token from secure workspace process...',
      compilingState: 'running'
    });

    const s = get().socket;
    const openRouterKey = get().openRouterKey;
    const modelName = get().modelName;
    if (s) {
      s.emit('start_compile', { simulateBuildFailure, openRouterKey, modelName });
    } else {
      get().appendTerminalLine('Establishing web-socket channel for backend compilation...');
      setTimeout(() => {
        const retrySocket = get().socket;
        if (retrySocket) {
          retrySocket.emit('start_compile', { simulateBuildFailure, openRouterKey, modelName });
        } else {
          set({
            compilingState: 'failed',
            compileMessage: 'Unable to connect to Real-Time socket compiler engine.'
          });
        }
      }, 800);
    }
  },

  testAppRuntimeCrash: () => {
    get().injectLogEvent(
      'CRITICAL',
      'USER_APPLICATION',
      'ReactRootNode',
      'Fatal: Application crashing triggered inside mission-critical viewport.',
      'TypeError: Cannot read properties of undefined (reading "renderLayout")\n  at WorkspaceView.tsx (vite://sandbox/Workspace.tsx:88:24)\n  at mountComponent (react-dom.development.js:12213:10)'
    );
  },

  resetTelemetryStats: () => {
    set({ logs: [] });
    get().appendTerminalLine('Telemetry logs cleared. Logging pipeline flushed.');
    set((state) => ({
      metrics: {
        ...state.metrics,
        buildFailureCount: 0,
        buildSuccessCount: 0,
        appErrorCount: 0,
        ideErrorCount: 0
      }
    }));
  },

  setSocketInstance: (s) => set({ socket: s }),
  setTasksList: (tasks) => set((prev) => ({
    swarmState: { ...prev.swarmState, tasks }
  })),
  setActiveAgentName: (name) => set((prev) => ({
    swarmState: { ...prev.swarmState, activeAgent: name }
  })),

  initDatabaseState: async () => {
    // 1. Initial Load of Chat Messages from IndexedDB
    try {
      const savedMsgs = await getStoredChat();
      if (savedMsgs && savedMsgs.length > 0) {
        set({ chatMessages: savedMsgs });
      } else {
        const defaultMsg: ChatMessage = {
          id: 'c1',
          role: 'system',
          content: 'System: Swarm conversation channel created with LangGraph Coder & Auditor. How can I help you build today?',
          timestamp: new Date().toISOString()
        };
        set({ chatMessages: [defaultMsg] });
        await saveChatHistory([defaultMsg]);
      }
    } catch (err) {
      console.error('Error loading chat messages from IndexedDB:', err);
    }

    // 2. Initial Load of System Config and VFS Tree structures from browser SQLite Tables
    try {
      const filesFromSqlite = await loadWorkspaceFilesFromSQLite();
      if (filesFromSqlite && filesFromSqlite.length > 0) {
        set({ files: filesFromSqlite });
        const appFile = findAppFile(filesFromSqlite) || (filesFromSqlite[0]?.children ? filesFromSqlite[0].children[0] : null);
        set({ activeFile: appFile });
      } else {
        // Run first setup on SQLite
        await saveWorkspaceFilesToSQLite(INITIAL_FILES);
        set({ files: INITIAL_FILES });
        const appFile = findAppFile(INITIAL_FILES) || (INITIAL_FILES[0]?.children ? INITIAL_FILES[0].children[0] : null);
        set({ activeFile: appFile });
      }

      const systemConfig = await loadSystemConfigFromSQLite();
      if (systemConfig) {
        set({
          yoloMode: systemConfig.yoloMode ?? false,
          openRouterKey: systemConfig.openRouterKey ?? '',
          modelName: systemConfig.modelName ?? 'gemma-4-31b-it',
          apiProvider: systemConfig.apiProvider ?? 'google'
        });
      } else {
        const defaultConfig = {
          yoloMode: false,
          openRouterKey: '',
          modelName: 'gemma-4-31b-it',
          apiProvider: 'google' as const
        };
        await saveSystemConfigToSQLite(defaultConfig);
        set(defaultConfig);
      }
    } catch (err) {
      console.error('Error loading config and files from browser SQLite database:', err);
    }

    // 3. Initial Load of Lessons Learned from browser SQLite Table
    await get().loadLessons();
  }
}));

// 3. Backwards-compatible React Provider to execute standard react cycles
export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initDatabaseState = useAppStore((state) => state.initDatabaseState);
  const setSocketInstance = useAppStore((state) => state.setSocketInstance);
  const appendTerminalLine = useAppStore((state) => state.appendTerminalLine);
  
  // Connect and sync socket properties to store
  useEffect(() => {
    // Run DB and structure initialization first on mount
    initDatabaseState();

    const url = window.location.origin;
    const s = io(url);
    setSocketInstance(s);

    s.on('compiler_lesson_formed', (data: { category: string; errorPattern: string; discoveredConstraint: string; remedialAction: string }) => {
      useAppStore.getState().addLesson(data.category, data.errorPattern, data.discoveredConstraint, data.remedialAction);
    });

    s.on('compile_progress', (data: { percent: number; message: string; state?: 'idle' | 'running' | 'success' | 'failed' }) => {
      const storeState = useAppStore.getState();
      if (data.percent !== undefined) storeState.setCompilePercent(data.percent);
      if (data.message !== undefined) storeState.setCompileMessage(data.message);
      if (data.state !== undefined) {
        storeState.setCompilingState(data.state);
      }
    });

    s.on('compile_log', (logLine: string) => {
      appendTerminalLine(logLine);
    });

    s.on('compile_metric_update', (metricsUpdate: any) => {
      useAppStore.setState((store) => ({
        metrics: { ...store.metrics, ...metricsUpdate }
      }));
    });

    s.on('compile_task_update', (tasksUpdate: { id: string, status: string }[]) => {
      const currentTasks = useAppStore.getState().swarmState.tasks;
      const updatedTasks = currentTasks.map(t => {
        const match = tasksUpdate.find(tu => tu.id === t.id);
        return match ? { ...t, status: match.status as any } : t;
      });
      useAppStore.setState((store) => ({
        swarmState: { ...store.swarmState, tasks: updatedTasks }
      }));
    });

    s.on('hmr_update', (data: { path: string; timestamp: string; status: 'success' | 'failed'; message: string }) => {
      useAppStore.getState().setHmrUpdates((prev) => [data, ...prev].slice(0, 10));
      appendTerminalLine(`\r\n[HMR DAEMON] ${data.message} (${data.timestamp})\r\n`);
      useAppStore.getState().injectLogEvent(
        data.status === 'success' ? 'INFO' : 'ERROR',
        'IDE_SYSTEM',
        'HMR_Daemon',
        data.message,
        `File Path: ${data.path}`
      );
    });

    const initTimer = setTimeout(() => {
      s.emit('initial_load_check');
    }, 500);

    return () => {
      clearTimeout(initTimer);
      s.disconnect();
    };
  }, [initDatabaseState, setSocketInstance, appendTerminalLine]);

  // Synchronize dynamic application error rates and health metrics 
  const logs = useAppStore((state) => state.logs);
  useEffect(() => {
    const ideErrors = logs.filter(l => l.severity === 'ERROR' && l.origin === 'IDE_SYSTEM').length;
    const appErrors = logs.filter(l => l.severity === 'ERROR' && l.origin === 'USER_APPLICATION').length;
    const criticals = logs.filter(l => l.severity === 'CRITICAL').length;
    
    useAppStore.setState((store) => ({
      metrics: {
        ...store.metrics,
        ideErrorCount: ideErrors,
        appErrorCount: appErrors + criticals,
        health: (appErrors > 4 || criticals > 1) ? 'failing' : 'good'
      },
      swarmState: {
        ...store.swarmState,
        health: (appErrors > 4 || criticals > 1) ? 'failing' : 'good'
      }
    }));
  }, [logs]);

  // Real system host telemetry receiver loop
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const data = await res.json();
          if (data.metrics) {
            useAppStore.setState((store) => ({
              metrics: {
                ...store.metrics,
                cpuUsage: Math.min(100, Math.max(0, Math.round(data.metrics.cpuUsage))),
                memoryUsage: data.metrics.memoryUsage,
              }
            }));
          }
        }
      } catch (err) {
        // Fail silently during network disconnects
      }

      // Rotate acting swarm node executor representation
      const agents = ['orchestrator', 'planner', 'coder', 'auditor', 'platform'];
      if (Math.random() < 0.25) {
        const nextAgent = agents[Math.floor(Math.random() * agents.length)];
        useAppStore.getState().setActiveAgentName(nextAgent);
      }

      // Chart telemetry ticks
      useAppStore.setState((store) => {
        const prev = store.telemetryTimeline;
        const stepName = `S-${prev.length + 1}`;
        const newPoint = {
          step: stepName,
          "Prompt Tokens": Math.round(1200 + Math.random() * 400),
          "Completion Tokens": Math.round(400 + Math.random() * 200),
          "Latency ms": Math.round(45 + Math.random() * 80)
        };
        const next = [...prev, newPoint];
        return {
          telemetryTimeline: next.length > 8 ? next.slice(1) : next
        };
      });
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  return <>{children}</>;
};
