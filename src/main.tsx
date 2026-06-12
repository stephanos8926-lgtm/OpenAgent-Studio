// File: src/main.tsx

import 'zone.js';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { StoreProvider } from './lib/store';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

import { initWebTelemetry } from './lib/telemetry';

// Browser-level storage integrity check
function checkStorageIntegrity() {
  try {
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      const value = localStorage.getItem(key);
      if (value && (value.startsWith('{') || value.startsWith('['))) {
        JSON.parse(value); // Will throw if corrupted
      }
    }
  } catch (e) {
    console.warn("Storage corruption detected, clearing local and session storage. Error:", e);
    localStorage.clear();
    sessionStorage.clear();
  }
}

// Run before anything else boots
checkStorageIntegrity();

// Initialize web telemetry
initWebTelemetry();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StoreProvider>
      <ErrorBoundary componentName="AppRoot">
        <App />
      </ErrorBoundary>
    </StoreProvider>
  </React.StrictMode>
);
