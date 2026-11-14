-- A customer Payment is reversed by cancelling (or deleting) its Finance
-- transaction. Record that on the payment so it no longer counts as active.
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3);

-- Backfill payments whose Finance transaction is already cancelled.
UPDATE "payments" AS p
SET "cancelled_at" = COALESCE(ft."cancelled_at", ft."updated_at")
FROM "finance_transactions" AS ft
WHERE ft."tenant_id" = p."tenant_id"
  AND ft."source_doc_type" = 'PAYMENT'
  AND ft."source_doc_id" = p."id"
  AND ft."status" = 'CANCELLED'
  AND p."cancelled_at" IS NULL;
