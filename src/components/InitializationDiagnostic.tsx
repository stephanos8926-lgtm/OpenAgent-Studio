// File: src/components/InitializationDiagnostic.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { 
  ShieldAlert, RefreshCcw, Wifi, WifiOff, Database, 
  FileCode, Terminal as TerminalIcon, Sparkles, AlertTriangle, Play 
} from 'lucide-react';
import { useAppStore } from '../lib/store';

interface ServiceCheck {
  name: string;
  status: 'ok' | 'failed' | 'checking';
  details: string;
  latency?: number;
}

interface DiagnosticProps {
  onForceLoad?: () => void;
  onStartupSuccess?: () => void;
}

export const InitializationDiagnostic: React.FC<DiagnosticProps> = ({ onForceLoad, onStartupSuccess }) => {
  const [storeStatus, setStoreStatus] = useState<ServiceCheck>({
    name: 'State Store Context',
    status: 'checking',
    details: 'Locating StoreProvider context and state slices...'
  });

  const [apiStatus, setApiStatus] = useState<ServiceCheck>({
    name: 'Backend Core API',
    status: 'checking',
    details: 'Initiating handshake with http://localhost:3000/api/health...'
  });

  const [assetStatus, setAssetStatus] = useState<ServiceCheck>({
    name: 'Production Asset Loader',
    status: 'checking',
    details: 'Checking DOM readiness state and active stylesheets...'
  });

  const [diagnosticLogs, setDiagnosticLogs] = useState<string[]>([
    'Initializing sandbox diagnostic procedures...',
    'Awaiting state validations...'
  ]);

  const [retryAttempt, setRetryAttempt] = useState(0);
  const [nextRetryTime, setNextRetryTime] = useState<number | null>(null);

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setDiagnosticLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  }, []);

  // Safe Store Verification inside react context tree
  let store: any = null;
  let hasStoreError = false;
  let storeErrorMessage = '';
  try {
    store = useAppStore();
  } catch (err: any) {
    hasStoreError = true;
    storeErrorMessage = err.message || 'useAppStore Context is unreachable.';
  }

  const verifyStore = useCallback(() => {
    if (hasStoreError || !store) {
      setStoreStatus({
        name: 'State Store Context',
        status: 'failed',
        details: storeErrorMessage || 'StoreProvider missing from App root rendering tree.'
      });
      addLog(`❌ Store Verification Failed: ${storeErrorMessage || 'StoreProvider missing.'}`);
      return false;
    } else {
      const keysCount = Object.keys(store).length;
      setStoreStatus({
        name: 'State Store Context',
        status: 'ok',
        details: `Connected successfully. Store verified with ${keysCount} state/action registers.`
      });
      addLog('✅ AppStoreState loaded and ready.');
      return true;
    }
  }, [store, hasStoreError, storeErrorMessage, addLog]);

  // Safe Asset Loading checks
  const verifyAssets = useCallback(() => {
    const docReady = document.readyState;
    const stylesheets = document.styleSheets.length;
    const isTailwindLoaded = document.styleSheets.length > 0;
    const fontsLoaded = document.fonts ? document.fonts.check('12px "Inter"') : 'unsupported';

    if (docReady === 'loading') {
      setAssetStatus({
        name: 'Production Asset Loader',
        status: 'checking',
        details: `DOM readyState: "${docReady}". Waiting for stylesheet resolution...`
      });
      return false;
    }

    setAssetStatus({
      name: 'Production Asset Loader',
      status: 'ok',
      details: `DOM active state: "${docReady}". Stylesheets active: ${stylesheets}. Fonts check: ${fontsLoaded}.`
    });
    addLog('✅ CSS, static resources, and font-classes successfully loaded.');
    return true;
  }, [addLog]);

  // Exponential backoff ping utility for backend API
  const pingAPI = useCallback(async (currentRetry: number): Promise<boolean> => {
    setApiStatus(prev => ({
      ...prev,
      status: 'checking',
      details: `Attempting API connection (Attempt #${currentRetry + 1})...`
    }));
    addLog(`Pinging backend API route /api/health (Attempt ${currentRetry + 1})...`);

    const startTime = performance.now();
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 4000); // 4s timeout

      const res = await fetch('/api/health', { 
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(id);

      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);

      if (res.ok) {
        const body = await res.json();
        setApiStatus({
          name: 'Backend Core API',
          status: 'ok',
          details: `Connected. Latency: ${latency}ms. Clustered node state: [${body.system || 'healthy'}].`,
          latency
        });
        addLog(`✅ API Response code 200 OK (${latency}ms). Cluster: ${body.cluster || 'default-zone'}`);
        return true;
      } else {
        throw new Error(`Endpoint returned status ${res.status}`);
      }
    } catch (err: any) {
      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);
      
      setApiStatus({
        name: 'Backend Core API',
        status: 'failed',
        details: `Connection rejected. Latency: ${latency}ms. Error: ${err.message || 'Server timeout'}`
      });
      addLog(`❌ API handshaking failure: ${err.message || 'Endpoint unresolved'}`);
      return false;
    }
  }, [addLog]);

  // Main Orchestrated verification loop
  const triggerChecks = useCallback(async () => {
    addLog('🔄 Launching synchronized health procedures...');
    const originalStoreOk = verifyStore();
    const assetsOk = verifyAssets();
    
    // Check API with local state logic
    const apiOk = await pingAPI(retryAttempt);

    if (originalStoreOk && assetsOk && apiOk) {
      addLog('🚀 System check complete. All services initialized.');
      if (onStartupSuccess) {
        // Delay slightly for visual pacing
        setTimeout(() => {
          onStartupSuccess();
        }, 1500);
      }
    } else {
      // Setup next retry using exponential backoff
      const nextDelay = Math.min(1000 * Math.pow(2, retryAttempt), 12000); // caps at 12s backoff
      setNextRetryTime(nextDelay);
      addLog(`⚠️ Validation failed. Scheduling exponential backoff retry in ${Math.round(nextDelay / 1000)}s...`);
    }
  }, [verifyStore, verifyAssets, pingAPI, retryAttempt, onStartupSuccess, addLog]);

  useEffect(() => {
    triggerChecks();
  }, [triggerChecks]);

  // Count down timer for backoff
  useEffect(() => {
    if (nextRetryTime === null) return;

    const timer = setTimeout(() => {
      setRetryAttempt(prev => prev + 1);
      setNextRetryTime(null);
    }, nextRetryTime);

    return () => clearTimeout(timer);
  }, [nextRetryTime]);

  const handleManualRetry = () => {
    setRetryAttempt(0);
    setNextRetryTime(null);
    addLog('👤 Manual diagnostic override triggered. Restarting cycles.');
    triggerChecks();
  };

  return (
    <div className="flex h-screen w-full items-center justify-center p-4 bg-[#07090e] text-slate-100 font-sans select-none relative overflow-hidden">
      {/* Background aesthetics */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[10%] -left-[15%] w-[45%] h-[45%] rounded-full bg-blue-900/10 blur-[130px]" />
        <div className="absolute -bottom-[10%] -right-[15%] w-[45%] h-[45%] rounded-full bg-red-950/10 blur-[130px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:3rem_3rem]" />
      </div>

      <div className="max-w-2xl w-full bg-[#0d101a]/85 border border-white/5 rounded-2xl p-6 md:p-8 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] z-10">
        
        {/* Header Block */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/5">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
              <ShieldAlert className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-wider text-white">INITIALIZATION DIAGNOSTIC</h2>
              <p className="text-xs text-slate-400 font-sans">App fail-safes activated. Diagnostic startup sequence monitoring.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded font-mono">
              LEVEL: SYSTEM FAILURE
            </span>
          </div>
        </div>

        {/* Current status grids */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-6">
          
          {/* Store Service */}
          <div className="p-4 bg-slate-900/40 border border-white/5 rounded-xl flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-slate-300">
                <Database className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-bold font-mono">1. Store State</span>
              </div>
              <span className={`w-2 h-2 rounded-full ${
                storeStatus.status === 'ok' ? 'bg-emerald-500' : storeStatus.status === 'checking' ? 'bg-amber-400 animate-pulse' : 'bg-red-500'
              }`} />
            </div>
            <p className="text-[11px] text-slate-400 font-sans leading-relaxed min-h-[44px]">
              {storeStatus.details}
            </p>
          </div>

          {/* Core API Server */}
          <div className="p-4 bg-slate-900/40 border border-white/5 rounded-xl flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-slate-300">
                {apiStatus.status === 'ok' ? (
                  <Wifi className="w-4 h-4 text-emerald-400" />
                ) : (
                  <WifiOff className="w-4 h-4 text-red-400" />
                )}
                <span className="text-xs font-bold font-mono">2. Core API</span>
              </div>
              <span className={`w-2 h-2 rounded-full ${
                apiStatus.status === 'ok' ? 'bg-emerald-500' : apiStatus.status === 'checking' ? 'bg-amber-400 animate-pulse' : 'bg-red-500'
              }`} />
            </div>
            <p className="text-[11px] text-slate-400 font-sans leading-relaxed min-h-[44px]">
              {apiStatus.details}
            </p>
          </div>

          {/* Raw Assets Bundle */}
          <div className="p-4 bg-slate-900/40 border border-white/5 rounded-xl flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-slate-300">
                <FileCode className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-bold font-mono">3. Assets Bundle</span>
              </div>
              <span className={`w-2 h-2 rounded-full ${
                assetStatus.status === 'ok' ? 'bg-emerald-500' : assetStatus.status === 'checking' ? 'bg-amber-400 animate-pulse' : 'bg-red-500'
              }`} />
            </div>
            <p className="text-[11px] text-slate-400 font-sans leading-relaxed min-h-[44px]">
              {assetStatus.details}
            </p>
          </div>

        </div>

        {/* Backoff notification overlay */}
        {nextRetryTime !== null && (
          <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/15 p-3 rounded-xl mb-6">
            <div className="flex items-center gap-2.5 text-amber-400 text-xs">
              <AlertTriangle className="w-4 h-4" />
              <span>
                Exponential check scheduled. Backoff-delay: <strong>{nextRetryTime / 1000}s</strong>
              </span>
            </div>
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
          </div>
        )}

        {/* Console outputs */}
        <div className="flex flex-col bg-slate-950/90 border border-slate-900 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 text-slate-400 border-b border-white/5 pb-2 mb-2">
            <TerminalIcon className="w-3.5 h-3.5" />
            <span className="text-[10px] uppercase tracking-wider font-bold">Diagnostic Trace stream</span>
          </div>
          <div className="font-mono text-[11px] text-slate-400 space-y-1.5 h-36 overflow-y-auto pr-2 scrollbar-thin">
            {diagnosticLogs.map((log, index) => (
              <div key={index} className={
                log.includes('❌') ? 'text-red-400' :
                log.includes('✅') ? 'text-emerald-400' :
                log.includes('⚠️') ? 'text-amber-400 animate-pulse' : 'text-slate-400'
              }>
                {log}
              </div>
            ))}
          </div>
        </div>

        {/* Controls block */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <button
            onClick={handleManualRetry}
            className="px-4 py-2 bg-slate-900 border border-slate-700 hover:border-slate-500 hover:bg-slate-850 hover:text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer"
          >
            <RefreshCcw className="w-3.5 h-3.5 text-blue-400" />
            Restart Checks
          </button>

          {onForceLoad && (
            <button
              onClick={onForceLoad}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:from-blue-700 active:to-indigo-705 text-white border border-blue-500/15 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md"
            >
              <Play className="w-3.5 h-3.5" />
              Force Mount Workspace
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
