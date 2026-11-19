-- An opening-balance inventory line records the FIFO batch it created, so
-- unposting removes exactly that batch (it used to match batch numbers by a
-- 15-character prefix, which could hit another document's batches).
ALTER TABLE "product_batches" ADD COLUMN IF NOT EXISTS "opening_balance_line_id" TEXT;

CREATE INDEX IF NOT EXISTS "product_batches_opening_balance_line_id_idx"
  ON "product_batches"("opening_balance_line_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'product_batches_opening_balance_line_id_fkey'
  ) THEN
    ALTER TABLE "product_batches"
      ADD CONSTRAINT "product_batches_opening_balance_line_id_fkey"
      FOREIGN KEY ("opening_balance_line_id") REFERENCES "opening_balance_lines"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
