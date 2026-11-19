-- The payment guard trigger declared a PL/pgSQL variable named "account_type"
-- and selected the column of the same name into it. PL/pgSQL cannot tell the
-- two apart, so EVERY insert into "payments" failed with
--   42702: column reference "account_type" is ambiguous
-- and paying a sales invoice ("To'lov qabul qilish") returned a 500.
-- Same checks, with variables that cannot clash with column names.
CREATE OR REPLACE FUNCTION enforce_payment_cash_account_type()
RETURNS TRIGGER AS $$
DECLARE
  v_account_tenant_id TEXT;
  v_account_type "CashAccountType";
  v_account_is_active BOOLEAN;
  v_account_currency TEXT;
  v_document_currency TEXT;
BEGIN
  IF NEW.cash_account_id IS NULL THEN
    RAISE EXCEPTION 'A payment must be assigned to a cash or bank account';
  END IF;

  SELECT ca."tenant_id", ca."account_type", ca."is_active", ca."currency"
  INTO v_account_tenant_id, v_account_type, v_account_is_active, v_account_currency
  FROM "cash_accounts" AS ca
  WHERE ca."id" = NEW.cash_account_id;

  IF NOT FOUND OR v_account_tenant_id <> NEW.tenant_id OR NOT v_account_is_active THEN
    RAISE EXCEPTION 'Payment cash account must be active and belong to the same tenant';
  END IF;

  IF NEW.method = 'CASH' AND v_account_type = 'BANK' THEN
    RAISE EXCEPTION 'Cash payments must use the currency-specific cash till';
  END IF;
  IF NEW.method <> 'CASH' AND v_account_type <> 'BANK' THEN
    RAISE EXCEPTION 'Bank and electronic payments must use the bank account';
  END IF;

  IF (NEW.invoice_id IS NULL) = (NEW.order_id IS NULL) THEN
    RAISE EXCEPTION 'A payment must be linked to exactly one sales document';
  END IF;

  IF NEW.invoice_id IS NOT NULL THEN
    SELECT si."currency" INTO v_document_currency
    FROM "sales_invoices" AS si
    WHERE si."id" = NEW.invoice_id AND si."tenant_id" = NEW.tenant_id;
  ELSE
    SELECT so."currency" INTO v_document_currency
    FROM "sales_orders" AS so
    WHERE so."id" = NEW.order_id AND so."tenant_id" = NEW.tenant_id;
  END IF;

  IF v_document_currency IS NULL THEN
    RAISE EXCEPTION 'A linked sales document must belong to the same tenant';
  END IF;
  IF v_document_currency <> v_account_currency THEN
    RAISE EXCEPTION 'Payment account currency must match its linked sales document currency';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
