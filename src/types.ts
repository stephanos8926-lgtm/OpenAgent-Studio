// File: src/types.ts

// Severity levels matching standard telemetry suites
export type TelemetrySeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

// Crucial physical classification separating the environment tools from the user-generated software
export type TelemetryOrigin = 'IDE_SYSTEM' | 'USER_APPLICATION';

export interface TelemetryLog {
  id: string;
  timestamp: string;
  severity: TelemetrySeverity;
  origin: TelemetryOrigin;
  module: string;    // e.g., 'FileTree', 'LinterService', 'ComponentSandbox', 'ExpressRouter'
  message: string;
  detail?: string;   // e.g., stack trace or diagnostics data
  meta?: Record<string, any>;
}

export interface SystemMetrics {
  cpuUsage: number;         // simulated profiling processor utilization (%)
  memoryUsage: number;      // simulated active heap usage (MB)
  activeAgent: string;      // currently active LangGraph Swarm agent loop
  health: 'good' | 'failing';
  networkLatency: number;   // ms
  buildSuccessCount: number;
  buildFailureCount: number;
  appErrorCount: number;
  ideErrorCount: number;
  totalTokensUsed: number;
}

export interface TaskNode {
  id: string;
  label: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  dependsOn?: string[];
  assignedTo?: string; // Orchestrator, Planner, Coder, Auditor, Platform
}

export interface WorkspaceFile {
  name: string;
  path: string;
  isDirectory: boolean;
  content?: string;
  proposedContent?: string;
  children?: WorkspaceFile[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export type ExecutionMode = 'plan' | 'normal' | 'yolo';
