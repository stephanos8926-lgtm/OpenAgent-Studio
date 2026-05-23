import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '../lib/store';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { 
  FileCode, FileType, FileJson, Play, Code2, Terminal as TerminalIcon, 
  Folder, ChevronRight, ChevronDown, Shield, Network, 
  Check, X, Zap, Eye, AlertTriangle 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

const FileTreeNode = ({ name, isDirectory, children, activeFile, onSelect, depth = 0 }: any) => {
  const [isOpen, setIsOpen] = useState(true);
  const paddingLeft = `${depth * 12 + 16}px`;

  if (isDirectory) {
    return (
      <div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full text-left py-1.5 text-sm flex items-center gap-1 hover:bg-gray-800 text-gray-400"
          style={{ paddingLeft }}
        >
          {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          <Folder className="w-4 h-4 text-blue-400" />
          <span className="truncate">{name}</span>
        </button>
        {isOpen && children && (
          <div>
            {Object.entries(children).map(([childName, childNode]: [string, any]) => (
              <FileTreeNode
                key={childName}
                name={childName}
                {...childNode}
                activeFile={activeFile}
                onSelect={onSelect}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelect(name, children.fullPath)} // For files, 'name' is filename, fullPath is needed
      className={`w-full text-left py-1.5 text-sm flex items-center gap-2 hover:bg-gray-800 ${
        activeFile === children?.fullPath ? 'bg-blue-600/20 text-blue-400' : 'text-gray-300'
      }`}
      style={{ paddingLeft: `${(depth * 12) + 24}px` }}
    >
      {name.endsWith('.css') ? <FileType className="w-3.5 h-3.5 text-blue-300" /> : 
       name.endsWith('.js') || name.endsWith('.ts') || name.endsWith('.tsx') ? <FileJson className="w-3.5 h-3.5 text-yellow-300" /> : 
       <FileCode className="w-3.5 h-3.5 text-orange-400" />}
      <span className="truncate">{name}</span>
    </button>
  );
};

import { Maintenance } from './Maintenance';
import { MeshController } from './MeshController';

export default function Workspace() {
  const { 
    vfs, updateFile, terminalLogs, 
    executionMode, setExecutionMode, 
    proposedChanges, resolveProposedChange, resolveProposedChunk,
    proposedCommands, resolveProposedCommand
  } = useAppStore();
  
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [mode, setMode] = useState<'code' | 'preview' | 'terminal' | 'maintenance' | 'mesh'>('code');
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768);

  const pendingChanges = proposedChanges.filter(c => c.status === 'pending');
  const currentProposedChange = pendingChanges.find(c => c.path === activeFile);

  const pendingCommands = proposedCommands.filter(c => c.status === 'pending');
  const currentProposedCommand = pendingCommands[0];

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) setIsSidebarOpen(false);
      else setIsSidebarOpen(true);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const isExecutingManualCommandRef = useRef(false);

  const fileNames = Object.keys(vfs).sort();

  const fileTree = useMemo(() => {
    const root: any = {};
    for (const path of fileNames) {
      const parts = path.split('/');
      let current = root;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (i === parts.length - 1) {
          // File
          current[part] = { isDirectory: false, children: { fullPath: path } };
        } else {
          // Directory
          if (!current[part]) {
            current[part] = { isDirectory: true, children: {} };
          }
          current = current[part].children;
        }
      }
    }
    return root;
  }, [fileNames]);

  useEffect(() => {
    if (!activeFile && fileNames.length > 0) {
      if (vfs['index.html']) setActiveFile('index.html');
      else setActiveFile(fileNames[0]);
    }
  }, [vfs, activeFile, fileNames]);

  useEffect(() => {
    if (mode === 'terminal' && terminalRef.current) {
      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
      }

      const term = new Terminal({
        theme: {
          background: '#1e1e1e',
          foreground: '#d4d4d4',
        },
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'JetBrains Mono, monospace',
      });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(terminalRef.current);
      fitAddon.fit();
      xtermRef.current = term;
      fitAddonRef.current = fitAddon;

      term.write('Terminal is ready...\r\n');
      const existingLogs = useAppStore.getState().terminalLogs;
      if (existingLogs) {
        term.write(existingLogs.replace(/\r?\n/g, '\r\n'));
      }
      term.write('\r\ndeepagent-workspace:$ ');

      let currentLine = '';
      const dataDisposable = term.onData(async (data) => {
        if (isExecutingManualCommandRef.current) return;

        // Handle enter key
        if (data === '\r' || data === '\n') {
          term.write('\r\n');
          const trimmedCommand = currentLine.trim();
          currentLine = '';
          if (trimmedCommand) {
            isExecutingManualCommandRef.current = true;
            useAppStore.getState().appendTerminalLog(`\n> ${trimmedCommand}\n`);
            
            try {
              const response = await fetch('/api/terminal/command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: trimmedCommand })
              });

              if (!response.body) {
                term.write('\r\nError: No response stream from server.\r\n');
                term.write('deepagent-workspace:$ ');
                isExecutingManualCommandRef.current = false;
                return;
              }

              const reader = response.body.getReader();
              const decoder = new TextDecoder();
              let done = false;

              while (!done) {
                const { value, done: doneReading } = await reader.read();
                done = doneReading;
                if (value) {
                  const text = decoder.decode(value);
                  const formattedText = text.replace(/\r?\n/g, '\n').replace(/\n/g, '\r\n');
                  term.write(formattedText);
                  useAppStore.getState().appendTerminalLog(formattedText);
                }
              }
            } catch (err: any) {
              const errMsg = `\r\nError executing command: ${err.message}\r\n`;
              term.write(errMsg);
              useAppStore.getState().appendTerminalLog(errMsg);
            } finally {
              isExecutingManualCommandRef.current = false;
              term.write('deepagent-workspace:$ ');
            }
          } else {
            term.write('deepagent-workspace:$ ');
          }
        } 
        // Handle backspace
        else if (data === '\x7f' || data === '\x08') {
          if (currentLine.length > 0) {
            currentLine = currentLine.slice(0, -1);
            term.write('\b \b');
          }
        } 
        // Handle Ctrl+C
        else if (data === '\x03') {
          term.write('^C\r\n');
          currentLine = '';
          term.write('deepagent-workspace:$ ');
        }
        // Handle ordinary printable keys
        else if (data.length === 1 && data >= ' ' && data <= '~') {
          currentLine += data;
          term.write(data);
        }
      });

      return () => {
        dataDisposable.dispose();
        if (xtermRef.current) {
          xtermRef.current.dispose();
          xtermRef.current = null;
        }
      };
    }
  }, [mode]);

  useEffect(() => {
    // Subscribe to terminal updates
    const unsubscribe = useAppStore.subscribe(
      (state) => state.terminalLogs,
      (logs, previousLogs) => {
        if (xtermRef.current && logs !== previousLogs) {
           const newChunk = logs.slice(previousLogs.length);
           if (newChunk && !isExecutingManualCommandRef.current) {
             xtermRef.current.write(newChunk.replace(/\r?\n/g, '\n').replace(/\n/g, '\r\n'));
           }
        }
      }
    );
    return () => unsubscribe();
  }, []);

  // Try to render the app inside the iframe when in preview mode
  const srcDoc = useMemo(() => {
    if (!vfs['index.html']) return '<h1>No index.html found. Cannot render full app preview.</h1>';
    
    let html = vfs['index.html'];

    // Basic heuristic: inject CSS and JS directly for previews if they are referenced
    // More complex bundling is omitted for MVP. 
    // We look for standard script.js and style.css
    
    if (vfs['style.css']) {
      html = html.replace(
        '<link rel="stylesheet" href="/style.css">',
        `<style>\n${vfs['style.css']}\n</style>`
      );
    }
    
    if (vfs['script.js']) {
      html = html.replace(
        '<script src="/script.js"></script>',
        `<script>\n${vfs['script.js']}\n</script>`
      );
    }

    return html;
  }, [vfs]);

  const editorRef = useRef<any>(null);

  const activeContent = activeFile ? vfs[activeFile] : '';

  useEffect(() => {
    // When the agent updates the VFS, or when switching files, sync the editor without losing cursor state
    if (editorRef.current && activeContent !== undefined) {
      const model = editorRef.current.getModel();
      if (model && model.getValue() !== activeContent) {
        model.pushEditOperations(
          [],
          [{ range: model.getFullModelRange(), text: activeContent }],
          () => null
        );
      }
    }
  }, [activeContent, activeFile]);

  const handleEditorMount = (editor: any) => {
    editorRef.current = editor;
  };

  const handleEditorChange = (value: string | undefined) => {
    if (activeFile && value !== undefined) {
      updateFile(activeFile, value);
    }
  };

  const getLanguage = (filename: string) => {
    if (filename.endsWith('.ts') || filename.endsWith('.tsx')) return 'typescript';
    if (filename.endsWith('.js') || filename.endsWith('.jsx')) return 'javascript';
    if (filename.endsWith('.css')) return 'css';
    if (filename.endsWith('.json')) return 'json';
    if (filename.endsWith('.html')) return 'html';
    return 'plaintext';
  };

  return (
    <div className="flex h-full bg-[#1e1e1e] text-gray-300 relative overflow-hidden">
      {/* File Tree - Responsive Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#111] border-r border-gray-800 transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full uppercase tracking-widest text-gray-500">
          <div className="p-3 text-xs font-bold border-b border-gray-800 flex justify-between items-center">
            Explorer
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-gray-400">
              <ChevronRight className="w-4 h-4 rotate-180" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {Object.entries(fileTree).map(([name, node]: [string, any]) => (
              <FileTreeNode
                key={name}
                name={name}
                {...node}
                activeFile={activeFile}
                onSelect={(_name: string, fullPath: string) => {
                  setActiveFile(fullPath);
                  setMode('code');
                  if (window.innerWidth < 768) setIsSidebarOpen(false);
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        {/* Tabs - Responsive Header */}
        <div className="flex bg-[#2d2d2d] border-b border-gray-800 overflow-x-auto whitespace-nowrap scrollbar-hide no-scrollbar">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="px-4 border-r border-gray-800 text-gray-400 hover:text-white"
          >
            {isSidebarOpen ? <ChevronRight className="w-4 h-4 rotate-180" /> : <Folder className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setMode('code')}
            className={`px-4 py-2 text-sm flex items-center gap-2 border-b-2 transition-colors ${
              mode === 'code' ? 'border-blue-500 text-white bg-[#1e1e1e]' : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-[#333]'
            }`}
          >
            <Code2 className="w-4 h-4" />
            Code
          </button>
          <button
            onClick={() => setMode('preview')}
            className={`px-4 py-2 text-sm flex items-center gap-2 border-b-2 transition-colors ${
              mode === 'preview' ? 'border-blue-500 text-white bg-[#1e1e1e]' : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-[#333]'
            }`}
          >
            <Play className="w-4 h-4" />
            Preview
          </button>
          <button
            onClick={() => setMode('terminal')}
            className={`px-4 py-2 text-sm flex items-center gap-2 border-b-2 transition-colors ${
              mode === 'terminal' ? 'border-blue-500 text-white bg-[#1e1e1e]' : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-[#333]'
            }`}
          >
            <TerminalIcon className="w-4 h-4" />
            Terminal
          </button>
          <button
            onClick={() => setMode('maintenance')}
            className={`px-4 py-2 text-sm flex items-center gap-2 border-b-2 transition-colors ${
              mode === 'maintenance' ? 'border-blue-500 text-white bg-[#1e1e1e]' : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-[#333]'
            }`}
          >
            <Shield className="w-4 h-4" />
            Maintenance
          </button>
          <button
            onClick={() => setMode('mesh')}
            className={`px-4 py-2 text-sm flex items-center gap-2 border-b-2 transition-colors ${
              mode === 'mesh' ? 'border-blue-500 text-white bg-[#1e1e1e]' : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-[#333]'
            }`}
          >
            <Network className="w-4 h-4" />
            Mesh
          </button>
          <div className="flex-1"></div>
          <button
            onClick={async () => {
              try {
                const res = await fetch('/api/save', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ vfs: useAppStore.getState().vfs })
                });
                if (res.ok) {
                  alert('All files saved successfully!');
                } else {
                  alert('Error saving files.');
                }
              } catch (e) {
                alert('Connection error.');
              }
            }}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            Save All
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 relative flex flex-col">
          {/* Proposed Command Review Bar */}
          <AnimatePresence>
            {currentProposedCommand && (
              <motion.div 
                initial={{ y: -50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -50, opacity: 0 }}
                className="bg-amber-600 text-white px-4 py-2.5 flex items-center justify-between shadow-lg z-10 border-b border-amber-500"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <AlertTriangle className="w-5 h-5 text-yellow-300 animate-bounce shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-bold">Destructive Command Confirmation Request</span>
                    <span className="text-xs text-amber-100 font-mono truncate">
                      The agent wants to run: <code className="bg-black/30 px-1.5 py-0.5 rounded text-yellow-200">{currentProposedCommand.command}</code>
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button 
                    onClick={async () => {
                      try {
                        await fetch('/api/approve-command', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ id: currentProposedCommand.id, approved: false })
                        });
                      } catch (e) {
                        console.error(e);
                      }
                      resolveProposedCommand(currentProposedCommand.id, 'rejected');
                    }}
                    className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded-md text-xs font-bold transition-colors flex items-center gap-1 text-white"
                  >
                    <X className="w-4 h-4" /> Deny
                  </button>
                  <button 
                    onClick={async () => {
                      try {
                        await fetch('/api/approve-command', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ id: currentProposedCommand.id, approved: true })
                        });
                      } catch (e) {
                        console.error(e);
                      }
                      resolveProposedCommand(currentProposedCommand.id, 'accepted');
                    }}
                    className="px-4 py-1 bg-white text-amber-800 hover:bg-amber-50 rounded-md text-xs font-bold transition-colors flex items-center gap-1 shadow-sm"
                  >
                    <Check className="w-4 h-4" /> Approve
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Diff Review Bar */}
          <AnimatePresence>
            {currentProposedChange && mode === 'code' && (
              <motion.div 
                initial={{ y: -50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -50, opacity: 0 }}
                className="bg-blue-600 text-white px-4 py-2 flex items-center justify-between shadow-lg z-10"
              >
                <div className="flex items-center gap-3">
                  <Zap className="w-5 h-5 text-yellow-300 animate-pulse" />
                  <span className="text-sm font-bold">Review Proposed Edits</span>
                  <span className="text-xs bg-white/20 px-2 py-0.5 rounded font-mono">{activeFile}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => resolveProposedChange(currentProposedChange.id, 'rejected')}
                    className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded-md text-xs font-bold transition-colors flex items-center gap-1"
                  >
                    <X className="w-4 h-4" /> Discard
                  </button>
                  <button 
                    onClick={() => resolveProposedChange(currentProposedChange.id, 'accepted')}
                    className="px-4 py-1 bg-white text-blue-600 hover:bg-blue-50 rounded-md text-xs font-bold transition-colors flex items-center gap-1 shadow-sm"
                  >
                    <Check className="w-4 h-4" /> Accept Changes
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Execution Mode Toolbar */}
          <div className="bg-[#252526] border-b border-gray-800 px-4 py-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-gray-500">
             <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5 text-gray-400">
                  <Eye className="w-3.5 h-3.5" /> Strategy Mode:
                </span>
                <div className="flex bg-[#1e1e1e] rounded-md p-0.5 border border-gray-800">
                  {(['plan', 'normal', 'yolo'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setExecutionMode(m)}
                      className={`px-3 py-1 rounded transition-all ${
                        executionMode === m 
                          ? 'bg-blue-600 text-white shadow-sm' 
                          : 'hover:bg-gray-800 text-gray-500'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
             </div>
             
             {executionMode === 'yolo' && (
               <div className="flex items-center gap-1.5 text-red-400 animate-pulse">
                 <AlertTriangle className="w-3.5 h-3.5" />
                 Warning: Auto-Approve Enabled
               </div>
             )}
          </div>

          <div className="flex-1 relative">
            {mode === 'code' && activeFile ? (
              currentProposedChange ? (
                <div className="flex h-full w-full">
                  <div className="flex-1 min-w-0 h-full">
                    <DiffEditor
                      height="100%"
                      original={currentProposedChange.originalContent}
                      modified={currentProposedChange.proposedContent}
                      language={getLanguage(activeFile)}
                      theme="vs-dark"
                      options={{
                        renderSideBySide: true,
                        readOnly: true,
                        domReadOnly: true,
                        minimap: { enabled: false },
                        fontSize: 14,
                        padding: { top: 16 }
                      }}
                    />
                  </div>
                  {currentProposedChange.chunks && currentProposedChange.chunks.length > 0 && (
                    <div className="w-[380px] border-l border-gray-800 bg-[#1e1e1e] flex flex-col h-full overflow-hidden text-gray-200">
                      <div className="p-4 border-b border-gray-800 bg-[#252526] sticky top-0 z-10 flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Targeted Chunk Modifications</h3>
                        <span className="text-xs bg-blue-600/20 text-blue-400 px-2.5 py-0.5 rounded-full font-bold">
                          {currentProposedChange.chunks.filter(c => c.status === 'accepted').length} / {currentProposedChange.chunks.length} Approved
                        </span>
                      </div>
                      <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {currentProposedChange.chunks.map((chunk) => (
                          <div key={chunk.id} className="border border-gray-800 rounded bg-[#181818] overflow-hidden shadow-md">
                            <div className="px-3 py-2 bg-[#252526] flex items-center justify-between border-b border-gray-800">
                              <span className="text-xs font-mono text-gray-400">Chunk {chunk.id}</span>
                              <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                                chunk.status === 'accepted' ? 'bg-green-600/50 text-green-300 border border-green-600/30' :
                                chunk.status === 'rejected' ? 'bg-red-600/50 text-red-400 border border-red-600/30' :
                                'bg-yellow-600/20 text-yellow-500 border border-yellow-600/30'
                              }`}>
                                {chunk.status}
                              </span>
                            </div>
                            
                            {chunk.description && (
                              <div className="p-3 text-xs text-gray-400 italic border-b border-gray-800 bg-[#202021]">
                                {chunk.description}
                              </div>
                            )}
                            
                            <div className="p-3 space-y-2">
                              <div className="space-y-1">
                                <span className="text-[10px] text-gray-500 uppercase font-mono block">Original Block</span>
                                <pre className="text-xs p-2 bg-red-950/20 text-red-300 font-mono overflow-x-auto rounded border border-red-950/50 max-h-24 whitespace-pre-wrap">
                                  {chunk.target}
                                </pre>
                              </div>
                              <div className="space-y-1">
                                <span className="text-[10px] text-gray-500 uppercase font-mono block">Proposed Replacement</span>
                                <pre className="text-xs p-2 bg-green-950/20 text-green-300 font-mono overflow-x-auto rounded border border-green-950/50 max-h-24 whitespace-pre-wrap">
                                  {chunk.replacement}
                                </pre>
                              </div>
                            </div>
                            
                            {chunk.status === 'pending' && (
                              <div className="flex border-t border-gray-800">
                                <button
                                  type="button"
                                  onClick={() => resolveProposedChunk(currentProposedChange.id, chunk.id, 'rejected')}
                                  className="flex-1 py-1.5 hover:bg-red-600/10 text-red-400 text-xs font-bold transition-all border-r border-gray-800"
                                >
                                  Reject
                                </button>
                                <button
                                  type="button"
                                  onClick={() => resolveProposedChunk(currentProposedChange.id, chunk.id, 'accepted')}
                                  className="flex-1 py-1.5 hover:bg-green-600/10 text-green-400 text-xs font-bold transition-all"
                                >
                                  Accept
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Editor
                  height="100%"
                  path={activeFile}
                  language={getLanguage(activeFile)}
                  theme="vs-dark"
                  defaultValue={activeContent}
                  onChange={handleEditorChange}
                  onMount={handleEditorMount}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    wordWrap: 'on',
                    padding: { top: 16 }
                  }}
                />
              )
            ) : mode === 'preview' ? (
            <iframe
              ref={iframeRef}
              srcDoc={srcDoc}
              title="Preview"
              className="w-full h-full bg-white border-0"
              sandbox="allow-scripts"
            />
          ) : mode === 'terminal' ? (
            <div ref={terminalRef} className="w-full h-full bg-[#1e1e1e]" />
          ) : mode === 'maintenance' ? (
            <div className="w-full h-full bg-gray-50 overflow-y-auto">
              <Maintenance />
            </div>
          ) : mode === 'mesh' ? (
            <div className="w-full h-full bg-gray-50 overflow-y-auto">
              <MeshController />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              Select a file to edit
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
  );
}
