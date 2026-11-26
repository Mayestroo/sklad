-- Buxgalteriya TZ v1.0 (26.11.2026).
--   * Storno: a cancelled document's journal entries are no longer deleted.
--     The original is marked REVERSED and a storno entry (same lines, debit
--     and credit swapped, same date) points back to it via reversed_of_id.
--   * Accounts get a plain-language alias (simple mode) and a technical flag
--     (00, the opening-balance helper, is hidden in the simple mode).
--   * Journal lines keep the original currency and amount (TZ 15); the
--     existing lines are UZS, so their original amount is the UZS amount.
--   * Indexes for period aggregation of the trial balance and summary.
-- Idempotent: safe to run again.

DO $$ BEGIN
  CREATE TYPE "JournalEntryStatus" AS ENUM ('POSTED', 'REVERSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "journal_entries"
  ADD COLUMN IF NOT EXISTS "status" "JournalEntryStatus" NOT NULL DEFAULT 'POSTED',
  ADD COLUMN IF NOT EXISTS "reversed_of_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "journal_entries_reversed_of_id_key" ON "journal_entries"("reversed_of_id");
CREATE INDEX IF NOT EXISTS "journal_entries_tenant_id_source_doc_type_source_doc_id_idx" ON "journal_entries"("tenant_id", "source_doc_type", "source_doc_id");
CREATE INDEX IF NOT EXISTS "journal_entries_tenant_id_entry_date_idx" ON "journal_entries"("tenant_id", "entry_date");

DO $$ BEGIN
  ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversed_of_id_fkey"
    FOREIGN KEY ("reversed_of_id") REFERENCES "journal_entries"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "journal_lines_entry_id_idx" ON "journal_lines"("entry_id");
CREATE INDEX IF NOT EXISTS "journal_lines_debit_account_id_idx" ON "journal_lines"("debit_account_id");
CREATE INDEX IF NOT EXISTS "journal_lines_credit_account_id_idx" ON "journal_lines"("credit_account_id");

ALTER TABLE "accounts"
  ADD COLUMN IF NOT EXISTS "alias" JSONB,
  ADD COLUMN IF NOT EXISTS "is_technical" BOOLEAN NOT NULL DEFAULT false;

UPDATE "accounts" SET "is_technical" = true WHERE "code" = '00' AND "is_technical" = false;

ALTER TABLE "journal_lines"
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'UZS',
  ADD COLUMN IF NOT EXISTS "amount_orig" DECIMAL(15,2);
UPDATE "journal_lines" SET "amount_orig" = "amount" WHERE "amount_orig" IS NULL;
ALTER TABLE "journal_lines" ALTER COLUMN "amount_orig" SET NOT NULL;
