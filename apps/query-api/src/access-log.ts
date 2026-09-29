import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { trace } from '@opentelemetry/api';
import { log } from 'telemetry/log';

export function accessLog(app: NestFastifyApplication) {
  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook('onRequest', (req, _reply, done) => {
    const route = req.routeOptions.url;
    if (route) trace.getActiveSpan()?.updateName(`${req.method} ${route}`).setAttribute('http.route', route);
    done();
  });
  fastify.addHook('onResponse', (req, reply, done) => {
    if (req.url !== '/health') {
      const body = (req.body ?? {}) as { walletId?: number; merchantId?: number };
      const params = (req.params ?? {}) as { id?: string };
      const route = req.routeOptions.url ?? req.url;
      const id = params.id ? Number(params.id) : undefined;
      log.info(
        {
          method: req.method,
          route,
          status: reply.statusCode,
          duration_ms: Math.round(reply.elapsedTime * 10) / 10,
          wallet_id: body.walletId ?? (route.startsWith('/wallets') ? id : undefined),
          merchant_id: body.merchantId ?? (route.startsWith('/merchants') ? id : undefined),
        },
        'request completed',
      );
    }
    done();
  });
}
