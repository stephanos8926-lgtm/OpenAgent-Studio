// File: src/server/observability/Telemetry.ts

import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ATTR_SERVICE_NAME, ATTR_DEPLOYMENT_ENVIRONMENT_NAME } from '@opentelemetry/semantic-conventions';
import { AlwaysOnSampler, ParentBasedSampler, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';
import { log } from './Logger.js';

export async function initializeTelemetry() {
  const COMPONENT = 'Telemetry';
  const { resourceFromAttributes } = (await import('@opentelemetry/resources')) as any;

  // 1. Sentry Configuration
  if (process.env.SENTRY_DSN) {
    try {
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        integrations: [
          nodeProfilingIntegration(),
        ],
        // Performance Monitoring
        tracesSampleRate: 1.0, // Capture 100% of the transactions
        // Set sampling rate for profiling - this is relative to tracesSampleRate
        profilesSampleRate: 1.0,
        environment: process.env.NODE_ENV || 'development',
      });
      log.info(COMPONENT, 'Sentry initialized');
    } catch (sentryError) {
      log.warn(COMPONENT, 'Sentry initialization failed framework-softly', { sentryError });
    }
  }

  // 2. OpenTelemetry Configuration with Sampling
  try {
    // record 100% of errors (via global error handler)
    // Sample 10% of high-frequency traces
    const traceSampler = new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(0.1),
    });

    const sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: 'langgraph-swarm-ide',
        [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: process.env.NODE_ENV || 'development',
      }),
      traceExporter: new OTLPTraceExporter({
        url: process.env.OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
      }),
      instrumentations: [getNodeAutoInstrumentations()],
      sampler: process.env.NODE_ENV === 'production' ? traceSampler : new AlwaysOnSampler(),
    });

    sdk.start();
    log.info(COMPONENT, 'OpenTelemetry initialized successfully');

    // Process exit handling
    process.on('SIGTERM', () => {
      sdk.shutdown()
        .then(() => log.info(COMPONENT, 'Tracing terminated'))
        .catch((error) => log.error(COMPONENT, 'Error terminating tracing', { error }))
        .finally(() => process.exit(0));
    });
  } catch (error) {
    log.warn(COMPONENT, 'Graceful fallback on OpenTelemetry NodeSDK init:', { error });
  }
}

/**
 * Capture error to Sentry with additional context
 */
export function captureException(error: any, context?: any) {
  Sentry.withScope((scope) => {
    if (context) {
      scope.setExtras(context);
    }
    Sentry.captureException(error);
  });
}
