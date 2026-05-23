import pinoHttp from 'pino-http';
import crypto from 'crypto';
import { logger } from '../utils/logger';

/**
 * Enterprise Request Logging Middleware
 * Correlates incoming requests via a generated or provided Request ID
 * and automatically logs request latency and status codes.
 */
export const requestLogger = pinoHttp({
  logger,
  genReqId: function (req) {
    if (req.id) return req.id;
    const id = req.headers['x-request-id'] || crypto.randomUUID();
    return id;
  },
  customLogLevel: function (req, res, err) {
    if (res.statusCode >= 400 && res.statusCode < 500) {
      return 'warn';
    } else if (res.statusCode >= 500 || err) {
      return 'error';
    }
    // Only log successful requests in debug mode to avoid log spam,
    // or return 'info' if you want a complete audit trail.
    return process.env.NODE_ENV === 'development' ? 'info' : 'silent';
  },
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      remoteAddress: req.remoteAddress
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    })
  }
});
