// File: src/lib/store.ts

import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { io } from 'socket.io-client';
import { 
  TelemetryLog, 
  SystemMetrics, 
  TaskNode, 
  WorkspaceFile, 
  ChatMessage 
} from '../types';

// Mock files in the virtual IDE
const INITIAL_FILES: WorkspaceFile[] = [
  {
    name: 'src',
    path: 'src',
    isDirectory: true,
    children: [
      {
        name: 'components',
        path: 'src/components',
        isDirectory: true,
        children: [
          {
            name: 'Workspace.tsx',
            path: 'src/components/Workspace.tsx',
            isDirectory: false,
            content: `// File: src/components/Workspace.tsx
import React, { useState } from 'react';
import { useAppStore } from '../lib/store';

export const Workspace: React.FC = () => {
  const { metrics, injectEvent } = useAppStore();
  return (
    <div className="p-6">
      <h1 className="text-xl font-bold">Workspace View</h1>
      <p>CPU Health: {metrics.cpuUsage}%</p>
    </div>
  );
};`
          },
          {
            name: 'SwarmConsole.tsx',
            path: 'src/components/SwarmConsole.tsx',
            isDirectory: false,
            content: `// File: src/components/SwarmConsole.tsx
import React from 'react';

export const SwarmConsole: React.FC = () => {
  return <div>LangGraph Active Swarm Metrics</div>;
};`
          },
          {
            name: 'TelemetryDashboard.tsx',
            path: 'src/components/TelemetryDashboard.tsx',
            isDirectory: false,
            content: `// File: src/components/TelemetryDashboard.tsx\n// Loaded by core metrics dashboards.`
          }
        ]
      },
      {
        name: 'App.tsx',
        path: 'src/App.tsx',
        isDirectory: false,
        content: `// File: src/App.tsx
import React from 'react';
import { Workspace } from './components/Workspace';

export default function App() {
  return <Workspace />;
}`
      }
    ]
  },
  {
    name: 'server.ts',
    path: 'server.ts',
    isDirectory: false,
    content: `// File: server.ts
import express from 'express';
const app = express();
app.listen(3000);`
  }
];

const INITIAL_TASKS: TaskNode[] = [
  { id: 't1', label: 'Route Strategy Verification', status: 'completed', assignedTo: 'orchestrator' },
  { id: 't2', label: 'DAG Dependency Planning', status: 'completed', assignedTo: 'planner' },
  { id: 't3', label: 'VFS Code Assembly', status: 'in_progress', assignedTo: 'coder' },
  { id: 't4', label: 'Semantic Compliance Scan', status: 'pending', assignedTo: 'auditor' },
  { id: 't5', label: 'Sandbox Warm Boot', status: 'pending', assignedTo: 'platform' }
];

export interface AppStoreState {
  swarmState: {
    activeAgent: string;
    tasks: TaskNode[];
    health: 'good' | 'failing';
  };
  metrics: SystemMetrics;
  terminalLogs: string[];
  logs: TelemetryLog[];
  files: WorkspaceFile[];
  activeFile: WorkspaceFile | null;
  chatMessages: ChatMessage[];
  activeBreakpoint: string | null;
  compilingState: 'idle' | 'running' | 'success' | 'failed';
  compilePercent: number;
  compileMessage: string;
  hmrUpdates: any[];
  setHmrUpdates: React.Dispatch<React.SetStateAction<any[]>>;
  setCompilingState: (state: 'idle' | 'running' | 'success' | 'failed') => void;
  setCompilePercent: (percent: number) => void;
  setCompileMessage: (msg: string) => void;
  
  yoloMode: boolean;
  setYoloMode: (val: boolean) => void;
  openRouterKey: string;
  setOpenRouterKey: (val: string) => void;
  
  // Setters and action handlers
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
  simulateAppRuntimeCrash: () => void;
  resetTelemetryStats: () => void;
}

