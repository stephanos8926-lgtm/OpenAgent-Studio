// File: src/server/observability/Logger.ts

import pino from 'pino';
import fs from 'fs';
import path from 'path';

const PII_PATTERNS = [
  /password/i,
  /secret/i,
  /key/i,
  /token/i,
  /auth/i,
  /apikey/i,
  /access_token/i,
  /refresh_token/i,
  /cookie/i,
  /set-cookie/i
];

const redact = {
  paths: [
    'password',
    'secret',
    'key',
    'token',
    'auth',
    'apiKey',
    'accessToken',
    'refreshToken',
    'context.userId',
    '*.password',
    '*.secret'
  ],
  censor: '[REDACTED]'
};

// Create a custom stream or hook to handle regex-based scrubbing of any text message if needed, 
// though Pino's redactor handles object keys efficiently.
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact,
  mixin(_context, level) {
    return {
      service: 'langgraph-swarm-ide',
      environment: process.env.NODE_ENV || 'development'
    };
  }
});

/**
 * Appends log content to `.data/startup-compile.log` to persist logs for audit.
 */
function appendToFile(level: string, component: string, message: string, context?: any) {
  try {
    const logDir = path.join(process.cwd(), '.data');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const logPath = path.join(logDir, 'startup-compile.log');
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` | Context: ${JSON.stringify(context)}` : '';
    const fileLogEntry = `[${timestamp}] [${level.toUpperCase()}] [${component}] ${message}${contextStr}\n`;
    fs.appendFileSync(logPath, fileLogEntry, 'utf-8');
  } catch (err) {
    // Fail silently to avoid interrupting the main thread
  }
}

/**
 * Structured logger utility to enforce schema compliance with disk persistence.
 */
export const log = {
  debug: (component: string, message: string, context?: any) => {
    logger.debug({ component, ...context }, message);
    appendToFile('DEBUG', component, message, context);
  },
  info: (component: string, message: string, context?: any) => {
    logger.info({ component, ...context }, message);
    appendToFile('INFO', component, message, context);
  },
  warn: (component: string, message: string, context?: any) => {
    logger.warn({ component, ...context }, message);
    appendToFile('WARN', component, message, context);
  },
  error: (component: string, message: string, context?: any) => {
    logger.error({ component, ...context }, message);
    appendToFile('ERROR', component, message, context);
  },
  fatal: (component: string, message: string, context?: any) => {
    logger.fatal({ component, ...context }, message);
    appendToFile('FATAL', component, message, context);
  },
  /**
   * Directly write compiler progress logs or external command dumps to the audit file.
   */
  rawFileWriter: (component: string, rawMessage: string) => {
    try {
      const logDir = path.join(process.cwd(), '.data');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      const logPath = path.join(logDir, 'startup-compile.log');
      const timestamp = new Date().toISOString();
      // Normalize layout line breaks for presentation
      const cleaned = rawMessage.replace(/\r/g, '').trim();
      if (!cleaned) return;
      fs.appendFileSync(logPath, `[${timestamp}] [RAW] [${component}] ${cleaned}\n`, 'utf-8');
    } catch (err) {
      // ignore
    }
  }
};

