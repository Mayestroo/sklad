-- Reverses migration.sql in this folder. Prisma does not run this file:
-- apply it by hand, then remove the migration's row from _prisma_migrations
--   DELETE FROM "_prisma_migrations"
--   WHERE "migration_name" = '20261120120000_expense_consumption_cost';
-- and roll the code back to a version without the column.
--
-- Consumption costs already revalued by expenses posted after the migration
-- stay as they are; cancelling one of those expenses with the old code will
-- then leave its delta on the consumptions.

ALTER TABLE "additional_expenses"
  DROP COLUMN IF EXISTS "consumption_cost_revalued";
