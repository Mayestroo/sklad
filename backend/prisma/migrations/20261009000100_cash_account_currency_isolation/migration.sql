DO $$
DECLARE
  invalid_accounts TEXT;
BEGIN
  SELECT string_agg(
    format('%s (%s, %s)', "id", "account_type", "currency"),
    ', ' ORDER BY "account_type", "id"
  )
  INTO invalid_accounts
  FROM "cash_accounts"
  WHERE NOT (
    ("account_type" = 'UZS_CASH' AND "currency" = 'UZS') OR
    ("account_type" = 'USD_CASH' AND "currency" = 'USD') OR
    ("account_type" = 'BANK' AND "currency" IN ('UZS', 'USD'))
  );

  IF invalid_accounts IS NOT NULL THEN
    RAISE EXCEPTION 'Cash accounts have incompatible account type/currency; resolve before migrating: %', invalid_accounts;
  END IF;
END $$;

ALTER TABLE "cash_accounts"
ADD CONSTRAINT "cash_accounts_type_currency_check"
CHECK (
  ("account_type" = 'UZS_CASH' AND "currency" = 'UZS') OR
  ("account_type" = 'USD_CASH' AND "currency" = 'USD') OR
  ("account_type" = 'BANK' AND "currency" IN ('UZS', 'USD'))
);

ALTER TABLE "finance_transactions"
ADD COLUMN IF NOT EXISTS "transfer_exchange_rate" DECIMAL(15,6),
ADD COLUMN IF NOT EXISTS "exchange_rate" DECIMAL(15,4);

ALTER TABLE "payments"
ADD COLUMN IF NOT EXISTS "cash_account_id" TEXT,
ADD COLUMN IF NOT EXISTS "order_id" TEXT;

ALTER TABLE "payments"
DROP CONSTRAINT IF EXISTS "payments_cash_account_id_fkey",
ADD CONSTRAINT "payments_cash_account_id_fkey"
FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_order_id_fkey'
      AND conrelid = 'payments'::regclass
  ) THEN
    ALTER TABLE "payments"
    ADD CONSTRAINT "payments_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

UPDATE "payments" AS payment
SET "cash_account_id" = finance_transaction."account_id"
FROM "finance_transactions" AS finance_transaction
WHERE payment."cash_account_id" IS NULL
  AND finance_transaction."source_doc_type" = 'PAYMENT'
  AND finance_transaction."source_doc_id" = payment."id"
  AND finance_transaction."tenant_id" = payment."tenant_id"
  AND finance_transaction."account_id" IS NOT NULL
  AND (
    SELECT COUNT(DISTINCT candidate."account_id")
    FROM "finance_transactions" AS candidate
    WHERE candidate."source_doc_type" = 'PAYMENT'
      AND candidate."source_doc_id" = payment."id"
      AND candidate."tenant_id" = payment."tenant_id"
      AND candidate."account_id" IS NOT NULL
  ) = 1;

UPDATE "finance_transactions" AS tx
SET "transfer_to_amount" = tx."amount"
FROM "cash_accounts" AS source_account, "cash_accounts" AS target_account
WHERE tx."direction" = 'TRANSFER'
  AND tx."account_id" = source_account."id"
  AND tx."transfer_to_id" = target_account."id"
  AND source_account."currency" = target_account."currency"
  AND tx."transfer_to_amount" IS NULL;

UPDATE "finance_transactions" AS tx
SET "transfer_exchange_rate" = CASE
  WHEN source_account."currency" = 'USD' THEN ROUND(tx."transfer_to_amount" / tx."amount", 4)
  ELSE ROUND(tx."amount" / tx."transfer_to_amount", 4)
END
FROM "cash_accounts" AS source_account, "cash_accounts" AS target_account
WHERE tx."direction" = 'TRANSFER'
  AND tx."account_id" = source_account."id"
  AND tx."transfer_to_id" = target_account."id"
  AND source_account."currency" <> target_account."currency"
  AND tx."amount" > 0
  AND tx."transfer_to_amount" > 0;

