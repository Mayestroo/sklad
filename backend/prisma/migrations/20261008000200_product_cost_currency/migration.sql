ALTER TABLE "products"
ADD COLUMN "cost_price_currency" TEXT NOT NULL DEFAULT 'UZS',
ADD COLUMN "cost_price_exchange_rate" DECIMAL(15,4) NOT NULL DEFAULT 1;

ALTER TABLE "products"
ADD CONSTRAINT "products_cost_price_currency_check"
CHECK ("cost_price_currency" IN ('USD', 'UZS')),
ADD CONSTRAINT "products_cost_price_exchange_rate_check"
CHECK ("cost_price_exchange_rate" > 0);
