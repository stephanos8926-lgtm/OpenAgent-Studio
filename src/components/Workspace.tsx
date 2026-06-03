// File: src/components/Workspace.tsx

import React, { useState } from 'react';
import { useAppStore } from '../lib/store';
import { FileTree } from './FileTree';
import { EditorPanel } from './EditorPanel';
import { PreviewPanel } from './PreviewPanel';
import { SwarmConsole } from './SwarmConsole';
import { TelemetryDashboard } from './TelemetryDashboard';
import { TerminalPanel } from './TerminalPanel';
import { Chat } from './Chat';
import { Settings } from './Settings';
import { ErrorBoundary } from './ErrorBoundary';
import { AlphaDashboard } from './AlphaDashboard';
import { 
  Network, 
  Terminal, 
  Activity, 
  Settings as SettingsIcon, 
  Cpu, 
  Play, 
  Layers, 
  Bot, 
  Bug,
  LayoutGrid, Rocket
} from 'lucide-react';

export const Workspace: React.FC = () => {
  const { metrics, compilingState, simulateCompileAction } = useAppStore();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'code' | 'swarm' | 'telemetry' | 'settings'>('dashboard');

  return (
    <div className="flex-1 flex flex-col bg-slate-900 text-slate-100 min-h-screen font-sans">
      
      {/* Prime Header Block */}
      <header className="bg-slate-950 border-b border-slate-850 px-6 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-4 select-none">
        
        {/* Left branding */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-600/10 border border-blue-500/25 rounded-xl text-blue-400">
            <Cpu className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm font-black tracking-widest text-white uppercase font-display">DeepAgent</h1>
              <span className="bg-blue-900/30 text-blue-400 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded border border-blue-500/20">
                ALPHA V0.1
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-sans mt-0.5">Autonomous Swarm Development IDE.</p>
          </div>
        </div>

        {/* Global Toolbar buttons */}
        <div className="flex items-center gap-3">
          
          {/* Quick build triggers */}
          <button
            onClick={() => simulateCompileAction(false)}
            disabled={compilingState === 'running'}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 text-white border border-blue-500/15 rounded-lg text-xs font-bold flex items-center gap-2 cursor-pointer transition-all shadow-md shadow-blue-950/20"
          >
            <Play className={`w-3.5 h-3.5 ${compilingState === 'running' ? 'animate-spin' : ''}`} />
            {compilingState === 'running' ? 'Compiling Bundle...' : 'Recompile App'}
          </button>

          {/* Core integrity indicator */}
          <div className="hidden md:flex items-center gap-2.5 bg-slate-900 border border-slate-850 p-1.5 px-3.5 rounded-lg">
            <span className={`w-2 h-2 rounded-full ${metrics.health === 'good' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500 animate-pulse'}`} />
            <span className="text-[10px] font-mono text-slate-400 font-semibold uppercase">
              GRID HEALTH: {metrics.health.toUpperCase()}
            </span>
          </div>

        </div>

      </header>

      {/* Main Multi-Panel Workspace Area Grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 p-4 md:p-6 overflow-hidden">
        
        {/* Left Side Tree Navigation Rail */}
        <div className="lg:col-span-3 bg-slate-950 border border-slate-850 p-4 rounded-2xl flex flex-col h-full min-h-[160px] lg:min-h-0">
          <ErrorBoundary componentName="FileTree">
            <FileTree />
          </ErrorBoundary>
        </div>

        {/* Central Core Content Deck Area */}
        <div className="lg:col-span-9 flex flex-col space-y-5 h-full">
          
          {/* Tab switches */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-850 self-start select-none">
            
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'dashboard' 
                  ? 'bg-slate-900 text-white font-black shadow-inner border border-slate-800' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Rocket className="w-3.5 h-3.5" />
              Overview
            </button>

            <button
              onClick={() => setActiveTab('code')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'code' 
                  ? 'bg-slate-900 text-cyan-400 font-black shadow-inner border border-slate-800' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Code Workspace
            </button>

            <button
              onClick={() => setActiveTab('swarm')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'swarm' 
                  ? 'bg-slate-900 text-blue-400 font-black shadow-inner border border-slate-800' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Network className="w-3.5 h-3.5 animate-pulse" />
              Swarm Vision
            </button>

            <button
              onClick={() => setActiveTab('telemetry')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'telemetry' 
                  ? 'bg-slate-900 text-purple-400 font-black shadow-inner border border-slate-800' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              Telemetry Analyzer
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'settings' 
                  ? 'bg-slate-900 text-slate-100 font-black shadow-inner border border-slate-800' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <SettingsIcon className="w-3.5 h-3.5" />
              Controls
            </button>

          </div>

          {/* Active View render block wrapped in robust ErrorBoundaries */}
          <div className="flex-1">
            {activeTab === 'dashboard' && (
              <ErrorBoundary componentName="AlphaDashboard">
                <AlphaDashboard />
              </ErrorBoundary>
            )}
            {activeTab === 'code' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 h-full">
                {/* Wrapped Editor Panel */}
                <div className="h-full">
                  <ErrorBoundary componentName="EditorPanel">
                    <EditorPanel />
                  </ErrorBoundary>
                </div>
                {/* Wrapped Sandbox Viewport */}
                <div className="h-full">
                  <ErrorBoundary componentName="PreviewPanel">
                    <PreviewPanel />
                  </ErrorBoundary>
                </div>
              </div>
            )}

            {activeTab === 'swarm' && (
              <ErrorBoundary componentName="SwarmConsole">
                <SwarmConsole />
              </ErrorBoundary>
            )}

            {activeTab === 'telemetry' && (
              <ErrorBoundary componentName="TelemetryDashboard">
                <TelemetryDashboard />
              </ErrorBoundary>
            )}

            {activeTab === 'settings' && (
              <ErrorBoundary componentName="Settings">
                <Settings />
              </ErrorBoundary>
            )}
          </div>

          {/* Bottom Panel Split Screen (Interactive Shell & Agents Comm bus side-by-side) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="h-56">
              <ErrorBoundary componentName="TerminalPanel">
                <TerminalPanel />
              </ErrorBoundary>
            </div>
            <div className="h-56">
              <ErrorBoundary componentName="Chat">
                <Chat />
              </ErrorBoundary>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
