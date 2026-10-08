ALTER TABLE "sales_orders"
ADD COLUMN "vat_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN "additional_charge_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN "additional_charge_vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 12,
ADD COLUMN "additional_charge_vat_amount" DECIMAL(15,2) NOT NULL DEFAULT 0;

ALTER TABLE "sales_order_items"
ADD COLUMN "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN "vat_amount" DECIMAL(15,2) NOT NULL DEFAULT 0;

ALTER TABLE "sales_invoices"
ADD COLUMN "additional_charge_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN "additional_charge_vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 12,
ADD COLUMN "additional_charge_vat_amount" DECIMAL(15,2) NOT NULL DEFAULT 0;

ALTER TABLE "sales_return_items"
ADD COLUMN "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN "vat_amount" DECIMAL(15,2) NOT NULL DEFAULT 0;

-- Existing document forms submit discount as a percentage, not a currency amount.
UPDATE "sales_order_items"
SET "total_price" = ROUND(
  "quantity" * "unit_price" * (1 - LEAST(GREATEST("discount", 0), 100) / 100),
  2
);

UPDATE "sales_orders" AS order_doc
SET "subtotal_amount" = totals.subtotal,
    "discount_amount" = totals.discount,
    "vat_amount" = 0,
    "total_amount" = ROUND(totals.subtotal - totals.discount, 2)
FROM (
  SELECT "order_id",
         SUM("quantity" * "unit_price") AS subtotal,
         SUM("quantity" * "unit_price" * LEAST(GREATEST("discount", 0), 100) / 100) AS discount
  FROM "sales_order_items"
  GROUP BY "order_id"
) AS totals
WHERE order_doc."id" = totals."order_id";

-- Recompute invoice line totals from the percentage discounts and VAT rates.
UPDATE "sales_invoice_items"
SET "discount" = LEAST(GREATEST("discount", 0), 100),
    "vat_amount" = ROUND(
      "quantity" * "unit_price" * (1 - LEAST(GREATEST("discount", 0), 100) / 100) * "vat_rate" / 100,
      2
    ),
    "total_price" = ROUND(
      "quantity" * "unit_price" * (1 - LEAST(GREATEST("discount", 0), 100) / 100)
      + "quantity" * "unit_price" * (1 - LEAST(GREATEST("discount", 0), 100) / 100) * "vat_rate" / 100,
      2
    );

UPDATE "sales_invoices" AS invoice
SET "subtotal_amount" = totals.subtotal,
    "discount_amount" = totals.discount,
    "vat_amount" = totals.vat,
    "total_amount" = ROUND(totals.subtotal - totals.discount + totals.vat, 2)
FROM (
  SELECT "invoice_id",
         SUM("quantity" * "unit_price") AS subtotal,
         SUM("quantity" * "unit_price" * "discount" / 100) AS discount,
         SUM("vat_amount") AS vat
  FROM "sales_invoice_items"
  GROUP BY "invoice_id"
) AS totals
WHERE invoice."id" = totals."invoice_id";

-- Gross profit is a base-currency (UZS) KPI: convert net revenue before subtracting FIFO COGS.
UPDATE "sales_invoice_items" AS item
SET "line_gross_profit" = ROUND(
  (item."total_price" - item."vat_amount") * invoice."exchange_rate" - item."line_cogs",
  2
),
"is_below_cost" = item."unit_price" * (1 - item."discount" / 100) * invoice."exchange_rate" < item."unit_cogs"
FROM "sales_invoices" AS invoice
WHERE invoice."id" = item."invoice_id"
  AND invoice."status" = 'POSTED';

UPDATE "sales_invoices"
SET "gross_profit" = ROUND(
  ("total_amount" - "vat_amount") * "exchange_rate" - "total_cogs",
  2
)
WHERE "status" = 'POSTED';

UPDATE "sales_return_items" AS return_item
SET "vat_rate" = invoice_item."vat_rate",
    "vat_amount" = ROUND(
      invoice_item."vat_amount" / NULLIF(invoice_item."quantity", 0) * return_item."quantity",
      2
    ),
    "unit_price" = ROUND(
      return_item."total_price" / NULLIF(return_item."quantity", 0)
      - invoice_item."vat_amount" / NULLIF(invoice_item."quantity", 0),
      2
    )
FROM "sales_returns" AS return_doc,
     "sales_invoice_items" AS invoice_item
WHERE return_doc."id" = return_item."return_id"
  AND invoice_item."invoice_id" = return_doc."invoice_id"
  AND invoice_item."product_id" = return_item."product_id"
  AND return_doc."invoice_id" IS NOT NULL;
