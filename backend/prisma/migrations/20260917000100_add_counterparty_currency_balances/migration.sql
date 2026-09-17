CREATE TABLE "counterparty_balances" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "counterparty_id" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "customer_debt" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "supplier_debt" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "counterparty_balances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "counterparty_balances_counterparty_id_currency_key"
  ON "counterparty_balances"("counterparty_id", "currency");
CREATE INDEX "counterparty_balances_tenant_id_currency_idx"
  ON "counterparty_balances"("tenant_id", "currency");
ALTER TABLE "counterparty_balances"
  ADD CONSTRAINT "counterparty_balances_counterparty_id_fkey"
  FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
