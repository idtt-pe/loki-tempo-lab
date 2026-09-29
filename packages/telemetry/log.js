import pino from 'pino';

export const log = pino({
  base: { service: process.env.OTEL_SERVICE_NAME ?? 'app' },
  messageKey: 'msg',
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (label) => ({ level: label }) },
});
