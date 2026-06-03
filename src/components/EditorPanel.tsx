// File: src/components/EditorPanel.tsx

import React, { useEffect, useState, useRef } from 'react';
import { useAppStore } from '../lib/store';
import { FileCode, Save, CheckCircle, XCircle, ArrowRight, X } from 'lucide-react';
import { Editor, DiffEditor } from '@monaco-editor/react';

export const EditorPanel: React.FC = () => {
  const { activeFile, updateFileContent, clearFileProposal, appendTerminalLine, injectLogEvent } = useAppStore();
  
  // Using monaco diff editor reference to extract chunks
  const diffEditorRef = useRef<any>(null);
  const [diffChanges, setDiffChanges] = useState<any[]>([]);

  const handleTextChange = (value: string | undefined) => {
    if (activeFile && value !== undefined) {
      updateFileContent(activeFile.path, value);
    }
  };

  const handleSave = () => {
    if (activeFile) {
      appendTerminalLine(`Saved file: ${activeFile.path} to sandbox disk`);
      injectLogEvent(
        'INFO',
        'IDE_SYSTEM',
        'VFSWriter',
        `Successfully autosaved file ${activeFile.name}`,
        `File Path: ${activeFile.path}`
      );
    }
  };

  const handleDiffMount = (editor: any) => {
    diffEditorRef.current = editor;
    
    // Listen for diff computed
    editor.onDidUpdateDiff(() => {
      const changes = editor.getLineChanges();
      if (changes) {
        setDiffChanges(changes);
      }
    });
  };

  const acceptChunk = (change: any) => {
    if (!diffEditorRef.current) return;
    const editor = diffEditorRef.current;
    const modifiedModel = editor.getModel().modified;
    const originalModel = editor.getModel().original;
    
    let modifiedText = '';
    if (change.modifiedEndLineNumber !== 0) {
      modifiedText = modifiedModel.getValueInRange({
        startLineNumber: change.modifiedStartLineNumber,
        startColumn: 1,
        endLineNumber: change.modifiedEndLineNumber,
        endColumn: modifiedModel.getLineMaxColumn(change.modifiedEndLineNumber)
      });
      // Add a newline if it's not the end of the file and we're inserting lines
      if (change.originalStartLineNumber === 0 && change.originalEndLineNumber === 0) {
         modifiedText += '\n';
      }
    }
    
    let replaceRange = {
      startLineNumber: change.originalStartLineNumber,
      startColumn: 1,
      endLineNumber: Math.max(1, change.originalEndLineNumber),
      endColumn: change.originalEndLineNumber === 0 ? 1 : originalModel.getLineMaxColumn(change.originalEndLineNumber)
    };

    if (change.originalStartLineNumber === 0) {
      replaceRange.startLineNumber = 1;
      replaceRange.endLineNumber = 1;
    }

    originalModel.pushEditOperations(
      [],
      [{
        range: replaceRange,
        text: modifiedText
      }],
      () => null
    );

    // Save back to store
    if (activeFile) {
      updateFileContent(activeFile.path, originalModel.getValue());
    }
  };

  const acceptAllChanges = () => {
    if (activeFile && activeFile.proposedContent !== undefined) {
      updateFileContent(activeFile.path, activeFile.proposedContent);
      clearFileProposal(activeFile.path);
    }
  };

  const discardProposal = () => {
    if (activeFile) {
      clearFileProposal(activeFile.path);
    }
  };

  if (!activeFile) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 text-slate-500 font-sans">
        <FileCode className="w-8 h-8 text-slate-700 mb-2" />
        <p className="text-xs">No file selected in files explorer.</p>
        <p className="text-[10px] text-slate-600 mt-1">Select a file from the left sidebar tree to begin editing.</p>
      </div>
    );
  }

  const isDiffMode = activeFile.proposedContent !== undefined;

  return (
    <div id="editor-panel-container" className="h-full flex flex-col bg-[#1e1e1e] rounded-xl border border-slate-850 overflow-hidden font-sans">
      
      {/* Editor Tab Headers toolbar */}
      <div className="flex items-center justify-between bg-[#252526] px-4 py-2 border-b border-[#3c3c3c]">
        <div className="flex items-center gap-2">
          <FileCode className="w-4 h-4 text-cyan-400 shrink-0" />
          <span className="text-xs font-mono font-bold text-slate-300 truncate max-w-[200px]">
            {activeFile.name}
          </span>
          {isDiffMode && (
            <span className="text-[9px] bg-purple-900/30 text-purple-400 border border-purple-500/20 px-1.5 py-0.5 rounded font-mono font-extrabold pb-0.5 animate-pulse">
              PROPOSAL REVIEW
            </span>
          )}
        </div>

        {/* Action button */}
        <div className="flex items-center gap-2">
          {isDiffMode ? (
            <>
              <button
                onClick={discardProposal}
                className="px-2.5 py-1 bg-transparent hover:bg-red-500/10 text-red-400 border border-red-500/20 rounded-md text-[10px] font-bold flex items-center gap-1 cursor-pointer select-none transition-all"
              >
                <X className="w-3 h-3" />
                Discard
              </button>
              <button
                onClick={acceptAllChanges}
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-md text-[10px] font-bold flex items-center gap-1 cursor-pointer select-none transition-all"
              >
                <CheckCircle className="w-3 h-3" />
                Accept All
              </button>
            </>
          ) : (
            <button
              onClick={handleSave}
              className="px-2.5 py-1 bg-[#0e639c] hover:bg-[#1177bb] active:bg-[#0c5384] text-white rounded-md text-[10px] font-bold flex items-center gap-1 cursor-pointer select-none transition-all"
            >
              <Save className="w-3 h-3" />
              Save
            </button>
          )}
        </div>
      </div>

      {isDiffMode && diffChanges.length > 0 && (
        <div className="bg-[#2d2d2d] border-b border-[#3c3c3c] p-2 px-4 flex items-center gap-3 overflow-x-auto">
          <span className="text-[10px] text-slate-400 font-mono shrink-0">Review Chunks:</span>
          {diffChanges.map((change, i) => (
            <div key={i} className="flex items-center gap-1.5 bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1 shrink-0">
               <span className="text-[10px] text-slate-300 font-mono">
                 Lines {change.originalStartLineNumber > 0 ? change.originalStartLineNumber : 'New'} 
                 <ArrowRight className="w-3 h-3 inline mx-0.5 text-slate-500" /> 
                 {change.modifiedStartLineNumber > 0 ? change.modifiedStartLineNumber : 'Del'}
               </span>
               <div className="flex items-center gap-1 border-l border-[#3c3c3c] pl-1.5 ml-1">
                 <button onClick={() => acceptChunk(change)} title="Accept Chunk" className="text-emerald-400 hover:text-emerald-300 cursor-pointer">
                   <CheckCircle className="w-3 h-3" />
                 </button>
               </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor Container */}
      <div className="flex-1 overflow-hidden relative">
        {isDiffMode ? (
          <DiffEditor
            original={activeFile.content || ''}
            modified={activeFile.proposedContent || ''}
            language="typescript"
            theme="vs-dark"
            onMount={handleDiffMount}
            options={{
              renderSideBySide: true,
              readOnly: false, // Allows original to be editable if modified programatically
              originalEditable: true,
              minimap: { enabled: false },
              fontSize: 12,
              scrollBeyondLastLine: false,
            }}
          />
        ) : (
          <Editor
            value={activeFile.content || ''}
            onChange={handleTextChange}
            language="typescript"
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 12,
              scrollBeyondLastLine: false,
              wordWrap: 'on'
            }}
          />
        )}
      </div>

      {/* Editor Status bar */}
      <div className="bg-[#007acc] px-4 py-1 flex items-center justify-between text-[10px] text-white font-mono">
        <div className="flex items-center gap-4">
          <span>UTF-8</span>
          <span>{activeFile.name.split('.').pop()?.toUpperCase() || 'TXT'}</span>
        </div>
        <div className="flex items-center gap-1.5 font-bold">
          CODE_SERVICE: ACTIVE
        </div>
      </div>

    </div>
  );
};