UPDATE "finance_transactions"
SET "exchange_rate" = 1
WHERE "currency" = 'UZS';

UPDATE "finance_transactions"
SET "exchange_rate" = "transfer_exchange_rate"
WHERE "direction" = 'TRANSFER'
  AND "currency" = 'USD'
  AND "exchange_rate" IS NULL
  AND "transfer_exchange_rate" > 0;

DO $$
DECLARE
  invalid_exchange_transactions TEXT;
BEGIN
  SELECT string_agg("id", ', ' ORDER BY "id")
  INTO invalid_exchange_transactions
  FROM "finance_transactions"
  WHERE "exchange_rate" IS NULL
     OR "exchange_rate" <= 0
     OR ("currency" = 'UZS' AND "exchange_rate" <> 1);

  IF invalid_exchange_transactions IS NOT NULL THEN
    RAISE EXCEPTION 'Finance transactions need manual exchange-rate review before migration: %', invalid_exchange_transactions;
  END IF;
END $$;

ALTER TABLE "finance_transactions"
ALTER COLUMN "exchange_rate" DROP DEFAULT,
ALTER COLUMN "exchange_rate" SET NOT NULL;

ALTER TABLE "finance_transactions"
ADD CONSTRAINT "finance_transactions_exchange_rate_check"
CHECK (
  "exchange_rate" > 0 AND
  ("currency" <> 'UZS' OR "exchange_rate" = 1)
);

DO $$
DECLARE
  invalid_transactions TEXT;
  invalid_payments TEXT;
BEGIN
  SELECT string_agg(tx."id", ', ' ORDER BY tx."id")
  INTO invalid_transactions
  FROM "finance_transactions" AS tx
  LEFT JOIN "cash_accounts" AS source_account ON source_account."id" = tx."account_id"
  LEFT JOIN "cash_accounts" AS target_account ON target_account."id" = tx."transfer_to_id"
  WHERE source_account."id" IS NULL
     OR source_account."tenant_id" <> tx."tenant_id"
     OR source_account."currency" <> tx."currency"
     OR (tx."direction" = 'TRANSFER' AND (
       target_account."id" IS NULL
       OR target_account."tenant_id" <> tx."tenant_id"
       OR tx."transfer_to_amount" IS NULL
       OR tx."transfer_to_amount" <= 0
       OR (source_account."currency" = target_account."currency" AND (
         tx."transfer_to_amount" <> tx."amount" OR tx."transfer_exchange_rate" IS NOT NULL
       ))
        OR (source_account."currency" <> target_account."currency" AND (
          tx."transfer_exchange_rate" IS NULL OR tx."transfer_exchange_rate" <= 0
          OR (source_account."currency" = 'USD' AND target_account."currency" = 'UZS'
            AND tx."exchange_rate" <> tx."transfer_exchange_rate")
          OR (source_account."currency" = 'USD' AND target_account."currency" = 'UZS'
            AND ABS(ROUND(tx."amount" * tx."transfer_exchange_rate", 2) - tx."transfer_to_amount") > 0.01)
          OR (source_account."currency" = 'UZS' AND target_account."currency" = 'USD'
            AND ABS(ROUND(tx."amount" / tx."transfer_exchange_rate", 2) - tx."transfer_to_amount") > 0.01)
        ))
     ))
     OR (tx."direction" <> 'TRANSFER' AND (
       tx."transfer_to_id" IS NOT NULL
       OR tx."transfer_to_amount" IS NOT NULL
       OR tx."transfer_exchange_rate" IS NOT NULL
     ));

  IF invalid_transactions IS NOT NULL THEN
    RAISE EXCEPTION 'Finance transactions have missing or mismatched cash-account currency data: %', invalid_transactions;
  END IF;

  SELECT string_agg(payment."id", ', ' ORDER BY payment."id")
  INTO invalid_payments
  FROM "payments" AS payment
  LEFT JOIN "cash_accounts" AS account ON account."id" = payment."cash_account_id"
  WHERE account."id" IS NULL
     OR account."tenant_id" <> payment."tenant_id"
     OR ((payment."invoice_id" IS NULL) = (payment."order_id" IS NULL))
     OR EXISTS (
       SELECT 1 FROM "finance_transactions" AS payment_transaction
       WHERE payment_transaction."source_doc_type" = 'PAYMENT'
         AND payment_transaction."source_doc_id" = payment."id"
         AND payment_transaction."tenant_id" = payment."tenant_id"
         AND payment_transaction."account_id" IS DISTINCT FROM payment."cash_account_id"
     )
     OR (payment."method" = 'CASH' AND account."account_type" = 'BANK')
     OR (payment."method" <> 'CASH' AND account."account_type" <> 'BANK')
     OR (payment."invoice_id" IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM "sales_invoices" AS invoice
       WHERE invoice."id" = payment."invoice_id"
         AND invoice."tenant_id" = payment."tenant_id"
         AND invoice."currency" = account."currency"
     ))
     OR (payment."order_id" IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM "sales_orders" AS sales_order
       WHERE sales_order."id" = payment."order_id"
         AND sales_order."tenant_id" = payment."tenant_id"
         AND sales_order."currency" = account."currency"
     ));

  IF invalid_payments IS NOT NULL THEN
    RAISE EXCEPTION 'Payments have missing or incompatible cash/bank accounts: %', invalid_payments;
  END IF;
