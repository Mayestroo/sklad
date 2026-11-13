-- Click / Payme transaction lifecycle on subscription payments.
ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "provider_state" INTEGER;
ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "provider_created_at" TIMESTAMP(3);
ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "provider_performed_at" TIMESTAMP(3);
ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "provider_cancelled_at" TIMESTAMP(3);
ALTER TABLE "subscription_payments" ADD COLUMN IF NOT EXISTS "provider_cancel_reason" INTEGER;

CREATE INDEX IF NOT EXISTS "subscription_payments_method_transaction_id_idx"
  ON "subscription_payments"("method", "transaction_id");
