import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { log } from 'telemetry/log';
import { readPool } from './db.js';
import { kafka, TOPIC } from './kafka.js';
import { recordBatch, recordLag, recordStages } from './stats.js';
import { startChildSpan } from './tracing.js';

type WalletEvent = {
  type: 'PaymentAccepted' | 'TopUpAccepted';
  txId: number;
  walletId: number;
  merchantId: number | null;
  kind: 'payment' | 'topup';
  amountCents: number;
  balanceCents: number;
  ownerName: string;
  createdAt: string;
  committedAt: string;
};

const merchants = new Map<number, { name: string; category: string }>();

async function loadMerchants() {
  const { rows } = await readPool.query('SELECT id, name, category FROM merchants');
  for (const r of rows) merchants.set(r.id, { name: r.name, category: r.category });
}

export async function apply(events: WalletEvent[]) {
  const started = performance.now();
  const client = await readPool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO wallet_movements (wallet_id, tx_id, kind, merchant_name, category, amount_cents, created_at)
       SELECT * FROM unnest($1::bigint[], $2::bigint[], $3::text[], $4::text[], $5::text[], $6::bigint[], $7::timestamptz[])
       ON CONFLICT DO NOTHING
       RETURNING tx_id`,
      [
        events.map((e) => e.walletId),
        events.map((e) => e.txId),
        events.map((e) => e.kind),
        events.map((e) => (e.merchantId ? merchants.get(e.merchantId)?.name ?? null : null)),
        events.map((e) => (e.merchantId ? merchants.get(e.merchantId)?.category ?? 'otros' : 'recarga')),
        events.map((e) => e.amountCents),
        events.map((e) => e.createdAt),
      ],
    );
    const fresh = new Set(inserted.rows.map((r) => r.tx_id));
    const applied = events.filter((e) => fresh.has(e.txId));

    if (applied.length) {
      const latest = new Map<number, WalletEvent>();
      for (const e of applied) {
        const current = latest.get(e.walletId);
        if (!current || e.txId > current.txId) latest.set(e.walletId, e);
      }
      const balances = [...latest.values()];
      await client.query(
        `INSERT INTO wallet_balance (wallet_id, owner_name, balance_cents, last_tx_id, updated_at)
         SELECT * FROM unnest($1::bigint[], $2::text[], $3::bigint[], $4::bigint[], $5::timestamptz[])
         ON CONFLICT (wallet_id) DO UPDATE
           SET balance_cents = excluded.balance_cents, last_tx_id = excluded.last_tx_id, updated_at = excluded.updated_at
           WHERE wallet_balance.last_tx_id < excluded.last_tx_id`,
        [
          balances.map((e) => e.walletId),
          balances.map((e) => e.ownerName),
          balances.map((e) => e.balanceCents),
          balances.map((e) => e.txId),
          balances.map((e) => e.createdAt),
        ],
      );

      await client.query(
        `INSERT INTO wallet_month_category (wallet_id, month, category, tx_count, amount_cents)
         SELECT wallet_id, date_trunc('month', created_at)::date, category, count(*), sum(amount_cents)
         FROM unnest($1::bigint[], $2::timestamptz[], $3::text[], $4::bigint[]) AS e(wallet_id, created_at, category, amount_cents)
         GROUP BY 1, 2, 3
         ON CONFLICT (wallet_id, month, category) DO UPDATE
           SET tx_count = wallet_month_category.tx_count + excluded.tx_count,
               amount_cents = wallet_month_category.amount_cents + excluded.amount_cents`,
        [
          applied.map((e) => e.walletId),
          applied.map((e) => e.createdAt),
          applied.map((e) => (e.merchantId ? merchants.get(e.merchantId)?.category ?? 'otros' : 'recarga')),
          applied.map((e) => e.amountCents),
        ],
      );

      const payments = applied.filter((e) => e.kind === 'payment' && e.merchantId);
      if (payments.length) {
        await client.query(
          `INSERT INTO merchant_hour_sales (merchant_id, hour, tx_count, amount_cents)
           SELECT merchant_id, date_trunc('hour', created_at), count(*), sum(amount_cents)
           FROM unnest($1::int[], $2::timestamptz[], $3::bigint[]) AS e(merchant_id, created_at, amount_cents)
           GROUP BY 1, 2
           ON CONFLICT (merchant_id, hour) DO UPDATE
             SET tx_count = merchant_hour_sales.tx_count + excluded.tx_count,
                 amount_cents = merchant_hour_sales.amount_cents + excluded.amount_cents`,
          [payments.map((e) => e.merchantId), payments.map((e) => e.createdAt), payments.map((e) => e.amountCents)],
        );
      }
    }
    await client.query('COMMIT');
    recordBatch(performance.now() - started);
    const now = Date.now();
    for (const e of applied) recordLag(now - Date.parse(e.committedAt));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function startProjection() {
  await loadMerchants();
  const consumer = kafka.consumer({ groupId: 'read-model-projector', maxWaitTimeInMs: 20 });
  await consumer.connect();
  await consumer.subscribe({ topics: [TOPIC], fromBeginning: true });
  await consumer.run({
    eachBatch: async ({ batch }) => {
      const received = Date.now();
      const events = batch.messages.map((m) => JSON.parse(m.value!.toString()) as WalletEvent);
      const spans = batch.messages.map((m, i) =>
        startChildSpan(
          `${TOPIC} process`,
          Object.fromEntries(Object.entries(m.headers ?? {}).map(([k, v]) => [k, String(v)])),
          SpanKind.CONSUMER,
          {
            'messaging.system': 'kafka',
            'messaging.destination.name': TOPIC,
            'messaging.operation.type': 'process',
            'messaging.kafka.offset': Number(m.offset),
            'wallet.id': events[i].walletId,
            'tx.id': events[i].txId,
          },
          received,
        ),
      );
      try {
        if (events.length) await apply(events);
      } catch (err) {
        for (const span of spans) span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message }).end();
        log.error({ partition: batch.partition, events: events.length, err: (err as Error).message }, 'projection batch failed');
        throw err;
      }
      const applied = Date.now();
      for (const span of spans) span.end(applied);
      log.info({ partition: batch.partition, events: events.length, apply_ms: applied - received }, 'projection batch applied');
      for (let i = 0; i < events.length; i++) {
        const produced = Number(batch.messages[i].timestamp);
        const committed = Date.parse(events[i].committedAt);
        recordStages(produced - committed, received - produced, applied - received);
      }
    },
  });
}
