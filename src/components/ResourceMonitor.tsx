import React, { useEffect, useState } from "react";
import { Cpu, HardDrive, ShieldCheck, Lock } from "lucide-react";
import { updateTelemetryMetrics } from "../lib/telemetry";

interface Metrics {
  cpu: number;
  memory: {
    used: number;
    total: number;
    free: number;
    percent: number;
  };
}

interface LockInfo {
  path: string;
  owner: string;
  timestamp: string;
}

export const ResourceMonitor: React.FC = () => {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [lockCount, setLockCount] = useState<number>(0);
  const [activeLocks, setActiveLocks] = useState<LockInfo[]>([]);
  const [showLocksTooltip, setShowLocksTooltip] = useState<boolean>(false);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await fetch("/api/container/metrics");
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            updateTelemetryMetrics(data.cpu);
            setMetrics({
              cpu: data.cpu,
              memory: data.memory,
            });
          }
        }
      } catch (err) {
        // Silent catch for dev server restarts
      }
    };

    const fetchLocks = async () => {
      try {
        const res = await fetch("/api/vfs/locks");
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.locks) {
            setLockCount(data.locks.length);
            setActiveLocks(data.locks);
          }
        }
      } catch (err) {
        // Silent catch
      }
    };

    fetchMetrics();
    fetchLocks();

    const interval = setInterval(() => {
      fetchMetrics();
      fetchLocks();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const formatBytes = (bytes: number): string => {
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)} GB`;
  };

  const getCpuPercentage = (): number => {
    if (!metrics) return 0;
    return Math.min(Math.max(metrics.cpu, 0.5), 99.5);
  };

  if (!metrics) {
    return (
      <div className="flex items-center gap-1 text-[11px] text-slate-500 font-mono">
        <Cpu className="w-3.5 h-3.5 animate-spin mr-1 text-slate-600" />
        <span>Syncing metrics...</span>
      </div>
    );
  }

  const cpuPercent = getCpuPercentage();
  const memPercent = Math.min(Math.max(metrics.memory.percent, 0.5), 99.5);

  return (
    <div className="flex items-center gap-3.5 select-none">
      {/* VFS Locks Indicator */}
      <div 
        className="relative flex items-center gap-1.5 duration-200"
        onMouseEnter={() => setShowLocksTooltip(true)}
        onMouseLeave={() => setShowLocksTooltip(false)}
      >
        <div className={`flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[10px] border transition-all ${
          lockCount > 0 
            ? "bg-amber-500/10 border-amber-500/20 text-amber-400 font-semibold" 
            : "bg-slate-900/40 border-slate-800 text-slate-500"
        }`}>
          <Lock className={`w-3 h-3 ${lockCount > 0 ? "animate-pulse" : ""}`} />
          <span>VFS Locks: {lockCount}</span>
        </div>

        {/* Lock Tooltip Panel */}
        {showLocksTooltip && (
          <div className="absolute top-7 right-0 min-w-[220px] bg-[#0b0f19] border border-slate-800 rounded-xl p-3 shadow-2xl z-50 text-slate-300 font-sans text-xs">
            <h4 className="font-bold text-[11px] text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5 border-b border-slate-800/60 pb-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
              Active System Locks
            </h4>
            {activeLocks.length === 0 ? (
              <p className="text-slate-500 text-[11px] italic">No active locks. Workspace is fully writable.</p>
            ) : (
              <ul className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                {activeLocks.map((lock, idx) => (
                  <li key={idx} className="flex flex-col gap-0.5 border-b border-white/5 pb-1 last:border-0 last:pb-0">
                    <span className="font-mono text-[10px] text-blue-400 truncate">{lock.path}</span>
                    <span className="text-[9px] text-slate-500">Locked by: {lock.owner}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* CPU Monitor */}
      <div className="flex items-center gap-1.5 bg-[#121622]/40 px-2.5 py-1 rounded-md border border-slate-800/40 hover:border-slate-800 transition-all">
        <Cpu className="w-3.5 h-3.5 text-slate-400" />
        <div className="flex flex-col">
          <div className="flex items-center gap-2 justify-between">
            <span className="text-[10px] text-slate-500 font-mono">CPU</span>
            <span className="text-[10px] text-slate-300 font-mono font-semibold">{cpuPercent.toFixed(1)}%</span>
          </div>
          <div className="w-14 bg-slate-800 h-1 rounded-full overflow-hidden mt-0.5">
            <div 
              style={{ width: `${cpuPercent}%` }}
              className={`h-full rounded-full transition-all duration-300 ${
                cpuPercent > 80 ? 'bg-red-500' : cpuPercent > 50 ? 'bg-amber-500' : 'bg-blue-500'
              }`}
            />
          </div>
        </div>
      </div>

      {/* Memory Monitor */}
      <div className="flex items-center gap-1.5 bg-[#121622]/40 px-2.5 py-1 rounded-md border border-slate-800/40 hover:border-slate-800 transition-all">
        <HardDrive className="w-3.5 h-3.5 text-slate-400" />
        <div className="flex flex-col">
          <div className="flex items-center gap-2 justify-between">
            <span className="text-[10px] text-slate-500 font-mono">MEM</span>
            <span className="text-[10px] text-slate-300 font-mono font-semibold">{formatBytes(metrics.memory.used)}</span>
          </div>
          <div className="w-14 bg-slate-800 h-1 rounded-full overflow-hidden mt-0.5">
            <div 
              style={{ width: `${memPercent}%` }}
              className={`h-full rounded-full transition-all duration-300 ${
                memPercent > 85 ? 'bg-red-500' : memPercent > 65 ? 'bg-amber-500' : 'bg-blue-500'
              }`}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
