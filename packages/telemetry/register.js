import { register } from 'node:module';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';

register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter(),
  instrumentations: [
    new HttpInstrumentation({
      ignoreIncomingRequestHook: (req) => req.url === '/health' || req.url === '/stats' || req.url === '/reset',
    }),
    new UndiciInstrumentation(),
    new PgInstrumentation({ requireParentSpan: true }),
    new PinoInstrumentation({ disableLogSending: true }),
  ],
});

sdk.start();

const shutdown = () => sdk.shutdown().finally(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
