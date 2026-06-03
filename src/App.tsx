/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Bot, Code2, Terminal as TerminalIcon, Network, 
  BarChart3, Settings as SettingsIcon, PanelLeftClose, 
  PanelRightClose, FileJson, LayoutGrid, Smartphone, Laptop
} from 'lucide-react';
import { useAppStore } from './lib/store';
import { Chat } from './components/Chat';
import { Workspace } from './components/Workspace';
import { CompileOverlay } from './components/CompileOverlay';
import { InitializationDiagnostic } from './components/InitializationDiagnostic';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldAlert, Cpu } from 'lucide-react';
import { ResourceMonitor } from './components/ResourceMonitor';
import { CommandPalette } from './components/CommandPalette';
import { WorkspaceTour } from './components/WorkspaceTour';

export default function App() {
  const { 
    chatMessages, 
    swarmState, 
    yoloMode, 
    setYoloMode, 
    resetTelemetryStats, 
    clearTerminal 
  } = useAppStore();
  
  // Layout and view states
  const [isMobile, setIsMobile] = useState(false);
  const [activeMobileView, setActiveMobileView] = useState<'chat' | 'workspace'>('workspace');
  
  // Desktop panel selectors
  const [showRightChat, setShowRightChat] = useState(true);

  // Diagnostic states
  const [isInitialized, setIsInitialized] = useState(false);
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [apiReady, setApiReady] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [backgroundRetries, setBackgroundRetries] = useState(0);

  // Smooth visual progress bar indicator
  const [visualProgress, setVisualProgress] = useState(0);

  // Responsive breakpoints matching smaller screens like the Moto G7 Play (around 570px wide)
  useEffect(() => {
    const checkViewport = () => {
      setIsMobile(window.innerWidth < 820);
    };
    
    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  // Background exponential backoff ping to core health endpoint
  useEffect(() => {
    let active = true;
    let timer: NodeJS.Timeout;

    const performBackgroundPing = async (attempt: number) => {
      try {
        const res = await fetch('/api/health');
        if (res.ok && active) {
          setApiReady(true);
          // Let visualProgress run its smooth course to 100% to ensure zero instant-flash layout glitching
          return;
        }
      } catch (err) {
        // connection flatly offline, continue backoff schedule
      }

      if (active) {
        // backoff delay: 2^attempt * 500ms (max 6 seconds delay)
        const delay = Math.min(500 * Math.pow(2, attempt), 6000);
        timer = setTimeout(() => {
          setBackgroundRetries(attempt + 1);
        }, delay);
      }
    };

    if (!apiReady) {
      performBackgroundPing(backgroundRetries);
    }

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [backgroundRetries, apiReady]);

  // Smoothly increment visual loading progress
  useEffect(() => {
    if (isInitialized) return;
    
    const intervalTime = 20; // Butter tick: 50 times per second
    const duration = 1200; // Optimal 1.2s pace
    const step = 100 / (duration / intervalTime);
    
    const timer = setInterval(() => {
      setVisualProgress(prev => {
        if (prev >= 100) {
          clearInterval(timer);
          return 100;
        }
        
        // If API is not quite ready yet, hold or decelerate near 90%
        if (!apiReady && prev >= 90) {
          return 90;
        }
        
        const next = prev + step;
        return next > 100 ? 100 : next;
      });
    }, intervalTime);
    
    return () => clearInterval(timer);
  }, [apiReady, isInitialized]);

  // Smooth transition handshake trigger when progress compiles and API is verified
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (apiReady && visualProgress >= 100 && !isInitialized) {
      timer = setTimeout(() => {
        setIsInitialized(true);
      }, 150);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [apiReady, visualProgress, isInitialized]);

  // Overall 10 seconds timeout logic
  useEffect(() => {
    if (apiReady || isInitialized) return;

    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setShowDiagnostic(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [apiReady, isInitialized]);

  // Handle force loading or successful external checks
  const handleForceLoad = () => {
    setIsInitialized(true);
    setShowDiagnostic(false);
  };

  const handleStartupSuccess = () => {
    setApiReady(true);
    setIsInitialized(true);
    setShowDiagnostic(false);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#07090e]">
      <AnimatePresence mode="wait">
        {!isInitialized ? (
          showDiagnostic ? (
            <motion.div
              key="diagnostic"
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98, filter: "blur(6px)" }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="absolute inset-0 w-full h-full z-10"
            >
              <InitializationDiagnostic 
                onForceLoad={handleForceLoad}
                onStartupSuccess={handleStartupSuccess}
              />
            </motion.div>
          ) : (
            <motion.div
              key="splash"
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -10, filter: "blur(8px)" }}
              transition={{ duration: 0.45, ease: "easeInOut" }}
              className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-[#07090e] text-slate-100 font-sans select-none overflow-hidden z-10"
            >
              {/* Ambient aura glow */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-[10%] -left-[10%] w-[45%] h-[45%] rounded-full bg-blue-900/10 blur-[130px] animate-pulse" />
                <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:3rem_3rem]" />
              </div>

              <div className="max-w-md w-full px-6 text-center z-10 flex flex-col items-center">
                {/* Centered logo spinner */}
                <div className="relative w-16 h-16 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-6 group">
                  <div className="absolute inset-0 rounded-2xl border border-blue-500/40 animate-ping opacity-25" />
                  <Cpu className="w-7 h-7 text-blue-400 animate-pulse" />
                </div>

                <h2 className="text-sm font-black tracking-[0.2em] text-white uppercase font-display select-none">
                  CALIBRATING METRIC NETWORKS
                </h2>
                
                <p className="text-xs text-slate-400 mt-2 font-sans max-w-sm leading-relaxed">
                  Handshaking with sandboxed virtual environments and local memory registers...
                </p>

                {/* Graphical Loading Loop Bar */}
                <div className="w-full bg-[#111624] h-1.5 rounded-full mt-8 relative overflow-hidden border border-white/5">
                  <div 
                    style={{ width: `${Math.round(visualProgress)}%` }}
                    className="bg-blue-600 h-full rounded-full transition-all duration-75 ease-[cubic-bezier(0.1,0.85,0.25,1)]"
                  />
                </div>

                <div className="flex items-center justify-between w-full mt-3 text-[10px] font-mono text-slate-500">
                  <span>PORT 3000 / SYNC</span>
                  <span className="text-blue-400 font-bold">FAIL-SAFE TIMER ACTIVE: {countdown}s</span>
                </div>

                {/* Quick skip */}
                <button
                  onClick={handleForceLoad}
                  className="mt-6 px-4 py-1.5 bg-slate-900/60 hover:bg-slate-850 text-[10px] uppercase font-bold text-slate-400 hover:text-white rounded-lg border border-slate-800 hover:border-slate-700 transition-all cursor-pointer"
                >
                  Skip Calibration Validation
                </button>
              </div>
            </motion.div>
          )
        ) : (
          <motion.div
            key="workspace"
            initial={{ opacity: 0, scale: 0.992, filter: "blur(6px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 w-full h-full flex overflow-hidden bg-[#0a0d14] text-slate-100 font-sans selection:bg-blue-600/30 selection:text-blue-100 z-0"
          >
            {/* BACKGROUND FLUENT ACRYLIC EFFECTS */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
              {/* Soft Indigo Material glow top-left */}
              <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-indigo-900/15 blur-[120px]" />
              {/* Soft Blue Windows 11 Fluent glow bottom-right */}
              <div className="absolute -bottom-[20%] -right-[10%] w-[50%] h-[50%] rounded-full bg-blue-900/10 blur-[130px]" />
              {/* Decorative Grid Line System */}
              <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:4rem_4rem]" />
            </div>

            {/* MOBILE SHELL: Beautiful Android Studio / Bolt.diy Tabbed Layout */}
            {isMobile ? (
              <div className="flex flex-col h-full w-full z-10">
                
                {/* Header Bar */}
                <header className="flex items-center justify-between px-4 py-3 bg-[#0d121f]/90 backdrop-blur-md border-b border-white/5 shadow-md">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-blue-400 animate-pulse" />
                    </div>
                    <span className="font-bold tracking-tight text-sm text-slate-200">
                      OpenAgent Studio <span className="text-[10px] bg-blue-600/20 text-blue-400 px-1.5 py-0.5 rounded font-mono border border-blue-500/25 ml-1">v1.1</span>
                    </span>
                  </div>
                  
                  {/* Swarm State badge */}
                  {swarmState.activeAgent && (
                    <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full text-[10px] text-emerald-400 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                      <span>{swarmState.activeAgent} running</span>
                    </div>
                  )}
                </header>

                {/* Main Mobile Viewport */}
                <main className="flex-1 min-h-0 relative overflow-hidden">
                  <AnimatePresence mode="wait">
                    {activeMobileView === 'chat' ? (
                      <motion.div 
                        key="chat-view"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.15 }}
                        className="h-full w-full bg-[#070a12]/50"
                      >
                      <Chat />
                      </motion.div>
                    ) : (
                      <motion.div 
                        key="workspace-view"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.15 }}
                        className="h-full w-full bg-[#0a0d14]"
                      >
                        <Workspace />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </main>

                {/* Windows 11 Mica-style Bottom Tab Bar */}
                <nav className="bg-[#0b0f19]/95 backdrop-blur-lg border-t border-white/5 py-2 px-6 flex items-center justify-around shadow-[0_-8px_30px_rgba(0,0,0,0.5)] z-20">
                  <button
                    onClick={() => setActiveMobileView('workspace')}
                    className={`flex flex-col items-center gap-1 py-1 px-4 rounded-xl transition-all ${
                      activeMobileView === 'workspace' 
                        ? 'bg-blue-600/15 text-blue-400 font-semibold border border-blue-500/15' 
                        : 'text-slate-400'
                    }`}
                  >
                    <Code2 className="w-5 h-5" />
                    <span className="text-[10px]">Build Mode</span>
                  </button>

                  <button
                    onClick={() => setActiveMobileView('chat')}
                    className={`flex flex-col items-center gap-1 py-1 px-4 rounded-xl transition-all relative ${
                      activeMobileView === 'chat' 
                        ? 'bg-blue-600/15 text-blue-400 font-semibold border border-blue-500/15' 
                        : 'text-slate-400'
                    }`}
                  >
                    <Bot className="w-5 h-5" />
                    {swarmState.activeAgent && (
                      <span className="absolute top-1 right-5 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                      </span>
                    )}
                    <span className="text-[10px]">Copilot Chat</span>
                  </button>
                </nav>

              </div>
            ) : (
              /* DESKTOP SHELL: VS Code Side-by-Side Dual Pane Style with Right-Sided Copilot Chat Panel */
              <div className="flex h-full w-full z-10">
                
                {/* Main center workspace column container */}
                <div className="flex-1 flex flex-col h-full min-w-0 bg-[#0d1017]">
                  {/* Fluent Windows 11 Acrylic Header bar */}
                  <header className="flex items-center justify-between px-5 h-12 bg-[#090b11]/90 backdrop-blur-md border-b border-white/5 z-20">
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-md bg-[#161d2a] flex items-center justify-center border border-white/5">
                        <Bot className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-200 tracking-tight">OpenAgent Studio</span>
                        <span className="text-[9px] bg-blue-600/10 text-blue-400 border border-blue-500/20 px-1 py-0.2 rounded font-mono">v1.1</span>
                      </div>
                    </div>

                    {/* Status metrics bar */}
                    <div className="hidden lg:flex items-center gap-4 text-xs text-slate-400">
                      {swarmState.activeAgent && (
                        <div className="flex items-center gap-2 bg-[#121c16] border border-emerald-500/20 py-0.5 px-2.5 rounded-full text-[10px] text-emerald-400 font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                          <span>Swarm Agent: {swarmState.activeAgent}</span>
                        </div>
                      )}
                      {swarmState.health && (
                        <div className="flex items-center gap-1.5 bg-[#171c26] border border-white/5 py-0.5 px-2.5 rounded-full text-[10px] text-slate-300">
                          <span className={`w-1.5 h-1.5 rounded-full ${swarmState.health === 'good' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                          <span>Swarm Status: {swarmState.health}</span>
                        </div>
                      )}
                      <ResourceMonitor />
                    </div>

                    {/* Toggle Side Panels toolbar */}
                    <div className="flex items-center gap-2">
                      <CommandPalette 
                        onToggleChat={() => setShowRightChat(prev => !prev)}
                        onRestartTour={() => window.dispatchEvent(new CustomEvent("restart-workspace-tour"))}
                        isYoloMode={yoloMode}
                        onToggleYoloMode={() => setYoloMode(!yoloMode)}
                        onClearLogs={() => {
                          resetTelemetryStats();
                          clearTerminal();
                        }}
                      />
                      <button
                        onClick={() => setShowRightChat(!showRightChat)}
                        title={showRightChat ? "Hide Copilot Chat" : "Show Copilot Chat"}
                        className={`p-1.5 rounded-md hover:bg-slate-800 border transition-all cursor-pointer ${
                          showRightChat 
                            ? 'bg-blue-600/15 border-blue-500/30 text-blue-400' 
                            : 'border-white/5 text-slate-400'
                        }`}
                      >
                        <PanelRightClose className="w-4 h-4" />
                      </button>
                    </div>
                  </header>

                  {/* Workplace Content Frame */}
                  <div className="flex-1 min-h-0 relative">
                    <Workspace />
                  </div>
                </div>

                {/* DOCKED COPILOT PANEL ON THE RIGHT (VS CODE STYLE) */}
                <AnimatePresence mode="popLayout">
                  {showRightChat && (
                    <motion.aside
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: 380, opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      transition={{ type: "spring", damping: 25, stiffness: 180 }}
                      className="h-full border-l border-white/5 bg-[#090b11] shrink-0 z-20 shadow-[-10px_0_30px_rgba(0,0,0,0.3)] flex flex-col overflow-hidden"
                    >
                      <Chat />
                    </motion.aside>
                  )}
                </AnimatePresence>

              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Real-time compilation & container-startup status HUD overlay */}
      <CompileOverlay />

      {/* Interactive Getting Started tour highlight guide */}
      <WorkspaceTour />
    </div>
  );
}
