// File: src/components/Chat.tsx

import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../lib/store';
import { Send, Bot, User, Plus, Mic, ArrowUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const Chat: React.FC = () => {
  const { chatMessages, sendChatMessage, swarmState } = useAppStore();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim()) return;
    sendChatMessage(input);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div id="chat-panel-container" className="h-full flex flex-col bg-[#0b0d11] font-sans">
      
      {/* Immersive Header bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 bg-[#0d0f14]/80 backdrop-blur-md select-none shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center">
            <Bot size={16} className="text-indigo-400" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold text-slate-100 tracking-tight">OpenAgent Studio</span>
            <span className="text-[9px] text-slate-500 font-mono flex items-center gap-1.5 uppercase tracking-widest">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
              Ran for 286s
            </span>
          </div>
        </div>
      </div>

      {/* Messages Scroll Panel list */}
      <div 
        ref={scrollRef}
        className="flex-1 p-6 overflow-y-auto space-y-8 bg-transparent scrollbar-hide"
      >
        <AnimatePresence initial={false}>
          {chatMessages.map(msg => {
            const isUser = msg.role === 'user';
            
            return (
              <motion.div 
                key={msg.id} 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 ${
                  isUser ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
                }`}>
                  {isUser ? <User size={14} /> : <Bot size={14} />}
                </div>

                <div className={`max-w-[80%] flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
                  <div className={`text-[10px] font-bold text-slate-500 uppercase tracking-[0.15em] mb-1`}>
                    {isUser ? 'Developer' : 'Intelligence Engine'}
                  </div>
                  <div 
                    className={`text-sm leading-[1.6] font-normal break-words ${
                      isUser ? 'text-slate-200 text-right' : 'text-slate-300'
                    }`}
                  >
                    {msg.content}
                  </div>
                  <div className="text-[9px] text-slate-600 font-mono mt-1 opacity-60 italic">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* The Floating Interactive Input Ring (Bottom) */}
      <div className="px-5 pb-8 pt-2 bg-transparent shrink-0">
        <div className="max-w-2xl mx-auto relative group">
           {/* Top Suggestions (as shown in some references) */}
           <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-hide no-scrollbar">
              {['AI Features', 'Implement OTel SDK', 'Visual Telemetry'].map((hint, i) => (
                <button 
                  key={i}
                  className="px-3 py-1.5 rounded-full bg-white/5 border border-white/5 hover:border-indigo-500/30 text-[10px] text-slate-400 hover:text-indigo-300 transition-all whitespace-nowrap flex items-center gap-1.5"
                >
                  {i === 0 && <span className="text-indigo-400">✨</span>}
                  {hint}
                </button>
              ))}
           </div>

           {/* The Ring Container */}
           <div className="bg-[#161a22]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-2 shadow-2xl focus-within:border-indigo-500/40 transition-all duration-300">
             <div className="flex items-start">
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Make changes, add new features, ask for anything"
                  rows={2}
                  className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-slate-200 placeholder-slate-500 px-4 py-3 resize-none scrollbar-hide"
                />
             </div>
             
             <div className="flex items-center justify-between px-3 pb-2 pt-1">
                <div className="flex items-center gap-1">
                  <button className="p-2 text-slate-500 hover:bg-white/5 hover:text-slate-300 rounded-xl transition-all">
                    <Mic size={18} />
                  </button>
                  <button className="p-2 text-slate-500 hover:bg-white/5 hover:text-slate-300 rounded-xl transition-all">
                    <Plus size={18} />
                  </button>
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={!input.trim()}
                  className={`p-2 rounded-xl transition-all shadow-lg ${
                    input.trim() 
                      ? 'bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95 shadow-indigo-500/20' 
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <ArrowUp size={20} />
                </button>
             </div>
           </div>
        </div>
      </div>

    </div>
  );
};

