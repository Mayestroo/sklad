-- Reverses migration.sql in this folder. Prisma does not run this file:
-- apply it by hand, then remove the migration's row from _prisma_migrations
--   DELETE FROM "_prisma_migrations"
--   WHERE "migration_name" = '20261120100000_expense_allocation_snapshot';
-- and roll the code back to a version without the snapshot columns.
--
-- It drops only what migration.sql added. No pre-existing column was changed
-- by the migration, so nothing else needs restoring. Expenses posted or
-- cancelled after the migration keep their effects (batches, receipt lines,
-- journal); only their stored snapshot is lost.

ALTER TABLE "additional_expense_items"
  DROP CONSTRAINT IF EXISTS "additional_expense_items_snapshot_check",
  DROP CONSTRAINT IF EXISTS "additional_expense_items_original_currency_check";

ALTER TABLE "additional_expense_items"
  DROP COLUMN IF EXISTS "base_unit_delta",
  DROP COLUMN IF EXISTS "receipt_unit_delta",
  DROP COLUMN IF EXISTS "base_amount",
  DROP COLUMN IF EXISTS "receipt_amount",
  DROP COLUMN IF EXISTS "rate_source",
  DROP COLUMN IF EXISTS "rate_date",
  DROP COLUMN IF EXISTS "receipt_rate",
  DROP COLUMN IF EXISTS "expense_rate",
  DROP COLUMN IF EXISTS "original_currency";

DROP TYPE IF EXISTS "ExpenseRateSource";
