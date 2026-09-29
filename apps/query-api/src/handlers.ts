import { Inject, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { trace } from '@opentelemetry/api';
import pg from 'pg';
import { PG } from './db.js';
import { GetMerchantDashboardQuery, GetStatementQuery } from './queries.js';

const STATEMENT_SQL = `
SELECT json_build_object(
  'walletId', b.wallet_id,
  'owner', b.owner_name,
  'balanceCents', b.balance_cents,
  'month', (
    SELECT coalesce(json_agg(json_build_object('category', c.category, 'tx_count', c.tx_count, 'amount_cents', c.amount_cents) ORDER BY c.amount_cents DESC), '[]')
    FROM wallet_month_category c
    WHERE c.wallet_id = b.wallet_id AND c.month = date_trunc('month', now())::date
  ),
  'movements', (
    SELECT coalesce(json_agg(x), '[]')
    FROM (
      SELECT tx_id, kind, merchant_name, amount_cents, created_at
      FROM wallet_movements
      WHERE wallet_id = b.wallet_id
      ORDER BY tx_id DESC
      LIMIT 20
    ) x
  )
) AS body
FROM wallet_balance b
WHERE b.wallet_id = $1`;

const DASHBOARD_SQL = `
SELECT json_build_object(
  'merchantId', m.id,
  'name', m.name,
  'today', (
    SELECT json_build_object('txCount', coalesce(sum(tx_count), 0), 'amountCents', coalesce(sum(amount_cents), 0),
                             'avgTicketCents', coalesce(round(sum(amount_cents)::numeric / nullif(sum(tx_count), 0)), 0))
    FROM merchant_hour_sales
    WHERE merchant_id = m.id AND hour >= date_trunc('day', now())
  ),
  'byHour', (
    SELECT coalesce(json_agg(json_build_object('hour', hour, 'tx_count', tx_count, 'amount_cents', amount_cents) ORDER BY hour), '[]')
    FROM merchant_hour_sales
    WHERE merchant_id = m.id AND hour >= date_trunc('day', now())
  ),
  'last7Days', (
    SELECT coalesce(json_agg(d ORDER BY d.day), '[]')
    FROM (
      SELECT date_trunc('day', hour)::date AS day, sum(tx_count) AS tx_count, sum(amount_cents) AS amount_cents
      FROM merchant_hour_sales
      WHERE merchant_id = m.id AND hour >= date_trunc('day', now()) - interval '6 days'
      GROUP BY 1
    ) d
  )
) AS body
FROM merchants m
WHERE m.id = $1`;

@QueryHandler(GetStatementQuery)
export class GetStatementHandler implements IQueryHandler<GetStatementQuery> {
  constructor(@Inject(PG) private readonly pool: pg.Pool) {}

  async execute({ walletId }: GetStatementQuery) {
    trace.getActiveSpan()?.setAttribute('wallet.id', walletId);
    const { rows } = await this.pool.query(STATEMENT_SQL, [walletId]);
    if (!rows.length) throw new NotFoundException('wallet not found');
    return rows[0].body;
  }
}

@QueryHandler(GetMerchantDashboardQuery)
export class GetMerchantDashboardHandler implements IQueryHandler<GetMerchantDashboardQuery> {
  constructor(@Inject(PG) private readonly pool: pg.Pool) {}

  async execute({ merchantId }: GetMerchantDashboardQuery) {
    trace.getActiveSpan()?.setAttribute('merchant.id', merchantId);
    const { rows } = await this.pool.query(DASHBOARD_SQL, [merchantId]);
    if (!rows.length) throw new NotFoundException('merchant not found');
    return rows[0].body;
  }
}
