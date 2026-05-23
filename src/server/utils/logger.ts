import pino from 'pino';

/**
 * Singleton Logger Configuration
 * Utilizes Pino for enterprise-grade, high-performance structured logging.
 * In development, utilizes pino-pretty for human-readable output.
 */
class Logger {
  private static instance: pino.Logger;

  // Private constructor to prevent direct construction calls with the `new` operator.
  private constructor() {}

  /**
   * The static method that controls the access to the singleton instance.
   * On the first run, it creates a singleton object and places it into the static field.
   * On subsequent runs, it returns the client existing object stored in the static field.
   */
  public static getInstance(): pino.Logger {
    if (!Logger.instance) {
      Logger.instance = pino({
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport: process.env.NODE_ENV !== 'production' ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname'
          }
        } : undefined,
      });
    }
    return Logger.instance;
  }
}

export const logger = Logger.getInstance();
