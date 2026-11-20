-- READ-ONLY AUDIT. Lists sale consumptions (batch_consumptions with a
-- sales_invoice_item_id) whose unit_cost no longer matches the unit COGS of
-- their sale line, on batches that have a POSTED Additional Expense.
--
-- Why: until migration 20261120120000_expense_consumption_cost, posting an
-- Additional Expense raised the batch landed cost and the sale line's
-- unit_cogs / line_cogs, but not batch_consumptions.unit_cost. A sales
-- return re-enters stock (and reverses 9110) at the consumption cost, so a
-- return of such a sale used the pre-expense cost. This query only shows
-- the rows; it changes nothing and nothing repairs them.
--
-- Run it on PGlite or a local Postgres copy only, inside a read-only
-- transaction, e.g.
--   psql "$LOCAL_URL" -v ON_ERROR_STOP=1 \
--     -c "BEGIN TRANSACTION READ ONLY" -f audit-stale-sale-consumption-cost.sql -c "ROLLBACK"
--
-- Matching rule
-- - A line with one consumption: |unit_cost - unit_cogs| is above what the
--   sale's own rounding explains. The sale stores unit_cogs =
--   round(qty * cost, 2) / qty, so they can legitimately differ by up to
--   0.005 / qty (plus 0.0001 for the 4-decimal column). An expense delta
--   that never reached the consumption is at least 0.01 (old postings were
--   2-decimal) and shows up.
-- - A line with several consumptions (several batches): unit_cogs is their
--   average, so the line is compared as a whole: sum(qty * unit_cost) against
--   line_cogs, allowing 0.01 for the sale's rounding plus 0.01 per posted
--   expense (each expense rounds its line COGS change to 2 decimals).
--
-- Columns
-- - legacy_expenses: posted expenses on the batch that did not revalue
--   consumptions (consumption_cost_revalued = false), and the sum of their
--   base_unit_delta, the amount the consumption most likely misses when it
--   was created before they were posted (created_before_legacy_post).
-- - cost_gap: unit_cogs - unit_cost (one consumption) or
--   line_cogs - sum(qty * unit_cost) (several), in UZS.

WITH posted_expense_batches AS (
  SELECT
    b.id AS batch_id,
    COUNT(*) AS posted_expenses,
    COUNT(*) FILTER (WHERE NOT ae.consumption_cost_revalued) AS legacy_expenses,
    COALESCE(SUM(aei.base_unit_delta) FILTER (WHERE NOT ae.consumption_cost_revalued), 0)
      AS legacy_unit_delta,
    MAX(ae.posted_at) FILTER (WHERE NOT ae.consumption_cost_revalued) AS last_legacy_post
  FROM additional_expenses ae
  JOIN additional_expense_items aei ON aei.expense_id = ae.id
  JOIN product_batches b
    ON b.tenant_id = ae.tenant_id
   AND b.receipt_id = ae.receipt_id
   AND b.product_id = aei.product_id
  WHERE ae.status = 'POSTED'
  GROUP BY b.id
),
line_totals AS (
  SELECT
    c.sales_invoice_item_id,
    COUNT(*) AS consumptions_on_line,
    SUM(c.quantity * c.unit_cost) AS consumed_cost
  FROM batch_consumptions c
  WHERE c.sales_invoice_item_id IS NOT NULL
  GROUP BY c.sales_invoice_item_id
)
SELECT
  c.tenant_id,
  si.invoice_number,
  si.status AS invoice_status,
  si.invoice_date,
  sii.id AS sales_invoice_item_id,
  sii.product_id,
  c.id AS consumption_id,
  c.batch_id,
  c.quantity,
  c.unit_cost,
  sii.unit_cogs,
  sii.line_cogs,
  lt.consumptions_on_line,
  CASE
    WHEN lt.consumptions_on_line = 1 THEN sii.unit_cogs - c.unit_cost
    ELSE sii.line_cogs - ROUND(lt.consumed_cost, 2)
  END AS cost_gap,
  peb.posted_expenses,
  peb.legacy_expenses,
  peb.legacy_unit_delta,
  (peb.last_legacy_post IS NOT NULL AND c.created_at < peb.last_legacy_post)
    AS created_before_legacy_post
FROM batch_consumptions c
JOIN posted_expense_batches peb ON peb.batch_id = c.batch_id
JOIN line_totals lt ON lt.sales_invoice_item_id = c.sales_invoice_item_id
JOIN sales_invoice_items sii ON sii.id = c.sales_invoice_item_id
JOIN sales_invoices si ON si.id = sii.invoice_id AND si.tenant_id = c.tenant_id
WHERE c.sales_invoice_item_id IS NOT NULL
  AND (
    (lt.consumptions_on_line = 1
      AND ABS(sii.unit_cogs - c.unit_cost) > 0.005 / NULLIF(c.quantity, 0) + 0.0001)
    OR
    (lt.consumptions_on_line > 1
      AND ABS(sii.line_cogs - lt.consumed_cost) > 0.01 + 0.01 * peb.posted_expenses)
  )
ORDER BY c.tenant_id, si.invoice_date, si.invoice_number, sii.id, c.id;
