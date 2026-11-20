# UX audit — Sklad frontend (2026-11-21)

Baseline: commit `a4811d3`, local app with demo data (8 products, 5 counterparties, posted receipts and sales).
Screenshots: `screens/before/<route>-<locale>-<width>.jpg` (1440, 1280, 390 px; uz and ru), raw data in
`screens/before/report.json` (load time, horizontal overflow, console errors, axe WCAG 2 A/AA results at 1440 px).
Flow screenshots after changes: `flows/`.

How to re-run: see `docs/ux-guide.md` → "Verification".

## Measured baseline

| Route | overflow 390 uz/ru (px) | overflow 1280 | axe violations @1440 uz | console errors |
|---|---|---|---|---|
| /login | 0 / 0 | 0 | — | 0 |
| /register | 0 / 0 | 0 | color-contrast(1) | 0 |
| / (dashboard) | 414 / 414 | 0 | color-contrast(17) | 0 |
| /sales | 303 / 332 | 0 | color-contrast(23) | 0 |
| /sales/new | 991 / 991 | 101 | color-contrast(21) nested-interactive(1) | 0 |
| /sales/orders | 303 / 332 | 0 | color-contrast(12) | 0 |
| /sales/orders/new | 635 / 631 | 0 | color-contrast(19) | 0 |
| /sales/returns | 303 / 332 | 0 | color-contrast(5) | 0 |
| /sales/prices | 378 / 391 | 0 | color-contrast(5) | 0 |
| /sales/customers | 303 / 332 | 0 | color-contrast(8) | 0 |
| /sales/crm | 303 / 332 | 0 | color-contrast(11) scrollable-region-focusable(1) | 0 |
| /purchases | 303 / 332 | 0 | color-contrast(20) | 0 |
| /purchases/new | 376 / 385 | 0 | color-contrast(21) label(1) nested-interactive(1) | 0 |
| /purchases/expenses | 303 / 332 | 0 | color-contrast(11) | 0 |
| /purchases/expenses/new | 303 / 332 | 0 | color-contrast(18) nested-interactive(1) | 0 |
| /purchases/returns | 303 / 332 | 0 | color-contrast(10) | 0 |
| /purchases/returns/new | 303 / 332 | 0 | color-contrast(17) nested-interactive(1) | 0 |
| /purchases/suppliers | 303 / 332 | 0 | color-contrast(9) | 0 |
| /products | 303 / 332 | 26 | color-contrast(33) | 0 |
| /products/new | 328 / 342 | 0 | color-contrast(8) | 0 |
| /inventory | 303 / 332 | 0 | color-contrast(24) | 0 |
| /inventory/documents | 303 / 332 | 0 | color-contrast(7) | 0 |
| /inventory/transfers | 303 / 332 | 0 | color-contrast(7) | 0 |
| /counterparties | 1544 / 1589 | 654 | color-contrast(24) | 0 |
| /finance | 303 / 332 | 0 | color-contrast(65) | 0 |
| /services | 303 / 332 | 0 | color-contrast(21) | 0 |
| /production | 303 / 332 | 0 | color-contrast(6) | 0 |
| /opening-balances | 303 / 332 | 0 | color-contrast(6) | 0 |
| /accounting | 303 / 332 | 0 | color-contrast(24) | 0 |
| /accounting/accounts | 303 / 332 | 0 | color-contrast(49) | 0 |
| /accounting/journal | 303 / 332 | 0 | color-contrast(7) | 0 |
| /accounting/reports | 303 / 332 | 0 | color-contrast(15) | 0 |
| /analytics | 509 / 549 | 0 | color-contrast(19) | 0 |
| /users | 303 / 332 | 0 | color-contrast(14) | 0 |
| /settings/branches | 303 / 332 | 0 | color-contrast(7) | 0 |
| /settings/sales | 303 / 332 | 0 | color-contrast(8) | 0 |
| /settings/billing | 303 / 332 | 0 | color-contrast(8) | 0 |
| /settings/security | 303 / 332 | 0 | color-contrast(11) | 0 |
| /settings/production | 303 / 332 | 0 | color-contrast(6) | 0 |

Totals: 597 color-contrast nodes, 4 nested-interactive, 1 label, 1 scrollable-region-focusable.

## Cross-cutting problems (fix once, helps every screen)

