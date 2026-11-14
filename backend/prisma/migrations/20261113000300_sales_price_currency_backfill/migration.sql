-- Sales-document correctness plan, Task 1 Step 3: product sale-price currency.
--
-- A database built from the baseline already has the column and the CHECK
-- constraint. Production was created with `db push`, so the historical
-- backfill (the original 20260924000200 migration) may never have run there.
-- Idempotent: safe on a fresh database, on the baseline and on a re-run.
--
-- Only NULL currencies are filled, and only from a valid
-- companies.settings.sales.defaultCurrency (USD or UZS). Anything else stays
-- NULL and is listed in a NOTICE for manual repair, never guessed (ADR 0022).

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "sale_price_currency" TEXT;

UPDATE "products" AS product
SET "sale_price_currency" = company."settings" #>> '{sales,defaultCurrency}'
FROM "companies" AS company
WHERE company."id" = product."tenant_id"
  AND product."sale_price_currency" IS NULL
  AND company."settings" #>> '{sales,defaultCurrency}' IN ('USD', 'UZS');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_sale_price_currency_check'
  ) THEN
    ALTER TABLE "products"
      ADD CONSTRAINT "products_sale_price_currency_check"
      CHECK ("sale_price_currency" IS NULL OR "sale_price_currency" IN ('USD', 'UZS'));
  END IF;
END $$;

DO $$
DECLARE
  unresolved_products TEXT;
BEGIN
  SELECT string_agg(product."tenant_id" || '/' || product."id" || ':' || product."sku", ', ' ORDER BY product."tenant_id", product."sku")
  INTO unresolved_products
  FROM "products" AS product
  WHERE product."sale_price" > 0
    AND product."sale_price_currency" IS NULL;

  IF unresolved_products IS NOT NULL THEN
    RAISE NOTICE 'Products requiring manual sale-price currency: %', unresolved_products;
  END IF;
END $$;
