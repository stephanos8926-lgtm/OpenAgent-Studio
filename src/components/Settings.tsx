import React, { useState } from 'react';
import { useAppStore } from '../lib/store';
import { X, Key, Settings as SettingsIcon } from 'lucide-react';

export default function Settings() {
  const { settings, setSettings } = useAppStore();
  const [isOpen, setIsOpen] = useState(false);
  const [localKey, setLocalKey] = useState(settings.openRouterKey);
  const [localModel, setLocalModel] = useState(settings.model);

  const handleSave = () => {
    setSettings({ openRouterKey: localKey, model: localModel });
    setIsOpen(false);
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="p-2 rounded hover:bg-gray-200 transition-colors"
        title="Settings"
      >
        <SettingsIcon className="w-5 h-5 text-gray-700" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 relative">
            <button 
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-black"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <SettingsIcon className="w-5 h-5" />
              Settings
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">OpenRouter API Key</label>
                <div className="relative">
                  <Key className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <input 
                    type="password" 
                    value={localKey}
                    onChange={(e) => setLocalKey(e.target.value)}
                    placeholder="sk-or-..."
                    className="w-full pl-9 pr-4 py-2 border rounded-md outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">Stored locally in your browser.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Free Tool-Calling Model</label>
                <input 
                  type="text" 
                  value={localModel}
                  onChange={(e) => setLocalModel(e.target.value)}
                  placeholder="e.g. google/gemini-2.0-flash-lite-preview-02-05:free"
                  className="w-full px-4 py-2 border rounded-md outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button 
                onClick={handleSave}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
