// File: src/components/SwarmRadar.tsx

import React, { useEffect, useState, useMemo } from 'react';
import { useAppStore } from '../lib/store';
import { 
  Radio, 
  Activity, 
  Radar, 
  ShieldAlert, 
  Compass, 
  CheckCircle2, 
  RefreshCw 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AgentNodeProps {
  id: string;
  name: string;
  role: string;
  px: number;
  py: number;
  color: string;
  activeColor: string;
  angle: number;
}

export const SwarmRadar: React.FC = () => {
  const { swarmState } = useAppStore();
  const { activeAgent, tasks, health } = swarmState;

  // Radar sweep animation degree state
  const [sweepAngle, setSweepAngle] = useState(0);
  const [latencyMetrics, setLatencyMetrics] = useState<Record<string, number>>({
    orchestrator: 120,
    planner: 240,
    coder: 350,
    auditor: 180,
    reviewer: 150
  });

  const [activeFlashes, setActiveFlashes] = useState<string[]>([]);
  const [expandedAgents, setExpandedAgents] = useState<Record<string, boolean>>({});

  // Toggle expanded state
  const toggleExpanded = (agentId: string) => {
    setExpandedAgents((prev) => ({ ...prev, [agentId]: !prev[agentId] }));
  };

  // Update sweeps & slightly alter telemetry in real-time for high-fidelity immersion
  useEffect(() => {
    let frameId: number;
    const updateSweep = () => {
      setSweepAngle((prev) => (prev + 1.2) % 360);
      frameId = requestAnimationFrame(updateSweep);
    };
    frameId = requestAnimationFrame(updateSweep);

    const interval = setInterval(() => {
      setLatencyMetrics({
        orchestrator: Math.round(90 + Math.random() * 50),
        planner: Math.round(180 + Math.random() * 80),
        coder: Math.round(280 + Math.random() * 120),
        auditor: Math.round(150 + Math.random() * 60),
        reviewer: Math.round(130 + Math.random() * 50)
      });
    }, 4000);

    return () => {
      cancelAnimationFrame(frameId);
      clearInterval(interval);
    };
  }, []);

  // Flash nodes whenever active agent changes (simulating ingress traffic)
  useEffect(() => {
    if (!activeAgent) return;
    setActiveFlashes((prev) => [...prev, activeAgent]);
    const timer = setTimeout(() => {
      setActiveFlashes((prev) => prev.filter((id) => id !== activeAgent));
    }, 1005);
    return () => clearTimeout(timer);
  }, [activeAgent]);

  // Center coordinate of the 400x400 radar circle is (200, 200)
  const cx = 200;
  const cy = 200;
  const rMax = 160;

  // Plotting our agents on the 400x400 SVG radar canvas using polar coordinates
  const agents: AgentNodeProps[] = useMemo(() => [
    { 
      id: 'orchestrator', 
      name: 'Orchestrator', 
      role: 'Gateway Router', 
      px: cx, 
      py: cy - 120, // Center Top
      color: '#3b82f6', // blue
      activeColor: 'shadow-[0_0_15px_#3b82f6]', 
      angle: 270 
    },
    { 
      id: 'planner', 
      name: 'Planner', 
      role: 'Decomposition', 
      px: cx - 110, 
      py: cy - 40, // Top-Left
      color: '#f59e0b', // amber
      activeColor: 'shadow-[0_0_15px_#f59e0b]', 
      angle: 210 
    },
    { 
      id: 'coder', 
      name: 'Coder', 
      role: 'Code Generator', 
      px: cx, 
      py: cy + 120, // Bottom
      color: '#10b981', // emerald
      activeColor: 'shadow-[0_0_15px_#10b981]', 
      angle: 90 
    },
    { 
      id: 'auditor', 
      name: 'Auditor', 
      role: 'QA & Sandbox', 
      px: cx + 110, 
      py: cy - 40, // Top-Right
      color: '#8b5cf6', // violet
      activeColor: 'shadow-[0_0_15px_#8b5cf6]', 
      angle: 330 
    },
    { 
      id: 'reviewer', 
      name: 'Reviewer', 
      role: 'Static Audits', 
      px: cx, 
      py: cy, // Direct Center Core
      color: '#ec4899', // pink
      activeColor: 'shadow-[0_0_15px_#ec4899]', 
      angle: 0 
    },
  ], []);

  // Connection routing list
  const connections = useMemo(() => [
    { from: 'orchestrator', to: 'planner' },
    { from: 'orchestrator', to: 'coder' },
    { from: 'planner', to: 'coder' },
    { from: 'coder', to: 'auditor' },
    { from: 'auditor', to: 'coder' },
    { from: 'coder', to: 'reviewer' },
    { from: 'reviewer', to: 'coder' }
  ], []);

  return (
    <div id="swarm-radar-root" className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6 shadow-xl text-white select-none font-sans flex flex-col xl:flex-row gap-6 mt-6">
      
      {/* Visual Canvas Panel */}
      <div className="flex-1 bg-slate-950 rounded-xl border border-slate-850 p-4 flex flex-col items-center justify-center relative overflow-hidden">
        
        {/* Header indicator bar */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
          <span className="text-[10px] font-bold text-slate-400 font-mono tracking-widest flex items-center gap-1.5">
            <Radar className="w-4 h-4 text-emerald-400 animate-spin" style={{ animationDuration: '4s' }} />
            LANGGRAPH CELL RADAR (312.4 GHZ)
          </span>
          <span className="flex items-center gap-1.5 text-[9px] font-mono text-emerald-400 border border-emerald-900/40 bg-emerald-950/40 rounded px-2 py-0.5 font-bold">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
            SWEEP_SCANNING_ACTIVE
          </span>
        </div>

        {/* Outer Circular Bounds Wrapper */}
        <div className="relative w-[320px] h-[320px] md:w-[400px] md:h-[400px] mt-6 flex items-center justify-center scale-90 md:scale-100">
          
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 400 400">
            <defs>
              {/* Sweep gradient */}
              <linearGradient id="sweepGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                <stop offset="50%" stopColor="#10b981" stopOpacity="0.1" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
              </linearGradient>

              {/* Data pulse marker */}
              <radialGradient id="pulseGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="1" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Concentric Grid Rings */}
            <circle cx={cx} cy={cy} r={40} stroke="#1e293b" fill="none" strokeWidth="1" strokeDasharray="2 2" />
            <circle cx={cx} cy={cy} r={80} stroke="#1e293b" fill="none" strokeWidth="1" />
            <circle cx={cx} cy={cy} r={120} stroke="#1e293b" fill="none" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={cx} cy={cy} r={rMax} stroke="#334155" fill="none" strokeWidth="1.5" />

            {/* Degree ticks around outer rim */}
            {Array.from({ length: 12 }).map((_, i) => {
              const angle = (i * 30 * Math.PI) / 180;
              const x1 = cx + (rMax - 5) * Math.cos(angle);
              const y1 = cy + (rMax - 5) * Math.sin(angle);
              const x2 = cx + rMax * Math.cos(angle);
              const y2 = cy + rMax * Math.sin(angle);
              return (
                <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#475569" strokeWidth="1.5" />
              );
            })}

            {/* Crosshair Axes */}
            <line x1={cx - rMax} y1={cy} x2={cx + rMax} y2={cy} stroke="#1e293b" strokeWidth="1" />
            <line x1={cx} y1={cy - rMax} x2={cx} y2={cy + rMax} stroke="#1e293b" strokeWidth="1" />

            {/* Sweeping Scanning Line */}
            <line 
              x1={cx} 
              y1={cy} 
              x2={cx + rMax * Math.cos((sweepAngle * Math.PI) / 180)} 
              y2={cy + rMax * Math.sin((sweepAngle * Math.PI) / 180)} 
              stroke="#10b981" 
              strokeWidth="2" 
              opacity="0.85"
            />

            {/* Connection Arcs & Traffic Lines */}
            {connections.map((conn, idx) => {
              const nodeFrom = agents.find((a) => a.id === conn.from);
              const nodeTo = agents.find((a) => a.id === conn.to);
              if (!nodeFrom || !nodeTo) return null;

              // Check if path is currently active
              const isActiveRoute = activeAgent === conn.from || activeAgent === conn.to;

              return (
                <g key={`route-${idx}`} className="transition-all duration-300">
                  <path 
                    d={`M ${nodeFrom.px} ${nodeFrom.py} L ${nodeTo.px} ${nodeTo.py}`} 
                    fill="none" 
                    stroke={isActiveRoute ? '#38bdf8' : '#334155'} 
                    strokeWidth={isActiveRoute ? '2' : '1.2'} 
                    strokeDasharray={isActiveRoute ? 'none' : '4 4'}
                    opacity={isActiveRoute ? '0.85' : '0.4'}
                  />

                  {/* Flowing data pulses mapping to active states */}
                  {isActiveRoute && (
                    <circle r="4">
                      <animateMotion 
                        path={`M ${nodeFrom.px} ${nodeFrom.py} L ${nodeTo.px} ${nodeTo.py}`} 
                        dur="1.5s" 
                        repeatCount="indefinite" 
                      />
                      <animate attributeName="fill" values="#38bdf8;#60a5fa;#34d399;#38bdf8" dur="1.5s" repeatCount="indefinite" />
                    </circle>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Interactive Agent Plotted CSS Elements */}
          {agents.map((agent) => {
            const isFlashed = activeFlashes.includes(agent.id);
            const isSelected = activeAgent === agent.id;

            return (
              <div 
                key={agent.id}
                style={{ 
                  position: 'absolute', 
                  left: `${agent.px}px`, 
                  top: `${agent.py}px`,
                  transform: 'translate(-50%, -50%)'
                }}
                className="z-15 flex flex-col items-center"
              >
                {/* Node circle wrapper with framer motions */}
                <motion.div 
                  animate={{ 
                    scale: isSelected ? 1.15 : isFlashed ? 1.25 : 1,
                  }}
                  className={`w-10 h-10 rounded-full border-2 bg-slate-950 flex items-center justify-center cursor-pointer transition-all ${
                    isSelected ? agent.activeColor : 'border-slate-700'
                  }`}
                  style={{ 
                    borderColor: isSelected || isFlashed ? agent.color : '#334155' 
                  }}
                >
                  {/* Ping center */}
                  <div 
                    className="w-3.5 h-3.5 rounded-full relative" 
                    style={{ backgroundColor: agent.color }}
                  >
                    {(isSelected || isFlashed) && (
                      <span 
                        className="absolute inset-0 rounded-full animate-ping opacity-75"
                        style={{ backgroundColor: agent.color }}
                      />
                    )}
                  </div>
                </motion.div>

                {/* Agent text metadata flag */}
                <div className="mt-1.5 px-2 py-0.5 bg-slate-950/90 border border-slate-850 rounded text-center min-w-[100px] shadow-md backdrop-blur-xs">
                  <div className="flex items-center justify-between gap-1">
                    <div className="text-[9px] font-black leading-none text-white tracking-tight">{agent.name}</div>
                    <button onClick={() => toggleExpanded(agent.id)} className="text-[10px] w-3.5 h-3.5 flex items-center justify-center rounded bg-slate-800 text-slate-300 hover:bg-slate-700">
                      {expandedAgents[agent.id] ? '−' : '+'}
                    </button>
                  </div>
                  <div className="text-[7px] font-mono text-slate-400 leading-tight mt-0.5 font-bold uppercase">{agent.role}</div>
                  
                  {expandedAgents[agent.id] && (
                    <div className="mt-1.5 text-[8px] text-left text-slate-300 border-t border-slate-800 pt-1.5 space-y-1">
                      {tasks.slice(-3).map((t, idx) => (
                        <div key={idx} className="truncate max-w-[90px]">{t.label}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

        </div>

        {/* Orbit layer footer guide */}
        <div className="w-full border-t border-slate-900 mt-4 pt-3 flex items-center justify-between text-[11px] text-slate-500 font-mono">
          <div className="flex gap-4">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              Core Routing
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-pink-500" />
              Audits/Review
            </span>
          </div>
          <span>Refresher: 60Hz</span>
        </div>

      </div>

      {/* Structured Telemetry Data Panel */}
      <div className="w-full xl:w-96 flex flex-col justify-between bg-slate-950/70 border border-slate-850 p-4 md:p-5 rounded-xl">
        
        <div className="space-y-4">
          <span className="text-[10px] font-black text-slate-500 font-mono tracking-widest uppercase flex items-center gap-1.5 mb-1">
            <Activity className="w-4 h-4 text-blue-400" />
            NODE REALTIME COHERENCE
          </span>

          <div className="space-y-2.5">
            {agents.map((agent) => {
              const isSelected = activeAgent === agent.id;
              const nodeTasks = tasks.filter(t => t.status === 'in_progress');
              const latency = latencyMetrics[agent.id] || 150;

              return (
                <div 
                  key={agent.id}
                  className={`p-2.5 rounded-lg border flex items-center justify-between transition-all ${
                    isSelected 
                      ? 'bg-slate-900/80 border-slate-700/80' 
                      : 'bg-slate-950 border-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-2.5 h-2.5 rounded-full" 
                      style={{ backgroundColor: agent.color }}
                    />
                    <div className="text-left">
                      <div className="text-xs font-bold text-slate-200">{agent.name}</div>
                      <div className="text-[9px] font-mono text-slate-500 font-bold uppercase">{agent.role}</div>
                    </div>
                  </div>

                  <div className="text-right font-mono text-[10px] space-y-0.5">
                    <div className={`font-black ${isSelected ? 'text-emerald-400' : 'text-slate-400'}`}>
                      {isSelected ? 'EXECUTING' : 'STANDBY'}
                    </div>
                    <div className="text-slate-500 font-bold">{latency}ms lat</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Global telemetry network health */}
        <div className="mt-6 pt-4 border-t border-slate-900 space-y-3 font-mono text-xs text-slate-400">
          <div className="flex justify-between">
            <span>Graph Health Coefficient:</span>
            <span className={`font-bold ${health === 'good' ? 'text-emerald-400' : 'text-red-400'}`}>
              {(health === 'good' ? '98.4% (EXCELLENT)' : '42.1% (CRITICAL)')}
            </span>
          </div>

          <div className="flex justify-between">
            <span>Swarm Execution Model:</span>
            <span className="font-bold text-blue-400">LangGraph v0.2.6</span>
          </div>

          <div className="flex justify-between">
            <span>Interactive Mesh Intercept:</span>
            <span className="text-slate-300 font-bold">Enabled</span>
          </div>
        </div>

      </div>

    </div>
  );
};
