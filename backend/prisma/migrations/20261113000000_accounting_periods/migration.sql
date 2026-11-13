-- D4: accounting period closing. Additive and idempotent.

-- New permission actions: accounting:close, accounting:reopen.
ALTER TYPE "PermissionAction" ADD VALUE IF NOT EXISTS 'CLOSE';
ALTER TYPE "PermissionAction" ADD VALUE IF NOT EXISTS 'REOPEN';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AccountingPeriodStatus') THEN
    CREATE TYPE "AccountingPeriodStatus" AS ENUM ('OPEN', 'CLOSED');
  END IF;
END $$;

-- One row per tenant and calendar month; no row means OPEN.
CREATE TABLE IF NOT EXISTS "accounting_periods" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "AccountingPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closed_at" TIMESTAMP(3),
    "closed_by_id" TEXT,
    "reopened_at" TIMESTAMP(3),
    "reopened_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounting_periods_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "accounting_periods_tenant_id_year_month_key"
    ON "accounting_periods"("tenant_id", "year", "month");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'accounting_periods_tenant_id_fkey'
  ) THEN
    ALTER TABLE "accounting_periods"
      ADD CONSTRAINT "accounting_periods_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "companies"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'accounting_periods_month_check'
  ) THEN
    ALTER TABLE "accounting_periods"
      ADD CONSTRAINT "accounting_periods_month_check"
      CHECK ("month" BETWEEN 1 AND 12 AND "year" BETWEEN 2000 AND 2999);
  END IF;
END $$;
