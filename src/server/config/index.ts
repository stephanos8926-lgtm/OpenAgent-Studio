import fs from 'fs/promises';
import path from 'path';

export interface AppConfig {
  agent: {
    tempDirPrefix: string;
    allowedCommands: string[];
    executionTimeoutMs: number;
    defaultModel: string;
    coderTemperature: number;
    plannerTemperature: number;
  };
  server: {
    port: number;
  };
}

const DEFAULT_CONFIG: AppConfig = {
  agent: {
    tempDirPrefix: 'agent-workspace-',
    allowedCommands: ['npm', 'node', 'ls', 'grep', 'mkdir', 'cat', 'echo', 'pwd', 'npx', 'tsc'],
    executionTimeoutMs: 30000,
    defaultModel: 'google/gemini-2.0-flash-lite-preview-02-05:free',
    coderTemperature: 0.2,
    plannerTemperature: 0.5
  },
  server: {
    port: 3000
  }
};

let currentConfig: AppConfig = { ...DEFAULT_CONFIG };

export const loadConfig = async () => {
  try {
    const configPath = path.join(process.cwd(), 'deepagent.config.json');
    const content = await fs.readFile(configPath, 'utf8');
    const fileConfig = JSON.parse(content);
    
    currentConfig = {
      ...DEFAULT_CONFIG,
      ...fileConfig,
      agent: { ...DEFAULT_CONFIG.agent, ...(fileConfig.agent || {}) },
      server: { ...DEFAULT_CONFIG.server, ...(fileConfig.server || {}) },
    };
  } catch (e) {
    // File not found or invalid JSON, keep defaults
  }

  // Override with environment variables
  if (process.env.AGENT_ALLOWED_COMMANDS) {
    currentConfig.agent.allowedCommands = process.env.AGENT_ALLOWED_COMMANDS.split(',');
  }
  if (process.env.AGENT_EXECUTION_TIMEOUT_MS) {
    currentConfig.agent.executionTimeoutMs = parseInt(process.env.AGENT_EXECUTION_TIMEOUT_MS, 10);
  }
  // Enforce port 3000 for AI Studio environment routing stability
  currentConfig.server.port = 3000;
};

export const getConfig = () => currentConfig;
