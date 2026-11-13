-- Purchase returns carry the UZS rate their journal entry is posted at.
ALTER TABLE "purchase_returns"
  ADD COLUMN IF NOT EXISTS "exchange_rate" DECIMAL(15,4) NOT NULL DEFAULT 1;

-- A receipt-linked return reverses the payable at the receipt's rate.
UPDATE "purchase_returns" pr
   SET "exchange_rate" = r."exchange_rate"
  FROM "purchase_receipts" r
 WHERE pr."receipt_id" = r."id"
   AND pr."tenant_id" = r."tenant_id"
   AND pr."currency" <> 'UZS'
   AND pr."exchange_rate" = 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'purchase_returns_exchange_rate_check'
  ) THEN
    ALTER TABLE "purchase_returns"
      ADD CONSTRAINT "purchase_returns_exchange_rate_check"
      CHECK ("exchange_rate" > 0 AND ("currency" <> 'UZS' OR "exchange_rate" = 1));
  END IF;
END $$;
