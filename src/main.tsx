// File: src/main.tsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { StoreProvider } from './lib/store';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StoreProvider>
      <ErrorBoundary componentName="AppRoot">
        <App />
      </ErrorBoundary>
    </StoreProvider>
  </React.StrictMode>
);
