/**
 * OpenTelemetry bootstrap, loaded before the app with `node --import ./dist/instrument.js`.
 * Does nothing unless OTEL_EXPORTER_OTLP_ENDPOINT is set; then HTTP, pg, ioredis and friends
 * are traced and exported to the collector (Tempo in the observability profile).
 */
import { register } from 'node:module';

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  // ESM modules can only be patched through the loader hook, registered before they load.
  register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);
  const { NodeSDK } = await import('@opentelemetry/sdk-node');
  const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node');
  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'taskin-api',
    instrumentations: [getNodeAutoInstrumentations({ '@opentelemetry/instrumentation-fs': { enabled: false } })],
  });
  sdk.start();
  const stop = () => void sdk.shutdown();
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}
