// File: src/lib/telemetry.ts

import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { getWebAutoInstrumentations } from '@opentelemetry/auto-instrumentations-web';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor, SamplingDecision } from '@opentelemetry/sdk-trace-base';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { ZoneContextManager } from '@opentelemetry/context-zone';

let currentCpuUsage = 0;

/**
 * Custom Sampling Middleware
 * Throttles non-error log events to 10% when CPU utilization is high (>80%).
 */
class DynamicSampler {
  shouldSample(spanContext: any, traceId: any, spanName: any, spanKind: any, attributes: any, links: any) {
    const isError = attributes?.['error'] === true || attributes?.['http.status_code'] >= 400;
    
    // If CPU is high and it's not an error, sample at 10%
    if (currentCpuUsage > 80 && !isError) {
      const decision = Math.random() < 0.1 ? SamplingDecision.RECORD_AND_SAMPLED : SamplingDecision.NOT_RECORD;
      return { decision };
    }
    
    return { decision: SamplingDecision.RECORD_AND_SAMPLED }; // Default: sample everything
  }

  toString() {
    return 'DynamicSampler';
  }
}

export function updateTelemetryMetrics(cpuUsage: number) {
  currentCpuUsage = cpuUsage;
}

/**
 * Initializes OpenTelemetry for the browser with error tolerance.
 */
export function initWebTelemetry() {
  try {
    const provider = new WebTracerProvider({
      sampler: new DynamicSampler() as any
    });

    const exporter = new OTLPTraceExporter({
      url: '/api/traces',
    });

    (provider as any).addSpanProcessor(new BatchSpanProcessor(exporter) as any);

    provider.register({
      contextManager: new ZoneContextManager(),
    });

    registerInstrumentations({
      instrumentations: [
        getWebAutoInstrumentations({
          '@opentelemetry/instrumentation-fetch': {
            propagateTraceHeaderCorsUrls: [/.*/],
          },
        }),
      ],
    });

    console.log('[Telemetry] Web OpenTelemetry initialized successfully');
  } catch (error) {
    console.warn('[Telemetry] Fail-soft on client-side OpenTelemetry init:', error);
  }
}

