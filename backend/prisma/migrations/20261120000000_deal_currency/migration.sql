-- ADR 0022 / 0023: a CRM deal amount carries its currency.
-- Existing deals keep NULL: their currency was never recorded and is not
-- guessed; the CRM shows them as "currency not set" until edited.
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "currency" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deals_currency_check'
  ) THEN
    ALTER TABLE "deals"
      ADD CONSTRAINT "deals_currency_check"
      CHECK ("currency" IS NULL OR "currency" IN ('USD', 'UZS'));
  END IF;
END $$;
