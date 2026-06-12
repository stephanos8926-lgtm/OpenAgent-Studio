// File: src/components/FileTree.tsx

import React from 'react';
import { useAppStore } from '../lib/store';
import { WorkspaceFile } from '../types';
import { Folder, ChevronRight, FileCode, FileJson, FileText, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface FileNodeProps {
  node: WorkspaceFile;
  level: number;
}

const FileNode: React.FC<FileNodeProps> = ({ node, level }) => {
  const { activeFile, setActiveFile } = useAppStore();
  const [isOpen, setIsOpen] = React.useState(true);

  const getIcon = () => {
    if (node.isDirectory) {
      return (
        <Folder className={`w-3.5 h-3.5 shrink-0 ${isOpen ? 'text-slate-400' : 'text-slate-600'}`} />
      );
    }
    
    // File type matching icons
    if (node.name.endsWith('.tsx') || node.name.endsWith('.ts')) {
      return <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0 mx-1" />;
    }
    if (node.name.endsWith('.json')) {
      return <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 mx-1" />;
    }
    return <div className="w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0 mx-1" />;
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.isDirectory) {
      setIsOpen(!isOpen);
    } else {
      setActiveFile(node);
    }
  };

  const isSelected = activeFile && activeFile.path === node.path;

  return (
    <div className="select-none overflow-hidden">
      <div
        onClick={handleClick}
        style={{ paddingLeft: `${level * 16 + 12}px` }}
        className={`group flex items-center gap-2 py-1.5 rounded-md text-[11px] cursor-pointer transition-all duration-200 ${
          isSelected 
            ? 'bg-indigo-600/10 text-slate-100 font-bold border border-indigo-500/10' 
            : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
        }`}
      >
        {node.isDirectory && (
          <ChevronRight 
            size={12} 
            className={`transition-transform duration-200 ${isOpen ? 'rotate-90' : ''} text-slate-600`} 
          />
        )}
        {!node.isDirectory && <div className="w-3" />}
        {getIcon()}
        <span className="truncate flex-1 tracking-tight">{node.name}</span>
      </div>

      <AnimatePresence initial={false}>
        {node.isDirectory && isOpen && node.children && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="space-y-0.5 mt-0.5 overflow-hidden"
          >
            {node.children.map(child => (
              <FileNode key={child.path} node={child} level={level + 1} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const FileTree: React.FC = () => {
  const { files } = useAppStore();

  return (
    <div id="file-tree-container" className="space-y-1 h-full flex flex-col font-sans">
      <div className="flex items-center justify-between px-2 py-2 mb-2">
         <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Active Workspace</span>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
        {files.map(file => (
          <FileNode key={file.path} node={file} level={0} />
        ))}
      </div>
    </div>
  );
};

