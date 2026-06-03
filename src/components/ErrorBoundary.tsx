// File: src/components/ErrorBoundary.tsx

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ShieldAlert, RefreshCcw, WifiOff } from 'lucide-react';

interface Props {
  children?: ReactNode;
  componentName: string;
  onCrashReport?: (errorMsg: string, stack: string) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    const { componentName, onCrashReport } = this.props;

    const errorMsg = error.message || 'Unknown render exception';
    const stack = errorInfo.componentStack || error.stack || '';

    // Trigger local context reports if passed
    if (onCrashReport) {
      onCrashReport(errorMsg, stack);
    }

    // Call unified telemetry endpoint on backend to record this IDE/App UI fault
    fetch('/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'ui-' + Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        severity: 'CRITICAL',
        origin: 'USER_APPLICATION', // UI level failures impact user experience
        module: `ErrorBoundary[${componentName}]`,
        message: `UI Crash in <${componentName}/>: ${errorMsg}`,
        detail: stack
      })
    }).catch(err => {
      console.warn('Telemetry server upload failed from ErrorBoundary:', err);
    });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div 
          id={`error-boundary-${this.props.componentName.toLowerCase()}`}
          className="flex flex-col items-center justify-center p-6 bg-slate-950 border border-red-500/30 rounded-xl relative overflow-hidden h-full min-h-[180px] text-center"
        >
          {/* Pulsing red visual indicator */}
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-red-900/40 text-red-400 font-mono text-[9px] px-2 py-0.5 rounded border border-red-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            FAULT RESTRICTED
          </div>
          
          <div className="p-3 bg-red-950/60 rounded-xl text-red-500 border border-red-500/25 mb-3.5">
            <ShieldAlert className="w-6 h-6" />
          </div>

          <h4 className="text-sm font-bold text-slate-100 font-display">
            &lt;{this.props.componentName}/&gt; Crashed
          </h4>
          
          <p className="text-xs text-slate-400 mt-1 max-w-sm font-mono truncate px-4">
            {this.state.error?.message || 'Component mounting or state evaluation crash.'}
          </p>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={this.handleReset}
              className="px-3.5 py-1.5 bg-slate-900 text-slate-200 border border-slate-700 hover:border-slate-500 hover:bg-slate-850 hover:text-white rounded-lg text-xs font-black flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            >
              <RefreshCcw className="w-3.5 h-3.5 text-blue-400" />
              Reset Panel
            </button>
          </div>
        </div>
      );
    }

    // Access props children safely as requested
    return this.props.children;
  }
}
