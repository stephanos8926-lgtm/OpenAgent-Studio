// File: src/components/SwarmConsole.tsx

import React, { useMemo } from 'react';
import { useAppStore } from '../lib/store';
import { 
  Network, 
  Cpu, 
  Zap, 
  Activity, 
  CheckCircle2, 
  Fingerprint,
  TrendingUp,
  Server,
  Layers,
  Sparkles
} from 'lucide-react';
import { motion } from 'motion/react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Cell,
  ReferenceLine
} from 'recharts';

export const SwarmConsole: React.FC = () => {
  const { swarmState, metrics, telemetryTimeline } = useAppStore();
  const { activeAgent, tasks, health } = swarmState;
  const [expandedAgents, setExpandedAgents] = React.useState<Record<string, boolean>>({});

  const toggleExpanded = (agentId: string) => {
    setExpandedAgents((prev) => ({ ...prev, [agentId]: !prev[agentId] }));
  };

  const agents = useMemo(() => [
    { id: 'orchestrator', name: 'Orchestrator', role: 'Strategic Routing', type: 'CORE', color: '#3b82f6' },
    { id: 'planner', name: 'Planner', role: 'DAG Generation', type: 'CORE', color: '#f59e0b' },
    { id: 'coder', name: 'Coder', role: 'VFS Code Engine', type: 'CORE', color: '#10b981' },
    { id: 'auditor', name: 'Auditor', role: 'Compliance & Safety', type: 'SPECIALIZED', color: '#8b5cf6' },
    { id: 'platform', name: 'Platform', role: 'Sandbox Orchestration', type: 'SYSTEM', color: '#ec4899' },
  ], []);

  // Compute status metrics for the Recharts rendering engine
  const chartData = useMemo(() => {
    const counts = { completed: 0, in_progress: 0, pending: 0, failed: 0 };
    tasks.forEach(t => {
      if (t.status === 'completed') counts.completed++;
      else if (t.status === 'in_progress') counts.in_progress++;
      else if (t.status === 'failed') counts.failed++;
      else counts.pending++;
    });

    return [
      { name: 'Completed', count: counts.completed, fill: '#10b981', gradient: 'url(#completedGrad)' },
      { name: 'Active', count: counts.in_progress, fill: '#3b82f6', gradient: 'url(#activeGrad)' },
      { name: 'Pending', count: counts.pending, fill: '#cbd5e1', gradient: 'url(#pendingGrad)' },
      { name: 'Failed', count: counts.failed, fill: '#ef4444', gradient: 'url(#failedGrad)' },
    ];
  }, [tasks]);

  // Aggregate stats
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const inProgressCount = tasks.filter(t => t.status === 'in_progress').length;
  const totalTasks = tasks.length;

  return (
    <div id="swarm-console-container" className="bg-slate-900 p-4 md:p-6 rounded-2xl border border-slate-800 shadow-xl space-y-6 select-none font-sans">
      
      {/* Header telemetry banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <span className="text-[10px] text-blue-400 font-mono tracking-widest font-bold uppercase flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-yellow-400" /> SYSTEM ARCHITECTURE
          </span>
          <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2.5 mt-1 font-display">
            <span className="p-1.5 bg-blue-900/30 text-blue-400 rounded-lg border border-blue-500/20">
              <Network className="w-4 h-4 animate-pulse" />
            </span>
            LangGraph Swarm Vision
          </h2>
          <p className="text-xs text-slate-400 mt-1">Real-time control-plane node routing, variable-frequency pulses, and state graphs.</p>
        </div>

        {/* Global Mesh stats grids */}
        <div className="grid grid-cols-2 md:flex items-center gap-2.5">
          <div className="bg-slate-950 border border-slate-850 p-2 px-3.5 rounded-xl flex items-center gap-2.5">
            <Fingerprint className="w-4 h-4 text-slate-500 shrink-0" />
            <div className="text-left">
              <div className="text-[9px] text-slate-500 font-bold uppercase font-mono">ACTIVE HEAD</div>
              <div className="text-xs font-mono font-black text-blue-400">
                {activeAgent ? activeAgent.toUpperCase() : 'IDLE'}
              </div>
            </div>
          </div>
          <div className="bg-slate-950 border border-slate-850 p-2 px-3.5 rounded-xl flex items-center gap-2.5">
            <div className={`w-2 h-2 rounded-full ${
              health === 'good' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500 animate-pulse'
            }`} />
            <div className="text-left">
              <div className="text-[9px] text-slate-500 font-bold uppercase font-mono">INTEGRITY</div>
              <div className={`text-xs font-mono font-black uppercase ${
                health === 'good' ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {health}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Central Visual Communication Bus */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Core Node Pulse Interactive Screen */}
        <div className="lg:col-span-7 bg-slate-950 p-5 rounded-2xl border border-slate-850 relative overflow-hidden min-h-[420px] flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-yellow-500 fill-yellow-200" />
              Intelligence Routing Canvas
            </span>
            <span className="text-[9px] font-mono border border-slate-800 rounded px-1.5 py-0.5 bg-slate-900 text-slate-400 font-bold">
              FRAME_RATE_60HZ
            </span>
          </div>

          <div className="relative flex-1 w-full min-h-[280px] flex items-center justify-center my-4">
            
            {/* Visual communication arcs connection paths */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
              <defs>
                <radialGradient id="ringGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                </radialGradient>
                <linearGradient id="completedGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#059669" stopOpacity="0.5" />
                </linearGradient>
                <linearGradient id="activeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity="0.5" />
                </linearGradient>
                <linearGradient id="failedGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#dc2626" stopOpacity="0.5" />
                </linearGradient>
                <linearGradient id="pendingGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#64748b" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#475569" stopOpacity="0.5" />
                </linearGradient>
              </defs>

              {/* Wirelines showing logical mesh connections from Strategic Router */}
              <g className="opacity-25" stroke="#475569" strokeWidth="1.5" strokeDasharray="3 3" fill="none">
                <path d="M 150 40 L 80 140" />
                <path d="M 150 40 L 220 140" />
                <path d="M 80 140 L 80 240" />
                <path d="M 220 140 L 220 240" />
                <path d="M 80 240 L 150 40" />
              </g>

              {/* Pulsing glow particle when coder or orchestrator runs */}
              {activeAgent && (
                <circle 
                  cx={activeAgent === 'orchestrator' ? '50%' : activeAgent === 'planner' ? '25%' : activeAgent === 'coder' ? '75%' : activeAgent === 'auditor' ? '20%' : '80%'}
                  cy={activeAgent === 'orchestrator' ? '20%' : activeAgent === 'planner' ? '50%' : activeAgent === 'coder' ? '50%' : activeAgent === 'auditor' ? '80%' : '80%'}
                  r="24"
                  fill="url(#ringGlow)"
                  className="animate-pulse"
                />
              )}
            </svg>

            {/* Layout container physically placement nodes */}
            <div className="absolute inset-0 flex flex-col justify-between p-2 z-10">
              
              {/* Strategic Gateway node */}
              <div className="flex justify-center">
                <motion.div 
                  animate={{ 
                    scale: activeAgent === 'orchestrator' ? 1.05 : 1,
                    borderColor: activeAgent === 'orchestrator' ? '#3b82f6' : '#334155',
                    backgroundColor: activeAgent === 'orchestrator' ? '#0f172a' : '#020617'
                  }}
                  className="border rounded-xl p-2 px-4 text-center w-36 flex items-center gap-2 transition-all cursor-pointer shadow-lg"
                >
                  <div className={`p-1 rounded-md ${activeAgent === 'orchestrator' ? 'bg-blue-900/40 text-blue-400 animate-pulse' : 'bg-slate-900 text-slate-500'}`}>
                    <Server className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-left">
                    <span className="text-[8px] text-slate-500 font-extrabold uppercase font-mono leading-none block">GATEWAY</span>
                    <h4 className="text-[11px] font-bold text-slate-200 leading-tight flex items-center justify-between">
                      Orchestrator
                      <button onClick={() => toggleExpanded('orchestrator')} className="ml-2 text-[10px] w-3.5 h-3.5 flex items-center justify-center rounded bg-slate-800 text-slate-300">
                        {expandedAgents['orchestrator'] ? '−' : '+'}
                      </button>
                    </h4>
                    {expandedAgents['orchestrator'] && (
                      <div className="mt-1 text-[8px] text-slate-400 border-t border-slate-700 pt-1">
                        {tasks.filter(t => t.assignedTo === 'orchestrator').slice(-2).map((t, idx) => (
                           <div key={idx} className="truncate max-w-[100px]">{t.label}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>

              {/* Cognitive execution nodes */}
              <div className="flex items-center justify-around">
                {/* Planner */}
                <motion.div 
                  animate={{ 
                    scale: activeAgent === 'planner' ? 1.05 : 1,
                    borderColor: activeAgent === 'planner' ? '#f59e0b' : '#334155',
                    backgroundColor: activeAgent === 'planner' ? '#1e1b4b' : '#020617'
                  }}
                  className="border rounded-xl p-2 px-3 text-center w-32 flex items-center gap-2 transition-all cursor-pointer shadow-lg"
                >
                  <div className={`p-1 rounded-md ${activeAgent === 'planner' ? 'bg-amber-900/40 text-amber-400 animate-pulse' : 'bg-slate-900 text-slate-500'}`}>
                    <Layers className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-left">
                    <span className="text-[8px] text-slate-500 font-extrabold uppercase font-mono leading-none block">STRATEGY</span>
                    <h4 className="text-[11px] font-bold text-slate-200 leading-tight flex items-center justify-between">
                      Planner
                      <button onClick={() => toggleExpanded('planner')} className="ml-2 text-[10px] w-3.5 h-3.5 flex items-center justify-center rounded bg-slate-800 text-slate-300">
                        {expandedAgents['planner'] ? '−' : '+'}
                      </button>
                    </h4>
                    {expandedAgents['planner'] && (
                      <div className="mt-1 text-[8px] text-slate-400 border-t border-slate-700 pt-1">
                        {tasks.filter(t => t.assignedTo === 'planner').slice(-2).map((t, idx) => (
                           <div key={idx} className="truncate max-w-[100px]">{t.label}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>

                {/* Coder */}
                <motion.div 
                  animate={{ 
                    scale: activeAgent === 'coder' ? 1.05 : 1,
                    borderColor: activeAgent === 'coder' ? '#10b981' : '#334155',
                    backgroundColor: activeAgent === 'coder' ? '#064e3b' : '#020617'
                  }}
                  className="border rounded-xl p-2 px-3 text-center w-32 flex items-center gap-2 transition-all cursor-pointer shadow-lg"
                >
                  <div className={`p-1 rounded-md ${activeAgent === 'coder' ? 'bg-emerald-900/40 text-emerald-400 animate-pulse' : 'bg-slate-900 text-slate-500'}`}>
                    <Cpu className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-left">
                    <span className="text-[8px] text-slate-500 font-extrabold uppercase font-mono leading-none block">EXECUTE</span>
                    <h4 className="text-[11px] font-bold text-slate-200 leading-tight flex items-center justify-between">
                      Coder
                      <button onClick={() => toggleExpanded('coder')} className="ml-2 text-[10px] w-3.5 h-3.5 flex items-center justify-center rounded bg-slate-800 text-slate-300">
                        {expandedAgents['coder'] ? '−' : '+'}
                      </button>
                    </h4>
                    {expandedAgents['coder'] && (
                      <div className="mt-1 text-[8px] text-slate-400 border-t border-slate-700 pt-1">
                        {tasks.filter(t => t.assignedTo === 'coder').slice(-2).map((t, idx) => (
                           <div key={idx} className="truncate max-w-[100px]">{t.label}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>

              {/* Validator/compliance and sandbox nodes */}
              <div className="flex items-center justify-around">
                {/* Auditor */}
                <motion.div 
                  animate={{ 
                    scale: activeAgent === 'auditor' ? 1.05 : 1,
                    borderColor: activeAgent === 'auditor' ? '#8b5cf6' : '#334155',
                    backgroundColor: activeAgent === 'auditor' ? '#3b0764' : '#020617'
                  }}
                  className="border rounded-xl p-2 px-3 text-center w-32 flex items-center gap-2 transition-all cursor-pointer shadow-lg"
                >
                  <div className={`p-1 rounded-md ${activeAgent === 'auditor' ? 'bg-purple-900/40 text-purple-400 animate-pulse' : 'bg-slate-900 text-slate-500'}`}>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-left">
                    <span className="text-[8px] text-slate-500 font-extrabold uppercase font-mono leading-none block">COMPLIANCE</span>
                    <h4 className="text-[11px] font-bold text-slate-200 leading-tight flex items-center justify-between">
                      Auditor
                      <button onClick={() => toggleExpanded('auditor')} className="ml-2 text-[10px] w-3.5 h-3.5 flex items-center justify-center rounded bg-slate-800 text-slate-300">
                        {expandedAgents['auditor'] ? '−' : '+'}
                      </button>
                    </h4>
                    {expandedAgents['auditor'] && (
                      <div className="mt-1 text-[8px] text-slate-400 border-t border-slate-700 pt-1">
                        {tasks.filter(t => t.assignedTo === 'auditor').slice(-2).map((t, idx) => (
                           <div key={idx} className="truncate max-w-[100px]">{t.label}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>

                {/* Platform VM */}
                <motion.div 
                  animate={{ 
                    scale: activeAgent === 'platform' ? 1.05 : 1,
                    borderColor: activeAgent === 'platform' ? '#ec4899' : '#334155',
                    backgroundColor: activeAgent === 'platform' ? '#50072b' : '#020617'
                  }}
                  className="border rounded-xl p-2 px-3 text-center w-32 flex items-center gap-2 transition-all cursor-pointer shadow-lg"
                >
                  <div className={`p-1 rounded-md ${activeAgent === 'platform' ? 'bg-pink-900/40 text-pink-400 animate-pulse' : 'bg-slate-900 text-slate-500'}`}>
                    <Activity className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-left">
                    <span className="text-[8px] text-slate-500 font-extrabold uppercase font-mono block leading-none">SANDBOX</span>
                    <h4 className="text-[11px] font-bold text-slate-200 leading-tight flex items-center justify-between">
                      Platform VM
                      <button onClick={() => toggleExpanded('platform')} className="ml-2 text-[10px] w-3.5 h-3.5 flex items-center justify-center rounded bg-slate-800 text-slate-300">
                        {expandedAgents['platform'] ? '−' : '+'}
                      </button>
                    </h4>
                    {expandedAgents['platform'] && (
                      <div className="mt-1 text-[8px] text-slate-400 border-t border-slate-700 pt-1">
                        {tasks.filter(t => t.assignedTo === 'platform').slice(-2).map((t, idx) => (
                           <div key={idx} className="truncate max-w-[100px]">{t.label}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>

            </div>
          </div>

          {/* Quick status guide */}
          <div className="border-t border-slate-900 pt-4 flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span>Route Strategy: {activeAgent ? agents.find(a => a.id === activeAgent)?.role : 'None'}</span>
            <span className="flex items-center gap-1 text-blue-400 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
              TELEM_STREAM_LIVE
            </span>
          </div>
        </div>

        {/* Recharts Telemetry Dials inside the right-hand panel */}
        <div className="lg:col-span-5 space-y-5">
          
          {/* Bar chart - Task progress stats */}
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono flex items-center gap-1.5 mb-3">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              Task DAG Execution Dials
            </span>

            <div className="w-full h-36">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 10, left: -32, bottom: 0 }}>
                  <XAxis 
                    dataKey="name" 
                    tick={{ fill: '#64748b', fontSize: 9, fontWeight: 'bold' }} 
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{ fill: '#64748b', fontSize: 9 }} 
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip 
                    cursor={{ fill: 'rgba(51, 65, 85, 0.4)', radius: 4 }}
                    contentStyle={{ background: '#020617', borderRadius: '8px', border: '1px solid #1e293b', color: '#fff', fontSize: '10px', fontFamily: 'monospace' }}
                  />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]} barSize={24}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-3 pt-3 border-t border-slate-900 flex items-center justify-between text-[11px] text-slate-400">
              <div className="flex gap-3">
                <span>
                  <strong className="text-white">{completedCount}</strong>/<strong>{totalTasks}</strong> Completed
                </span>
                <span>
                  <strong className="text-blue-400">{inProgressCount}</strong> Active
                </span>
              </div>
              <span className="font-mono text-[9px] bg-emerald-950 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-bold">
                COMPILATION: OK
              </span>
            </div>
          </div>

          {/* Area chart - Token Consumption Rate */}
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono flex items-center gap-1.5 mb-3">
              <Activity className="w-3.5 h-3.5 text-blue-500" />
              Swarms Token Allocation TimeSeries
            </span>

            <div className="w-full h-36">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={telemetryTimeline} margin={{ top: 8, right: 10, left: -26, bottom: 0 }}>
                  <XAxis 
                    dataKey="step" 
                    tick={{ fill: '#64748b', fontSize: 9 }} 
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{ fill: '#64748b', fontSize: 9 }} 
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip 
                    contentStyle={{ background: '#020617', borderRadius: '8px', border: '1px solid #1e293b', color: '#fff', fontSize: '10px', fontFamily: 'monospace' }}
                  />
                  <ReferenceLine y={2800} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: 'THROTTLE', fill: '#f59e0b', fontSize: 7, fontWeight: 'bold', position: 'top' }} />
                  <Area 
                    type="monotone" 
                    dataKey="Prompt Tokens" 
                    stroke="#3b82f6" 
                    strokeWidth={1.5}
                    fillOpacity={0.10} 
                    fill="#3b82f6" 
                  />
                  <Area 
                    type="monotone" 
                    dataKey="Completion Tokens" 
                    stroke="#10b981" 
                    strokeWidth={1.5}
                    fillOpacity={0.05} 
                    fill="#10b981" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-3 pt-3 border-t border-slate-900 flex justify-between text-[9px] text-slate-500 font-bold uppercase font-mono">
              <div className="flex gap-3">
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Prompts</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Completions</span>
              </div>
              <span className="text-slate-400">Total: {metrics.totalTokensUsed} Tok</span>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
