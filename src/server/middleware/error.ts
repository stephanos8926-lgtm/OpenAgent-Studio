import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Standardized API Error Response Structure
 */
interface ErrorResponse {
  error: boolean;
  message: string;
  code?: string;
  details?: any;
}

/**
 * Custom App Error Class extending native Error
 * Useful for catching specific operational vs programmer errors
 */
export class AppError extends Error {
  public statusCode: number;
  public code: string;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Global Error Handling Middleware
 * Catches all unhandled errors in the Express pipeline
 */
export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Determine if error is a known operational error
  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? (err as AppError).statusCode : 500;
  const code = isAppError ? (err as AppError).code : 'INTERNAL_SERVER_ERROR';

  // Log the error via the singleton logger
  if (statusCode >= 500) {
    logger.error({ err, req_id: req.headers['x-request-id'] }, 'Unhandled Server Error');
  } else {
    logger.warn({ err, req_id: req.headers['x-request-id'] }, 'Operational Error');
  }

  const response: ErrorResponse = {
    error: true,
    message: isAppError || process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error',
    code,
  };

  // Stack trace only attached in development mode for security
  if (process.env.NODE_ENV === 'development') {
    response.details = err.stack;
  }

  res.status(statusCode).json(response);
};
