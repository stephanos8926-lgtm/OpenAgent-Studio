// File: src/components/TelemetryDashboard.tsx

import React, { useState, useMemo } from 'react';
import { useAppStore } from '../lib/store';
import { TelemetryLog, TelemetrySeverity, TelemetryOrigin } from '../types';
import { 
  Heart, 
  Cpu, 
  Database, 
  Clock, 
  Terminal, 
  AlertTriangle, 
  AlertOctagon, 
  Info, 
  Search, 
  Trash2, 
  RefreshCw, 
  Wrench, 
  Compass, 
  Bug, 
  Layers,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const TelemetryDashboard: React.FC = () => {
  const { 
    metrics, 
    logs, 
    simulateCompileAction, 
    simulateAppRuntimeCrash, 
    injectLogEvent, 
    resetTelemetryStats,
    compilingState
  } = useAppStore();

  const [search, setSearch] = useState('');
  const [filterOrigin, setFilterOrigin] = useState<'ALL' | TelemetryOrigin>('ALL');
  const [filterSeverity, setFilterSeverity] = useState<'ALL' | TelemetrySeverity>('ALL');
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  // Compute stats counters
  const stats = useMemo(() => {
    let ideErrors = 0;
    let appErrors = 0;
    let totalWarnings = 0;
    
    logs.forEach(l => {
      if (l.severity === 'ERROR' || l.severity === 'CRITICAL') {
        if (l.origin === 'IDE_SYSTEM') ideErrors++;
        else appErrors++;
      }
      if (l.severity === 'WARNING') {
        totalWarnings++;
      }
    });

    return { ideErrors, appErrors, totalWarnings };
  }, [logs]);

  // Handle filtering
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchSearch = log.message.toLowerCase().includes(search.toLowerCase()) || 
                          log.module.toLowerCase().includes(search.toLowerCase());
      const matchOrigin = filterOrigin === 'ALL' ? true : log.origin === filterOrigin;
      const matchSeverity = filterSeverity === 'ALL' ? true : log.severity === filterSeverity;
      return matchSearch && matchOrigin && matchSeverity;
    });
  }, [logs, search, filterOrigin, filterSeverity]);

  const handleTestIdeError = () => {
    injectLogEvent(
      'ERROR',
      'IDE_SYSTEM',
      'FSWatcher',
      'Fault: Workspace storage volume write timeout (I/O lockout)',
      'EACCES: permission denied, open "/sandbox/dist/assets/index.js"\n  at Object.openSync (node:fs:600:3)\n  at writeFileSync (node:fs:2200:5)\n  at packSandboxBundle (/server.ts:162:10)'
    );
  };

  return (
    <div id="telemetry-dashboard-container" className="bg-slate-900 rounded-2xl border border-slate-800 p-4 md:p-6 space-y-6 font-sans">
      
      {/* Top Profiler Metrics & Health Bento Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* CPU Util Profile */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-500 font-bold uppercase font-mono flex items-center gap-1">
              <Cpu className="w-3 h-3 text-cyan-400" /> Profiler CPU
            </span>
            <div className="text-xl font-bold font-mono text-slate-100">{metrics.cpuUsage}%</div>
            <p className="text-[10px] text-slate-400">Thread Pool Allocation</p>
          </div>
          <div className="w-12 h-12 relative flex items-center justify-center">
            {/* Simple circular gauge */}
            <svg className="w-full h-full transform -rotate-90">
              <circle cx="24" cy="24" r="20" stroke="#1e293b" strokeWidth="3" fill="transparent" />
              <circle cx="24" cy="24" r="20" stroke="#06b6d4" strokeWidth="3" fill="transparent" 
                strokeDasharray="125" strokeDashoffset={125 - (125 * metrics.cpuUsage) / 100} />
            </svg>
            <span className="absolute text-[8px] font-mono text-cyan-400 font-bold">CORE</span>
          </div>
        </div>

        {/* Memory Heap Util */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-500 font-bold uppercase font-mono flex items-center gap-1">
              <Database className="w-3 h-3 text-purple-400" /> Active Heap
            </span>
            <div className="text-xl font-bold font-mono text-slate-100">{metrics.memoryUsage} MB</div>
            <p className="text-[10px] text-slate-400">GC Limit: 1024MB</p>
          </div>
          <div className="w-12 h-12 relative flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90">
              <circle cx="24" cy="24" r="20" stroke="#1e293b" strokeWidth="3" fill="transparent" />
              <circle cx="24" cy="24" r="20" stroke="#a855f7" strokeWidth="3" fill="transparent" 
                strokeDasharray="125" strokeDashoffset={125 - (125 * metrics.memoryUsage) / 1024} />
            </svg>
            <span className="absolute text-[8px] font-mono text-purple-400 font-bold">RAM</span>
          </div>
        </div>

        {/* IDE Error Metrics Tally */}
        <div className="bg-slate-950 p-4 rounded-xl border border-amber-500/10 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-500 font-bold uppercase font-mono flex items-center gap-1">
              <Wrench className="w-3 h-3 text-amber-500" /> Workspace Faults
            </span>
            <div className="text-xl font-bold font-mono text-amber-400">{metrics.ideErrorCount}</div>
            <p className="text-[10px] text-slate-400">Total Tooling Failures</p>
          </div>
          <div className="p-2.5 bg-amber-950/40 border border-amber-500/25 text-amber-400 rounded-xl">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        {/* App Runtime Crash Tally */}
        <div className="bg-slate-950 p-4 rounded-xl border border-red-500/10 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-500 font-bold uppercase font-mono flex items-center gap-1">
              <Bug className="w-3 h-3 text-red-500" /> Sandbox Errors
            </span>
            <div className="text-xl font-bold font-mono text-red-400">{metrics.appErrorCount}</div>
            <p className="text-[10px] text-slate-400">Runtime Client Breaks</p>
          </div>
          <div className="p-2.5 bg-red-950/40 border border-red-500/25 text-red-400 rounded-xl">
            <AlertOctagon className="w-5 h-5 animate-pulse" />
          </div>
        </div>

      </div>

      {/* Simulator Actions Console */}
      <div className="bg-slate-950 p-4 rounded-xl border border-slate-850">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-blue-400" />
          <h4 className="text-xs font-bold text-slate-200 uppercase tracking-widest font-mono">Simulation Command Center</h4>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Test telemetry sorting and error boundary behaviors. Trigger compilation workflows, mock IDE disk blocks, or test user component render crashes below.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <button
            onClick={() => simulateCompileAction(false)}
            disabled={compilingState === 'running'}
            className="p-2.5 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900 text-slate-200 hover:text-white transition-all text-xs font-bold text-left flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${compilingState === 'running' ? 'animate-spin' : ''}`} />
            <div>
              <div className="leading-none">Build Sandbox</div>
              <span className="text-[9px] text-slate-500 font-mono font-normal">SIMULATE SUCCESS</span>
            </div>
          </button>

          <button
            onClick={() => simulateCompileAction(true)}
            disabled={compilingState === 'running'}
            className="p-2.5 rounded-lg border border-slate-850 hover:border-red-900/30 bg-slate-900 text-slate-200 hover:text-white transition-all text-xs font-bold text-left flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <div>
              <div className="leading-none text-amber-400">Build Failure</div>
              <span className="text-[9px] text-slate-500 font-mono font-normal">SIMULATE LINT FAULT</span>
            </div>
          </button>

          <button
            onClick={handleTestIdeError}
            className="p-2.5 rounded-lg border border-slate-850 hover:border-amber-950/40 bg-slate-900 text-slate-200 hover:text-white transition-all text-xs font-bold text-left flex items-center gap-2 cursor-pointer"
          >
            <Wrench className="w-3.5 h-3.5 text-orange-400" />
            <div>
              <div className="leading-none text-orange-400">Trigger IDE Error</div>
              <span className="text-[9px] text-slate-500 font-mono font-normal">STORAGE WRITE LOCKOUT</span>
            </div>
          </button>

          <button
            onClick={simulateAppRuntimeCrash}
            className="p-2.5 rounded-lg border border-slate-850 hover:border-red-950 bg-slate-900 text-slate-100 hover:text-red-300 transition-all text-xs font-bold text-left flex items-center gap-2 cursor-pointer"
          >
            <Bug className="w-3.5 h-3.5 text-red-500" />
            <div>
              <div className="leading-none text-red-400">Trigger App Crash</div>
              <span className="text-[9px] text-slate-500 font-mono font-normal">VM RUNTIME EXCEPTIONS</span>
            </div>
          </button>
        </div>
      </div>

      {/* Main Logs Feed and Diagnostic details */}
      <div className="space-y-4">
        
        {/* Logs Filter Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-850">
          
          {/* Left search */}
          <div className="relative w-full sm:w-64">
            <span className="absolute inset-y-0 left-3 flex items-center text-slate-500">
              <Search className="w-3.5 h-3.5" />
            </span>
            <input
              type="text"
              placeholder="Filter module or messages..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-600 rounded-lg py-1.5 pl-9 pr-3 text-xs"
            />
          </div>

          {/* Filters alignment */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            
            {/* Origin filters */}
            <select
              value={filterOrigin}
              onChange={e => setFilterOrigin(e.target.value as any)}
              className="bg-slate-900 border border-slate-800 text-slate-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-slate-600 cursor-pointer"
            >
              <option value="ALL">Show All Channels</option>
              <option value="IDE_SYSTEM">💻 IDE System</option>
              <option value="USER_APPLICATION">📦 User App</option>
            </select>

            {/* Severity filter */}
            <select
              value={filterSeverity}
              onChange={e => setFilterSeverity(e.target.value as any)}
              className="bg-slate-900 border border-slate-800 text-slate-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-slate-600 cursor-pointer"
            >
              <option value="ALL">All Severities</option>
              <option value="INFO">INFO</option>
              <option value="WARNING">WARNING</option>
              <option value="ERROR">ERROR</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>

            {/* Clear logs Button */}
            <button
              onClick={resetTelemetryStats}
              title="Flush Log Buffer"
              className="p-1.5 bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-850 text-slate-400 hover:text-red-400 rounded-lg transition-all cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

        </div>

        {/* Virtualized/Scrollable Logs Timeline */}
        <div id="telemetry-logs-list" className="bg-slate-950 rounded-xl border border-slate-850 overflow-hidden divide-y divide-slate-850 max-h-[360px] overflow-y-auto">
          {filteredLogs.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              No telemetry events recorded matching current filter parameters.
            </div>
          ) : (
            filteredLogs.map(log => {
              const isSelected = selectedLogId === log.id;
              
              // Colors matching severities
              const badgeColors = {
                INFO: 'bg-blue-950 text-blue-400 border-blue-500/20',
                WARNING: 'bg-amber-950 text-amber-400 border-amber-500/20',
                ERROR: 'bg-red-950 text-red-400 border-red-500/20',
                CRITICAL: 'bg-pink-950 text-pink-400 border-pink-500/25 border animate-pulse'
              };

              return (
                <div key={log.id} className={`transition-all ${isSelected ? 'bg-slate-900/60' : 'hover:bg-slate-900/25'}`}>
                  
                  {/* Log summary row block */}
                  <div 
                    onClick={() => setSelectedLogId(isSelected ? null : log.id)}
                    className="p-3 px-4 flex items-center justify-between gap-3 cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      
                      {/* Colored severity dot */}
                      <span className={`w-2 h-2 rounded-full ${
                        log.severity === 'INFO' ? 'bg-blue-400' :
                        log.severity === 'WARNING' ? 'bg-amber-400' :
                        log.severity === 'ERROR' ? 'bg-red-500' : 'bg-pink-500'
                      }`} />

                      {/* Origin indicator icon */}
                      <span className="text-[10px] uppercase font-mono font-black text-slate-500 tracking-wider">
                        {log.origin === 'IDE_SYSTEM' ? '💻 IDE' : '📦 APP'}
                      </span>

                      {/* Severity badge info */}
                      <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded border ${badgeColors[log.severity]}`}>
                        {log.severity}
                      </span>

                      {/* Module scope text label */}
                      <span className="text-xs font-mono font-bold text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                        {log.module}
                      </span>

                      {/* Msg description */}
                      <p className="text-xs text-slate-200 truncate min-w-0 font-sans">
                        {log.message}
                      </p>

                    </div>

                    {/* Metadata column right */}
                    <div className="flex items-center gap-4 shrink-0 font-mono text-[10px] text-slate-500">
                      <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                      {isSelected ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </div>

                  </div>

                  {/* Expanded Diagnostics Panel (Simulating Deep profiling information) */}
                  <AnimatePresence>
                    {isSelected && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden bg-slate-950 font-mono text-[11px]"
                      >
                        <div className="p-4 border-t border-slate-850 space-y-3 mx-4 mb-4 mt-1 bg-slate-900 rounded-lg border">
                          
                          {/* Diagnostic trace heading */}
                          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                            <span className="text-slate-400 font-bold uppercase tracking-widest text-[9px] flex items-center gap-1">
                              <Terminal className="w-3 h-3 text-cyan-400" /> Trace Diagnostics Context
                            </span>
                            <span className="text-[8px] text-slate-500">ID: {log.id}</span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                            <div>
                              <div className="text-slate-500 text-[10px] font-bold font-mono">Module / Caller Interface:</div>
                              <div className="text-slate-300 font-mono mt-0.5">{log.module}</div>
                            </div>
                            <div>
                              <div className="text-slate-500 text-[10px] font-bold font-mono">Telemetry Timestamp:</div>
                              <div className="text-slate-300 font-mono mt-0.5">{log.timestamp}</div>
                            </div>
                          </div>

                          {/* Code error diagnostic stack trace */}
                          {log.detail ? (
                            <div className="space-y-1.5">
                              <div className="text-slate-500 text-[10px] font-bold font-mono">Exception Diagnostics StackTrace:</div>
                              <pre className="p-2.5 bg-slate-950 text-red-400 overflow-x-auto rounded border border-red-500/10 max-h-[140px] text-[10px] font-mono leading-relaxed whitespace-pre font-medium shadow-inner">
                                {log.detail}
                              </pre>
                            </div>
                          ) : (
                            <div className="text-slate-500 font-mono max-w-sm">No secondary trace trace payload declared. Level: INFO.</div>
                          )}

                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                </div>
              );
            })
          )}
        </div>

      </div>

    </div>
  );
};
