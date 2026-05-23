import React, { useEffect, useState } from 'react';
import { 
  Shield, Activity, Calendar, Clock, RefreshCw, 
  Cpu, HardDrive, Play, Zap, Power, AlertCircle, 
  FileText, Database, Terminal, ChevronRight, ChevronDown, Folder, File 
} from 'lucide-react';

const ASSEMBLER_TEMPLATES = {
  multiplier: `; Factorial & Multiplier Demonstration
LOAD R1 6         ; Set multiplier index accumulator
LOAD R2 5         ; Set multiplier unit constant (5)
LOAD R3 0         ; Zero-out result register: R3 = 0

mult_loop:
ADD R3 R2         ; R3 = R3 + R2 (accumulate sum)
LOAD R4 1
SUB R1 R4         ; Decrement index count
JZ R1 end_mult    ; Exit once counter reaches 0
JMP mult_loop

end_mult:
STM R3 100        ; Save multiplication results to memory
PRINT R3          ; Print final accumulator state
HALT`,
  countdown: `; Loop & Decrement countdown demo
LOAD R1 5         ; Start index register R1 = 5
LOAD R2 1         ; Decrement step constant R2 = 1

loop:
PRINT R1          ; Write remaining cycles
SUB R1 R2         ; Decrement accumulator: R1 = R1 - R2
JZ R1 finish      ; Exit loop if R1 matches zero
JMP loop

finish:
HALT`,
  arithmetic: `; Basic arithmetic calculations
LOAD R1 250
LOAD R2 150
ADD R1 R2         ; R1 = R1 + R2 (400)
LOAD R3 50
SUB R1 R3         ; R1 = R1 - R3 (350)
PRINT R1
HALT`
};

