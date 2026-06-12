// File: src/components/AgentOperationsDashboard.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../lib/store';
import { AgentOperationLog } from '../types';
import { 
  RefreshCw, 
  Trash2, 
  Search, 
  Cpu, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  GitBranch, 
  Terminal, 
  ChevronDown, 
  ChevronUp, 
  Sparkles,
  Layers,
  Wrench,
  ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const AgentOperationsDashboard: React.FC = () => {
  const { 
    agentLogs, 
    loadAgentLogs, 
    clearAgentLogs,
    swarmState
  } = useAppStore();

  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load logs on mount and when filters change
  useEffect(() => {
    loadAgentLogs();
    
    // Auto-refresh logs on a 4-second interval for real-time orchestration streaming
    const interval = setInterval(() => {
      loadAgentLogs();
    }, 4000);

    return () => clearInterval(interval);
  }, [loadAgentLogs]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadAgentLogs();
    setTimeout(() => setIsRefreshing(false), 650);
  };

  const handleClear = async () => {
    if (window.confirm("Are you sure you want to purge all compiled agent operations and milestone registries?")) {
      await clearAgentLogs();
    }
  };

  // Memoized filter calculation for client-side fluid typing
  const filteredLogs = useMemo(() => {
    return agentLogs.filter(log => {
      const matchesSearch = 
        log.message.toLowerCase().includes(search.toLowerCase()) || 
        log.threadId.toLowerCase().includes(search.toLowerCase()) ||
        (log.metadata && JSON.stringify(log.metadata).toLowerCase().includes(search.toLowerCase()));
      
      const matchesCategory = filterCategory === 'ALL' || log.category === filterCategory;
      const matchesStatus = filterStatus === 'ALL' || log.status === filterStatus;

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [agentLogs, search, filterCategory, filterStatus]);

  // Aggregate operations metrics
  const stats = useMemo(() => {
    let orchestratorCount = 0;
    let plannerCount = 0;
    let coderCount = 0;
    let auditorCount = 0;
    let errorCount = 0;

    agentLogs.forEach(l => {
      if (l.category === 'ORCHESTRATOR') orchestratorCount++;
      if (l.category === 'PLANNER') plannerCount++;
      if (l.category === 'CODER') coderCount++;
      if (l.category === 'AUDITOR') auditorCount++;
      if (l.status === 'ERROR') errorCount++;
    });

    return {
      total: agentLogs.length,
      orchestratorCount,
      plannerCount,
      coderCount,
      auditorCount,
      errorCount
    };
  }, [agentLogs]);

  // helper to get category-specific tailwind classes
  const getCategoryStyles = (category: string) => {
    switch (category) {
      case 'ORCHESTRATOR':
        return 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20';
      case 'PLANNER':
        return 'bg-violet-500/10 text-violet-400 border border-violet-500/20';
      case 'CODER':
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      case 'AUDITOR':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case 'SYSTEM':
        return 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20';
      default:
        return 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
    }
  };

  // helper to get status-specific icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'WARNING':
        return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      case 'ERROR':
        return <XCircle className="w-4 h-4 text-rose-400" />;
      case 'INFO':
      default:
        return <Terminal className="w-4 h-4 text-cyan-400" />;
    }
  };

  return (
    <div id="agent-operations-dashboard" className="bg-slate-900 rounded-2xl border border-slate-800 p-4 md:p-6 space-y-6 font-sans text-slate-300">
      
      {/* Upper header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-slate-100 flex items-center gap-2 tracking-tight">
            <Sparkles className="w-5 h-5 text-indigo-400 animate-pulse" />
            Agent Operations Logs
          </h2>
          <p className="text-xs text-slate-400">
            Real-time milestone reporting, event telemetry, and sub-agent execution profiles.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-slate-100 text-xs font-medium rounded-lg border border-slate-700 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleClear}
            disabled={stats.total === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/40 text-rose-300 disabled:opacity-40 disabled:pointer-events-none text-xs font-medium rounded-lg border border-rose-900/35 transition cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Purge Logs
          </button>
        </div>
      </div>

      {/* Bento Grid Counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        
        {/* Total Events */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 flex flex-col justify-between">
          <span className="text-[10px] text-slate-500 font-bold uppercase font-mono tracking-wider flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-400" /> TOTAL TELEMETRY
          </span>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-100">{stats.total}</span>
            <span className="text-[10px] text-slate-400">recorded log items</span>
          </div>
        </div>

        {/* Coder Nodes Executed */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 flex flex-col justify-between">
          <span className="text-[10px] text-slate-500 font-bold uppercase font-mono tracking-wider flex items-center gap-1.5">
            <Wrench className="w-3.5 h-3.5 text-amber-400" /> CODER STAGE RUNS
          </span>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-amber-400">{stats.coderCount}</span>
            <span className="text-[10px] text-slate-400">invocations</span>
          </div>
        </div>

        {/* Auditor Checks Passed */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 flex flex-col justify-between">
          <span className="text-[10px] text-slate-500 font-bold uppercase font-mono tracking-wider flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> AUDITOR VERIFICATION
          </span>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-emerald-400">{stats.auditorCount}</span>
            <span className="text-[10px] text-slate-400">compliance loops</span>
          </div>
        </div>

        {/* Fault Logs Count */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 flex flex-col justify-between">
          <span className="text-[10px] text-slate-500 font-bold uppercase font-mono tracking-wider flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" /> DETECTED THREAD CRASHES
          </span>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-rose-400">{stats.errorCount}</span>
            <span className="text-[10px] text-slate-400">exceptions</span>
          </div>
        </div>

      </div>

      {/* Filters Area */}
      <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-850 flex flex-col md:flex-row items-center gap-3">
        
        {/* Search Message Box */}
        <div className="relative w-full md:flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search operational logs, thread IDs, code feedback..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-500 text-xs rounded-lg pl-9 pr-4 py-2 focus:outline-none focus:border-indigo-500 transition"
          />
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="text-[10px] font-bold uppercase font-mono text-slate-500 whitespace-nowrap">Agent Domain:</span>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg text-slate-300 text-xs px-2.5 py-2 focus:outline-none focus:border-indigo-500 transition cursor-pointer w-full md:w-auto"
          >
            <option value="ALL">All Roles</option>
            <option value="ORCHESTRATOR">Orchestrator</option>
            <option value="PLANNER">Planner</option>
            <option value="CODER">Coder</option>
            <option value="AUDITOR">Auditor</option>
            <option value="SYSTEM">System</option>
          </select>
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="text-[10px] font-bold uppercase font-mono text-slate-500 whitespace-nowrap">Status:</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg text-slate-300 text-xs px-2.5 py-2 focus:outline-none focus:border-indigo-500 transition cursor-pointer w-full md:w-auto"
          >
            <option value="ALL">All Outcomes</option>
            <option value="INFO">Info</option>
            <option value="SUCCESS">Success</option>
            <option value="WARNING">Warning</option>
            <option value="ERROR">Error</option>
          </select>
        </div>

      </div>

      {/* Main logs display area */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-500 px-2 font-mono">
          <span>EVENT LOG LIST ({filteredLogs.length} matches)</span>
          <span className="animate-pulse flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span> Live Node Gateway
          </span>
        </div>

        <div className="max-h-[380px] overflow-y-auto pr-1 space-y-2 scrollbar-thin scrollbar-thumb-slate-800">
          <AnimatePresence initial={false}>
            {filteredLogs.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-slate-950 rounded-xl border border-slate-850 p-8 text-center"
              >
                <Terminal className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                <p className="text-slate-400 text-xs font-mono">No operational logs found matching query parameters.</p>
                <p className="text-[10px] text-slate-600 mt-1">Operational logs are automatically streamed during active chat workflows.</p>
              </motion.div>
            ) : (
              filteredLogs.map((log) => {
                const isSelected = selectedLogId === log.id;
                return (
                  <motion.div
                    key={log.id}
                    layoutId={`log-${log.id}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    onClick={() => setSelectedLogId(isSelected ? null : log.id)}
                    className={`bg-slate-950 hover:bg-slate-950/85 text-xs p-3 rounded-lg border hover:border-slate-700 cursor-pointer transition-all flex flex-col gap-2 ${
                      isSelected ? 'border-indigo-500 shadow-md shadow-indigo-500/5' : 'border-slate-850'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2 font-mono">
                        {/* Status Icon */}
                        {getStatusIcon(log.status)}
                        
                        {/* Category Badge */}
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-tight uppercase ${getCategoryStyles(log.category)}`}>
                          {log.category}
                        </span>

                        {/* Thread ID */}
                        <span className="text-slate-500 text-[10px]">
                          Thread: <strong className="text-slate-400 font-normal">{log.threadId}</strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500">
                        {log.duration !== undefined && (
                          <span className="flex items-center gap-0.5 text-indigo-400">
                            <Clock className="w-3 h-3 text-slate-500" /> {log.duration}ms
                          </span>
                        )}
                        <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                        {isSelected ? <ChevronUp className="w-3 h-3 text-slate-500" /> : <ChevronDown className="w-3 h-3 text-slate-500" />}
                      </div>
                    </div>

                    <p className={`font-mono text-[11px] leading-relaxed text-slate-200 mt-0.5 break-words ${isSelected ? '' : 'truncate select-none'}`}>
                      {log.message}
                    </p>

                    {/* Metadata Drawer Expansion */}
                    {isSelected && log.metadata && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        transition={{ duration: 0.15 }}
                        className="bg-slate-900 border border-slate-800 p-2 rounded mt-1 overflow-x-auto font-mono text-[10px] text-indigo-300"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="text-slate-500 block mb-1">Attached Event Metadata:</span>
                        <pre className="text-emerald-400 leading-tight">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </motion.div>
                    )}
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
