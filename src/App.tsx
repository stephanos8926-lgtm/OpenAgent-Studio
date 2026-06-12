/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Suspense } from 'react';
import { 
  Bot, Code2, Terminal as TerminalIcon, Network, 
  BarChart3, Settings as SettingsIcon, PanelLeftClose, 
  PanelRightClose, FileJson, LayoutGrid, Smartphone, Laptop,
  ShieldAlert, Cpu
} from 'lucide-react';
import { useAppStore } from './lib/store';
import { CompileOverlay } from './components/CompileOverlay';
import { InitializationDiagnostic } from './components/InitializationDiagnostic';
import { motion, AnimatePresence } from 'motion/react';
import { ResourceMonitor } from './components/ResourceMonitor';
import { CommandPalette } from './components/CommandPalette';
import { WorkspaceTour } from './components/WorkspaceTour';
import { NotificationProvider } from './hooks/useNotifications';
import { NotificationOverlay } from './components/NotificationOverlay';
import { Chat } from './components/Chat';
import { Workspace } from './components/Workspace';
import { SettingsModal } from './components/SettingsModal';

export default function App() {
  // Lazy load dashboard manually to bypass Suspense conflicts with zone.js
  const [DashboardModule, setDashboardModule] = useState<any>(null);
  
  useEffect(() => {
    import('./components/LangGraphDashboard').then((m) => {
      setDashboardModule(() => m.LangGraphDashboard);
    }).catch(err => {
      console.error("Failed to load LangGraphDashboard chunk", err);
    });
  }, []);

  const { 
    chatMessages, 
    swarmState, 
    yoloMode, 
    setYoloMode, 
    resetTelemetryStats, 
    clearTerminal,
    showSettingsModal,
    setShowSettingsModal
  } = useAppStore();
  
  // Layout and view states
  const [isMobile, setIsMobile] = useState(false);
  const [activeMobileView, setActiveMobileView] = useState<'chat' | 'workspace'>('workspace');
  
  // Desktop panel selectors
  const [showRightChat, setShowRightChat] = useState(true);
  const [showDashboard, setShowDashboard] = useState(false);

  // Diagnostic states
  const [isInitialized, setIsInitialized] = useState(false);
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [apiReady, setApiReady] = useState(false);
  const [visualProgress, setVisualProgress] = useState(0);

  // Hook global errors early to trigger the diagnostic screen
  useEffect(() => {
    const handleGlobalError = (event: ErrorEvent | PromiseRejectionEvent) => {
      setShowDiagnostic(true);
      // Wait for it to show up, then dispatch a custom event if we want InitializationDiagnostic to pick it up,
      // but InitializationDiagnostic also registers its own hooks. By the time it mounts, the error already happened.
      // We will let the earlier index.html grab the telemetry.
    };
    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handleGlobalError);
    return () => {
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handleGlobalError);
    };
  }, []);

  // Responsive breakpoints
  useEffect(() => {
    const checkViewport = () => {
      setIsMobile(window.innerWidth < 820);
    };
    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  // Soft initialization timeout (don't stay on splash forever)
  useEffect(() => {
    const timer = setTimeout(() => {
      setApiReady(true); // Soft-pass health check
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  // Background ping to core health endpoint (non-blocking)
  useEffect(() => {
    let active = true;
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok && active) {
          setApiReady(true);
        }
      } catch (err) {
        // ignore
      }
    };
    checkHealth();
    return () => { active = false; };
  }, []);

  // Smoothly increment visual loading progress
  useEffect(() => {
    if (isInitialized) return;
    const interval = setInterval(() => {
      setVisualProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        // Decelerate near end
        const step = prev > 80 ? 0.5 : 2;
        return Math.min(100, prev + step);
      });
    }, 20);
    return () => clearInterval(interval);
  }, [isInitialized]);

  // Transition to workspace
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (visualProgress >= 100 && !isInitialized) {
      timer = setTimeout(() => setIsInitialized(true), 200);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [visualProgress, isInitialized]);

  // Force loading handle
  const handleForceLoad = () => setIsInitialized(true);

  const handleStartupSuccess = () => {
    setApiReady(true);
    setIsInitialized(true);
    setShowDiagnostic(false);
  };

  return (
    <NotificationProvider>
      <div className="relative w-screen h-screen overflow-hidden bg-[#0a0c10]">
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
              className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-[#0a0c10] text-slate-100 font-sans select-none overflow-hidden z-10"
            >
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-[10%] -left-[10%] w-[45%] h-[45%] rounded-full bg-indigo-500/5 blur-[130px] animate-pulse" />
                <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:3rem_3rem]" />
              </div>

              <div className="max-w-md w-full px-6 text-center z-10 flex flex-col items-center">
                <div className="relative w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-6 group">
                  <div className="absolute inset-0 rounded-2xl border border-indigo-500/40 animate-ping opacity-25" />
                  <Cpu className="w-7 h-7 text-indigo-400 animate-pulse" />
                </div>

                <h2 className="text-xs font-black tracking-[0.3em] text-white uppercase select-none opacity-80">
                  Initializing Core Infrastructure
                </h2>
                
                <p className="text-[10px] text-slate-500 mt-2 font-sans max-w-sm tracking-tight">
                  Handshaking with sandboxed virtual environments and telemetry registers...
                </p>

                <div className="w-full bg-slate-900/50 h-1 rounded-full mt-8 relative overflow-hidden border border-white/5">
                  <div 
                    style={{ width: `${Math.round(visualProgress)}%` }}
                    className="bg-indigo-500 h-full rounded-full transition-all duration-75 ease-[cubic-bezier(0.1,0.85,0.25,1)]"
                  />
                </div>

                <div className="flex items-center justify-between w-full mt-3 text-[9px] font-mono text-slate-600">
                  <span className="uppercase tracking-widest">Runtime: Node/V8</span>
                  <span className="text-indigo-400 font-bold uppercase tracking-widest">Loading...</span>
                </div>
              </div>
            </motion.div>
          )
        ) : (
          <motion.div
            key="workspace"
            initial={{ opacity: 0, filter: "blur(6px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            className="absolute inset-0 w-full h-full flex overflow-hidden bg-[#0a0c10] text-slate-200 font-sans z-0"
          >
            {isMobile ? (
              <div className="flex flex-col h-full w-full z-10">
                <header className="flex items-center justify-between px-4 py-3 bg-[#0a0c10] border-b border-white/5 shadow-md">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-indigo-400" />
                    </div>
                    <span className="font-bold tracking-tight text-sm text-slate-100">
                      OpenAgent Studio
                    </span>
                  </div>
                  
                  {swarmState.activeAgent && (
                    <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full text-[10px] text-emerald-400 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                      <span>{swarmState.activeAgent}</span>
                    </div>
                  )}
                </header>

                <main className="flex-1 min-h-0 relative overflow-hidden">
                  <AnimatePresence mode="wait">
                    {activeMobileView === 'chat' ? (
                      <motion.div 
                        key="chat-view"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="h-full w-full"
                      >
                        <Chat />
                      </motion.div>
                    ) : (
                      <motion.div 
                        key="workspace-view"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="h-full w-full"
                      >
                        <Workspace />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </main>

                <nav className="bg-[#0b0c10] border-t border-white/5 py-2 px-6 flex items-center justify-around z-20">
                  <button
                    onClick={() => setActiveMobileView('workspace')}
                    className={`flex flex-col items-center gap-1 py-1 px-4 rounded-xl transition-all ${
                      activeMobileView === 'workspace' ? 'text-indigo-400' : 'text-slate-500'
                    }`}
                  >
                    <Code2 className="w-5 h-5" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Build</span>
                  </button>

                  <button
                    onClick={() => setActiveMobileView('chat')}
                    className={`flex flex-col items-center gap-1 py-1 px-4 rounded-xl transition-all relative ${
                      activeMobileView === 'chat' ? 'text-indigo-400' : 'text-slate-500'
                    }`}
                  >
                    <Bot className="w-5 h-5" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Copilot</span>
                  </button>
                </nav>
              </div>
            ) : (
              <div className="flex h-full w-full z-10 overflow-hidden divide-x divide-white/5">
                {/* IDE Side (Left) */}
                <div className="flex-1 flex flex-col h-full min-w-0 bg-[#0a0c10]">
                  <header className="flex items-center justify-between px-5 h-12 border-b border-white/5 z-20">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-md bg-indigo-600/10 flex items-center justify-center border border-indigo-500/20">
                        <Bot className="w-3.5 h-3.5 text-indigo-400" />
                      </div>
                      <span className="text-xs font-bold text-slate-100 uppercase tracking-[0.2em] opacity-80">OpenAgent Studio</span>
                    </div>

                    <div className="flex items-center gap-4 text-xs">
                      {swarmState.activeAgent && (
                        <div className="flex items-center gap-2 bg-emerald-500/5 py-0.5 px-3 rounded-full text-[10px] text-emerald-400 border border-emerald-500/10 font-bold uppercase tracking-widest">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span>{swarmState.activeAgent}</span>
                        </div>
                      )}
                      <ResourceMonitor />
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowDashboard(true)}
                        title="Open Agent Workspace & Performance Hub"
                        className="p-1.5 rounded-md hover:bg-slate-900 transition-all text-slate-500 hover:text-indigo-400"
                        aria-label="Agent Workspace and Performance Hub"
                      >
                        <Network className="w-4 h-4" />
                      </button>
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
                        className={`p-1.5 rounded-md hover:bg-slate-900 transition-all ${
                          showRightChat ? 'text-indigo-400' : 'text-slate-500'
                        }`}
                      >
                        <PanelRightClose className="w-4 h-4" />
                      </button>
                    </div>
                  </header>

                  <div className="flex-1 min-h-0 relative">
                    <Workspace />
                  </div>
                </div>

                {/* Copilot Chat (Right) */}
                <AnimatePresence mode="popLayout">
                  {showRightChat && (
                    <motion.aside
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: 400, opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      className="h-full bg-[#0d0f14] shrink-0 z-20 flex flex-col overflow-hidden"
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

      <CompileOverlay />
      <WorkspaceTour />
      {showDashboard && DashboardModule && <DashboardModule onClose={() => setShowDashboard(false)} />}
      <AnimatePresence>
        {showSettingsModal && (
          <SettingsModal onClose={() => setShowSettingsModal(false)} />
        )}
      </AnimatePresence>
      <NotificationOverlay />
    </div>
  </NotificationProvider>
);
}