export const Maintenance = () => {
  // System Status State
  const [status, setStatus] = useState<any>({
    state: 'HALTED',
    runlevel: 0,
    pids: [],
    cronJobsCount: 0
  });

  // Resources and Processes States
  const [processes, setProcesses] = useState<any[]>([]);
  const [syslogs, setSyslogs] = useState<string[]>([]);
  const [bootlog, setBootlog] = useState<string[]>([]);
  const [cronlog, setCronlog] = useState<string[]>([]);
  const [dbBoots, setDbBoots] = useState<any[]>([]);
  const [dbCrons, setDbCrons] = useState<any[]>([]);

  // Assembly Compiler State
  const [selectedTemplate, setSelectedTemplate] = useState<keyof typeof ASSEMBLER_TEMPLATES>('multiplier');
  const [assemblyCode, setAssemblyCode] = useState(ASSEMBLER_TEMPLATES.multiplier);
  const [assemblyResult, setAssemblyResult] = useState<any>(null);
  const [compiling, setCompiling] = useState(false);

  // VFS Virtual File Explorer State
  const [vfsCurrentPath, setVfsCurrentPath] = useState('/');
  const [vfsEntries, setVfsEntries] = useState<string[]>([]);
  const [vfsFileContent, setVfsFileContent] = useState<string | null>(null);
  const [vfsActiveFile, setVfsActiveFile] = useState<string | null>(null);

  // Loading indicator states
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load assembly template on selection
  const handleTemplateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const key = e.target.value as keyof typeof ASSEMBLER_TEMPLATES;
    setSelectedTemplate(key);
    setAssemblyCode(ASSEMBLER_TEMPLATES[key]);
  };

  /**
   * Primary status and log fetch routines
   */
  const refreshSystemData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // 1. Fetch global system status
      const statusRes = await fetch('/api/superos/status');
      if (statusRes.ok) {
        const data = await statusRes.json();
        setStatus({
          state: data.state,
          runlevel: data.runlevel,
          pids: data.pids,
          cronJobsCount: data.cronJobsCount
        });
      }

      // 2. Fetch processes list
      const procRes = await fetch('/api/superos/processes');
      if (procRes.ok) {
        const data = await procRes.json();
        setProcesses(data.processes || []);
      }

      // 3. Fetch log trails
      const logsToFetch = ['syslog', 'boot.log', 'cron.log'];
      const fetchedLogs = await Promise.all(
        logsToFetch.map(name => 
          fetch(`/api/superos/logs?log=${name}`).then(res => res.ok ? res.json() : { lines: [] })
        )
      );
      setSyslogs(fetchedLogs[0].lines || []);
      setBootlog(fetchedLogs[1].lines || []);
      setCronlog(fetchedLogs[2].lines || []);

      // 4. Query relational reports
      const bootHistoryRes = await fetch('/api/superos/db/boot-history');
      if (bootHistoryRes.ok) {
        const data = await bootHistoryRes.json();
        setDbBoots(data.history || []);
      }

      const cronHistoryRes = await fetch('/api/superos/db/cron-history');
      if (cronHistoryRes.ok) {
        const data = await cronHistoryRes.json();
        setDbCrons(data.history || []);
      }

      // 5. Query active virtual directory
      await fetchVFSDirectory(vfsCurrentPath);

    } catch (err: any) {
      setErrorMsg(`Failed to query hypervisor API: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Lifecycle actions (power on, power off, reboot)
   */
  const handlePowerAction = async (action: 'on' | 'off' | 'reboot') => {
    try {
      const res = await fetch('/api/superos/power', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      if (res.ok) {
        await refreshSystemData();
      }
    } catch (err: any) {
      setErrorMsg(`Control execution failed: ${err.message}`);
    }
  };

  /**
   * Compile and Execute assembly scripts
   */
  const handleCompileAndRun = async () => {
    setCompiling(true);
    setAssemblyResult(null);
    try {
      const res = await fetch('/api/superos/execute-asm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: assemblyCode })
      });
      if (res.ok) {
        const outcome = await res.json();
        setAssemblyResult(outcome);
        await refreshSystemData(); // Reload stats after CPU operations
      }
    } catch (err: any) {
      setErrorMsg(`Assembler script crash: ${err.message}`);
    } finally {
      setCompiling(false);
    }
  };

  /**
   * VFS exploration helpers
   */
  const fetchVFSDirectory = async (dirPath: string) => {
    try {
      const res = await fetch(`/api/superos/vfs/ls?path=${encodeURIComponent(dirPath)}`);
      if (res.ok) {
        const data = await res.json();
        setVfsEntries(data.entries.sort() || []);
        setVfsCurrentPath(dirPath);
        setVfsFileContent(null);
        setVfsActiveFile(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleReadFile = async (fileName: string) => {
    let targetPath = vfsCurrentPath === '/' ? `/${fileName}` : `${vfsCurrentPath}/${fileName}`;
    // Proc files inside nested structure can be hardcoded mapped for display
    if (vfsCurrentPath.startsWith('/proc/')) {
      targetPath = `${vfsCurrentPath}/${fileName}`;
    }
    try {
      const res = await fetch(`/api/superos/vfs/cat?path=${encodeURIComponent(targetPath)}`);
      if (res.ok) {
        const data = await res.json();
        setVfsFileContent(data.content);
        setVfsActiveFile(targetPath);
      }
    } catch (e: any) {
      setVfsFileContent(`Permission error: unable to read '${targetPath}'`);
    }
  };

  const handleVFSNavigateUp = () => {
    if (vfsCurrentPath === '/') return;
    const parts = vfsCurrentPath.split('/').filter(Boolean);
    parts.pop();
    const upPath = '/' + parts.join('/');
    fetchVFSDirectory(upPath);
  };

  const handleVFSNavigateIn = (dirName: string) => {
    const targetPath = vfsCurrentPath === '/' ? `/${dirName}` : `${vfsCurrentPath}/${dirName}`;
    fetchVFSDirectory(targetPath);
  };

  useEffect(() => {
    refreshSystemData();
    // Auto tick state updates every 8 seconds to reflect simulated loads
    const interval = setInterval(() => {
      refreshSystemData();
    }, 8000);
    return () => clearInterval(interval);
  }, [vfsCurrentPath]);

  // Aggregate virtual stats metrics
  const totalSimCpu = processes.reduce((acc, proc) => acc + proc.cpu, 0).toFixed(1);
  const totalSimMem = processes.reduce((acc, proc) => acc + proc.memory, 0);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 text-gray-800 bg-gray-50 min-h-screen">
      {/* HEADER CONTROLS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-indigo-900 tracking-tight">
            <Shield className="w-7 h-7 text-indigo-600 animate-pulse" />
            SuperOS Simulated Embedded Console
          </h1>
          <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest font-mono">
            Virtualized Kernel Sandbox & Stack CPU Monitor
          </p>
        </div>

        {/* HOST POWER INTERFACE */}
        <div className="flex items-center gap-2 bg-white p-1.5 rounded-lg border border-gray-200 shadow-sm">
          <div className="px-3 text-xs font-bold font-mono text-gray-500 uppercase flex items-center gap-1.5">
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${
              status.state === 'RUNNING' ? 'bg-emerald-500 animate-ping' : 
              status.state === 'BOOTING' ? 'bg-amber-500 animate-pulse' : 'bg-rose-500'
            }`} />
            State: {status.state}
          </div>
          
          <button 
            onClick={() => handlePowerAction('on')}
            disabled={status.state === 'RUNNING'}
            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-100 disabled:text-gray-400 text-white rounded-md text-xs font-bold transition-all shadow-sm"
          >
            <Power className="w-3.5 h-3.5" /> Boot
          </button>
          
          <button 
            onClick={() => handlePowerAction('reboot')}
            disabled={status.state !== 'RUNNING'}
            className="flex items-center gap-2 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:bg-gray-100 disabled:text-gray-400 text-white rounded-md text-xs font-bold transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Core Reset
          </button>
          
          <button 
            onClick={() => handlePowerAction('off')}
            disabled={status.state !== 'RUNNING'}
            className="flex items-center gap-2 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:bg-gray-100 disabled:text-gray-400 text-white rounded-md text-xs font-bold transition-all shadow-sm"
          >
            <Power className="w-3.5 h-3.5" /> Terminate
          </button>

          <button 
            onClick={refreshSystemData}
            className="p-1.5 hover:bg-gray-100 rounded text-gray-600 border-l border-gray-200"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2.5 text-sm animate-shake">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {errorMsg}
        </div>
      )}

      {/* CORE STATS MATRIX */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Runlevel gauge */}
        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-gray-400 uppercase font-mono tracking-wider">Init Target Runlevel</span>
            <div className="text-2xl font-black text-indigo-950 font-mono mt-1">RL-0{status.runlevel}</div>
            <span className="text-[10px] text-gray-500 block font-mono mt-1">Multi-User Console CLI Ready</span>
          </div>
          <div className="bg-indigo-50 p-3 rounded-full text-indigo-600">
            <Calendar className="w-6 h-6" />
          </div>
        </div>

        {/* CPU utilization */}
        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-gray-400 uppercase font-mono tracking-wider">Virtual CPU Matrix</span>
            <div className="text-2xl font-black text-emerald-950 font-mono mt-1">
              {status.state === 'RUNNING' ? `${totalSimCpu}%` : '0.0%'}
            </div>
            {/* Visual Progress percentage bar */}
            <div className="w-24 bg-gray-100 h-1.5 rounded-full mt-2 overflow-hidden">
              <div 
                className="bg-emerald-500 h-full transition-all duration-1000" 
                style={{ width: `${Math.min(100, parseFloat(totalSimCpu) * 3)}%` }} 
              />
            </div>
          </div>
          <div className="bg-emerald-50 p-3 rounded-full text-emerald-600">
            <Cpu className="w-6 h-6" />
          </div>
        </div>

        {/* Memory limit details */}
        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-gray-400 uppercase font-mono tracking-wider">Virtual RAM Usage</span>
            <div className="text-2xl font-black text-teal-950 font-mono mt-1">
              {status.state === 'RUNNING' ? `${(totalSimMem / 1024).toFixed(1)}MB` : '0.0MB'} / 128MB
            </div>
            <div className="w-24 bg-gray-100 h-1.5 rounded-full mt-2 overflow-hidden">
              <div 
                className="bg-teal-500 h-full transition-all duration-1000" 
                style={{ width: `${(totalSimMem / 1024 / 128) * 100}%` }} 
              />
            </div>
          </div>
          <div className="bg-teal-50 p-3 rounded-full text-teal-600">
            <HardDrive className="w-6 h-6" />
          </div>
        </div>

        {/* Cron threads scale */}
        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-gray-400 uppercase font-mono tracking-wider">Job Schedulers</span>
            <div className="text-2xl font-black text-violet-950 font-mono mt-1">
              Active: {status.cronJobsCount}
            </div>
            <span className="text-[10px] text-gray-500 block font-mono mt-1">Registered crontabs ticking</span>
          </div>
          <div className="bg-violet-50 p-3 rounded-full text-violet-600">
            <Clock className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* GRAPH SPLIT AND ASSEMBLER CONTAINER */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left pane: Active Process tree table */}
        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm lg:col-span-7 flex flex-col min-w-0">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-700">Live Process Tree Table (pidfs)</h3>
          </div>
          
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-gray-400 font-bold uppercase tracking-wider">
                  <th className="py-2.5">PID</th>
                  <th className="py-2.5">PPID</th>
                  <th className="py-2.5">Command Exec</th>
                  <th className="py-2.5">Thread State</th>
                  <th className="py-2.5">V-CPU</th>
                  <th className="py-2.5">V-MEM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-mono">
                {processes.map(proc => (
                  <tr key={proc.pid} className="hover:bg-gray-50/50">
                    <td className="py-3 text-indigo-700 font-bold">#{proc.pid}</td>
                    <td className="py-3 text-gray-400">{proc.ppid}</td>
                    <td className="py-3 text-gray-800 font-semibold">{proc.command}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold ${
                        proc.status === 'RUNNING' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                        proc.status === 'ZOMBIE' ? 'bg-amber-100 text-amber-800 animate-pulse' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {proc.status}
                      </span>
                    </td>
                    <td className="py-3 text-emerald-600">{proc.cpu.toFixed(1)}%</td>
                    <td className="py-3 text-teal-600">{proc.memory.toLocaleString()} KB</td>
                  </tr>
                ))}
                {processes.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-gray-400 uppercase font-bold tracking-wider">
                      Process tables empty. CPU halted.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right pane: INTERACTIVE VM ASSEMBLY WORKSTATION */}
        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm lg:col-span-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-violet-600" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-gray-700">ISA Compile & VM Workstation</h3>
            </div>
            
            {/* Template selector */}
            <select 
              value={selectedTemplate} 
              onChange={handleTemplateChange}
              className="text-[11px] font-semibold bg-gray-50 border border-gray-200 text-gray-600 rounded px-2 py-1 font-mono hover:bg-gray-100 outline-none cursor-pointer"
            >
              <option value="multiplier">Template: Multiplier loop</option>
              <option value=" countdown">Template: Countdown timer</option>
              <option value="arithmetic">Template: Simple Addition</option>
            </select>
          </div>

          <div className="flex-1 flex flex-col space-y-3">
            <div className="relative flex-1">
              <span className="absolute top-2 right-2 text-[9px] bg-indigo-50 border border-indigo-200 text-indigo-600 px-1.5 py-0.5 rounded uppercase font-bold font-mono tracking-wider">
                Custom Assembler v1.0
              </span>
              <textarea 
                value={assemblyCode}
                onChange={(e) => setAssemblyCode(e.target.value)}
                className="w-full h-48 bg-gray-900 border border-gray-800 font-mono text-[11px] text-yellow-105 p-3 rounded-md focus:ring-1 focus:ring-indigo-500 focus:outline-none leading-relaxed text-yellow-300"
                style={{ tabSize: 2 }}
              />
            </div>

            <button 
              onClick={handleCompileAndRun}
              disabled={compiling || status.state !== 'RUNNING'}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-xs font-bold transition-all shadow hover:shadow-md flex items-center justify-center gap-1.5 disabled:bg-gray-100 disabled:text-gray-400"
            >
              {compiling ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Compiling & Injecting...
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5 text-yellow-300 fill-yellow-300" /> Assemble & Run on Custom VM
                </>
              )}
            </button>

            {/* Micro execution traces outputs */}
            {assemblyResult && (
              <div className="bg-gray-950 p-4 rounded-md border border-gray-900 flex flex-col space-y-2 text-[11px] font-mono select-none">
                <div className="flex items-center justify-between border-b border-gray-800 pb-1.5">
                  <span className="text-gray-400 uppercase font-black tracking-widest text-[9px]">Execution Trace (PID #{assemblyResult.pid})</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase ${
                    assemblyResult.isCrashed ? 'bg-rose-950 text-rose-300 border border-rose-900' : 'bg-emerald-950 text-emerald-300 border border-emerald-900'
                  }`}>
                    {assemblyResult.isCrashed ? 'Crashed / Panic' : 'Success'}
                  </span>
                </div>

                {/* Outputs stream */}
                <div className="max-h-24 overflow-y-auto space-y-1 text-gray-300">
                  {assemblyResult.stdout.map((line: string, i: number) => (
                    <div key={i} className={line.includes('PANIC') || line.includes('ERROR') ? 'text-rose-400 font-bold' : ''}>
                      {line}
                    </div>
                  ))}
                  {assemblyResult.stdout.length === 0 && <div className="text-gray-600">No output streamed.</div>}
                </div>

                {/* Registers print */}
                <div className="grid grid-cols-4 gap-1 border-t border-gray-800 pt-1.5 text-center text-xs">
                  {assemblyResult.registers.map((val: number, idx: number) => (
                    <div key={idx} className="bg-gray-900 rounded p-1 border border-gray-800">
                      <div className="text-[9px] text-gray-500 font-bold">R{idx + 1}</div>
                      <div className="font-bold text-indigo-300 font-mono mt-0.5">{val}</div>
                    </div>
                  ))}
                </div>

                <div className="text-[9px] text-right text-gray-500 font-mono uppercase">
                  Instruction length: {assemblyResult.cycles} Cycles completed
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* FILE SYSTEM & LOG DUMPS SPLIT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: VFS virtual procfs Navigator */}
        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm lg:col-span-6 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <HardDrive className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-700">Adaptive VFS Explorer (/proc INTERCEPTS)</h3>
          </div>

          <div className="flex-1 grid grid-cols-1 sm:grid-cols-12 gap-4">
            {/* Folder browser */}
            <div className="sm:col-span-5 bg-gray-50 p-3 rounded-md border border-gray-100 flex flex-col space-y-1.5 text-xs font-mono max-h-60 overflow-y-auto">
              <div className="flex items-center justify-between border-b border-gray-200 pb-1.5 mb-1.5">
                <span className="font-bold text-[10px] text-gray-400 uppercase">File Namespace</span>
                {vfsCurrentPath !== '/' && (
                  <button 
                    onClick={handleVFSNavigateUp} 
                    className="text-[10px] text-indigo-600 hover:underline font-bold"
                  >
                    Up [..]
                  </button>
                )}
              </div>
              <div className="text-[10px] text-indigo-700 font-bold truncate mb-1">
                DIR: {vfsCurrentPath}
              </div>

              {vfsEntries.map(entry => {
                // Heuristic: directories don't have periods or are numeric PIDs inside /proc, 
                // or specific subfolders.
                const isDir = !entry.includes('.') || entry === 'bin' || entry === 'etc' || entry === 'proc' || entry === 'tmp' || entry === 'var' || entry === 'log' || /^\d+$/.test(entry);
                return (
                  <button 
                    key={entry}
                    onClick={() => isDir ? handleVFSNavigateIn(entry) : handleReadFile(entry)}
                    className="flex items-center gap-2 py-1 text-left hover:text-indigo-600 transition-colors truncate select-none group"
                  >
                    {isDir ? (
                      <Folder className="w-3.5 h-3.5 text-indigo-400 fill-indigo-100 shrink-0" />
                    ) : (
                      <File className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    )}
                    <span className="truncate group-hover:underline">{entry}</span>
                  </button>
                );
              })}
              {vfsEntries.length === 0 && <div className="text-gray-400 text-center py-6">Directory empty.</div>}
            </div>

            {/* Read pane */}
            <div className="sm:col-span-7 bg-gray-900 text-yellow-105 p-4 rounded-md border border-gray-950 font-mono text-[11px] flex flex-col max-h-60 overflow-y-auto select-none text-yellow-300">
              <div className="flex items-center justify-between border-b border-gray-800 pb-1.5 mb-1.5">
                <span className="text-[9px] text-gray-500 uppercase tracking-widest">Cat output stream</span>
                {vfsActiveFile && <span className="text-indigo-400 text-[10px] truncate max-w-40">{vfsActiveFile}</span>}
              </div>
              {vfsFileContent ? (
                <pre className="whitespace-pre-wrap leading-relaxed break-all select-text">{vfsFileContent}</pre>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-600 uppercase font-black text-center text-[10px] py-12">
                  <FileText className="w-8 h-8 text-gray-800 mb-2" />
                  Select a virtual file to read its contents
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: STREAMING TAIL SYSLOGS */}
        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm lg:col-span-6 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <Terminal className="w-4 h-4 text-violet-600" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-700">Rotated Syslogs & System Streams ({syslogs.length > 0 ? 'Ticking' : 'Halted'})</h3>
          </div>

          <div className="bg-gray-950 p-4 rounded-md border border-gray-900 font-mono text-[11px] text-gray-300 flex-1 max-h-60 overflow-y-auto space-y-1 text-xs select-none">
            {syslogs.map((line, i) => (
              <div key={i} className="leading-relaxed hover:bg-gray-900/30 font-medium whitespace-pre-wrap break-all select-text">
                {line}
              </div>
            ))}
            {syslogs.length === 0 && (
              <div className="text-center text-gray-600 py-16 uppercase font-bold tracking-widest">
                No syslog entries detected. System halted.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SQL DATABASE PERSISTENCE LOG REPORTS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Table 1: Boot history logs */}
        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <Database className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-700">Relational SQL Boot Records (os_boot_log)</h3>
          </div>

          <div className="overflow-x-auto max-h-48">
            <table className="w-full text-left border-collapse text-[10px]">
              <thead>
                <tr className="border-b border-gray-200 text-gray-400 font-bold uppercase tracking-wider">
                  <th className="py-2.5">BOOT ID</th>
                  <th className="py-2.5">timestamp</th>
                  <th className="py-2.5">p-level</th>
                  <th className="py-2.5">operation outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-mono">
                {dbBoots.map(boot => (
                  <tr key={boot.id}>
                    <td className="py-2.5 text-indigo-700 font-extrabold">BOOT-REC#{boot.id}</td>
                    <td className="py-2.5 text-gray-500">{new Date(boot.timestamp).toLocaleString()}</td>
                    <td className="py-2.5 font-bold">LEVEL-{boot.runlevel}</td>
                    <td className="py-2.5 text-gray-500 max-w-48 truncate">{boot.description}</td>
                  </tr>
                ))}
                {dbBoots.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-gray-400 uppercase">
                      No historical boot records inside WAL schema.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Table 2: Cron history scheduler logs */}
        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <Database className="w-4 h-4 text-violet-600" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-700">Relational SQL Scheduler Records (cron_log)</h3>
          </div>

          <div className="overflow-x-auto max-h-48">
            <table className="w-full text-left border-collapse text-[10px]">
              <thead>
                <tr className="border-b border-gray-200 text-gray-400 font-bold uppercase tracking-wider">
                  <th className="py-2.5">CRON REC ID</th>
                  <th className="py-2.5">Job Trigger</th>
                  <th className="py-2.5">Timestamp</th>
                  <th className="py-2.5">Code</th>
                  <th className="py-2.5">Outcome Logs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-mono">
                {dbCrons.map(cron => (
                  <tr key={cron.id}>
                    <td className="py-2.5 text-violet-700 font-extrabold">SCHED-REG#{cron.id}</td>
                    <td className="py-2.5 font-bold text-gray-800">{cron.jobId}</td>
                    <td className="py-2.5 text-gray-500">{new Date(cron.triggerTime).toLocaleTimeString()}</td>
                    <td className="py-2.5 text-[10px] text-indigo-600 font-bold">Exit: {cron.exitCode}</td>
                    <td className="py-2.5 text-gray-500 max-w-44 truncate">{cron.logOutput}</td>
                  </tr>
                ))}
                {dbCrons.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-gray-400 uppercase">
                      No scheduler operations logged to database schema yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
export default Maintenance;
