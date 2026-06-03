// File: src/components/StrategyToolbar.tsx

import React from 'react';
import { Eye, Shield, AlertTriangle, Cpu, Zap, Activity } from 'lucide-react';
import { ExecutionMode } from '../types';

interface StrategyToolbarProps {
  executionMode: ExecutionMode;
  setExecutionMode: (mode: ExecutionMode) => void;
}

export const StrategyToolbar: React.FC<StrategyToolbarProps> = ({
  executionMode,
  setExecutionMode
}) => {

  const getStrategyMessage = (mode: ExecutionMode) => {
    switch (mode) {
      case 'plan':
        return "Plan: The AI will generate structured layouts first and await code verification.";
      case 'yolo':
        return "YOLO mode: Auto-approves file adjustments bypass verification thresholds.";
      default:
        return "Normal Strategy: Requires individual file and chunk approval.";
    }
  };

  return (
    <div className="bg-[#0b0e14] border-b border-white/5 py-1.5 px-4 flex flex-col md:flex-row gap-3 md:items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono select-none shrink-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex items-center gap-1.5 text-slate-400 font-extrabold uppercase">
          <Eye className="w-3.5 h-3.5 text-indigo-400 shrink-0" /> Execution Strategy:
        </span>
        
        {/* Windows Acrylic Style Button Set */}
        <div className="flex bg-slate-950/80 rounded-md p-0.5 border border-white/5 select-none shrink-0">
          {(['plan', 'normal', 'yolo'] as const).map(m => (
            <button
              key={m}
              onClick={() => setExecutionMode(m)}
              className={`px-3 py-1 text-[9px] rounded font-bold uppercase transition-all duration-150 cursor-pointer ${
                executionMode === m 
                  ? 'bg-blue-600 text-white shadow shadow-blue-500/20' 
                  : 'hover:bg-slate-900 text-slate-500 hover:text-slate-300'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Dynamic Context Description Tip */}
        <span className="normal-case text-slate-400 font-sans font-medium hidden lg:inline truncate max-w-[400px]">
          {getStrategyMessage(executionMode)}
        </span>
      </div>

      {executionMode === 'yolo' ? (
        <div className="flex items-center gap-1.5 text-red-400 animate-pulse font-extrabold shrink-0 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded text-[9px]">
          <AlertTriangle className="w-3.5 h-3.5" />
          Warning: Auto-Approve Enabled
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-slate-500 font-semibold shrink-0">
          <Shield className="w-3.5 h-3.5 text-slate-500" />
          <span>Secured Sandbox IP</span>
        </div>
      )}
    </div>
  );
};
