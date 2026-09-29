CREATE TABLE merchants (
  id        int  PRIMARY KEY,
  name      text NOT NULL,
  category  text NOT NULL
);

CREATE TABLE wallet_balance (
  wallet_id      bigint      PRIMARY KEY,
  owner_name     text        NOT NULL,
  balance_cents  bigint      NOT NULL,
  last_tx_id     bigint      NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL
);

CREATE TABLE wallet_movements (
  wallet_id      bigint      NOT NULL,
  tx_id          bigint      NOT NULL,
  kind           text        NOT NULL,
  merchant_name  text,
  category       text,
  amount_cents   bigint      NOT NULL,
  created_at     timestamptz NOT NULL,
  PRIMARY KEY (wallet_id, tx_id)
);

CREATE TABLE wallet_month_category (
  wallet_id     bigint NOT NULL,
  month         date   NOT NULL,
  category      text   NOT NULL,
  tx_count      int    NOT NULL,
  amount_cents  bigint NOT NULL,
  PRIMARY KEY (wallet_id, month, category)
);

CREATE TABLE merchant_hour_sales (
  merchant_id   int         NOT NULL,
  hour          timestamptz NOT NULL,
  tx_count      int         NOT NULL,
  amount_cents  bigint      NOT NULL,
  PRIMARY KEY (merchant_id, hour)
);