| # | Problem | Evidence | Impact |
|---|---|---|---|
| X1 | No phone/tablet layout: fixed 260 px sidebar at every width | every signed-in page overflows ≥ 303 px at 390 px | Unusable on phones |
| X2 | Tertiary text token #a8a29e = 2.5:1 on white | 597 axe contrast nodes | Hints, captions, placeholders hard to read |
| X3 | Header search box does nothing; bell does nothing | code: no handler | Dead controls, wasted clicks |
| X4 | Pages not reachable from the menu: /sales/prices, /sales/crm; /inventory/transfers & /documents only via inner links | grep of links | Features effectively hidden |
| X5 | Profile menu "Settings" → /settings (404); "Profile settings" → no such page | Header.tsx | Broken navigation |
| X6 | Toasts hard-coded light colours (broken in dark mode), role=alert for success, re-render every 20 ms, no undo | Toast.tsx | Noisy for screen readers, dark mode unreadable |
| X7 | `.sr-only` labels inside wide tables widen the page | overflow.mjs on /sales/new | Horizontal scroll on phones |
| X8 | Two number-input conventions: CurrencyInput "15,000.5" vs DecimalInput/formatCurrency "15 000,5" | receipt form screenshot | Confusing money entry (see proposals) |
| X9 | Mixed i18n: ~80 files use inline `isRu ? … : …`, others next-intl; some hard-coded Uzbek/English (register page, "(equiv.)", "Below-Cost Guardrail") | grep | Inconsistent terms, English leftovers |
| X10 | Destructive "Delete" as solid red button in the middle of primary actions | sale/receipt toolbars | Mis-clicks |

## Screens ranked by impact (frequency × pain)

1. **New sale** (/sales/new) — most frequent; first customer silently pre-selected (debt to wrong client), errors only in a banner at the top (off-screen when scrolled), no live total near the actions, 991 px overflow on phones, English/Russian leftovers in Uzbek.
2. **New purchase receipt** (/purchases/new) — same patterns; first supplier pre-selected; currency starts empty (correct per ADR 0022) but the field was not marked; "()" in headers before a currency is chosen.
3. **Dashboard** — no quick actions; period dates computed in UTC (between 00:00–05:00 Tashkent "today" excluded today's documents — sales showed 0); "(equiv.)"; links to the wrong page; phone overflow 414 px.
4. **Login / registration** — labels not tied to inputs, no autocomplete, no language switch on login, English API error, registration hard-coded Uzbek, company code froze after the first letter.
5. **Counterparties** — 1544 px overflow at 390 and 654 px even at 1280 (wide table without scroll container).
6. **Finance** — 65 contrast nodes, 2191-line page (many drawers).
7. **Additional expense** (/purchases/expenses/new) — hard-coded `#ffffff` text on segmented control, nested-interactive.
8. **Products & quick-add**, **returns**, **inventory documents**, **settings**, then the rest.

## Glossary (UI terms, from CONTEXT.md; use these, not the synonyms)

| Concept (CONTEXT.md) | uz | ru | Avoid in UI |
|---|---|---|---|
| Sales Invoice | Sotuv hujjati | Накладная продажи / Продажа | "Nukladnoy", "invoice" |
| Sales Order | Buyurtma | Заказ | "pro-forma" |
| Sales Return | Mijozdan qaytarish | Возврат покупателя | |
| Purchase Receipt | Kirim (xarid) hujjati | Приходный документ | "admission sheet" |
| Additional Expense | Qo‘shimcha xarajat | Доп. расход | "overhead" |
| Purchase Return | Yetkazib beruvchiga qaytarish | Возврат поставщику | |
| Counterparty | Kontragent | Контрагент | |
| Customer / Supplier | Mijoz / Yetkazib beruvchi | Клиент / Поставщик | "Ta’minotchi" |
| Post / Unpost | Tasdiqlash / Tasdiqni bekor qilish | Провести / Отменить проведение | |
| Draft | Qoralama | Черновик | |
| Discount | Chegirma | Скидка | "Skidka" in Uzbek |
| VAT | QQS | НДС | |
| Landed cost | Tannarx | Себестоимость | |
| Warehouse | Ombor | Склад | |
| Receive payment | To‘lov qabul qilish | Принять оплату | "To‘lash" for incoming money |
