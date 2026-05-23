import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface Settings {
  openRouterKey: string;
  model: string;
}

export interface Task {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  dependencies: string[];
}

export interface SwarmState {
  activeAgent: string | null;
  tasks: Task[];
  health: 'good' | 'failing' | 'unknown';
}

export type ExecutionMode = 'plan' | 'normal' | 'yolo';

export interface ProposedChunk {
  id: string;
  target: string;
  replacement: string;
  description?: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface ProposedChange {
  id: string;
  path: string;
  originalContent: string;
  proposedContent: string;
  status: 'pending' | 'accepted' | 'rejected';
  mode?: 'exact' | 'chunks';
  chunks?: ProposedChunk[];
}

export interface ProposedCommand {
  id: string;
  command: string;
  status: 'pending' | 'accepted' | 'rejected';
}

interface AppState {
  vfs: Record<string, string>;
  messages: Message[];
  settings: Settings;
  isGenerating: boolean;
  terminalLogs: string;
  swarmState: SwarmState;
  executionMode: ExecutionMode;
  proposedChanges: ProposedChange[];
  proposedCommands: ProposedCommand[];
  
  setVfs: (vfs: Record<string, string>) => void;
  updateFile: (path: string, content: string) => void;
  addMessage: (message: Message) => void;
  appendLastMessage: (content: string) => void;
  setSettings: (settings: Settings) => void;
  setIsGenerating: (isGenerating: boolean) => void;
  appendTerminalLog: (log: string) => void;
  setSwarmState: (state: Partial<SwarmState>) => void;
  setExecutionMode: (mode: ExecutionMode) => void;
  addProposedChange: (change: ProposedChange) => void;
  resolveProposedChange: (id: string, status: 'accepted' | 'rejected') => void;
  resolveProposedChunk: (changeId: string, chunkId: string, status: 'accepted' | 'rejected') => void;
  addProposedCommand: (command: ProposedCommand) => void;
  resolveProposedCommand: (id: string, status: 'accepted' | 'rejected') => void;
}

const defaultFiles = {
  'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>App</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <h1>Hello AI Builder</h1>
  <script src="/script.js"></script>
</body>
</html>`,
  'style.css': `body { font-family: sans-serif; background: #fafafa; margin: 2rem; }
h1 { color: #333; }`,
  'script.js': `console.log("Ready");`
};

export const useAppStore = create<AppState>()(
  subscribeWithSelector((set) => ({
    vfs: defaultFiles,
  messages: [],
  settings: {
    openRouterKey: localStorage.getItem('openRouterKey') || '',
    model: localStorage.getItem('modelName') || 'google/gemini-2.0-flash-lite-preview-02-05:free'
  },
  isGenerating: false,
  terminalLogs: '',
  executionMode: 'normal',
  proposedChanges: [],
  proposedCommands: [],
  swarmState: {
    activeAgent: null,
    tasks: [],
    health: 'unknown'
  },
  
  setVfs: (vfs) => set({ vfs }),
  updateFile: (path, content) => set((state) => ({ vfs: { ...state.vfs, [path]: content } })),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  appendLastMessage: (content) => set((state) => {
    const newMessages = [...state.messages];
    if (newMessages.length > 0) {
      newMessages[newMessages.length - 1].content += content;
    }
    return { messages: newMessages };
  }),
  setSettings: (settings) => {
    localStorage.setItem('openRouterKey', settings.openRouterKey);
    localStorage.setItem('modelName', settings.model);
    set({ settings });
  },
  setIsGenerating: (isGenerating) => set({ isGenerating }),
  appendTerminalLog: (log) => set((state) => ({ terminalLogs: state.terminalLogs + log })),
  setSwarmState: (update) => set((state) => ({ 
    swarmState: { ...state.swarmState, ...update } 
  })),
  setExecutionMode: (executionMode) => set({ executionMode }),
  addProposedChange: (change) => set((state) => ({ 
    proposedChanges: [...state.proposedChanges, change] 
  })),
  resolveProposedChange: (id, status) => set((state) => {
    const changes = state.proposedChanges.map(c => 
      c.id === id ? { ...c, status } : c
    );
    // If accepted, update VFS
    const change = state.proposedChanges.find(c => c.id === id);
    if (status === 'accepted' && change) {
      return { 
        proposedChanges: changes,
        vfs: { ...state.vfs, [change.path]: change.proposedContent }
      };
    }
    return { proposedChanges: changes };
  }),
  resolveProposedChunk: (changeId, chunkId, status) => set((state) => {
    const changes = state.proposedChanges.map(change => {
      if (change.id !== changeId || !change.chunks) return change;
      
      const updatedChunks = change.chunks.map(chunk => 
        chunk.id === chunkId ? { ...chunk, status } : chunk
      );

      // Recalculate proposedContent by applying accepted chunks on top of originalContent
      let previewContent = change.originalContent;
      for (const ch of updatedChunks) {
        if (ch.status === 'accepted' && previewContent.includes(ch.target)) {
          previewContent = previewContent.replace(ch.target, ch.replacement);
        }
      }

      return {
        ...change,
        chunks: updatedChunks,
        proposedContent: previewContent
      };
    });

    return { proposedChanges: changes };
  }),
  addProposedCommand: (command) => set((state) => ({ 
    proposedCommands: [...state.proposedCommands, command] 
  })),
  resolveProposedCommand: (id, status) => set((state) => ({
    proposedCommands: state.proposedCommands.map(c => 
      c.id === id ? { ...c, status } : c
    )
  })),
})));
