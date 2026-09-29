import { Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { context, propagation } from '@opentelemetry/api';
import pg from 'pg';
import { log } from 'telemetry/log';
import { PG } from './db.js';
import { MovementAccepted } from './commands.js';

@Injectable()
export class WalletRepository {
  constructor(@Inject(PG) private readonly pool: pg.Pool) {}

  async applyMovement(
    walletId: number,
    merchantId: number | null,
    kind: 'payment' | 'topup',
    amountCents: number,
  ): Promise<MovementAccepted> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const delta = kind === 'payment' ? -amountCents : amountCents;
      const wallet = await client.query(
        `UPDATE wallets SET balance_cents = balance_cents + $2, updated_at = now()
         WHERE id = $1 AND balance_cents + $2 >= 0
         RETURNING balance_cents, owner_name`,
        [walletId, delta],
      );
      if (!wallet.rowCount) {
        await client.query('ROLLBACK');
        log.warn({ wallet_id: walletId, kind, amount_cents: amountCents }, 'movement rejected: insufficient funds or unknown wallet');
        throw new UnprocessableEntityException('insufficient funds or unknown wallet');
      }
      const tx = await client.query(
        `INSERT INTO transactions (wallet_id, merchant_id, kind, amount_cents)
         VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
        [walletId, merchantId, kind, amountCents],
      );
      const event = {
        txId: tx.rows[0].id,
        walletId,
        merchantId,
        kind,
        amountCents,
        balanceCents: wallet.rows[0].balance_cents,
        ownerName: wallet.rows[0].owner_name,
        createdAt: tx.rows[0].created_at,
        trace: {} as Record<string, string>,
      };
      propagation.inject(context.active(), event.trace);
      await client.query(
        `INSERT INTO outbox (aggregate_id, type, payload)
         VALUES ($1, $2, jsonb_set($3::jsonb, '{committedAt}', to_jsonb(clock_timestamp())))`,
        [walletId, kind === 'payment' ? 'PaymentAccepted' : 'TopUpAccepted', JSON.stringify(event)],
      );
      await client.query('COMMIT');
      return { txId: event.txId, balanceCents: event.balanceCents };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      if ((err as { code?: string }).code === '23503') throw new NotFoundException('unknown merchant');
      throw err;
    } finally {
      client.release();
    }
  }
}
