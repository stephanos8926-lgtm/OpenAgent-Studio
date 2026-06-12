// File: src/components/PreviewPanel.tsx

import React, { useState, useMemo } from 'react';
import { useAppStore } from '../lib/store';
import { Eye, ShieldCheck, RefreshCw, AlertOctagon, Layers, ShieldAlert } from 'lucide-react';

export const PreviewPanel: React.FC = () => {
  const { metrics, injectLogEvent, hmrUpdates, files } = useAppStore();
  const [activeTab, setActiveTab ] = useState<'preview' | 'schema'>('preview');
  const [iframeKey, setIframeKey] = useState(0);

  // Helper function to extract file content recursively
  const getFileContent = (nodes: any[], targetPath: string): string => {
    for (const node of nodes) {
      if (node.path === targetPath) return node.content || '';
      if (node.children) {
        const content = getFileContent(node.children, targetPath);
        if (content) return content;
      }
    }
    return '';
  };

  // Compile App.tsx content on the fly to render in the sandboxed frame
  const srcDoc = useMemo(() => {
    const appContent = getFileContent(files || [], 'src/App.tsx');
    let renderedHtml = '';
    
    if (appContent) {
      const jsxMatch = appContent.match(/return\s*\(\s*([\s\S]*?)\s*\);?/);
      if (jsxMatch) {
        renderedHtml = jsxMatch[1]
          .replace(/className=/g, 'class=') // Converts JSX className to HTML class
          .replace(/\{`([\s\S]*?)`\}/g, '$1') // Resolve backticks template strings
          .replace(/\{([\s\S]*?)\}/g, '$1'); // Resolve general braces
      } else {
        const directMatch = appContent.match(/return\s+([\s\S]*?);?/);
        if (directMatch) {
          renderedHtml = directMatch[1].replace(/className=/g, 'class=');
        }
      }
    }

    if (!renderedHtml || !renderedHtml.trim()) {
      renderedHtml = `
        <div class="flex flex-col items-center justify-center min-h-screen bg-slate-950 p-6 text-slate-300">
          <h2 class="text-xl font-bold mb-2 text-white font-sans text-center">New Agentic App</h2>
          <p class="text-xs text-slate-500 font-mono text-center">Ready to render application elements...</p>
        </div>
      `;
    }

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="https://cdn.tailwindcss.com"></script>
        <script>
          tailwind.config = {
            theme: {
              extend: {
                colors: {
                  slate: {
                    850: '#1e293b',
                    950: '#020617',
                  }
                }
              }
            }
          }
        </script>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <style>
          body {
            font-family: 'Inter', sans-serif;
            margin: 0;
            padding: 0;
            background-color: #020617;
          }
        </style>
      </head>
      <body class="bg-slate-950 text-white min-h-screen">
        ${renderedHtml}
      </body>
      </html>
    `;
  }, [files]);

  // Intentional runtime crash function to test boundary capturing
  const triggerSelfCrash = () => {
    injectLogEvent(
      'CRITICAL',
      'USER_APPLICATION',
      'PreviewBoundary',
      'Intentional User-Triggered Component Crash',
      'ReferenceError: layoutNode is not defined\n  at PreviewPanel.renderBody (PreviewPanel.tsx:55:12)\n  at handleRenderState (react-dom.production.min.js:312:12)'
    );
    throw new ReferenceError('layoutNode is not defined inside user preview node.');
  };

  const handleRefresh = () => {
    setIframeKey(prev => prev + 1);
    injectLogEvent('INFO', 'IDE_SYSTEM', 'PreviewManager', 'Refreshed isolated iframe sandbox boundary.');
  };

  return (
    <div id="preview-panel-container" className="h-full flex flex-col bg-white text-slate-800 rounded-xl border border-slate-200 overflow-hidden font-sans shadow-inner">
      
      {/* Title bar */}
      <div className="flex items-center justify-between bg-slate-100 px-4 py-2 border-b border-slate-200 select-none">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-slate-500 shrink-0" />
          <span className="text-xs font-bold text-slate-700">
            Isolated Preview
          </span>
          <span className="text-[10px] font-mono font-black text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded leading-none flex items-center gap-1">
            <ShieldAlert className="w-3 h-3 text-blue-500" /> Sandboxed Port 3000
          </span>
        </div>

        {/* Viewport controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleRefresh}
            title="Reload Sandbox Viewport"
            className="p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
          
          <div className="h-4 w-[1px] bg-slate-200" />

          <button
            onClick={() => setActiveTab('preview')}
            className={`px-2.5 py-1 rounded text-[10px] font-bold cursor-pointer transition-all ${
              activeTab === 'preview' 
                ? 'bg-white text-slate-800 shadow-xs border border-slate-200' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Live App
          </button>
          <button
            onClick={() => setActiveTab('schema')}
            className={`px-2.5 py-1 rounded text-[10px] font-bold cursor-pointer transition-all ${
              activeTab === 'schema' 
                ? 'bg-white text-slate-800 shadow-xs border border-slate-200' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            VFS Profile {hmrUpdates.length > 0 && `(${hmrUpdates.length})`}
          </button>
        </div>
      </div>

      {/* Main Sandbox Frame Rendering */}
      <div className="flex-1 bg-slate-50 flex flex-col min-h-[300px]">
        {activeTab === 'preview' ? (
          <div className="flex-1 flex flex-col p-4 relative">
            {/* Safe iframe boundary enforcement */}
            <div className="flex-1 rounded-xl overflow-hidden border border-slate-200/85 bg-[#020617] h-full flex flex-col relative shadow-sm">
              <iframe
                key={iframeKey}
                title="Workspace Preview Sandbox"
                srcDoc={srcDoc}
                sandbox="allow-scripts"
                className="w-full flex-1 border-0 bg-[#020617]"
              />
            </div>
            
            {/* Controller row */}
            <div className="mt-3 flex items-center justify-between gap-3 px-1 select-none">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-mono text-slate-500 font-semibold uppercase">Isolated sandboxed frame active</span>
              </div>
              
              <button
                onClick={triggerSelfCrash}
                className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded text-[10px] font-black cursor-pointer transition-all flex items-center gap-1"
              >
                <AlertOctagon className="w-3.5 h-3.5 text-red-500 font-bold" />
                Force Crash
              </button>
            </div>
          </div>
        ) : (
          /* Render VFS schema and node layout profiling */
          <div className="p-5 flex-1 flex flex-col justify-center">
            <div className="bg-slate-950 text-slate-300 p-5 rounded-xl border border-slate-900 font-mono text-[11px] space-y-4 max-w-sm mx-auto w-full shadow-lg leading-relaxed text-left">
              <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                <span className="text-cyan-400 font-bold uppercase tracking-widest text-[9px] flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-cyan-500" /> VFS Layout Profile
                </span>
                <span className="text-[8px] text-slate-500">BUILD ARCH: NODE-ESM</span>
              </div>
              
              <div className="space-y-1">
                <div><span className="text-slate-500">Container UUID:</span> <span className="text-slate-300">df3e1a80-c115-4e2b-baa3-e9821815e100</span></div>
                <div><span className="text-slate-500">Mount path:    </span> <span className="text-slate-300">/opt/workspace/app</span></div>
                <div><span className="text-slate-500">Compilation:   </span> <span className="text-emerald-400">VITE_SUCCESS (HMR_SOCKET)</span></div>
                <div><span className="text-slate-500">Output map:    </span> <span className="text-slate-300">dist/server.cjs (58.4kB)</span></div>
                <div><span className="text-slate-500">Diagnostics:   </span> <span className="text-cyan-400">Zero compiler faults</span></div>
              </div>

              {hmrUpdates.length > 0 && (
                <div className="pt-2 border-t border-slate-900 space-y-1 text-[10px]">
                  <div className="text-slate-400 font-bold">Recent Socket HMR Events:</div>
                  <div className="max-h-20 overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-slate-800 pr-1">
                    {hmrUpdates.map((h, i) => (
                      <div key={i} className="text-emerald-400 truncate">
                        [{h.timestamp}] {h.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-slate-900 text-[10px] text-slate-500 leading-normal">
                Virtual File System mounts cleanly to track and compile files in real time.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Status indicator bar */}
      <div className="bg-slate-100 border-t border-slate-200 px-4 py-1.5 select-none text-[10px] text-slate-500 font-mono flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Host isolation active
        </span>
        <span className="text-slate-400">REAL_TIME_SOCKETS</span>
      </div>

    </div>
  );
};
