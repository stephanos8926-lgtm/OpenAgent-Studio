// File: src/components/Workspace.tsx

import React, { useState } from 'react';
import { useAppStore } from '../lib/store';
import { FileTree } from './FileTree';
import { EditorPanel } from './EditorPanel';
import { PreviewPanel } from './PreviewPanel';
import { TerminalPanel } from './TerminalPanel';
import { ErrorBoundary } from './ErrorBoundary';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileCode, 
  Eye, 
  Terminal as TerminalIcon,
  Search,
  Plus,
  Settings,
  ChevronRight,
  Monitor
} from 'lucide-react';

export const Workspace: React.FC = () => {
  const { setShowSettingsModal } = useAppStore();
  const [activeView, setActiveView] = useState<'preview' | 'code'>('preview');
  const [isExplorerOpen, setIsExplorerOpen] = useState(true);

  return (
    <div className="flex w-full h-full bg-[#0a0c10] overflow-hidden">
      {/* File Explorer Sidebar ( extreme left ) */}
      <AnimatePresence initial={false}>
        {isExplorerOpen && (
          <motion.div 
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="h-full border-r border-white/5 bg-[#0b0d10] flex flex-col shrink-0 overflow-hidden"
          >
            <div className="p-4 flex items-center justify-between border-b border-white/5 bg-[#0d0f14]/50">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">File Explorer</span>
              <div className="flex items-center gap-2">
                <button className="p-1 hover:bg-white/5 rounded text-slate-500 hover:text-slate-300">
                  <Search size={14} />
                </button>
                <button className="p-1 hover:bg-white/5 rounded text-slate-500 hover:text-slate-300">
                  <Plus size={14} />
                </button>
                <button 
                  onClick={() => setShowSettingsModal(true)}
                  className="p-1 hover:bg-white/5 rounded text-slate-500 hover:text-slate-300"
                  title="Open Settings"
                >
                  <Settings size={14} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              <ErrorBoundary componentName="FileTree">
                <FileTree />
              </ErrorBoundary>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#07090e]">
        {/* Viewport Control Header */}
        <div className="h-12 flex items-center justify-between px-4 bg-[#0d0f14] border-b border-white/5 shrink-0">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsExplorerOpen(!isExplorerOpen)}
              className={`p-1.5 rounded transition-all ${!isExplorerOpen ? 'bg-indigo-600/10 text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <Monitor size={16} />
            </button>
            <div className="w-[1px] h-4 bg-white/5 mx-1" />
            <div className="flex bg-[#07090e] p-1 rounded-lg border border-white/5 gap-1">
              <button 
                onClick={() => setActiveView('preview')}
                className={`px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded transition-all flex items-center gap-2 ${
                  activeView === 'preview' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/20' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Eye size={12} />
                Preview
              </button>
              <button 
                onClick={() => setActiveView('code')}
                className={`px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded transition-all flex items-center gap-2 ${
                  activeView === 'code' ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/20' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <FileCode size={12} />
                Code
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
             <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                VFS ONLINE
             </div>
          </div>
        </div>

        {/* Content Canvas */}
        <div className="flex-1 relative overflow-hidden flex flex-col">
          <AnimatePresence mode="wait">
            {activeView === 'preview' ? (
              <motion.div 
                key="preview"
                initial={{ opacity: 0, scale: 0.995 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.99 }}
                className="flex-1 h-full"
              >
                <ErrorBoundary componentName="PreviewPanel">
                  <PreviewPanel />
                </ErrorBoundary>
              </motion.div>
            ) : (
              <motion.div 
                key="code"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex-1 h-full"
              >
                <ErrorBoundary componentName="EditorPanel">
                  <EditorPanel />
                </ErrorBoundary>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Integrated Interactive Terminal (Bottom) */}
          <div className="h-48 bg-black/40 border-t border-white/5 flex flex-col">
            <div className="px-4 py-2 bg-[#0d0f14] border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                <TerminalIcon size={14} />
                Development Terminal
              </div>
              <ChevronRight size={14} className="text-slate-700" />
            </div>
            <div className="flex-1 overflow-hidden p-3 font-mono text-[11px]">
              <ErrorBoundary componentName="TerminalPanel">
                <TerminalPanel />
              </ErrorBoundary>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

