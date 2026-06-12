// File: src/server/observability/Errors.ts

export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export enum ErrorCategory {
  OPERATIONAL = 'OPERATIONAL', // Recoverable (e.g., timeout, 404)
  PROGRAMMER = 'PROGRAMMER'    // Bug/Fault (e.g., null pointer, panic)
}

export interface ErrorContext {
  component: string;
  traceId?: string;
  userId?: string;
  vfsPath?: string;
  nodeId?: string;
  [key: string]: any;
}

export abstract class BasePlatformException extends Error {
  public abstract readonly category: ErrorCategory;
  public abstract readonly severity: ErrorSeverity;
  public readonly timestamp: string;
  public readonly context: ErrorContext;

  constructor(message: string, context: ErrorContext) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date().toISOString();
    this.context = context;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// Domain Specific Exceptions

export class VFSIOException extends BasePlatformException {
  readonly category = ErrorCategory.OPERATIONAL;
  readonly severity = ErrorSeverity.MEDIUM;
}

export class MCPTransportException extends BasePlatformException {
  readonly category = ErrorCategory.OPERATIONAL;
  readonly severity = ErrorSeverity.HIGH;
}

export class AgentExecutionException extends BasePlatformException {
  readonly category = ErrorCategory.OPERATIONAL;
  readonly severity = ErrorSeverity.MEDIUM;
}

export class PlatformPanicException extends BasePlatformException {
  readonly category = ErrorCategory.PROGRAMMER;
  readonly severity = ErrorSeverity.CRITICAL;
}
