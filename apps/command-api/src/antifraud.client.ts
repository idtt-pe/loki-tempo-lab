import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { log } from 'telemetry/log';

const URL = process.env.ANTIFRAUD_URL ?? 'http://antifraud:3000';
const TIMEOUT_MS = Number(process.env.ANTIFRAUD_TIMEOUT_MS ?? 2000);

@Injectable()
export class AntifraudClient {
  check(walletId: number, merchantId: number, amountCents: number) {
    return trace.getTracer('antifraud-client').startActiveSpan('antifraud.check', async (span) => {
      try {
        await this.call(walletId, merchantId, amountCents);
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        throw err;
      } finally {
        span.end();
      }
    });
  }

  private async call(walletId: number, merchantId: number, amountCents: number) {
    let status: number;
    try {
      const res = await fetch(`${URL}/check`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ walletId, merchantId, amountCents }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      status = res.status;
      await res.body?.cancel();
    } catch (err) {
      log.error({ wallet_id: walletId, merchant_id: merchantId, err: (err as Error).name }, 'antifraud request failed');
      throw new ServiceUnavailableException('antifraud unavailable');
    }
    if (status !== 200) {
      log.error({ wallet_id: walletId, merchant_id: merchantId, antifraud_status: status }, 'antifraud rejected the check');
      throw new ServiceUnavailableException('antifraud unavailable');
    }
  }
}