// Global context to share store
const StoreContext = createContext<AppStoreState | undefined>(undefined);

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeAgent, setActiveAgent] = useState<string>('coder');
  const [tasks, setTasks] = useState<TaskNode[]>(INITIAL_TASKS);
  const [health, setHealth] = useState<'good' | 'failing'>('good');
  const [activeBreakpoint, setBreakpoint] = useState<string | null>(null);
  
  const [yoloMode, setYoloMode] = useState<boolean>(false);
  const [openRouterKey, setOpenRouterKey] = useState<string>('');

  const [metrics, setMetrics] = useState<SystemMetrics>({
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
  });

  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    'Initializing LangGraph control plane gateway...',
    'Cluster auth verification: COMPLETED',
    'Virtual File System (VFS) mounted at /sandbox',
    'Type checking completed successfully. No warnings.',
    'Dev Server listening on http://0.0.0.0:3000',
    'Ready for code simulation actions.'
  ]);

  const appendTerminalLine = useCallback((line: string) => {
    setTerminalLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${line}`]);
  }, []);

  const [logs, setLogs] = useState<TelemetryLog[]>([
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
    },
    {
      id: 'l3',
      timestamp: new Date(Date.now() - 15000).toISOString(),
      severity: 'WARNING',
      origin: 'USER_APPLICATION',
      module: 'ViteConsole',
      message: 'HMR connection failed; fallback to static serve pipeline.',
    },
    {
      id: 'l4',
      timestamp: new Date(Date.now() - 5000).toISOString(),
      severity: 'ERROR',
      origin: 'USER_APPLICATION',
      module: 'ComponentSandbox',
      message: 'Failed to resolve external module "uninstalled-dummy-lib" inside Workspace.tsx',
      detail: 'Error: Cannot find module "uninstalled-dummy-lib"\n  at resolveImport (vite://sandbox/main.tsx:441:12)'
    }
  ]);

  const [files, setFiles] = useState<WorkspaceFile[]>(INITIAL_FILES);
  const [activeFile, setActiveFileInternal] = useState<WorkspaceFile | null>(INITIAL_FILES[0].children![0].children![0]); // Workspace.tsx
  const [compilingState, setCompilingState] = useState<'idle' | 'running' | 'success' | 'failed'>('idle');
  const [compilePercent, setCompilePercent] = useState<number>(0);
  const [compileMessage, setCompileMessage] = useState<string>('');
  const [socket, setSocket] = useState<any>(null);
  const [hmrUpdates, setHmrUpdates] = useState<any[]>([]);

  const injectLogEvent = useCallback((
    severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL',
    origin: 'IDE_SYSTEM' | 'USER_APPLICATION',
    module: string,
    message: string,
    detail?: string
  ) => {
    const newLog: TelemetryLog = {
      id: 'l-' + Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      severity,
      origin,
      module,
      message,
      detail
    };

    setLogs(prev => [newLog, ...prev]);

    // Send telemetry up to the backend service too for complete compliance integration
    fetch('/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newLog)
    }).catch(() => {
      // Slidely ignore backend storage connection drops in pure mock pipeline
    });
  }, []);

  useEffect(() => {
    const url = window.location.origin;
    const s = io(url);
    setSocket(s);

    s.on('compile_progress', (data: { percent: number; message: string; state?: 'idle' | 'running' | 'success' | 'failed' }) => {
      if (data.percent !== undefined) setCompilePercent(data.percent);
      if (data.message !== undefined) setCompileMessage(data.message);
      if (data.state !== undefined) {
        setCompilingState(data.state);
      }
    });

    s.on('compile_log', (logLine: string) => {
      appendTerminalLine(logLine);
    });

    s.on('compile_metric_update', (metricsUpdate: any) => {
      setMetrics(prev => ({
        ...prev,
        ...metricsUpdate
      }));
    });

    s.on('compile_task_update', (tasksUpdate: { id: string, status: string }[]) => {
      setTasks(prev => prev.map(t => {
        const match = tasksUpdate.find(tu => tu.id === t.id);
        return match ? { ...t, status: match.status as any } : t;
      }));
    });

    s.on('hmr_update', (data: { path: string; timestamp: string; status: 'success' | 'failed'; message: string }) => {
      setHmrUpdates(prev => [data, ...prev].slice(0, 10));
      appendTerminalLine(`\r\n[HMR DAEMON] ${data.message} (${data.timestamp})\r\n`);
      injectLogEvent(
        data.status === 'success' ? 'INFO' : 'ERROR',
        'IDE_SYSTEM',
        'HMR_Daemon',
        data.message,
        `File Path: ${data.path}`
      );
    });

    // Emit initial load check on connection stability
    const initTimer = setTimeout(() => {
      s.emit('initial_load_check');
    }, 500);

    return () => {
      clearTimeout(initTimer);
      s.disconnect();
    };
  }, [appendTerminalLine, injectLogEvent]);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'c1',
      role: 'system',
      content: 'System: Swarm conversation channel created with LangGraph Coder & Auditor. How can I help you build today?',
      timestamp: new Date().toISOString()
    }
  ]);

  // Synchronize state from logs list for telemetry
  useEffect(() => {
    const ideErrors = logs.filter(l => l.severity === 'ERROR' && l.origin === 'IDE_SYSTEM').length;
    const appErrors = logs.filter(l => l.severity === 'ERROR' && l.origin === 'USER_APPLICATION').length;
    const criticals = logs.filter(l => l.severity === 'CRITICAL').length;
    
    setMetrics(prev => ({
      ...prev,
      ideErrorCount: ideErrors,
      appErrorCount: appErrors + criticals,
      health: (appErrors > 4 || criticals > 1) ? 'failing' : 'good'
    }));
  }, [logs]);

  // Periodic simulated load fluctuation
  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(prev => {
        const deltaCpu = (Math.random() - 0.5) * 8;
        const deltaMem = (Math.random() - 0.5) * 4;
        const deltaLat = (Math.random() - 0.5) * 6;
        const nextCpu = Math.max(10, Math.min(95, Math.round(prev.cpuUsage + deltaCpu)));
        const nextMem = Math.max(120, Math.min(1024, Math.round(prev.memoryUsage + deltaMem)));
        const nextLat = Math.max(15, Math.min(120, Math.round(prev.networkLatency + deltaLat)));
        
        return {
          ...prev,
          cpuUsage: nextCpu,
          memoryUsage: nextMem,
          networkLatency: nextLat,
          totalTokensUsed: prev.totalTokensUsed + Math.round(Math.random() * 25)
        };
      });

      // Fluctuate active executing LangGraph agent
      const agents = ['orchestrator', 'planner', 'coder', 'auditor', 'platform'];
      if (Math.random() < 0.25) {
        const nextAgent = agents[Math.floor(Math.random() * agents.length)];
        setActiveAgent(nextAgent);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const clearTerminal = useCallback(() => {
    setTerminalLogs([]);
  }, []);

  const setActiveFile = useCallback((file: WorkspaceFile | null) => {
    setActiveFileInternal(file);
    if (file && !file.isDirectory) {
      appendTerminalLine(`Opened file: ${file.path}`);
    }
  }, [appendTerminalLine]);

  // Recursively update virtual file system content
  const updateFileContent = useCallback((filePath: string, newContent: string) => {
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
    
    setFiles(prev => updateInTree(prev));
    if (activeFile && activeFile.path === filePath) {
      setActiveFileInternal(prev => prev ? { ...prev, content: newContent } : null);
    }
    appendTerminalLine(`Updated file content: ${filePath}`);

    if (socket) {
      socket.emit('file_change', { path: filePath, content: newContent });
    }
  }, [activeFile, appendTerminalLine, socket]);

  const proposeFileChange = useCallback((filePath: string, proposedContent: string) => {
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
    
    setFiles(prev => updateInTree(prev));
    if (activeFile && activeFile.path === filePath) {
      setActiveFileInternal(prev => prev ? { ...prev, proposedContent } : null);
    }
    appendTerminalLine(`Agent proposed change for: ${filePath}`);
  }, [activeFile, appendTerminalLine]);

  const clearFileProposal = useCallback((filePath: string) => {
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
    
    setFiles(prev => updateInTree(prev));
    if (activeFile && activeFile.path === filePath) {
      setActiveFileInternal(prev => prev ? { ...prev, proposedContent: undefined } : null);
    }
  }, [activeFile]);

  const sendChatMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;

    const userMsg: ChatMessage = {
      id: 'c-' + crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date().toISOString()
    };

    setChatMessages(prev => {
      const newMessages = [...prev, userMsg];
      
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
      flatten(files);

      const requestBody = {
        messages: newMessages,
        vfs: flatVfs,
        openRouterKey: openRouterKey,
        modelName: "gemini-2.5-flash",
        executionMode: yoloMode ? 'yolo' : 'normal',
        threadId: 'default-thread-id'
      };

      // Kick off async backend fetch
      fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      }).then(async res => {
         if (!res.ok) {
           appendTerminalLine(`[ERROR] API request failed: ${res.statusText}`);
           return;
         }
         
         const reader = res.body?.getReader();
         if (!reader) return;
         const decoder = new TextDecoder();
         
         const aiMsgId = 'c-' + crypto.randomUUID();
         setChatMessages(msgs => [...msgs, {
            id: aiMsgId,
            role: 'assistant',
            content: '',
            timestamp: new Date().toISOString()
         }]);

         let partial = '';
         while (true) {
           const { done, value } = await reader.read();
           if (done) break;
           
           const chunkStr = decoder.decode(value, { stream: true });
           
           // A single chunk value might contain multiple SSE messages separated by \n\n
           const lines = chunkStr.split('\n\n');
           for (const line of lines) {
             if (line.startsWith('data: ')) {
               const dataStr = line.replace('data: ', '').trim();
               if (dataStr === '[DONE]') break;
               
               try {
                 const data = JSON.parse(dataStr);
                 if (data.type === 'token') {
                   setChatMessages(msgs => msgs.map(m => m.id === aiMsgId ? { ...m, content: m.content + data.content } : m));
                 } else if (data.type === 'pty') {
                   appendTerminalLine(data.content.trim());
                 } else if (data.type === 'swarm') {
                   if (data.activeAgent) {
                     setActiveAgent(data.activeAgent);
                   }
                   if (data.tasks) {
                     // Update task board
                     setTasks(data.tasks.map((t: any) => ({
                       id: t.id || t.name,
                       label: t.description || t.name,
                       status: 'pending',
                       assignedTo: data.activeAgent
                     })));
                   }
                 } else if (data.type === 'proposal') {
                   // incoming chunk proposeFileChange
                   // Here we would handle chunk mode... let's just trigger a notification
                   appendTerminalLine(`[ORCHESTRATOR] Agent proposed file change to: ${data.path}`);
                 } else if (data.type === 'error') {
                   appendTerminalLine(`[ERROR] Agent stream: ${data.message}`);
                 } else if (data.type === 'tool' && data.name === 'write_file') {
                    // Refresh VFS with changes
                    if (data.vfs) {
                       // Update frontend file tree...? Too complicated for simple VFS mapping but we could do it if needed.
                       appendTerminalLine(`[ORCHESTRATOR] Agent used tool ${data.name}`);
                    }
                 }
               } catch (e) {
                 // ignore fragment parsing error
               }
             }
           }
         }
      }).catch(err => {
         appendTerminalLine(`[API Error] ${err.message}`);
      });

      return newMessages;
    });

  }, [files, openRouterKey, yoloMode, appendTerminalLine]);

  const simulateCompileAction = useCallback(async (simulateBuildFailure: boolean) => {
    setCompilePercent(10);
    setCompileMessage('Requesting async compile token from secure workspace process...');
    setCompilingState('running');
    
    if (socket) {
      socket.emit('start_compile', { simulateBuildFailure });
    } else {
      appendTerminalLine('Establishing web-socket channel for backend compilation...');
      setTimeout(() => {
        if (socket) {
          socket.emit('start_compile', { simulateBuildFailure });
        } else {
          setCompilingState('failed');
          setCompileMessage('Unable to connect to Real-Time socket compiler engine.');
        }
      }, 800);
    }
  }, [socket, appendTerminalLine]);

  const simulateAppRuntimeCrash = useCallback(() => {
    injectLogEvent(
      'CRITICAL',
      'USER_APPLICATION',
      'ReactRootNode',
      'Fatal: Application crashing triggered inside mission-critical viewport.',
      'TypeError: Cannot read properties of undefined (reading "renderLayout")\n  at WorkspaceView.tsx (vite://sandbox/Workspace.tsx:88:24)\n  at mountComponent (react-dom.development.js:12213:10)'
    );
  }, [injectLogEvent]);

  const resetTelemetryStats = useCallback(() => {
    setLogs([]);
    appendTerminalLine('Telemetry logs cleared. Logging pipeline flushed.');
    setMetrics(prev => ({
      ...prev,
      buildFailureCount: 0,
      buildSuccessCount: 0,
      appErrorCount: 0,
      ideErrorCount: 0
    }));
  }, [appendTerminalLine]);

  // Combined state matching useAppStore requirements
  const storeContextValue: AppStoreState = {
    swarmState: {
      activeAgent,
      tasks,
      health
    },
    metrics,
    terminalLogs,
    logs,
    files,
    activeFile,
    chatMessages,
    activeBreakpoint,
    compilingState,
    compilePercent,
    compileMessage,
    setCompilingState,
    hmrUpdates,
    setHmrUpdates,
    setCompilePercent,
    setCompileMessage,
    yoloMode,
    setYoloMode,
    openRouterKey,
    setOpenRouterKey,
    setBreakpoint,
    setSwarmState: (state: any) => {
      if (state.activeAgent) setActiveAgent(state.activeAgent);
      if (state.tasks) setTasks(state.tasks);
      if (state.health) setHealth(state.health);
    },
    setActiveFile,
    updateFileContent,
    proposeFileChange,
    clearFileProposal,
    appendTerminalLine,
    clearTerminal,
    sendChatMessage,
    injectLogEvent,
    simulateCompileAction,
    simulateAppRuntimeCrash,
    resetTelemetryStats
  };

  return (
    <StoreContext.Provider value={storeContextValue}>
      {children}
    </StoreContext.Provider>
  );
};

export const useAppStore = () => {
  const context = useContext(StoreContext);
  if (context === undefined) {
    throw new Error('useAppStore must be used inside a StoreProvider');
  }
  return context;
};
