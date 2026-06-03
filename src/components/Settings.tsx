// File: src/components/Settings.tsx

import React, { useState } from 'react';
import { useAppStore } from '../lib/store';
import { Settings as SettingsIcon, ShieldCheck, Database, HardDrive, Wifi, Sliders, Key, Zap } from 'lucide-react';

export const Settings: React.FC = () => {
  const { metrics, swarmState, openRouterKey, setOpenRouterKey, yoloMode, setYoloMode } = useAppStore();
  const [throttleLimit, setThrottleLimit] = useState(3000);
  const [mockClusterLoc, setMockClusterLoc] = useState('us-east1-gcp');

  return (
    <div id="settings-panel-container" className="bg-slate-900 rounded-2xl border border-slate-800 p-4 md:p-6 space-y-6 font-sans">
      
      {/* Settings Panel Header banner */}
      <div className="flex items-center gap-2.5 border-b border-slate-800 pb-4">
        <div className="p-1.5 bg-slate-950 border border-slate-850 text-slate-400 rounded-lg">
          <SettingsIcon className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-100 font-display">System Controls & Constants</h3>
          <p className="text-[11px] text-slate-400">Configure simulated variables for testing full-stack telemetry and limits.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Left column sliders */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Sliders className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">Telemetry Limits</span>
          </div>

          <div className="space-y-1.5 bg-slate-950 p-3 rounded-lg border border-slate-850">
            <div className="flex justify-between items-center mb-1 text-[11px] font-mono">
              <span className="text-slate-400 flex items-center gap-1.5 font-bold"><Key className="w-3 h-3 text-emerald-400"/> API KEY:</span>
            </div>
            <input
              type="password"
              value={openRouterKey}
              onChange={e => setOpenRouterKey(e.target.value)}
              placeholder="sk-or-v1-..."
              className="w-full bg-slate-900 border border-slate-800 text-slate-300 rounded-lg p-1.5 text-xs focus:outline-none focus:border-emerald-600 font-mono"
            />
            <p className="text-[9px] text-slate-500">Required: OpenRouter API key for live LLM streaming.</p>
          </div>

          <div className="space-y-1.5 bg-slate-950 p-3 rounded-lg border border-slate-850 flex items-start gap-3">
             <div className="mt-1">
               <input 
                 type="checkbox" 
                 checked={yoloMode}
                 onChange={e => setYoloMode(e.target.checked)}
                 className="accent-amber-500 w-3.5 h-3.5 cursor-pointer"
               />
             </div>
             <div>
               <div className="text-[11px] font-mono text-amber-400 font-bold uppercase mb-0.5 flex items-center gap-1">
                  <Zap className="w-3 h-3"/> YOLO Mode (Auto-Accept)
               </div>
               <p className="text-[9px] text-slate-500 leading-tight">When enabled, the LangGraph swarm will instantly overwrite local module assets without generating proposed changes for manual UI review.</p>
             </div>
          </div>
          
          {/* Cluster configuration option */}
          <div className="space-y-1.5 bg-slate-950 p-3 rounded-lg border border-slate-850">
            <div className="text-[11px] font-mono text-slate-400 font-bold uppercase mb-1.5">Deploy Region Context:</div>
            <select
              value={mockClusterLoc}
              onChange={e => setMockClusterLoc(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 text-slate-300 rounded-lg p-1.5 text-xs focus:outline-none focus:border-slate-600 cursor-pointer"
            >
              <option value="us-east1-gcp">us-east1 (Google Cloud Run Container)</option>
              <option value="us-west2-gcp">us-west2 (Silicon Valley Core Network)</option>
              <option value="eu-west1-gcp">eu-west1 (Dublin Server Node)</option>
            </select>
            <p className="text-[9px] text-slate-500">Switches simulated telemetry logging geolocation and timezone alignment.</p>
          </div>
        </div>

        {/* Right column system pipeline details */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">Compliance Pipeline status</span>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 divide-y divide-slate-900">
            
            <div className="pb-2.5 flex items-center justify-between text-xs">
              <span className="text-slate-500 flex items-center gap-1.5"><Wifi className="w-3.5 h-3.5 text-blue-400" /> Ping Status</span>
              <span className="font-mono text-[11px] font-bold text-emerald-400">ACTIVE ({metrics.networkLatency}ms)</span>
            </div>

            <div className="py-2.5 flex items-center justify-between text-xs">
              <span className="text-slate-500 flex items-center gap-1.5"><Database className="w-3.5 h-3.5 text-purple-400" /> DB Connection</span>
              <span className="font-mono text-[11px] font-bold text-emerald-400">GOOD (POOLED_10)</span>
            </div>

            <div className="pt-2.5 flex items-center justify-between text-xs">
              <span className="text-slate-500 flex items-center gap-1.5"><HardDrive className="w-3.5 h-3.5 text-amber-400" /> Storage Sandbox</span>
              <span className="font-mono text-[11px] font-bold text-slate-300">MOUNTED (6.4GB free)</span>
            </div>

          </div>
        </div>

      </div>

    </div>
  );
};
