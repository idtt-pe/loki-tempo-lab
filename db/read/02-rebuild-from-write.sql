CREATE EXTENSION IF NOT EXISTS postgres_fdw;

CREATE SERVER IF NOT EXISTS write_db FOREIGN DATA WRAPPER postgres_fdw
  OPTIONS (host 'write-db', dbname 'wallet', fetch_size '50000');
CREATE USER MAPPING IF NOT EXISTS FOR CURRENT_USER SERVER write_db
  OPTIONS (user 'lab', password 'lab');

DROP SCHEMA IF EXISTS src CASCADE;
CREATE SCHEMA src;
IMPORT FOREIGN SCHEMA public LIMIT TO (merchants, wallets, transactions) FROM SERVER write_db INTO src;

TRUNCATE merchants, wallet_balance, wallet_movements, wallet_month_category, merchant_hour_sales;

INSERT INTO merchants SELECT id, name, category FROM src.merchants;

CREATE TEMP TABLE tx AS SELECT * FROM src.transactions;

INSERT INTO wallet_balance (wallet_id, owner_name, balance_cents, last_tx_id, updated_at)
SELECT w.id, w.owner_name, w.balance_cents, coalesce(max(t.id), 0), w.updated_at
FROM src.wallets w LEFT JOIN tx t ON t.wallet_id = w.id
GROUP BY w.id, w.owner_name, w.balance_cents, w.updated_at;

INSERT INTO wallet_movements
SELECT t.wallet_id, t.id, t.kind, m.name, m.category, t.amount_cents, t.created_at
FROM tx t LEFT JOIN merchants m ON m.id = t.merchant_id;

INSERT INTO wallet_month_category
SELECT t.wallet_id, date_trunc('month', t.created_at)::date, coalesce(m.category, 'recarga'), count(*), sum(t.amount_cents)
FROM tx t LEFT JOIN merchants m ON m.id = t.merchant_id
GROUP BY 1, 2, 3;

INSERT INTO merchant_hour_sales
SELECT t.merchant_id, date_trunc('hour', t.created_at), count(*), sum(t.amount_cents)
FROM tx t
WHERE t.kind = 'payment'
GROUP BY 1, 2;

DROP SCHEMA src CASCADE;
VACUUM ANALYZE;
