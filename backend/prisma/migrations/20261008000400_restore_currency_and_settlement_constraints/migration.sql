ALTER TABLE "products"
ADD CONSTRAINT "products_sale_price_currency_check"
CHECK ("sale_price_currency" IS NULL OR "sale_price_currency" IN ('USD', 'UZS'));

ALTER TABLE "products"
ADD CONSTRAINT "products_cost_price_currency_check"
CHECK ("cost_price_currency" IN ('USD', 'UZS')),
ADD CONSTRAINT "products_cost_price_exchange_rate_check"
CHECK ("cost_price_exchange_rate" > 0);

ALTER TABLE "counterparty_settlement_entries"
ADD CONSTRAINT "counterparty_settlement_entries_currency_check"
CHECK ("currency" IN ('USD', 'UZS')),
ADD CONSTRAINT "counterparty_settlement_entries_amount_check"
CHECK ("amount" <> 0);

ALTER TABLE "settlement_allocations"
ADD CONSTRAINT "settlement_allocations_currency_check"
CHECK ("currency" IN ('USD', 'UZS')),
ADD CONSTRAINT "settlement_allocations_amount_check"
CHECK ("amount" <> 0);
