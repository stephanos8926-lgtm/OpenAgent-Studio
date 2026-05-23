import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../lib/store';
import { Send, Bot, User, Code } from 'lucide-react';
import Settings from './Settings';

export default function Chat() {
  const { messages, addMessage, appendLastMessage, setVfs, settings, isGenerating, setIsGenerating, vfs } = useAppStore();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isGenerating) return;
    if (!settings.openRouterKey) {
      alert("Please enter an OpenRouter API key in Settings.");
      return;
    }

    const userMsg = input.trim();
    setInput('');
    addMessage({ role: 'user', content: userMsg });
    setIsGenerating(true);
    
    // Add empty assistant message to append to
    addMessage({ role: 'assistant', content: '' });

    // Generate or use a thread ID
    const threadId = localStorage.getItem('threadId') || crypto.randomUUID();
    localStorage.setItem('threadId', threadId);

    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content: userMsg }],
          vfs,
          openRouterKey: settings.openRouterKey,
          modelName: settings.model,
          threadId,
          executionMode: useAppStore.getState().executionMode
        })
      });

      if (!resp.ok) {
        throw new Error('Network response was not ok');
      }

      const reader = resp.body?.getReader();
      const decoder = new TextDecoder("utf-8");

      let incompleteData = "";
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        incompleteData += chunk;
        const lines = incompleteData.split('\n\n');
        
        incompleteData = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (dataStr === '[DONE]') break;
            
            try {
              const data = JSON.parse(dataStr);
              if (data.type === 'token') {
                appendLastMessage(data.content);
              } else if (data.type === 'proposal') {
                useAppStore.getState().addProposedChange({
                  id: data.id || crypto.randomUUID(),
                  path: data.path,
                  originalContent: data.originalContent,
                  proposedContent: data.proposedContent,
                  status: 'pending',
                  mode: data.mode,
                  chunks: data.chunks
                });
              } else if (data.type === 'proposed_command') {
                useAppStore.getState().addProposedCommand({
                  id: data.id,
                  command: data.command,
                  status: 'pending'
                });
              } else if (data.type === 'tool') {
                // Formatting tool message to display in chat
                appendLastMessage(`\n\n*[Tool Executed: ${data.name}]*\n` + (data.output ? `${data.output}\n` : ""));

                if (data.vfs) {
                  setVfs(data.vfs);
                }
              } else if (data.type === 'pty') {
                  useAppStore.getState().appendTerminalLog(data.content);
              } else if (data.type === 'swarm') {
                  useAppStore.getState().setSwarmState(data);
              } else if (data.type === 'platform') {
                  appendLastMessage(`\n\n*[Platform Architect]*: ${data.content}\n`);
              } else if (data.type === 'error') {
                appendLastMessage(`\n\n**Error**: ${data.message}\n`);
              }
            } catch (err) {
              console.error("Parse error", dataStr);
            }
          }
        }
      }
    } catch (error) {
      console.error(error);
      appendLastMessage(`\n\n**Connection failed. Please try again.**\n`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border-r">
      <div className="flex items-center justify-between p-4 border-b">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <Code className="w-5 h-5 text-blue-600" />
          AI Builder
        </h1>
        <Settings />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-4">
            <Bot className="w-12 h-12" />
            <p className="text-center text-sm px-4">
              Hello! I'm DeepAgent. I can build, fix, or modify web apps for you.<br/>
              Ask me to build a simple snake game or a fancy landing page.
            </p>
          </div>
        )}
        
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                <Bot className="w-5 h-5 text-blue-600" />
              </div>
            )}
            <div className={`max-w-[85%] rounded-lg px-4 py-2 ${
              msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-100 text-gray-800 rounded-bl-none prose prose-sm'
            }`}>
              <div className="whitespace-pre-wrap font-sans text-sm">{msg.content}</div>
            </div>
            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                <User className="w-5 h-5 text-gray-600" />
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isGenerating}
            placeholder={isGenerating ? "Working..." : "What do you want to build?"}
            className="flex-1 px-4 py-2 border rounded-full outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          />
          <button 
            type="submit" 
            disabled={isGenerating || !input.trim()}
            className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 transition"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
