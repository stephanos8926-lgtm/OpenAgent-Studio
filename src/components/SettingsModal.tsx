// File: src/components/SettingsModal.tsx

import React, { useState, useEffect } from 'react';
import { useAppStore } from '../lib/store';
import { motion, AnimatePresence } from 'motion/react';
import { Settings as SettingsIcon, X, Key, Sliders, Database, HardDrive, Wifi, ShieldCheck, Zap } from 'lucide-react';

interface SettingsModalProps {
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const { 
    metrics, 
    openRouterKey, 
    setOpenRouterKey, 
    yoloMode, 
    setYoloMode, 
    modelName, 
    setModelName, 
    apiProvider, 
    setApiProvider 
  } = useAppStore();

  const [availableModels, setAvailableModels] = useState<{id: string, name: string}[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const fetchModels = async () => {
    setIsLoadingModels(true);
    setErrorText(null);
    setAvailableModels([]); // Clear current list on start of fetch

    try {
      const res = await fetch(`/api/models?provider=${apiProvider}`);
      const data = await res.json();
      if (data.success && data.models) {
        const newModels = data.models;
        setAvailableModels(newModels);
        
        // If current model isn't in new list, reset to first or empty
        if (newModels.length > 0 && !newModels.find((m: any) => m.id === modelName)) {
           setModelName(newModels[0].id);
        } else if (newModels.length === 0) {
           setModelName('');
        }
      } else {
        throw new Error("Failed to fetch model list.");
      }
    } catch (e: any) {
      setErrorText(e?.message || "Failed to fetch model list.");
    } finally {
      setIsLoadingModels(false);
    }
  };

  useEffect(() => {
    // Reset model name when provider changes before fetching
    setModelName('');
    fetchModels();
  }, [apiProvider]);

  // Close on Escape modal keypress
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-[#020408]/80 backdrop-blur-md"
      />

      {/* Modal Card */}
      <motion.div
        initial={{ scale: 0.95, y: 15, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, y: 15, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        className="relative bg-[#0d1117] border border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 overflow-hidden z-10 text-left font-sans select-none"
      >
        {/* Glow accent */}
        <div className="absolute top-0 left-[10%] right-[10%] h-[1px] bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />

        {/* Header toolbar */}
        <div className="flex items-center justify-between mb-6 border-b border-gray-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#161b22] border border-gray-800 text-indigo-400 rounded-lg">
              <SettingsIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-100">Connection Settings</h3>
              <p className="text-xs text-gray-400">Configure real LLM providers & operational modes</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-[#161b22] border border-transparent hover:border-gray-805 rounded-lg text-gray-400 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Inputs Context */}
        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest font-mono flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-indigo-400" /> Active API Agent Provider
            </label>
            <select
              value={apiProvider}
              onChange={e => setApiProvider(e.target.value as 'google' | 'openrouter')}
              className="w-full bg-[#161b22] border border-gray-800 hover:border-gray-700 text-gray-200 rounded-lg p-2.5 text-xs focus:outline-none focus:border-indigo-600 transition-all font-mono"
            >
              <option value="google">Google Gemini API Endpoint</option>
              <option value="openrouter">OpenRouter Server API</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest font-mono flex items-center gap-2">
              <Key className="w-3.5 h-3.5 text-indigo-400" /> Endpoint Authorizations (Key)
            </label>
            <div className="relative">
              <input
                type="password"
                value={openRouterKey}
                onChange={e => setOpenRouterKey(e.target.value)}
                placeholder={apiProvider === 'google' ? "AIzaSy..." : "sk-or-v1-..."}
                className="w-full bg-[#161b22] border border-gray-800 text-gray-200 rounded-lg p-2.5 text-xs focus:outline-none focus:border-indigo-600 font-mono"
              />
            </div>
            <p className="text-[10px] text-gray-500">Provide a secure personal provider token. Stored completely in memory.</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest font-mono">
                Model Allocation
              </label>
              {errorText && (
                <span className="text-[10px] text-red-400 font-mono font-semibold">{errorText}</span>
              )}
            </div>
            <div className="flex gap-2">
              <select
                value={modelName}
                onChange={e => setModelName(e.target.value)}
                className="flex-1 bg-[#161b22] border border-gray-800 text-gray-200 rounded-lg p-2.5 text-xs focus:outline-none focus:border-indigo-600 font-mono"
              >
                {availableModels.map(model => (
                  <option key={model.id} value={model.id}>{model.name}</option>
                ))}
              </select>
              <button
                onClick={fetchModels}
                disabled={isLoadingModels}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 text-white font-bold rounded-lg text-xs transition-all cursor-pointer shadow-sm"
              >
                {isLoadingModels ? 'Fetching...' : 'Query API'}
              </button>
            </div>
          </div>

          {/* YOLO Mode toggle */}
          <div className="p-3 bg-[#161b22]/50 border border-gray-800/80 rounded-xl flex items-start gap-3">
            <input 
              id="yolo-mode-modal"
              type="checkbox"
              checked={yoloMode}
              onChange={e => setYoloMode(e.target.checked)}
              className="mt-1 accent-indigo-500 w-4 h-4 cursor-pointer"
            />
            <label htmlFor="yolo-mode-modal" className="select-none cursor-pointer">
              <span className="text-xs font-bold text-indigo-400 font-mono uppercase flex items-center gap-1.5 leading-none mb-1">
                <Zap className="w-3.5 h-3.5" /> High-Velocity Execution mode (YOLO)
              </span>
              <p className="text-[10px] text-gray-400 leading-normal">
                Skips HMR code diff proposals to instantly execute and commit agent code modifications to the workspace memory loop directly.
              </p>
            </label>
          </div>

          {/* Active Nodes compliance monitoring */}
          <div className="bg-[#161b22]/30 p-4 border border-gray-800/60 rounded-xl divide-y divide-gray-800/40">
            <div className="pb-2 flex items-center justify-between text-xs">
              <span className="text-gray-400 flex items-center gap-1.5"><Wifi className="w-4 h-4 text-emerald-400" /> Port Pipeline Channel</span>
              <span className="font-mono text-[11px] text-emerald-400 font-bold">Good ({metrics.networkLatency}ms)</span>
            </div>
            <div className="py-2 flex items-center justify-between text-xs">
              <span className="text-gray-400 flex items-center gap-1.5"><Database className="w-4 h-4 text-cyan-400" /> Database Stack</span>
              <span className="font-mono text-[11px] text-emerald-400 font-bold">PROD_ACTIVE</span>
            </div>
            <div className="pt-2 flex items-center justify-between text-xs">
              <span className="text-gray-400 flex items-center gap-1.5"><HardDrive className="w-4 h-4 text-blue-400" /> VFS Secure Cache</span>
              <span className="font-mono text-[11px] text-gray-300">COMPRESSED_BLOCK</span>
            </div>
          </div>
        </div>

        {/* Footer toolbar */}
        <div className="mt-8 pt-4 border-t border-gray-800 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#161b22] hover:bg-[#21262d] border border-gray-700 hover:border-gray-600 text-gray-200 font-bold rounded-lg text-xs transition-all cursor-pointer"
          >
            Done
          </button>
        </div>
      </motion.div>
    </div>
  );
};
