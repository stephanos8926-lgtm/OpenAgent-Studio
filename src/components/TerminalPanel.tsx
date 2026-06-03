// File: src/components/TerminalPanel.tsx

import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../lib/store';
import { Terminal as TerminalIcon, Trash2, Power } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { io, Socket } from 'socket.io-client';
import '@xterm/xterm/css/xterm.css';

export const TerminalPanel: React.FC = () => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize xterm.js
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      convertEol: true, // Handle linebreaks as standard carriage-returns
      theme: {
        background: '#020617', // slate-950
        foreground: '#e2e8f0', // slate-200
        cursor: '#38bdf8', // sky-400
        selectionBackground: '#1e293b', // slate-800
      },
      fontFamily: 'monospace',
      fontSize: 12,
      scrollback: 10000,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Connect Socket.IO
    const url = window.location.origin;
    const socket = io(url);
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      term.writeln('\x1b[32;1m[Connected to real-time Swarm PTY via Socket.IO]\x1b[0m');
      term.writeln('\x1b[90mTip: Press manual signal tags or Ctrl+C to interrupt tasks.\x1b[0m');
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      term.writeln('\r\n\x1b[31;1m[Disconnected from Swarm PTY]\x1b[0m');
    });

    socket.on('terminal_data', (data: string) => {
      term.write(data);
    });

    // Handle keys inputs with precise control sequences trapping
    term.onKey(({ key, domEvent }) => {
      if (!socket.connected) return;

      // Handle custom interrupts such as Ctrl+C or Ctrl+D directly
      if (domEvent.ctrlKey && domEvent.key === 'c') {
        socket.emit('terminal_input', '\x03');
        return;
      }
      if (domEvent.ctrlKey && domEvent.key === 'd') {
        socket.emit('terminal_input', '\x04');
        return;
      }
      if (domEvent.ctrlKey && domEvent.key === 'z') {
        socket.emit('terminal_input', '\x1a');
        return;
      }
    });

    // General user typing
    term.onData((data) => {
      if (socket.connected) {
        socket.emit('terminal_input', data);
      }
    });

    // Handle resize
    const handleResize = () => {
      fitAddon.fit();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      socket.disconnect();
      term.dispose();
    };
  }, []);

  const handleClear = () => {
    if (xtermRef.current) {
      xtermRef.current.clear();
    }
  };

  const reconnect = () => {
    if (socketRef.current && !socketRef.current.connected) {
      if (xtermRef.current) xtermRef.current.writeln('\x1b[33m[Attempting reconnect...]\x1b[0m');
      socketRef.current.connect();
    }
  };

  // Helper triggers to send direct control sequences
  const sendControlSequence = (seq: string) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('terminal_input', seq);
      if (xtermRef.current) {
        // Render dynamic echo helper markers in terminal buffer
        if (seq === '\x03') xtermRef.current.write('^C\r\n');
        else if (seq === '\x1a') xtermRef.current.write('^Z\r\n');
      }
    }
  };

  return (
    <div id="terminal-panel-container" className="h-full flex flex-col bg-slate-950 border border-slate-850 rounded-xl overflow-hidden font-sans">
      
      {/* Terminal Title Bar */}
      <div className="flex items-center justify-between bg-slate-900 px-4 py-2 border-b border-slate-850 select-none">
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-xs font-mono font-bold text-slate-300">
            Interactive Agent Shell
          </span>
          <span className={`text-[9px] border font-mono font-bold px-1.5 py-0.5 rounded leading-none shrink-0 ${isConnected ? 'bg-emerald-950/50 border-emerald-900/50 text-emerald-400' : 'bg-red-950/50 border-red-900/50 text-red-500'}`}>
            {isConnected ? 'PTY CONNECTED' : 'DISCONNECTED'}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {!isConnected && (
            <button
              onClick={reconnect}
              title="Reconnect PTY Socket"
              className="p-1 text-amber-500 hover:text-amber-400 hover:bg-slate-800 rounded transition-all cursor-pointer"
            >
              <Power className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={handleClear}
            title="Clear Console Buffer"
            className="p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-all cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Manual Signal Control Toolbar (High-fidelity signal injections) */}
      <div className="bg-slate-950 px-3 py-1.5 border-b border-slate-900/60 flex flex-wrap items-center gap-1.5 select-none shrink-0">
        <span className="text-[9px] font-mono font-bold text-slate-500 mr-1 uppercase">Signals:</span>
        <button
          onClick={() => sendControlSequence('\x03')}
          disabled={!isConnected}
          className="text-[9px] font-mono font-bold bg-red-950/30 text-red-400 border border-red-900/30 hover:border-red-500/30 px-1.5 py-0.5 rounded-sm transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
          title="Send Interrupt (Ctrl+C)"
        >
          SIGINT [Ctrl+C]
        </button>
        <button
          onClick={() => sendControlSequence('\x1a')}
          disabled={!isConnected}
          className="text-[9px] font-mono font-bold bg-amber-950/30 text-amber-400 border border-amber-900/30 hover:border-amber-500/30 px-1.5 py-0.5 rounded-sm transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
          title="Send Stop (Ctrl+Z)"
        >
          SIGTSTP [Ctrl+Z]
        </button>
        <button
          onClick={() => sendControlSequence('\nstty sane\n')}
          disabled={!isConnected}
          className="text-[9px] font-mono font-bold bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-700 px-1.5 py-0.5 rounded-sm transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
          title="Reset TTY settings to default"
        >
          stty sane
        </button>
        <button
          onClick={() => sendControlSequence('\t')}
          disabled={!isConnected}
          className="text-[9px] font-mono font-bold bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-700 px-1.5 py-0.5 rounded-sm transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
          title="Autocomplete / Send Tab character"
        >
          Tab
        </button>
      </div>

      {/* xterm.js container */}
      <div 
        ref={terminalRef}
        className="flex-1 p-2 bg-slate-950 w-full overflow-hidden" 
      />

    </div>
  );
};
