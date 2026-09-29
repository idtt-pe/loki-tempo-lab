CREATE TABLE merchants (
  id          int  PRIMARY KEY,
  name        text NOT NULL,
  category    text NOT NULL
);

CREATE TABLE wallets (
  id             bigint      PRIMARY KEY,
  owner_name     text        NOT NULL,
  balance_cents  bigint      NOT NULL CHECK (balance_cents >= 0),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE transactions (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  wallet_id     bigint      NOT NULL REFERENCES wallets (id),
  merchant_id   int         REFERENCES merchants (id),
  kind          text        NOT NULL CHECK (kind IN ('payment', 'topup')),
  amount_cents  bigint      NOT NULL CHECK (amount_cents > 0),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outbox (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  aggregate_id  bigint      NOT NULL,
  type          text        NOT NULL,
  payload       jsonb       NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp()
);