END $$;

ALTER TABLE "finance_transactions"
DROP CONSTRAINT IF EXISTS "finance_transactions_account_id_fkey",
ALTER COLUMN "account_id" SET NOT NULL,
ADD CONSTRAINT "finance_transactions_account_id_fkey"
FOREIGN KEY ("account_id") REFERENCES "cash_accounts"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments"
ALTER COLUMN "cash_account_id" SET NOT NULL;

CREATE OR REPLACE FUNCTION enforce_finance_transaction_cash_account_currency()
RETURNS TRIGGER AS $$
DECLARE
  source_tenant_id TEXT;
  source_currency TEXT;
  source_is_active BOOLEAN;
  linked_cash_account_id TEXT;
  target_tenant_id TEXT;
  target_currency TEXT;
  target_is_active BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
       AND NEW.direction IS NOT DISTINCT FROM OLD.direction
       AND NEW.account_id IS NOT DISTINCT FROM OLD.account_id
       AND NEW.transfer_to_id IS NOT DISTINCT FROM OLD.transfer_to_id
       AND NEW.amount IS NOT DISTINCT FROM OLD.amount
       AND NEW.transfer_to_amount IS NOT DISTINCT FROM OLD.transfer_to_amount
       AND NEW.transfer_exchange_rate IS NOT DISTINCT FROM OLD.transfer_exchange_rate
       AND NEW.exchange_rate IS NOT DISTINCT FROM OLD.exchange_rate
       AND NEW.currency IS NOT DISTINCT FROM OLD.currency
       AND NEW.source_doc_type IS NOT DISTINCT FROM OLD.source_doc_type
       AND NEW.source_doc_id IS NOT DISTINCT FROM OLD.source_doc_id THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.account_id IS NULL THEN
    RAISE EXCEPTION 'A finance transaction must belong to a cash or bank account';
  END IF;

  IF NEW.amount <= 0 THEN
    RAISE EXCEPTION 'A finance transaction amount must be positive';
  END IF;

  SELECT "tenant_id", "currency", "is_active"
  INTO source_tenant_id, source_currency, source_is_active
  FROM "cash_accounts"
  WHERE "id" = NEW.account_id;

  IF NOT FOUND OR source_tenant_id <> NEW.tenant_id OR NOT source_is_active THEN
    RAISE EXCEPTION 'Finance transaction source account must be active and belong to the same tenant';
  END IF;

  IF source_currency <> NEW.currency THEN
    RAISE EXCEPTION 'Finance transaction currency % does not match source account currency %', NEW.currency, source_currency;
  END IF;
  IF NEW.exchange_rate IS NULL OR NEW.exchange_rate <= 0
     OR (NEW.currency = 'UZS' AND NEW.exchange_rate <> 1) THEN
    RAISE EXCEPTION 'Finance transaction exchange rate is invalid for currency %', NEW.currency;
  END IF;

  IF NEW.source_doc_type = 'PAYMENT' THEN
    SELECT "cash_account_id" INTO linked_cash_account_id
    FROM "payments"
    WHERE "id" = NEW.source_doc_id AND "tenant_id" = NEW.tenant_id;
    IF NOT FOUND OR linked_cash_account_id IS DISTINCT FROM NEW.account_id THEN
      RAISE EXCEPTION 'Finance transaction must use the cash/bank account recorded on its payment';
    END IF;
  ELSIF NEW.source_doc_type = 'AdditionalExpense' THEN
    SELECT "cash_account_id" INTO linked_cash_account_id
    FROM "additional_expenses"
    WHERE "id" = NEW.source_doc_id AND "tenant_id" = NEW.tenant_id;
    IF FOUND AND linked_cash_account_id IS DISTINCT FROM NEW.account_id THEN
      RAISE EXCEPTION 'Finance transaction must use the account recorded on its additional expense';
    END IF;
  ELSIF NEW.source_doc_type = 'OpeningBalanceDocument' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "opening_balance_lines" AS line
      WHERE line."document_id" = NEW.source_doc_id
        AND line."tenant_id" = NEW.tenant_id
        AND line."account_id" = NEW.account_id
        AND line."currency" = NEW.currency
        AND line."amount" = NEW.amount
    ) THEN
      RAISE EXCEPTION 'Finance transaction must match an opening balance line for the same account and currency';
    END IF;
  END IF;

  IF NEW.direction = 'TRANSFER' THEN
    IF NEW.transfer_to_id IS NULL OR NEW.transfer_to_amount IS NULL OR NEW.transfer_to_amount <= 0 THEN
      RAISE EXCEPTION 'A transfer requires a destination account and positive destination amount';
    END IF;
    IF NEW.transfer_to_id = NEW.account_id THEN
      RAISE EXCEPTION 'A transfer source and destination account must be different';
    END IF;

    SELECT "tenant_id", "currency", "is_active"
    INTO target_tenant_id, target_currency, target_is_active
    FROM "cash_accounts"
    WHERE "id" = NEW.transfer_to_id;

    IF NOT FOUND OR target_tenant_id <> NEW.tenant_id OR NOT target_is_active THEN
      RAISE EXCEPTION 'Finance transaction destination account must be active and belong to the same tenant';
    END IF;

    IF source_currency = target_currency AND NEW.transfer_to_amount <> NEW.amount THEN
      RAISE EXCEPTION 'Same-currency transfers must debit and credit the same amount';
    END IF;
    IF source_currency = target_currency AND NEW.transfer_exchange_rate IS NOT NULL THEN
      RAISE EXCEPTION 'Same-currency transfers must not carry an exchange rate';
    END IF;
    IF source_currency <> target_currency THEN
      IF NEW.transfer_exchange_rate IS NULL OR NEW.transfer_exchange_rate <= 0 THEN
        RAISE EXCEPTION 'Cross-currency transfers require a positive USD/UZS exchange rate';
      END IF;
      IF source_currency = 'USD' AND target_currency = 'UZS'
         AND NEW.exchange_rate <> NEW.transfer_exchange_rate THEN
        RAISE EXCEPTION 'A USD-to-UZS transfer must use the transfer quote as its finance transaction rate';
      END IF;
      IF source_currency = 'USD' AND target_currency = 'UZS'
         AND ABS(ROUND(NEW.amount * NEW.transfer_exchange_rate, 2) - NEW.transfer_to_amount) > 0.01 THEN
        RAISE EXCEPTION 'USD-to-UZS transfer amount does not match the recorded exchange rate';
      END IF;
      IF source_currency = 'UZS' AND target_currency = 'USD'
         AND ABS(ROUND(NEW.amount / NEW.transfer_exchange_rate, 2) - NEW.transfer_to_amount) > 0.01 THEN
        RAISE EXCEPTION 'UZS-to-USD transfer amount does not match the recorded exchange rate';
      END IF;
    END IF;
  ELSIF NEW.transfer_to_id IS NOT NULL OR NEW.transfer_to_amount IS NOT NULL THEN
    RAISE EXCEPTION 'Only transfers may specify a destination account or destination amount';
  ELSIF NEW.transfer_exchange_rate IS NOT NULL THEN
    RAISE EXCEPTION 'Only transfers may specify an exchange rate';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "finance_transactions_cash_account_currency_guard"
