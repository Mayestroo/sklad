# Visual check, round 2 (2026-11-13)

Taken with headless Microsoft Edge driven over the DevTools protocol (no
browser extension), 1440×1000, logged in as the seeded demo admin.

Setup (local only, Neon never touched): a fresh `sklad_demo` database in the
local Docker Postgres, migrated with `prisma migrate deploy --config
prisma.test.config.ts`; backend started from `dist` with `DATABASE_URL`
pointing at it inline (it auto-seeded the demo company, the log confirmed
`127.0.0.1:5432/sklad_demo`); frontend from the production build. Demo data
added through the local API: warehouse "Asosiy ombor", product
"Sement M400" (unit `piece`, cost 8 000, price 12 500,50 UZS), inbound
document of 1 250,5 units at 8 000.

| File | What it shows | Result |
|---|---|---|
| 02-sales-order-new-B8 | New customer order line | **B8 OK**: quantity, price, discount and VAT inputs sit under their own headers. Sales menu shows "Sotuv xarajatlari" (B13). Line total `0 UZS` in the new format. **Problem seen**: the inputs still show `1.000` / `0.000` (CurrencyInput keeps the old 3-decimal grammar, see finding F6). |
| 03-sales-orders-list | Orders list (migrated to TanStack Query) | Loads, empty state. |
| 04 / 05 opening-balances | Opening balances, fixed-asset tab | **B6 OK**: the "Eskirish tizimda avtomatik hisoblanmaydi…" notice is shown above the table. |
| 06-finance-new-expense-B13 | `/finance?new=expense` | **B13 OK**: the "Chiqim qo'shish" drawer opens directly. |
| 07 / 08 / 11 accounting | Accounts, reports, journal (migrated) | Load; journal amount `10 004 000 UZS`, reports `0 UZS` (**D8 OK**). |
| 09-inventory-nomenclature-B10-B12 | Nomenclature list | **B10 OK** (edit pencil), **B12 OK** (`dona`), money `8 000 UZS` / `12 500,50 UZS`. First shot showed `1250.5 dona` (raw number); fixed to `1 250,5 dona` and re-shot. |
| 10-products-B12 | Products list | Captured before the demo product existed (empty state); the product row is visible in 09. |

Not checked visually: B1/B4/B9 quick-create drawers (need clicks inside a
dropdown), B11 stock label in the invoice dropdown, the period-closing API
(no UI).
