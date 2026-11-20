-- Per-unit costs keep 4 decimals (was 2). A small expense spread over many
-- units (1.00 USD over 500 units = 0.002 USD per unit) used to round to 0.00
-- per unit and was lost from the landed cost. Line and document totals stay
-- at 2 decimals: only per-unit figures widen.
--
-- DECIMAL(17,4) keeps the 13 integer digits DECIMAL(15,2) allowed, so every
-- existing value fits; values do not change, only their scale (100.00 is
-- stored as 100.0000).
--
-- Columns: the per-unit amounts an Additional Expense stores and applies,
-- and every column a per-unit cost is copied into afterwards (batch, FIFO
-- consumption, sale and return COGS, production issues and output).
--
-- Locking: a scale change rewrites each table (and its indexes) under an
-- ACCESS EXCLUSIVE lock, blocking reads and writes of that table until the
-- migration commits. Each table is altered in one statement, so it is
-- rewritten once. lock_timeout makes the migration fail fast instead of
-- queueing behind a long transaction (and blocking everyone queued after it);
-- rerun it when that happens. Run it outside working hours.
--
-- Idempotent: altering a column to the type it already has is a no-op.
-- Reverse with down.sql in this folder.

SET lock_timeout = '10s';

ALTER TABLE "additional_expense_items"
  ALTER COLUMN "receipt_unit_delta" TYPE DECIMAL(17,4),
  ALTER COLUMN "base_unit_delta" TYPE DECIMAL(17,4),
  ALTER COLUMN "initial_landed_cost" TYPE DECIMAL(17,4),
  ALTER COLUMN "new_landed_cost" TYPE DECIMAL(17,4);

ALTER TABLE "purchase_receipt_items"
  ALTER COLUMN "landed_cost" TYPE DECIMAL(17,4);

ALTER TABLE "product_batches"
  ALTER COLUMN "landed_cost" TYPE DECIMAL(17,4),
  ALTER COLUMN "purchase_price" TYPE DECIMAL(17,4);

ALTER TABLE "batch_consumptions"
  ALTER COLUMN "unit_cost" TYPE DECIMAL(17,4);

ALTER TABLE "sales_invoice_items"
  ALTER COLUMN "unit_cogs" TYPE DECIMAL(17,4);

ALTER TABLE "sales_return_items"
  ALTER COLUMN "unit_cogs" TYPE DECIMAL(17,4);

ALTER TABLE "production_documents"
  ALTER COLUMN "unit_cost" TYPE DECIMAL(17,4);

ALTER TABLE "production_material_lines"
  ALTER COLUMN "unit_cost" TYPE DECIMAL(17,4);

ALTER TABLE "production_material_batches"
  ALTER COLUMN "unit_cost" TYPE DECIMAL(17,4);

ALTER TABLE "production_material_movements"
  ALTER COLUMN "unit_cost" TYPE DECIMAL(17,4);

RESET lock_timeout;
