-- Reverses 20261120110000_per_unit_cost_scale: per-unit costs back to
-- DECIMAL(15,2). Not run by `prisma migrate`; apply by hand, then delete the
-- migration's row from "_prisma_migrations".
--
-- Going back to 2 decimals would round every value written with a 3rd or 4th
-- decimal since the migration (and break exact cancelling of Additional
-- Expenses posted since). It refuses to run while any such value exists, or
-- any value no longer fits 13 integer digits; nothing is rounded silently.
-- Same locking as the migration: run outside working hours.

SET lock_timeout = '10s';

DO $$
DECLARE
  c RECORD;
  n BIGINT;
BEGIN
  FOR c IN
    SELECT * FROM (VALUES
      ('additional_expense_items', 'receipt_unit_delta'),
      ('additional_expense_items', 'base_unit_delta'),
      ('additional_expense_items', 'initial_landed_cost'),
      ('additional_expense_items', 'new_landed_cost'),
      ('purchase_receipt_items', 'landed_cost'),
      ('product_batches', 'landed_cost'),
      ('product_batches', 'purchase_price'),
      ('batch_consumptions', 'unit_cost'),
      ('sales_invoice_items', 'unit_cogs'),
      ('sales_return_items', 'unit_cogs'),
      ('production_documents', 'unit_cost'),
      ('production_material_lines', 'unit_cost'),
      ('production_material_batches', 'unit_cost'),
      ('production_material_movements', 'unit_cost')
    ) AS t(tbl, col)
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %I WHERE %I IS NOT NULL AND (%I <> round(%I, 2) OR abs(%I) >= 1e13)',
      c.tbl, c.col, c.col, c.col, c.col
    ) INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION '%.% has % value(s) that do not fit DECIMAL(15,2); not reverting', c.tbl, c.col, n;
    END IF;
  END LOOP;
END $$;

ALTER TABLE "additional_expense_items"
  ALTER COLUMN "receipt_unit_delta" TYPE DECIMAL(15,2),
  ALTER COLUMN "base_unit_delta" TYPE DECIMAL(15,2),
  ALTER COLUMN "initial_landed_cost" TYPE DECIMAL(15,2),
  ALTER COLUMN "new_landed_cost" TYPE DECIMAL(15,2);

ALTER TABLE "purchase_receipt_items"
  ALTER COLUMN "landed_cost" TYPE DECIMAL(15,2);

ALTER TABLE "product_batches"
  ALTER COLUMN "landed_cost" TYPE DECIMAL(15,2),
  ALTER COLUMN "purchase_price" TYPE DECIMAL(15,2);

ALTER TABLE "batch_consumptions"
  ALTER COLUMN "unit_cost" TYPE DECIMAL(15,2);

ALTER TABLE "sales_invoice_items"
  ALTER COLUMN "unit_cogs" TYPE DECIMAL(15,2);

ALTER TABLE "sales_return_items"
  ALTER COLUMN "unit_cogs" TYPE DECIMAL(15,2);

ALTER TABLE "production_documents"
  ALTER COLUMN "unit_cost" TYPE DECIMAL(15,2);

ALTER TABLE "production_material_lines"
  ALTER COLUMN "unit_cost" TYPE DECIMAL(15,2);

ALTER TABLE "production_material_batches"
  ALTER COLUMN "unit_cost" TYPE DECIMAL(15,2);

ALTER TABLE "production_material_movements"
  ALTER COLUMN "unit_cost" TYPE DECIMAL(15,2);

RESET lock_timeout;
