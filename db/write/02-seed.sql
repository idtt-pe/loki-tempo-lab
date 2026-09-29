SELECT setseed(0.42);

INSERT INTO merchants (id, name, category)
SELECT i,
       'Comercio ' || lpad(i::text, 4, '0'),
       (ARRAY['supermercado','farmacia','restaurante','transporte','combustible','entretenimiento','servicios','tecnologia'])[1 + (i % 8)]
FROM generate_series(1, 5000) AS i;

INSERT INTO wallets (id, owner_name, balance_cents)
SELECT i,
       'Cliente ' || i,
       (100000 + floor(random() * 400000))::bigint
FROM generate_series(1, 200000) AS i;

INSERT INTO transactions (wallet_id, merchant_id, kind, amount_cents, created_at)
SELECT 1 + floor(random() * 200000)::bigint,
       CASE WHEN r < 0.9 THEN 1 + floor(5000 * power(random(), 3))::int END,
       CASE WHEN r < 0.9 THEN 'payment' ELSE 'topup' END,
       (500 + floor(random() * 19500))::bigint,
       now() - random() * interval '30 days'
FROM (SELECT random() AS r FROM generate_series(1, 1000000)) AS s;

CREATE INDEX transactions_wallet_created_idx   ON transactions (wallet_id, created_at DESC) INCLUDE (merchant_id, kind, amount_cents);
CREATE INDEX transactions_merchant_created_idx ON transactions (merchant_id, created_at) INCLUDE (kind, amount_cents);

VACUUM ANALYZE;
