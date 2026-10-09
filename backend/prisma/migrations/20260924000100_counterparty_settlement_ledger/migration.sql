CREATE TYPE "CounterpartySettlementSide" AS ENUM ('CUSTOMER', 'SUPPLIER');

CREATE TYPE "SettlementAllocationTarget" AS ENUM (
  'SALES_INVOICE',
  'SALES_ORDER',
  'SALES_RETURN',
  'PURCHASE_RECEIPT',
  'PURCHASE_RETURN',
  'ADDITIONAL_EXPENSE',
  'SERVICE_ACT'
);

ALTER TABLE "finance_transactions"
ADD COLUMN "settlement_side" "CounterpartySettlementSide";

CREATE TABLE "counterparty_settlement_entries" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "counterparty_id" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "side" "CounterpartySettlementSide" NOT NULL,
  "amount" DECIMAL(15,2) NOT NULL,
  "entry_type" TEXT NOT NULL,
  "effective_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source_doc_type" TEXT NOT NULL,
  "source_doc_id" TEXT NOT NULL,
  "source_line_id" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "reverses_entry_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "counterparty_settlement_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "counterparty_settlement_entries_currency_check" CHECK ("currency" IN ('USD', 'UZS')),
  CONSTRAINT "counterparty_settlement_entries_amount_check" CHECK ("amount" <> 0)
);

CREATE UNIQUE INDEX "counterparty_settlement_entries_idempotency_key_key"
ON "counterparty_settlement_entries"("idempotency_key");
CREATE UNIQUE INDEX "counterparty_settlement_entries_reverses_entry_id_key"
ON "counterparty_settlement_entries"("reverses_entry_id");
CREATE INDEX "counterparty_settlement_entries_tenant_counterparty_currency_created_idx"
ON "counterparty_settlement_entries"("tenant_id", "counterparty_id", "currency", "created_at");
CREATE INDEX "counterparty_settlement_entries_tenant_source_idx"
ON "counterparty_settlement_entries"("tenant_id", "source_doc_type", "source_doc_id");

ALTER TABLE "counterparty_settlement_entries"
ADD CONSTRAINT "counterparty_settlement_entries_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "counterparty_settlement_entries"
ADD CONSTRAINT "counterparty_settlement_entries_counterparty_id_fkey"
FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "counterparty_settlement_entries"
ADD CONSTRAINT "counterparty_settlement_entries_reverses_entry_id_fkey"
FOREIGN KEY ("reverses_entry_id") REFERENCES "counterparty_settlement_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "settlement_allocations" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "counterparty_id" TEXT NOT NULL,
  "finance_transaction_id" TEXT NOT NULL,
  "side" "CounterpartySettlementSide" NOT NULL,
  "currency" TEXT NOT NULL,
  "target_type" "SettlementAllocationTarget" NOT NULL,
  "target_id" TEXT NOT NULL,
  "amount" DECIMAL(15,2) NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "reverses_allocation_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "settlement_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "settlement_allocations_currency_check" CHECK ("currency" IN ('USD', 'UZS')),
  CONSTRAINT "settlement_allocations_amount_check" CHECK ("amount" <> 0)
);

CREATE UNIQUE INDEX "settlement_allocations_idempotency_key_key"
ON "settlement_allocations"("idempotency_key");
CREATE UNIQUE INDEX "settlement_allocations_reverses_allocation_id_key"
ON "settlement_allocations"("reverses_allocation_id");
CREATE INDEX "settlement_allocations_tenant_counterparty_currency_side_target_idx"
ON "settlement_allocations"("tenant_id", "counterparty_id", "currency", "side", "target_type", "target_id");
CREATE INDEX "settlement_allocations_finance_transaction_id_idx"
ON "settlement_allocations"("finance_transaction_id");

ALTER TABLE "settlement_allocations"
ADD CONSTRAINT "settlement_allocations_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "settlement_allocations"
ADD CONSTRAINT "settlement_allocations_counterparty_id_fkey"
FOREIGN KEY ("counterparty_id") REFERENCES "counterparties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "settlement_allocations"
ADD CONSTRAINT "settlement_allocations_finance_transaction_id_fkey"
FOREIGN KEY ("finance_transaction_id") REFERENCES "finance_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "settlement_allocations"
ADD CONSTRAINT "settlement_allocations_reverses_allocation_id_fkey"
FOREIGN KEY ("reverses_allocation_id") REFERENCES "settlement_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
