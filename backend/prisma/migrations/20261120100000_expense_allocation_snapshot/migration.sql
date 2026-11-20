-- Additional Expense allocations carry their conversion snapshot (ADR 0008 /
-- 0022 / 0023). The preview, the stored draft and posting used to add
-- amounts in different currencies; cancelling recomputed them from the
-- documents' current rates. From now on convertAndAllocate() writes, per
-- allocation line: the original amount and currency (allocated_amount,
-- original_currency), the two rates used (expense and receipt document rate
-- to UZS: the cross rate is expense_rate / receipt_rate), the rate date and
-- source, the share in the receipt currency and in UZS, and the per-unit
-- amounts applied to the receipt line and the batch. Cancelling reverses
-- exactly these stored values.
--
-- Existing data: no stored amount, batch, journal entry or receipt line is
-- changed. Posted rows get their snapshot from the rates they were posted
-- with (a posted expense cannot be edited, and its receipt cannot be
-- unposted). Their receipt_unit_delta stays NULL: cancelling them leaves the
-- receipt line alone, as before. Drafts and cancelled rows stay NULL; a
-- draft without a snapshot must be saved again before it can be posted.
--
-- Reverse with down.sql in this folder.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExpenseRateSource') THEN
    CREATE TYPE "ExpenseRateSource" AS ENUM ('SAME_CURRENCY', 'DOCUMENT');
  END IF;
END $$;

ALTER TABLE "additional_expense_items"
  ADD COLUMN IF NOT EXISTS "original_currency" TEXT,
  ADD COLUMN IF NOT EXISTS "expense_rate" DECIMAL(15,4),
  ADD COLUMN IF NOT EXISTS "receipt_rate" DECIMAL(15,4),
  ADD COLUMN IF NOT EXISTS "rate_date" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rate_source" "ExpenseRateSource",
  ADD COLUMN IF NOT EXISTS "receipt_amount" DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS "base_amount" DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS "receipt_unit_delta" DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS "base_unit_delta" DECIMAL(15,2);

-- Backfill posted rows. Rates: UZS is 1, otherwise the document's own rate;
-- when both documents share a currency the receipt rate is stored equal to
-- the expense rate (cross rate 1);
-- a row whose rate is missing or not positive is left NULL (its cancel is
-- refused with an explicit error rather than guessing a rate).
-- Rounding: each share is rounded to 2 decimals (half away from zero); the
-- leftover against the once-rounded total goes on the line with the largest
-- allocated_amount (ties: smallest receipt_item_id), so the column adds up
-- to round(amount * rate, 2) exactly.
WITH src AS (
  SELECT
    i."id",
    i."expense_id",
    i."receipt_item_id",
    i."allocated_amount",
    i."sold_quantity" + i."remaining_quantity" AS qty,
    e."amount",
    e."currency",
    e."doc_date",
    r."currency" AS receipt_currency,
    CASE WHEN e."currency" = 'UZS' THEN 1::numeric ELSE e."exchange_rate" END AS er,
    -- one currency converts 1:1: the cross rate is 1 whatever rates were typed
    CASE
      WHEN r."currency" = e."currency" THEN
        CASE WHEN e."currency" = 'UZS' THEN 1::numeric ELSE e."exchange_rate" END
      WHEN r."currency" = 'UZS' THEN 1::numeric
      ELSE r."exchange_rate"
    END AS rr
  FROM "additional_expense_items" i
  JOIN "additional_expenses" e ON e."id" = i."expense_id"
  JOIN "purchase_receipts" r ON r."id" = e."receipt_id"
  WHERE e."status" = 'POSTED'
    AND i."original_currency" IS NULL
),
valid AS (
  SELECT * FROM src
  WHERE er > 0 AND rr > 0 AND qty > 0
    -- every line of the expense must be convertible
    AND NOT EXISTS (
      SELECT 1 FROM src s2
      WHERE s2."expense_id" = src."expense_id"
        AND NOT (s2.er > 0 AND s2.rr > 0 AND s2.qty > 0)
    )
),
shares AS (
  SELECT
    v.*,
    round(v."allocated_amount" * v.er / v.rr, 2) AS receipt_share,
    round(v."allocated_amount" * v.er, 2) AS base_share,
    round(v."amount" * v.er / v.rr, 2) AS receipt_total,
    round(v."amount" * v.er, 2) AS base_total,
    row_number() OVER (
      PARTITION BY v."expense_id"
      ORDER BY v."allocated_amount" DESC, v."receipt_item_id" ASC
    ) AS rank_in_expense
  FROM valid v
),
totals AS (
  SELECT
    "expense_id",
    sum(receipt_share) AS receipt_sum,
    sum(base_share) AS base_sum
  FROM shares
  GROUP BY "expense_id"
),
final AS (
  SELECT
    s."id",
    s."currency",
    s.er,
    s.rr,
    s."doc_date",
    CASE WHEN s."currency" = s.receipt_currency THEN 'SAME_CURRENCY' ELSE 'DOCUMENT' END AS source,
    s.receipt_share + CASE WHEN s.rank_in_expense = 1 THEN s.receipt_total - t.receipt_sum ELSE 0 END AS receipt_amount,
    s.base_share + CASE WHEN s.rank_in_expense = 1 THEN s.base_total - t.base_sum ELSE 0 END AS base_amount,
    s.qty
  FROM shares s
  JOIN totals t ON t."expense_id" = s."expense_id"
)
UPDATE "additional_expense_items" i
SET
  "original_currency" = f."currency",
  "expense_rate" = f.er,
  "receipt_rate" = f.rr,
  "rate_date" = f."doc_date",
  "rate_source" = f.source::"ExpenseRateSource",
  "receipt_amount" = f.receipt_amount,
  "base_amount" = f.base_amount,
  "base_unit_delta" = round(f.base_amount / f.qty, 2)
FROM final f
WHERE i."id" = f."id";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'additional_expense_items_original_currency_check'
  ) THEN
    ALTER TABLE "additional_expense_items"
      ADD CONSTRAINT "additional_expense_items_original_currency_check"
      CHECK ("original_currency" IS NULL OR "original_currency" IN ('USD', 'UZS'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'additional_expense_items_snapshot_check'
  ) THEN
    -- The snapshot is written as a whole or not at all, with positive rates.
    -- receipt_unit_delta may be NULL on a snapshot (legacy posted rows).
    ALTER TABLE "additional_expense_items"
      ADD CONSTRAINT "additional_expense_items_snapshot_check"
      CHECK (
        (
          "original_currency" IS NULL AND "expense_rate" IS NULL
          AND "receipt_rate" IS NULL AND "rate_date" IS NULL
          AND "rate_source" IS NULL AND "receipt_amount" IS NULL
          AND "base_amount" IS NULL AND "base_unit_delta" IS NULL
          AND "receipt_unit_delta" IS NULL
        )
        OR (
          "original_currency" IS NOT NULL AND "expense_rate" > 0
          AND "receipt_rate" > 0 AND "rate_date" IS NOT NULL
          AND "rate_source" IS NOT NULL AND "receipt_amount" IS NOT NULL
          AND "base_amount" IS NOT NULL AND "base_unit_delta" IS NOT NULL
        )
      );
  END IF;
END $$;
