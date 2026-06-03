// File: src/components/PreviewPanel.tsx

import React, { useState } from 'react';
import { useAppStore } from '../lib/store';
import { Eye, ShieldCheck, Play, RefreshCw, AlertOctagon, Layers, Compass } from 'lucide-react';

export const PreviewPanel: React.FC = () => {
  const { metrics, injectLogEvent, hmrUpdates, activeFile } = useAppStore();
  const [activeTab, setActiveTab] = useState<'preview' | 'schema'>('preview');
  const [clickCount, setClickCount] = useState(0);

  // Intentional runtime crash function to test boundary capturing
  const triggerSelfCrash = () => {
    injectLogEvent(
      'CRITICAL',
      'USER_APPLICATION',
      'PreviewBoundary',
      'Intentional User-Triggered Component Crash',
      'ReferenceError: layoutNode is not defined\n  at PreviewPanel.renderBody (PreviewPanel.tsx:55:12)\n  at handleRenderState (react-dom.production.min.js:312:12)'
    );
    
    // Force a React error that is caught by the ErrorBoundary around this component
    throw new ReferenceError('layoutNode is not defined inside user preview node.');
  };

  // Simple extraction of display lines from active code to simulate dynamic high-fidelity HMR render
  const extractVisualDetails = () => {
    if (!activeFile || !activeFile.content) return null;
    
    // Find some strings, headings, or titles in Code
    const textMatches = activeFile.content.match(/(text|title|name|label|heading|message|description)\s*:\s*["'`](.*?)["'`]/gi);
    const jsxHeaderMatch = activeFile.content.match(/<(h[1-6]|span|p)[^>]*>(.*?)<\/\1>/i);
    
    const parsedLines: string[] = [];
    if (textMatches) {
      textMatches.slice(0, 3).forEach(m => {
        const parts = m.split(':');
        const cleaned = parts && parts[1] ? parts[1].replace(/['"`]/g, '').trim() : '';
        if (cleaned && cleaned.length < 50 && !parsedLines.includes(cleaned)) {
          parsedLines.push(cleaned);
        }
      });
    }
    if (jsxHeaderMatch && jsxHeaderMatch[2]) {
      const txt = jsxHeaderMatch[2].replace(/\{.*?\}/g, '').trim();
      if (txt && txt.length < 50 && !parsedLines.includes(txt)) {
        parsedLines.push(txt);
      }
    }
    
    return parsedLines.length > 0 ? parsedLines : null;
  };

  const activeVisualStrings = extractVisualDetails();

  return (
    <div id="preview-panel-container" className="h-full flex flex-col bg-white text-slate-800 rounded-xl border border-slate-200 overflow-hidden font-sans shadow-inner">
      
      {/* Port Title bar */}
      <div className="flex items-center justify-between bg-slate-100 px-4 py-2 border-b border-slate-200 select-none">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-slate-500 shrink-0" />
          <span className="text-xs font-bold text-slate-700">
            Web Preview
          </span>
          <span className="text-[10px] font-mono font-black text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded leading-none">
            localhost:3000 (HMR Active)
          </span>
        </div>

        {/* Viewport controls */}
        <div className="flex items-center gap-1">
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
      <div className="flex-1 bg-slate-50 p-5 flex flex-col justify-between overflow-y-auto min-h-[300px]">
        {activeTab === 'preview' ? (
          /* Render Simulated running customer app */
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4 max-w-sm mx-auto w-full my-auto text-left transition-all">
            
            {/* Blinking HMR notification overlay */}
            {hmrUpdates.length > 0 && (
              <div className="bg-blue-50 border border-blue-100 text-blue-800 text-[10px] px-2.5 py-1.5 rounded-lg flex items-center justify-between gap-1.5 animate-pulse transition-all">
                <div className="flex items-center gap-1.5 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping shrink-0" />
                  <span className="font-bold">HMR Accept:</span>
                  <span className="truncate max-w-[130px]">{hmrUpdates[0].message}</span>
                </div>
                <span className="text-[8px] text-blue-400 font-mono shrink-0">{hmrUpdates[0].timestamp}</span>
              </div>
            )}

            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-xs font-black text-slate-900 tracking-wide uppercase font-mono">Simulated Web App</h4>
                <p className="text-[10px] text-slate-500 font-sans">Compiles instantly into sandbox container.</p>
              </div>
              <span className="text-[9px] bg-emerald-50 text-emerald-600 border border-emerald-100 font-mono font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-500" /> ACTIVE
              </span>
            </div>

            {/* Simulated core contents */}
            <div className="space-y-3">
              <p className="text-[11px] text-slate-600 leading-relaxed font-sans">
                This viewport runs the customer's compiled build target in isolated state. Interacting with this panel feeds telemetry events up to the central dashboard.
              </p>

              {/* Live HMR DOM inspector */}
              {activeFile && (
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-1.5 select-none transition-all">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-blue-500 font-semibold uppercase font-mono flex items-center gap-1">
                      <Compass className="w-3 h-3 text-blue-500 animate-spin" style={{ animationDuration: '6s' }} /> Live HMR DOM View
                    </span>
                    <span className="text-[8px] text-slate-400 font-mono font-bold shrink-0">{activeFile.path.split('/').pop()}</span>
                  </div>
                  <div className="text-xs font-semibold text-slate-800 font-mono break-all pl-1.5 border-l-2 border-blue-400">
                    {activeVisualStrings ? (
                      <div className="space-y-1 text-[11px] text-slate-700 font-sans font-medium">
                        {activeVisualStrings.map((str, idx) => (
                          <div key={idx} className="truncate select-text">▪ <span className="text-blue-600">{str}</span></div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400 italic font-normal">Active structural layers serving backend rules. Editing strings here will reflect instantly via HMR.</div>
                    )}
                  </div>
                </div>
              )}

              {/* Counter interaction tool */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex items-center justify-between">
                <div>
                  <span className="text-[9px] text-slate-400 font-bold uppercase font-mono block">Component State</span>
                  <div className="text-xs font-bold text-slate-800 font-mono">React Click Count: {clickCount}</div>
                </div>
                <button
                  onClick={() => {
                    setClickCount(prev => prev + 1);
                    injectLogEvent('INFO', 'USER_APPLICATION', 'ComponentSandbox', `State update inside user view: ClickCount updated to ${clickCount + 1}`);
                  }}
                  className="px-3 py-1 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white font-bold rounded text-[11px] transition-all cursor-pointer shadow-sm shadow-slate-100"
                >
                  Increment
                </button>
              </div>

              {/* CPU load display */}
              <div className="space-y-1 mt-1.5">
                <div className="flex items-center justify-between text-[10px] uppercase font-bold font-mono text-slate-500">
                  <span>Simulated App Latency:</span>
                  <span>{metrics.networkLatency} ms</span>
                </div>
                <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                  <div className="bg-blue-600 h-full transition-all duration-500" style={{ width: `${Math.min(100, (metrics.networkLatency / 1.2))}%` }} />
                </div>
              </div>
            </div>

            {/* Critical actions row */}
            <div className="border-t border-slate-100 pt-3 flex items-center justify-between gap-3">
              <span className="text-[9px] text-slate-400 font-mono font-medium">Test React boundaries:</span>
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
          <div className="bg-slate-950 text-slate-300 p-5 rounded-xl border border-slate-900 font-mono text-[11px] space-y-4 max-w-sm mx-auto w-full my-auto shadow-lg leading-relaxed">
            <div className="flex items-center justify-between border-b border-slate-900 pb-2">
              <span className="text-cyan-400 font-bold uppercase tracking-widest text-[9px] flex items-center gap-1.5 animate-pulse">
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
        )}
      </div>

      {/* Frame Status indicator bar */}
      <div className="bg-slate-100 border-t border-slate-200 px-4 py-1.5 select-none text-[10px] text-slate-500 font-mono flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> iframe viewport active
        </span>
        <span className="text-slate-400">REAL_TIME_WEBSOCKETS</span>
      </div>

    </div>
  );
};
