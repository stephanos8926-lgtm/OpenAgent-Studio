// File: src/components/NotificationOverlay.tsx
import React from 'react';
import { useNotifications } from '../hooks/useNotifications';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, X, Info, AlertOctagon, Terminal } from 'lucide-react';

export function NotificationOverlay() {
  const { stack, dismiss } = useNotifications();

  return (
    <div className="fixed top-6 right-6 z-[60] flex flex-col gap-3 w-80 pointer-events-none">
      <AnimatePresence>
        {stack.map((notif) => (
          <motion.div
            key={notif.id}
            initial={{ opacity: 0, x: 50, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.95 }}
            className="pointer-events-auto bg-[#14151a]/95 backdrop-blur-md border border-gray-800 rounded-xl p-4 shadow-2xl flex gap-3 group"
          >
            <div className={`mt-0.5 shrink-0 ${
              notif.channel === 'TOAST' ? 'text-indigo-400' : 'text-amber-400'
            }`}>
              {notif.channel === 'AGENT' ? <Terminal size={18} /> : <Bell size={18} />}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-1 flex items-center justify-between">
                <span>{notif.name}</span>
                <span className="text-[9px] bg-gray-800 px-1.5 py-0.5 rounded text-gray-400">{notif.channel}</span>
              </div>
              <p className="text-sm text-gray-200 leading-snug break-words">
                {notif.message}
              </p>
            </div>

            <button 
              onClick={() => dismiss(notif.id!)}
              className="shrink-0 opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-800 rounded transition-all h-fit"
            >
              <X size={14} className="text-gray-500 hover:text-white" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
