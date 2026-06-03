import pino from 'pino';
import fs from 'fs';
import path from 'path';

/**
 * Singleton Logger Configuration
 * Utilizes Pino for enterprise-grade, high-performance structured logging.
 * In development, utilizes pino-pretty for human-readable output.
 * If development and process.env.DEBUG_MODE === 'true', supplements logging
 * with advanced debugging framing and error dumps to .data/debug_errors.log.
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
      const isDev = process.env.NODE_ENV !== 'production';
      const isDebugActive = process.env.DEBUG_MODE === 'true';
      
      const level = isDebugActive ? 'trace' : (isDev ? 'debug' : 'info');

      const baseLogger = pino({
        level,
        transport: isDev ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname'
          }
        } : undefined,
      });

      // Supplement logging facilities with robust developer workspace diagnostics if debug is active
      if (isDev && isDebugActive) {
        const errorLogPath = path.join(process.cwd(), ".data", "debug_errors.log");
        
        // Ensure data folder exists
        try {
          fs.mkdirSync(path.join(process.cwd(), ".data"), { recursive: true });
        } catch (e) {}

        const originalError = baseLogger.error.bind(baseLogger);

        // Customize error implementation to output rich console frames and write to debug disk
        baseLogger.error = (first: any, ...args: any[]) => {
          // Robust CLI highlight block
          console.error(`\n=================== 🚨 ROBUST DEBUG ERROR DETECTED 🚨 ===================`);
          console.error(`Timestamp: ${new Date().toISOString()}`);
          
          let errObj: any = null;
          let msgStr = "";

          if (typeof first === 'object' && first !== null) {
            errObj = first;
            msgStr = args[0] || first.message || "An object error occurred";
          } else {
            msgStr = String(first);
          }

          console.error(`Message: ${msgStr}`);
          if (errObj) {
            if (errObj.stack) {
              console.error(`\nStack Trace:\n${errObj.stack}\n`);
            } else {
              console.error(`\nMetadata Context:\n${JSON.stringify(errObj, null, 2)}\n`);
            }
          }
          console.error(`========================================================================\n`);

          // Write structured diagnostic log to disk .data/debug_errors.log for deep inspections
          try {
            const fileLogEntry = JSON.stringify({
              timestamp: new Date().toISOString(),
              message: msgStr,
              stack: errObj?.stack,
              context: errObj,
              arguments: args
            }) + "\n";
            fs.appendFileSync(errorLogPath, fileLogEntry, 'utf-8');
          } catch (fileErr) {
            // fallback
          }

          // Call the original pino channel
          return originalError(first, ...args);
        };
      }

      Logger.instance = baseLogger;
    }
    return Logger.instance;
  }
}

export const logger = Logger.getInstance();