BEFORE INSERT OR UPDATE ON "finance_transactions"
FOR EACH ROW
EXECUTE FUNCTION enforce_finance_transaction_cash_account_currency();

CREATE OR REPLACE FUNCTION prevent_used_cash_account_recurrency()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.account_type IS DISTINCT FROM OLD.account_type
     OR NEW.currency IS DISTINCT FROM OLD.currency THEN
    IF OLD.balance <> 0
       OR EXISTS (
         SELECT 1 FROM "finance_transactions"
         WHERE "account_id" = OLD.id OR "transfer_to_id" = OLD.id
       ) THEN
      RAISE EXCEPTION 'A cash account with a balance or transaction history cannot change account type or currency';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "cash_accounts_identity_immutability_guard"
BEFORE UPDATE ON "cash_accounts"
FOR EACH ROW
EXECUTE FUNCTION prevent_used_cash_account_recurrency();

CREATE OR REPLACE FUNCTION enforce_payment_cash_account_type()
RETURNS TRIGGER AS $$
DECLARE
  account_tenant_id TEXT;
  account_type "CashAccountType";
  account_is_active BOOLEAN;
  document_currency TEXT;
BEGIN
  IF NEW.cash_account_id IS NULL THEN
    RAISE EXCEPTION 'A payment must be assigned to a cash or bank account';
  END IF;

  SELECT "tenant_id", "account_type", "is_active"
  INTO account_tenant_id, account_type, account_is_active
  FROM "cash_accounts"
  WHERE "id" = NEW.cash_account_id;

  IF NOT FOUND OR account_tenant_id <> NEW.tenant_id OR NOT account_is_active THEN
    RAISE EXCEPTION 'Payment cash account must be active and belong to the same tenant';
  END IF;

  IF NEW.method = 'CASH' AND account_type = 'BANK' THEN
    RAISE EXCEPTION 'Cash payments must use the currency-specific cash till';
  END IF;
  IF NEW.method <> 'CASH' AND account_type <> 'BANK' THEN
    RAISE EXCEPTION 'Bank and electronic payments must use the bank account';
  END IF;

  IF (NEW.invoice_id IS NULL) = (NEW.order_id IS NULL) THEN
    RAISE EXCEPTION 'A payment must be linked to exactly one sales document';
  END IF;

  IF NEW.invoice_id IS NOT NULL THEN
    SELECT "currency" INTO document_currency
    FROM "sales_invoices"
    WHERE "id" = NEW.invoice_id AND "tenant_id" = NEW.tenant_id;
  ELSIF NEW.order_id IS NOT NULL THEN
    SELECT "currency" INTO document_currency
    FROM "sales_orders"
    WHERE "id" = NEW.order_id AND "tenant_id" = NEW.tenant_id;
  ELSE
    document_currency := NULL;
  END IF;

  IF (NEW.invoice_id IS NOT NULL OR NEW.order_id IS NOT NULL)
     AND document_currency IS NULL THEN
    RAISE EXCEPTION 'A linked sales document must belong to the same tenant';
  END IF;
  IF document_currency IS NOT NULL AND document_currency <> (
    SELECT "currency" FROM "cash_accounts" WHERE "id" = NEW.cash_account_id
  ) THEN
    RAISE EXCEPTION 'Payment account currency must match its linked sales document currency';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "payments_cash_account_type_guard"
BEFORE INSERT OR UPDATE ON "payments"
FOR EACH ROW
EXECUTE FUNCTION enforce_payment_cash_account_type();
