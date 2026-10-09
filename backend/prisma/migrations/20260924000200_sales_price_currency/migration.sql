ALTER TABLE "products"
ADD COLUMN "sale_price_currency" TEXT;

UPDATE "products" AS product
SET "sale_price_currency" = company."settings" #>> '{sales,defaultCurrency}'
FROM "companies" AS company
WHERE company."id" = product."tenant_id"
  AND company."settings" #>> '{sales,defaultCurrency}' IN ('USD', 'UZS');

ALTER TABLE "products"
ADD CONSTRAINT "products_sale_price_currency_check"
CHECK ("sale_price_currency" IS NULL OR "sale_price_currency" IN ('USD', 'UZS'));

DO $$
DECLARE
  unresolved_products TEXT;
BEGIN
  SELECT string_agg(product."id" || ':' || product."sku", ', ' ORDER BY product."sku")
  INTO unresolved_products
  FROM "products" AS product
  WHERE product."sale_price" > 0
    AND product."sale_price_currency" IS NULL;

  IF unresolved_products IS NOT NULL THEN
    RAISE NOTICE 'Products requiring manual sale-price currency: %', unresolved_products;
  END IF;
END $$;
