import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

export interface TelemetryOptions {
  serviceName: string;
  serviceNamespace?: string;
  serviceVersion?: string;
  otlpEndpoint?: string;
}

export interface TelemetryHandle {
  shutdown: () => Promise<void>;
}

export function bootstrapTelemetry(options: TelemetryOptions): Promise<TelemetryHandle> {
  const resource = resourceFromAttributes({
    [SemanticResourceAttributes.SERVICE_NAME]: options.serviceName,
    [SemanticResourceAttributes.SERVICE_NAMESPACE]: options.serviceNamespace ?? 'anankor',
    [SemanticResourceAttributes.SERVICE_VERSION]: options.serviceVersion ?? '0.1.0',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV ?? 'development',
  });

  const traceExporter = options.otlpEndpoint
    ? new OTLPTraceExporter({ url: `${options.otlpEndpoint}/v1/traces` })
    : undefined;

  const sdk = new NodeSDK({
    resource,
    traceExporter,
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();

  return Promise.resolve({
    shutdown: () => sdk.shutdown(),
  });
}
