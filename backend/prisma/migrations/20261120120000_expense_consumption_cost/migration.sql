-- A posted Additional Expense also revalues the batch consumptions of the
-- sales from its receipt batch (batch_consumptions.unit_cost += the stored
-- base_unit_delta), so a later sales return re-enters stock, and reverses
-- 9110, at the post-expense cost the sale was charged (ADR 0008 / 0012).
--
-- consumption_cost_revalued records that a posting did this. Cancelling
-- subtracts the same delta from the consumptions only when it is true.
-- Expenses posted before this migration never touched batch_consumptions:
-- they stay false, and cancelling them leaves the consumptions as they are,
-- exactly as before. No existing row is changed (the stale consumptions of
-- those older postings are listed by the read-only audit query, not fixed).
--
-- Reverse with down.sql in this folder.

ALTER TABLE "additional_expenses"
  ADD COLUMN IF NOT EXISTS "consumption_cost_revalued" BOOLEAN NOT NULL DEFAULT false;
