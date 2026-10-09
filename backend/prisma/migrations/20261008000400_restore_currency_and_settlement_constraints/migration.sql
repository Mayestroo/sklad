DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_sale_price_currency_check'
      AND conrelid = 'products'::regclass
  ) THEN
    ALTER TABLE "products"
    ADD CONSTRAINT "products_sale_price_currency_check"
    CHECK ("sale_price_currency" IS NULL OR "sale_price_currency" IN ('USD', 'UZS'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_cost_price_currency_check'
      AND conrelid = 'products'::regclass
  ) THEN
    ALTER TABLE "products"
    ADD CONSTRAINT "products_cost_price_currency_check"
    CHECK ("cost_price_currency" IN ('USD', 'UZS'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_cost_price_exchange_rate_check'
      AND conrelid = 'products'::regclass
  ) THEN
    ALTER TABLE "products"
    ADD CONSTRAINT "products_cost_price_exchange_rate_check"
    CHECK ("cost_price_exchange_rate" > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'counterparty_settlement_entries_currency_check'
      AND conrelid = 'counterparty_settlement_entries'::regclass
  ) THEN
    ALTER TABLE "counterparty_settlement_entries"
    ADD CONSTRAINT "counterparty_settlement_entries_currency_check"
    CHECK ("currency" IN ('USD', 'UZS'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'counterparty_settlement_entries_amount_check'
      AND conrelid = 'counterparty_settlement_entries'::regclass
  ) THEN
    ALTER TABLE "counterparty_settlement_entries"
    ADD CONSTRAINT "counterparty_settlement_entries_amount_check"
    CHECK ("amount" <> 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'settlement_allocations_currency_check'
      AND conrelid = 'settlement_allocations'::regclass
  ) THEN
    ALTER TABLE "settlement_allocations"
    ADD CONSTRAINT "settlement_allocations_currency_check"
    CHECK ("currency" IN ('USD', 'UZS'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'settlement_allocations_amount_check'
      AND conrelid = 'settlement_allocations'::regclass
  ) THEN
    ALTER TABLE "settlement_allocations"
    ADD CONSTRAINT "settlement_allocations_amount_check"
    CHECK ("amount" <> 0);
  END IF;
END $$;
