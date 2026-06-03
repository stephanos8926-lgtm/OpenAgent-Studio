// File: src/components/CompileOverlay.tsx

import React from "react";
import { useAppStore } from "../lib/store";
import { motion, AnimatePresence } from "motion/react";
import { Cpu, RefreshCw, Loader2, Sparkles, CheckCircle2, AlertOctagon } from "lucide-react";

export const CompileOverlay: React.FC = () => {
  const { compilePercent, compileMessage, compilingState, setCompilingState } = useAppStore();

  const isVisible = compilingState === "running" || compilingState === "failed" || compilingState === "success";

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <div 
        id="compile-overlay-backdrop"
        className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4 selection:bg-blue-600/30 font-sans"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -15 }}
          transition={{ type: "spring", damping: 25, stiffness: 220 }}
          id="compile-progress-window"
          className="w-full max-w-md bg-slate-900/95 border border-slate-800/80 rounded-2xl p-6 md:p-8 shadow-2xl shadow-blue-950/40 relative overflow-hidden"
        >
          {/* Accent glow line inside */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500 via-cyan-400 to-purple-500" />

          {/* Icon and Header Block */}
          <div className="flex items-center gap-4 mb-6">
            <div className={`p-3 rounded-xl border flex items-center justify-center ${
              compilingState === "failed" 
                ? "bg-red-500/10 border-red-500/20 text-red-400"
                : compilingState === "success"
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 font-bold"
                : "bg-blue-600/10 border-blue-500/25 text-blue-400"
            }`}>
              {compilingState === "failed" ? (
                <AlertOctagon className="w-6 h-6 animate-pulse" />
              ) : compilingState === "success" ? (
                <CheckCircle2 className="w-6 h-6" />
              ) : (
                <Cpu className="w-6 h-6 animate-spin" style={{ animationDuration: "3s" }} />
              )}
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-wider text-white uppercase font-display">
                {compilingState === "failed" 
                  ? "Compiler Error Detected" 
                  : compilingState === "success" 
                  ? "Compilation Successful" 
                  : "Asynchronous Builder Active"}
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {compilingState === "failed"
                  ? "Types-check failed or static assertion errors found"
                  : compilingState === "success"
                  ? "Platform bundle initialized cleanly"
                  : "Evaluating static files within secure sandbox environment"}
              </p>
            </div>
          </div>

          {/* Progress Bar Container */}
          <div className="space-y-3 mb-6">
            <div className="flex items-center justify-between text-xs">
              <span className="font-mono bg-slate-950 px-2 py-0.5 rounded border border-slate-850 text-slate-400 text-[10px] font-bold tracking-tight">
                STATUS: {compilingState.toUpperCase()}
              </span>
              <span className="font-mono text-cyan-400 font-bold text-sm">
                {compilePercent}%
              </span>
            </div>

            {/* Progress track */}
            <div className="w-full h-2.5 bg-slate-950 border border-slate-850 rounded-full overflow-hidden p-[2px]">
              <motion.div
                className={`h-full rounded-full ${
                  compilingState === "failed"
                    ? "bg-gradient-to-r from-red-600 to-rose-400"
                    : compilingState === "success"
                    ? "bg-gradient-to-r from-emerald-600 to-green-400"
                    : "bg-gradient-to-r from-blue-600 via-cyan-400 to-purple-500"
                }`}
                initial={{ width: "0%" }}
                animate={{ width: `${compilePercent}%` }}
                transition={{ duration: 0.1, ease: "easeOut" }}
              />
            </div>

            {/* Current messaging line */}
            <div className="flex items-center gap-2 text-slate-300 text-xs">
              {compilingState === "running" && (
                <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin shrink-0" />
              )}
              <span className="font-mono text-[11px] leading-relaxed truncate block text-slate-300">
                {compileMessage || "Initializing asynchronous compilation queue..."}
              </span>
            </div>
          </div>

          {/* Operations Controls */}
          <div className="flex items-center justify-end gap-3 mt-4 border-t border-slate-850 pt-4">
            {compilingState === "failed" && (
              <button
                onClick={() => setCompilingState("idle")}
                id="dismiss-compiler-error-btn"
                className="px-4 py-2 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 font-semibold rounded-lg text-xs cursor-pointer transition-all"
              >
                Dismiss Error
              </button>
            )}

            {compilingState === "success" && (
              <button
                onClick={() => setCompilingState("idle")}
                id="done-compiler-success-btn"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-xs cursor-pointer transition-all border border-emerald-500/20"
              >
                Launch Workspace
              </button>
            )}

            {compilingState === "running" && (
              <span className="text-[10px] font-mono text-slate-500 animate-pulse uppercase">
                Asynchronous Task Locking Active...
              </span>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
