INSERT INTO "counterparty_balances" (
  "id", "tenant_id", "counterparty_id", "currency", "customer_debt", "supplier_debt", "created_at", "updated_at"
)
SELECT
  md5(random()::text || clock_timestamp()::text || "counterparty_id" || "currency"),
  "tenant_id",
  "counterparty_id",
  "currency",
  SUM("customer_debt"),
  SUM("supplier_debt"),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT
    "tenant_id",
    "counterparty_id",
    "currency",
    GREATEST("total_amount" - "paid_amount", 0) AS "customer_debt",
    0::DECIMAL AS "supplier_debt"
  FROM "sales_invoices"
  WHERE "status" = 'POSTED'

  UNION ALL

  SELECT
    "tenant_id",
    "counterparty_id",
    "currency",
    0::DECIMAL AS "customer_debt",
    GREATEST("total_amount" - "paid_amount", 0) AS "supplier_debt"
  FROM "purchase_receipts"
  WHERE "status" = 'POSTED'
) AS "open_documents"
GROUP BY "tenant_id", "counterparty_id", "currency"
ON CONFLICT ("counterparty_id", "currency") DO UPDATE SET
  "customer_debt" = EXCLUDED."customer_debt",
  "supplier_debt" = EXCLUDED."supplier_debt",
  "updated_at" = CURRENT_TIMESTAMP;
