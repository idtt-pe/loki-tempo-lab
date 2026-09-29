import { SpanKind } from '@opentelemetry/api';
import { log } from 'telemetry/log';
import { writePool } from './db.js';
import { kafka, TOPIC } from './kafka.js';
import { injectFrom, startChildSpan } from './tracing.js';

const BATCH = Number(process.env.RELAY_BATCH ?? 500);
const IDLE_MS = Number(process.env.RELAY_IDLE_MS ?? 5);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function startRelay() {
  const producer = kafka.producer({ idempotent: true, maxInFlightRequests: 1 });
  await producer.connect();

  for (;;) {
    const client = await writePool.connect();
    let relayed = 0;
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `DELETE FROM outbox
         WHERE id IN (SELECT id FROM outbox ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED)
         RETURNING id, aggregate_id, type, payload`,
        [BATCH],
      );
      relayed = rows.length;
      if (relayed) {
        rows.sort((a, b) => a.id - b.id);
        const spans = rows.map((r) =>
          startChildSpan(`${TOPIC} publish`, r.payload.trace, SpanKind.PRODUCER, {
            'messaging.system': 'kafka',
            'messaging.destination.name': TOPIC,
            'messaging.operation.type': 'send',
            'outbox.id': r.id,
            'wallet.id': r.aggregate_id,
          }),
        );
        try {
          await producer.send({
            topic: TOPIC,
            acks: -1,
            messages: rows.map((r, i) => {
              const { trace: _, ...payload } = r.payload;
              return { key: String(r.aggregate_id), value: JSON.stringify({ type: r.type, ...payload }), headers: injectFrom(spans[i]) };
            }),
          });
        } finally {
          for (const span of spans) span.end();
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      log.error({ err: (err as Error).message }, 'relay failed to publish outbox batch');
      await sleep(500);
    } finally {
      client.release();
    }
    if (relayed < BATCH) await sleep(IDLE_MS);
  }
}

export async function outboxPending(): Promise<number> {
  const { rows } = await writePool.query('SELECT count(*)::int AS n FROM outbox');
  return rows[0].n;
}
