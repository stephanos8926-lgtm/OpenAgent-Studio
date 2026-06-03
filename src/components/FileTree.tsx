// File: src/components/FileTree.tsx

import React from 'react';
import { useAppStore } from '../lib/store';
import { WorkspaceFile } from '../types';
import { Folder, FolderOpen, FileCode, Terminal, HelpCircle } from 'lucide-react';

interface FileNodeProps {
  node: WorkspaceFile;
  level: number;
}

const FileNode: React.FC<FileNodeProps> = ({ node, level }) => {
  const { activeFile, setActiveFile } = useAppStore();
  const [isOpen, setIsOpen] = React.useState(true);

  const getIcon = () => {
    if (node.isDirectory) {
      return isOpen ? (
        <FolderOpen className="w-4 h-4 text-amber-400 fill-amber-400/10 shrink-0" />
      ) : (
        <Folder className="w-4 h-4 text-amber-500 fill-amber-500/10 shrink-0" />
      );
    }
    
    // File type matching icons
    if (node.name.endsWith('.tsx') || node.name.endsWith('.ts')) {
      return <FileCode className="w-4 h-4 text-cyan-400 shrink-0" />;
    }
    return <FileCode className="w-4 h-4 text-slate-400 shrink-0" />;
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
    <div className="select-none font-mono">
      <div
        onClick={handleClick}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        className={`flex items-center gap-2 py-1.5 rounded-lg text-xs cursor-pointer transition-all ${
          isSelected 
            ? 'bg-blue-600/20 text-blue-300 font-bold border-l-2 border-blue-500' 
            : 'text-slate-400 hover:bg-slate-850 hover:text-slate-200'
        }`}
      >
        {getIcon()}
        <span className="truncate leading-none">{node.name}</span>
      </div>

      {node.isDirectory && isOpen && node.children && (
        <div className="space-y-0.5 mt-0.5">
          {node.children.map(child => (
            <FileNode key={child.path} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

export const FileTree: React.FC = () => {
  const { files } = useAppStore();

  return (
    <div id="file-tree-container" className="space-y-2 h-full flex flex-col font-sans">
      <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold uppercase tracking-wider border-b border-slate-800 pb-2">
        <span>Files Explorer</span>
        <span className="text-[9px] bg-slate-950 px-1 py-0.5 rounded text-blue-400 border border-slate-850">
          VFS MOUNTED
        </span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-1">
        {files.map(file => (
          <FileNode key={file.path} node={file} level={0} />
        ))}
      </div>
    </div>
  );
};
