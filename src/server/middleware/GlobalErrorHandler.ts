// File: src/server/middleware/GlobalErrorHandler.ts

import { Request, Response, NextFunction } from 'express';
import { BasePlatformException, ErrorCategory, ErrorSeverity } from '../observability/Errors.js';
import { log } from '../observability/Logger.js';
import { captureException } from '../observability/Telemetry.js';

export function globalErrorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const component = 'HttpServer';
  
  // Context Enrichment
  const context = {
    method: req.method,
    url: req.url,
    ip: req.ip,
    traceId: req.headers['x-trace-id'],
    ...(err instanceof BasePlatformException ? err.context : {})
  };

  if (err instanceof BasePlatformException) {
    // Audit log the structured error
    log.error(component, err.message, {
      name: err.name,
      severity: err.severity,
      category: err.category,
      context: { ...context, ...err.context },
      stack: err.stack
    });

    // Capture to Sentry
    if (err.severity === ErrorSeverity.HIGH || err.severity === ErrorSeverity.CRITICAL) {
      captureException(err, context);
    }

    // Response Stratification
    if (err.category === ErrorCategory.OPERATIONAL) {
      return res.status(getHttpStatus(err)).json({
        status: 'error',
        code: err.name,
        message: err.message,
        retryable: true
      });
    } else {
      // Programmer error - potentially dangerous state
      // In production, we might want to kill the process and let the orchestrator restart it
      if (process.env.NODE_ENV === 'production') {
        log.fatal(component, 'CRITICAL PROGRAMMER ERROR - SHUTTING DOWN FOR SAFETY', { err });
        setTimeout(() => process.exit(1), 1000);
      }
      return res.status(500).json({
        status: 'fail',
        message: 'A critical internal error occurred.'
      });
    }
  }

  // Handle generic errors (unknown)
  log.error(component, 'Unhandled generic exception', {
    message: err.message,
    stack: err.stack,
    context
  });

  captureException(err, context);

  return res.status(500).json({
    status: 'error',
    message: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message
  });
}

function getHttpStatus(err: BasePlatformException): number {
  if (err.name === 'VFSIOException') return 500;
  if (err.name === 'MCPTransportException') return 502;
  if (err.name === 'AgentExecutionException') return 422;
  return 500;
}
