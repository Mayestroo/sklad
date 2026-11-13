-- Sales-document correctness plan, Task 3 Step 2: sales-order VAT and
-- sales-return line discount/VAT.
--
-- The baseline already has the order VAT and return VAT columns; production
-- was created with `db push`, so they are guarded with IF NOT EXISTS here.
-- New: sales_return_items.discount, the source invoice line's discount
-- percentage. A return line's unit_price is the source line's discounted
-- unit price excluding VAT, so this column is provenance for display and
-- audit; it is already applied in unit_price and total_price.
--
-- Additive and idempotent. Existing return lines get 0 (their unit_price is
-- already net), so no historical amount changes.

ALTER TABLE "sales_orders"
  ADD COLUMN IF NOT EXISTS "vat_amount" DECIMAL(15,2) NOT NULL DEFAULT 0;

ALTER TABLE "sales_order_items"
  ADD COLUMN IF NOT EXISTS "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "vat_amount" DECIMAL(15,2) NOT NULL DEFAULT 0;

ALTER TABLE "sales_return_items"
  ADD COLUMN IF NOT EXISTS "discount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "vat_amount" DECIMAL(15,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_return_items_discount_check'
  ) THEN
    ALTER TABLE "sales_return_items"
      ADD CONSTRAINT "sales_return_items_discount_check"
      CHECK ("discount" >= 0 AND "discount" <= 100);
  END IF;
END $$;
