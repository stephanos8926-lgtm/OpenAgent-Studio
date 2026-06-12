import React, { useState, useEffect } from 'react';
import { useAppStore } from '../lib/store';
import { 
  Network, 
  CheckCircle2, 
  Circle, 
  Clock, 
  AlertCircle, 
  Cpu, 
  Zap,
  ArrowRight,
  Shield,
  RefreshCw,
  Settings,
  Terminal,
  Activity,
  Play
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TaskDAGD3 } from './TaskDAGD3';
import { SwarmConsole } from './SwarmConsole';
import { SwarmRadar } from './SwarmRadar';

export const MeshController = () => {
  const { swarmState, setSwarmState, terminalLogs, activeBreakpoint, setBreakpoint, setShowSettingsModal } = useAppStore();
  const { activeAgent, tasks, health } = swarmState;
  const [showSettings, setShowSettings] = useState(false);
  const [governanceMode, setGovernanceMode] = useState(false);
  const [viewMode, setViewMode] = useState<'visual' | 'list'>('visual');

  const [checkpoints, setCheckpoints] = useState<any[]>([]);
  const [loadingCheckpoints, setLoadingCheckpoints] = useState(false);
  const [revertingCheckpointId, setRevertingCheckpointId] = useState<string | null>(null);
  const [confirmRevertId, setConfirmRevertId] = useState<string | null>(null);
  const [localMessage, setLocalMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchCheckpoints = async () => {
    const threadId = localStorage.getItem('threadId');
    if (!threadId) return;
    setLoadingCheckpoints(true);
    try {
      const res = await fetch(`/api/swarm/history?threadId=${encodeURIComponent(threadId)}`);
      if (res.ok) {
        const data = await res.json();
        setCheckpoints(data.history || []);
      }
    } catch (err) {
      console.error("Failed to load checkpoints history:", err);
    } finally {
      setLoadingCheckpoints(false);
    }
  };

  const fetchBreakpointStatus = async () => {
    const threadId = localStorage.getItem('threadId');
    if (!threadId) return;
    try {
      const res = await fetch(`/api/swarm/status?threadId=${encodeURIComponent(threadId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          if (data.next && data.next.length > 0) {
            setBreakpoint(data.next[0] || null);
          } else {
            setBreakpoint(null);
          }
          
          if (data.values) {
            setSwarmState({
              tasks: data.values.task_dag || [],
              health: data.values.environment_health || 'unknown',
              activeAgent: data.values.current_agent || null
            });
          }
        }
      }
    } catch (err) {
      console.error("Failed to load breakpoint status:", err);
    }
  };

  useEffect(() => {
    fetchCheckpoints();
    fetchBreakpointStatus();
    const interval = setInterval(() => {
      fetchCheckpoints();
      fetchBreakpointStatus();
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleRevert = async (chkId: string) => {
    const threadId = localStorage.getItem('threadId');
    if (!threadId) return;
    setRevertingCheckpointId(chkId);
    setLocalMessage(null);
    try {
      const res = await fetch(`/api/swarm/revert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, checkpointId: chkId })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setLocalMessage({ text: `State successfully reverted back to checkpoint: ${chkId.substring(0, 8)}`, type: 'success' });
        setConfirmRevertId(null);
        await fetchCheckpoints();
        await fetchBreakpointStatus();
      } else {
        setLocalMessage({ text: `Failed to revert: ${data.message || 'Unknown error'}`, type: 'error' });
      }
    } catch (err: any) {
      setLocalMessage({ text: `Network error: ${err.message}`, type: 'error' });
    } finally {
      setRevertingCheckpointId(null);
    }
  };

  const agents = [
    { id: 'orchestrator', name: 'Orchestrator', role: 'Strategic Routing', type: 'CORE' },
    { id: 'planner', name: 'Planner', role: 'DAG Generation', type: 'CORE' },
    { id: 'coder', name: 'Coder', role: 'VFS Implementation', type: 'CORE' },
    { id: 'auditor', name: 'Auditor', role: 'Compliance & QA', type: 'SPECIALIZED' },
    { id: 'platform', name: 'Platform', role: 'Maintenance', type: 'INTERNAL' },
  ];

  // Dynamically group nodes and project coordinates as a column-based DAG hierarchy
  const getTaskLevels = (taskList: typeof tasks) => {
    const levels: Record<string, number> = {};
    taskList.forEach(t => { levels[t.id] = 0; });
    
    let changed = true;
    let iterations = 0;
    while (changed && iterations < 50) {
      changed = false;
      iterations++;
      for (const t of taskList) {
        let maxDepLevel = -1;
        for (const depId of (t.dependsOn || [])) {
          const depLevel = levels[depId];
          if (depLevel !== undefined && depLevel > maxDepLevel) {
            maxDepLevel = depLevel;
          }
        }
        const newLevel = maxDepLevel + 1;
        if (levels[t.id] !== newLevel) {
          levels[t.id] = newLevel;
          changed = true;
        }
      }
    }
    return levels;
  };

  const nodeLevels = getTaskLevels(tasks);
  const maxLvl = Math.max(...Object.values(nodeLevels), 0);
  
  const colGroups: Record<number, typeof tasks> = {};
  tasks.forEach(t => {
    const l = nodeLevels[t.id] || 0;
    if (!colGroups[l]) colGroups[l] = [];
    colGroups[l].push(t);
  });

  const width = 800;
  const height = 300;
  const colCount = maxLvl + 1;
  const colDistance = colCount > 1 ? (width - 160) / (colCount - 1) : 0;
  
  const nodeCoordinates: Record<string, { x: number, y: number }> = {};
  for (let c = 0; c <= maxLvl; c++) {
    const tasksInCol = colGroups[c] || [];
    const x = colCount > 1 ? 80 + c * colDistance : width / 2;
    tasksInCol.forEach((t, r) => {
      const y = tasksInCol.length > 1
        ? 40 + r * ((height - 80) / (tasksInCol.length - 1))
        : height / 2;
      nodeCoordinates[t.id] = { x, y };
    });
  }

  const resetMesh = () => {
    setSwarmState({ tasks: [], health: 'unknown', activeAgent: null });
  };

  return (
    <div className="min-h-full bg-gray-50/50">
      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 md:space-y-12">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Network className="w-6 h-6 md:w-8 md:h-8 text-blue-600" />
              Agentic Mesh Controller
            </h1>
            <p className="text-sm md:text-base text-gray-500 mt-1">Observability for hierarchical LangGraph swarms and persistent task DAGs.</p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={resetMesh}
              className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-gray-200"
              title="Reset Mesh State"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setShowSettingsModal(true)}
              className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-gray-200"
              title="Open Connection Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
            <div className={`px-4 py-2 rounded-full flex items-center gap-2 text-xs md:text-sm font-bold border ${
              health === 'good' ? 'bg-green-50 text-green-700 border-green-200' : 
              health === 'failing' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-gray-50 text-gray-700 border-gray-200'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                health === 'good' ? 'bg-green-500 animate-pulse' : 
                health === 'failing' ? 'bg-red-500 animate-pulse' : 'bg-gray-400'
              }`} />
              {health.toUpperCase()}
            </div>
          </div>
        </div>

        {/* Swarm Console & Intelligence Mesh Visuals */}
        <SwarmConsole />

        {/* Real-time Swarm Radar Mapping */}
        <SwarmRadar />

        {/* Task DAG & Governance Grid */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          {/* Task Timeline */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                Strategic Task DAG
              </h2>
              <div className="flex items-center gap-2">
                <div className="bg-gray-100 rounded-lg p-0.5 flex">
                  <button 
                    onClick={() => setViewMode('visual')}
                    className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase transition-all ${
                      viewMode === 'visual' ? 'bg-white text-gray-900 shadow-sm font-bold' : 'text-gray-400 hover:text-gray-650'
                    }`}
                  >
                    Visual
                  </button>
                  <button 
                    onClick={() => setViewMode('list')}
                    className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase transition-all ${
                      viewMode === 'list' ? 'bg-white text-gray-900 shadow-sm font-bold' : 'text-gray-400 hover:text-gray-650'
                    }`}
                  >
                    List
                  </button>
                </div>
                <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-full uppercase tracking-tighter">
                  {tasks.filter(t => t.status === 'completed').length}/{tasks.length} Resolved
                </span>
              </div>
            </div>
            
            <div className="space-y-4">
              {tasks.length > 0 ? (
                viewMode === 'visual' ? (
                  <TaskDAGD3 tasks={tasks} />
                ) : (
                  tasks.map((task, index) => (
                    <motion.div 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      key={task.id} 
                      className={`bg-white p-5 rounded-xl border transition-all duration-300 ${
                        task.status === 'in_progress' ? 'border-blue-200 shadow-md ring-1 ring-blue-50' : 'border-gray-100 hover:border-gray-200'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <div className="mt-1 flex-shrink-0">
                          {task.status === 'completed' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                          {task.status === 'in_progress' && <Clock className="w-5 h-5 text-blue-500 animate-spin-slow" />}
                          {task.status === 'pending' && <Circle className="w-5 h-5 text-gray-200" />}
                          {task.status === 'failed' && <AlertCircle className="w-5 h-5 text-red-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-widest truncate">
                              {task.id}
                            </span>
                            <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase whitespace-nowrap ${
                              task.status === 'completed' ? 'bg-green-100 text-green-700' :
                              task.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                              task.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {task.status}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-gray-900 leading-snug">{task.label}</p>
                          {(task.dependsOn || []).length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {(task.dependsOn || []).map(dep => (
                                <span key={dep} className="text-[9px] bg-gray-50 text-gray-400 px-1.5 py-0.5 rounded border border-gray-100 flex items-center gap-1">
                                  <ArrowRight className="w-2 h-2" />
                                  {dep}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))
                )
              ) : (
                <div className="bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-200 p-16 text-center">
                  <Cpu className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                  <div className="text-gray-400 font-medium">Neural mesh is idle.</div>
                  <p className="text-xs text-gray-400 mt-1">Initiative a message to start orchestration.</p>
                </div>
              )}
            </div>
          </div>

          {/* Monitoring & Controls */}
          <div className="space-y-8">
            <div className="flex flex-col gap-6">
              <div className="bg-[#121212] rounded-2xl border border-gray-800 shadow-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-800 bg-[#1a1a1a] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-gray-400" />
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Governance Feed</span>
                  </div>
                  <div className="flex gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-red-500/30" />
                    <div className="w-2 h-2 rounded-full bg-yellow-500/30" />
                    <div className="w-2 h-2 rounded-full bg-green-500/30" />
                  </div>
                </div>
                <div className="p-5 font-mono text-[11px] h-[300px] overflow-y-auto space-y-1 selection:bg-blue-500/30">
                  {terminalLogs.map((line: string, i: number) => (
                    <div key={i} className="text-gray-400 break-all leading-relaxed flex gap-2">
                       <span className="text-gray-600 select-none">[{i+1}]</span>
                       <span className={
                         line.includes('[WARDEN]') ? 'text-green-400' :
                         line.includes('[PLANNER]') ? 'text-yellow-400' :
                         line.includes('error') || line.includes('Error') ? 'text-red-400' :
                         'text-gray-300'
                       }>{line}</span>
                    </div>
                  ))}
                  {terminalLogs.length === 0 && (
                    <div className="text-gray-600 italic">Starting telemetry stream...</div>
                  )}
                  <div className="animate-pulse inline-block w-2 h-4 bg-gray-500 ml-1" />
                </div>
              </div>
              
              {activeBreakpoint && activeBreakpoint.includes('coder') && (
                <div id="breakpoint-approval-panel" className="bg-amber-50/70 border-2 border-amber-200 rounded-2xl p-6 space-y-4 animate-in fade-in slide-in-from-top-4 duration-300 shadow-lg">
                  <div className="flex items-start gap-4">
                    <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl">
                      <Shield className="w-5 h-5 animate-pulse" />
                    </div>
                    <div>
                      <h3 className="text-xs font-black text-amber-950 font-sans uppercase tracking-widest">
                        LangGraph Breakpoint Active
                      </h3>
                      <p className="text-xs text-amber-900 mt-1.5 leading-relaxed font-sans">
                        Graph execution has suspended before entering the <span className="font-extrabold uppercase bg-amber-100/80 px-1 rounded text-amber-950">coder</span> state. Review task statuses before approval.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 pt-1 font-sans">
                    <button 
                      id="approve-coder-btn"
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('resume-swarm'));
                      }}
                      className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Approve & Resume execution
                    </button>
                    <button 
                      id="reject-coder-btn"
                      onClick={() => {
                        setBreakpoint(null);
                        setLocalMessage({ text: "Execution step rejected and halted.", type: 'error' });
                      }}
                      className="py-2.5 px-4 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 font-bold rounded-xl text-xs transition-all active:scale-95 cursor-pointer"
                    >
                      Reject Step
                    </button>
                  </div>
                </div>
              )}

              <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-indigo-600" />
                      Operational Controls
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">Direct intervention for autonomous sub-processes.</p>
                  </div>
                  <button 
                    onClick={() => setGovernanceMode(!governanceMode)}
                    className={`p-2 rounded-lg transition-all ${governanceMode ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-100'}`}
                    title="Governance Policy Designer"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                </div>
                
                {governanceMode ? (
                  <div className="animate-in fade-in slide-in-from-top-2 space-y-4">
                    <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-100 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-tighter">Budget Control</span>
                        <input type="range" className="w-24 accent-indigo-600" />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-tighter">Self-Correction</span>
                        <div className="w-8 h-4 bg-indigo-600 rounded-full relative">
                          <div className="absolute right-1 top-1 w-2 h-2 bg-white rounded-full" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-tighter">Token Throttling</span>
                        <div className="w-8 h-4 bg-gray-200 rounded-full relative" />
                      </div>
                    </div>
                    <button className="w-full py-2 bg-indigo-600 text-white rounded-lg text-[10px] font-bold uppercase">Apply Governance Diff</button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <button className="flex items-center justify-center gap-2 p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-100 active:scale-95">
                      <Shield className="w-3.5 h-3.5" />
                      Force Audit
                    </button>
                    <button className="flex items-center justify-center gap-2 p-3 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-xl text-xs font-bold transition-all active:scale-95">
                      <Play className="w-3.5 h-3.5" />
                      Resume DAG
                    </button>
                  </div>
                )}

                <div className="pt-4 border-t border-gray-50 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Hardware Isolation</span>
                    <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded">NAMESPACED</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Persistence Node</span>
                    <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">SYMLINKED_REPLICA</span>
                  </div>
                </div>
              </div>

              {/* Swarm Checkpoints History Panel */}
              <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-600 animate-pulse" />
                      Swarm State History
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">Timeline of LangGraph checkpoints stored in persistent SQLite database.</p>
                  </div>
                  <button 
                    onClick={fetchCheckpoints}
                    disabled={loadingCheckpoints}
                    className="p-1.5 px-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-[10px] text-gray-600 rounded flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 font-bold"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingCheckpoints ? 'animate-spin' : ''}`} />
                    Sync
                  </button>
                </div>

                {localMessage && (
                  <div className={`p-3 rounded-xl text-xs flex items-center gap-2 border animate-in slide-in-from-top-1 ${
                    localMessage.type === 'success' 
                      ? 'bg-green-50 text-green-700 border-green-200' 
                      : 'bg-red-50 text-red-700 border-red-200'
                  }`}>
                    <AlertCircle className="w-4.5 h-4.5 flex-shrink-0" />
                    <span className="font-medium">{localMessage.text}</span>
                    <button onClick={() => setLocalMessage(null)} className="ml-auto text-gray-400 hover:text-gray-600 font-bold text-sm">×</button>
                  </div>
                )}

                <div className="relative border-l border-gray-200 pl-4 ml-2 pt-1 max-h-[300px] overflow-y-auto space-y-4 selection:bg-blue-105">
                  {checkpoints.length > 0 ? (
                    checkpoints.map((chk, idx) => {
                      const isCurrent = idx === 0;
                      const displayId = chk.checkpointId?.substring(0, 8) || "N/A";
                      const dateText = chk.timestamp ? new Date(chk.timestamp).toLocaleTimeString() : "";
                      const isRevertedHead = chk.metadata?.reverted_from;
                      
                      return (
                        <div key={chk.checkpointId} className="relative group">
                          {/* Timeline dot */}
                          <div className={`absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full border-2 bg-white transition-all ${
                            isCurrent ? 'border-blue-600 ring-4 ring-blue-50' : 'border-gray-300 group-hover:border-gray-400'
                          }`} />

                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-bold text-gray-800">{displayId}</span>
                              {isCurrent && (
                                <span className="text-[8px] bg-blue-50 text-blue-700 border border-blue-200 font-bold uppercase py-0.5 px-1.5 rounded">
                                  Current Head
                                </span>
                              )}
                              {isRevertedHead && (
                                <span className="text-[8px] bg-purple-50 text-purple-700 border border-purple-200 font-bold uppercase py-0.5 px-1.5 rounded">
                                  Revert Node
                                </span>
                              )}
                              <span className="text-[10px] text-gray-400 font-mono font-medium ml-auto">{dateText}</span>
                            </div>

                            {chk.parentCheckpointId && (
                              <p className="text-[10px] text-gray-400 font-mono truncate">
                                Parent: <span className="font-bold">{chk.parentCheckpointId.substring(0, 8)}</span>
                              </p>
                            )}

                            {chk.metadata && (
                              <div className="text-[10px] text-gray-500 font-sans mt-0.5 flex flex-wrap gap-1">
                                {chk.metadata.step !== undefined && (
                                  <span className="bg-gray-100 text-gray-600 px-1.5 py-0.2 rounded text-[8px] font-bold uppercase">
                                    Step {chk.metadata.step}
                                  </span>
                                )}
                                {chk.metadata.reverted_from && (
                                  <span className="bg-purple-50 text-purple-600 px-1.5 py-0.2 rounded text-[8px] font-bold uppercase font-mono">
                                    Reverted from {chk.metadata.reverted_from.substring(0, 6)}
                                  </span>
                                )}
                              </div>
                            )}

                            {confirmRevertId === chk.checkpointId ? (
                              <div className="mt-2 p-2 bg-red-50/50 rounded-lg border border-red-100 space-y-2 animate-in zoom-in-95">
                                <p className="text-[10px] text-red-700 font-semibold leading-tight">
                                  Confirm restoring agent state back to checkpoint {displayId}?
                                </p>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handleRevert(chk.checkpointId)}
                                    disabled={revertingCheckpointId !== null}
                                    className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-[9px] font-bold uppercase active:scale-95 disabled:opacity-50"
                                  >
                                    {revertingCheckpointId === chk.checkpointId ? 'Restoring...' : 'Confirm'}
                                  </button>
                                  <button
                                    onClick={() => setConfirmRevertId(null)}
                                    className="px-2 py-1 bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 rounded text-[9px] font-bold uppercase active:scale-95"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              !isCurrent && (
                                <button
                                  onClick={() => setConfirmRevertId(chk.checkpointId)}
                                  className="mt-1 text-[10px] text-blue-600 hover:text-blue-800 font-bold uppercase tracking-tighter"
                                >
                                  Revert to here
                                </button>
                              )
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-6 text-gray-400 text-xs italic">
                      No state checkpoints available yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

// Simple spinning animation
const style = document.createElement('style');
style.textContent = `
  @keyframes spin-slow {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .animate-spin-slow {
    animation: spin-slow 3s linear infinite;
  }
  @keyframes dash {
    to {
      stroke-dashoffset: -20;
    }
  }
  .animate-dash-blue {
    stroke-dasharray: 6, 4;
    animation: dash 1s linear infinite;
  }
`;
document.head.appendChild(style);
