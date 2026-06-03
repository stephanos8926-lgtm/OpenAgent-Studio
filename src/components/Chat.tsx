// File: src/components/Chat.tsx

import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../lib/store';
import { Send, Cpu, Bot, User, Terminal, HelpCircle } from 'lucide-react';

export const Chat: React.FC = () => {
  const { chatMessages, sendChatMessage, swarmState } = useAppStore();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendChatMessage(input);
    setInput('');
  };

  return (
    <div id="chat-panel-container" className="h-full flex flex-col bg-slate-950 border border-slate-850 rounded-xl overflow-hidden font-sans">
      
      {/* Chat Title bar */}
      <div className="flex items-center justify-between bg-slate-900 px-4 py-2 border-b border-slate-850 select-none">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-purple-400 shrink-0" />
          <span className="text-xs font-mono font-bold text-slate-300">
            Agents Comm Bus
          </span>
          <span className="text-[9px] bg-purple-950 border border-purple-900/30 text-purple-300 font-mono font-bold px-1 py-0.5 rounded leading-none shrink-0">
            {swarmState.activeAgent.toUpperCase()}_LOOP
          </span>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-1.5 text-purple-400 font-mono text-[9px]">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
          SYNCED
        </div>
      </div>

      {/* Messages Scroll Panel list */}
      <div 
        ref={scrollRef}
        className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-950 scrollbar-thin max-h-[300px]"
      >
        {chatMessages.map(msg => {
          const isSystem = msg.role === 'system';
          const isUser = msg.role === 'user';
          
          return (
            <div 
              key={msg.id} 
              className={`flex flex-col ${
                isSystem ? 'items-center text-center my-1' : isUser ? 'items-end' : 'items-start'
              }`}
            >
              {isSystem ? (
                <div className="text-[10px] font-mono font-medium text-slate-500 bg-slate-900 px-3 py-1 rounded-sm border border-slate-920">
                  {msg.content}
                </div>
              ) : (
                <div className="max-w-[85%] space-y-1">
                  
                  {/* Sender Name header */}
                  <div className={`text-[9px] font-bold font-mono tracking-wide text-slate-500 flex items-center gap-1 ${isUser ? 'justify-end' : ''}`}>
                    {!isUser && <Cpu className="w-3 h-3 text-purple-400" />}
                    {isUser ? 'DEVELOPER (YOU)' : 'SWARM AGENTIC ROUTER'}
                  </div>

                  {/* Bubble body text */}
                  <div 
                    className={`p-3 rounded-xl text-xs leading-relaxed font-sans ${
                      isUser 
                        ? 'bg-purple-600 text-white rounded-tr-none shadow-md shadow-purple-900/10' 
                        : 'bg-slate-900 text-slate-200 border border-slate-800 rounded-tl-none shadow-sm shadow-slate-950'
                    }`}
                  >
                    {msg.content}
                  </div>

                  {/* Timestamp column */}
                  <div className={`text-[8px] text-slate-600 font-mono ${isUser ? 'text-right' : ''}`}>
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </div>

                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Input Message Form */}
      <form 
        onSubmit={handleSubmit}
        className="border-t border-slate-900 p-2 bg-slate-950/85 flex items-center gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask agents about metrics, DAGs, or trigger builds..."
          className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-700"
        />
        <button
          type="submit"
          className="p-2 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white rounded-lg transition-all cursor-pointer transition-all"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>

    </div>
  );
};
