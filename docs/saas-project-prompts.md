# SaaS Platform — Unified MoySklad + 1C System
## A standalone AI prompt for each module (Bilingual: Uzbek & Russian)

**Context:** This is a multi-tenant SaaS system built for the Uzbekistan market, sold to other companies. MoySklad's cloud-based simplicity and speed is merged with 1C's accounting depth into a single native codebase — there is no integration between two separate systems, it is one system from the ground up.

**Bilingual Architecture (UZ/RU):** The platform is natively bilingual supporting **Uzbek (`uz-UZ` - Latin script primary)** and **Russian (`ru-RU`)**. All UI elements, system messages, accounting charts of accounts (NAS/BHMS), printable/PDF financial documents, and dynamic domain metadata (product names, category titles, unit measurements) must natively support both languages seamlessly.

**How to use:** Copy each section's prompt in full and give it to your AI coding tool (Claude Code, Cursor, etc.) as a standalone task. The prompts are sequential and dependent on each other — Module 0 is the foundation, and everything else is built on top of it.

---

## MODULE 0: Project Architecture and Technical Foundation

**Goal:** Establish the technical foundation the entire system will be built on — every later prompt depends on this.

```
I am building a multi-tenant SaaS platform for the Uzbekistan market —
this platform combines warehouse/sales management (MoySklad-style) and
full double-entry accounting (1C-style) into a single unified system.
I am not integrating two separate products — I am writing one native
system.

The system MUST be natively bilingual: supporting Uzbek (uz-UZ, Latin)
and Russian (ru-RU).

Design and scaffold the following architecture:

1. Tech stack selection and justification:
   - Backend: Node.js (NestJS) or Python (FastAPI/Django) — recommend
     whichever is best suited for multi-tenant data isolation and i18n
     middleware
   - Database: PostgreSQL — justify whether schema-per-tenant or
     row-level tenant_id isolation is the right approach for this project
   - Frontend: React/Next.js with an i18n framework (e.g. next-intl or
     react-i18next) supporting fallback mechanisms (uz -> ru)
   - A WebSocket layer for real-time updates (e.g. warehouse stock
     levels)

2. Multi-tenant & Internationalization (i18n) architecture:
   - Each client company's (tenant's) data must be fully isolated
   - Tenant entity includes default_language ('uz' | 'ru') and
     supported_languages array
   - Database design strategy for translatable domain entities (e.g.,
     products, categories, units of measure): use PostgreSQL JSONB
     structures (e.g., name: { "uz": "...", "ru": "..." }) for dynamic
     fields
   - A single company can have multiple users, roles, and branches

3. Shared data model (core schema):
   - Company (tenant), User, Role, Permission
   - User profile includes preferred_language ('uz' | 'ru')
   - Warehouse, Branch
   - Currency, TaxRate — accounting for Uzbekistan's VAT (12%) and
     other tax types

4. Project folder structure and monorepo organization (if applicable)
   - Include clear localization assets location (/locales/uz.json,
     /locales/ru.json) for static UI text strings

5. .env configuration, local development environment via Docker

Output: a working skeleton project, empty but correctly configured
database migrations, i18n setup, and a structure ready for the next
modules to be added on top of it.
```

---

## MODULE 1: Authentication and User/Role Management

**Goal:** A secure access system for the SaaS — from company sign-up through to staff roles with language preference support.

```
On top of the architecture created in Module 0, build the
authentication and permissions system:

1. Company sign-up:
   - Create a new company (tenant) with a first admin user
   - Select company primary language (Uzbek or Russian)
   - Email/SMS verification flow sent in selected language
   - Trial period logic — e.g. a 14-day free trial

2. Login system:
   - JWT-based authentication, refresh token mechanism
   - "Multiple users per company" — each user can only see their own
     company's data
   - User session carries preferred_language context ('uz' | 'ru')

3. Roles and permissions (RBAC):
   - Create standard roles: Super Admin (SaaS owner), Company Admin,
     Accountant, Warehouse Manager, Salesperson, Viewer (read-only)
   - Role and permission display names localized in UZ and RU
   - A granular permission matrix per module (warehouse, sales,
     accounting, reports): view/create/edit/delete
   - Only the "Accountant" and "Admin" roles should be able to access
     the accounting module — this matters because financial data is
     sensitive

4. Audit log:
   - Log who changed which record and when (mandatory requirement for
     accounting documents) with multi-lingual action descriptors

5. Security: password hashing (bcrypt/argon2), rate limiting, optional
   2FA

UI: login/register pages, a user management panel (invite users,
assign roles, set language preference, activate/deactivate).
```

---

## MODULE 2: Warehouse and Inventory (MoySklad-style)

**Goal:** Real-time tracking of goods and inventory with multi-lingual nomenclature.

```
After Module 1, build the warehouse management module:

1. Product catalog (nomenclature):
   - Product/service card: bilingual name (Uzbek/Russian), SKU,
     barcode, unit of measure (dona/шт, kg/кг, litr/л, metr/м),
     category (bilingual), cost price, sale price, VAT rate
   - Support for variants (size, color) and bundles/kits with
     localized names
   - Dynamic JSONB translation handling for product titles and descriptions

2. Multi-warehouse accounting:
   - Track stock levels separately across multiple warehouses/branches
   - A stock-transfer document for moving goods between warehouses

3. Inbound/outbound documents:
   - Inbound (receiving goods from a supplier)
   - Outbound (sale, write-off, adjustment from inventory count)
   - Document UI and printable versions available in Uzbek and Russian
   - Every document must automatically generate the warehouse balance
     update AND — importantly — the matching accounting journal
     entries (double-entry), since these two modules run on one
     shared database

4. Stocktaking (inventory count):
   - Planned counting, discrepancy detection, and adjustment document

5. Real-time stock monitoring:
   - Dashboard alerts for products that have dropped below their
     minimum stock threshold (localized alert text)

6. Barcode/QR scanning integration (via browser camera)

UI: product list (table, filter, search), product card (with UZ/RU
translation fields), inbound/outbound document creation form, warehouse
balance report.

IMPORTANT: this module shares a single database with the accounting
module — not a separate API integration, but a common service layer
that updates both sides within the same transaction.
```

---

## MODULE 3: Sales, Purchasing and CRM (MoySklad-style)

**Goal:** Managing customers, orders, and sales processes with bilingual document exports.

```
On top of the warehouse module, build the sales and purchasing module:

1. Counterparties (customers and suppliers):
   - A single counterparty card: Tax ID (TIN/INN / STIR), bank details,
     contact information, preferred language, type (customer/supplier/both)

2. Sales process:
   - Customer order → invoice → shipping document → payment received
   - Each stage tracked by status (new, confirmed, shipped, paid)

3. Purchasing process:
   - Purchase order to supplier → goods received → payment

4. Bilingual PDF/Print Document Generator:
   - Export Invoices (Hisob-faktura / Счет-фактура), Shipping Waybills
     (Yuk xati / Товарная накладная), Payment Receipts (To'lov cheki /
     Квитанция), and Contracts (Shartnoma / Договор)
   - Allow user to choose output language: Uzbek (`uz`), Russian (`ru`),
     or Dual-language side-by-side view (compliant with Uzbekistan legal/tax standards)

5. Basic CRM functionality:
   - Customer interaction history (calls, meeting reminders)
   - Sales pipeline — stages from lead to confirmed deal (localized stage names)

6. Pricing policy:
   - Multiple price types (retail, wholesale), per-customer discounts

7. Accounting auto-posting:
   - Every sales/purchase document must automatically generate the
     matching accounting journal entry (e.g. a sale → revenue and VAT
     liability entry)

UI: order list and kanban-board view, customer card, invoice template
(with print/PDF export in UZ/RU/Dual formats).
```

---

## MODULE 4: Accounting — Double-Entry Bookkeeping Engine (1C-style)

**Goal:** The "1C" half of the system — building a correct accounting foundation with Uzbekistan NAS in Uzbek and Russian.

```
This is the most complex module — build 1C's accounting logic
natively (not an integration with external 1C, but our own internal
double-entry engine):

1. Chart of accounts (Schyotlar rejasi / План счетов):
   - Build an account hierarchy fully compliant with Uzbekistan's National
     Accounting Standards (NAS / BHMS)
   - Account numbers, titles, and descriptions must be pre-populated in
     both Uzbek and Russian (e.g., Account 4110: "Omborlardagi tovarlar" /
     "Товары на складах", Account 5010: "Milliy valyutadagi kassa" /
     "Касса в национальной валюте")
   - Every company starts from this standard bilingual chart of accounts,
     and can add custom sub-accounts in UZ/RU

2. Double-entry journal engine:
   - Every financial event is stored as a two-sided (debit/credit)
     entry
   - A validation layer that ensures the balance always nets to zero
   - A "posting template" system so documents from the warehouse and
     sales modules auto-generate the correct journal entries (e.g. a
     "goods sold" event automatically creates Dr 90.2 / Cr 41)

3. Core accounting registers (bilingual reports):
   - General ledger (Bosh daftar / Главная книга)
   - Trial balance (Aylanma-balans qaydnomasi / Оборотно-сальдовая ведомость)
   - Cash and bank operations ledger (Kassa va bank operatsiyalari)

4. Basic fixed asset accounting:
   - Depreciation calculation, fixed asset card (Asosiy vositalar)

5. Period closing:
   - Monthly/quarterly/yearly close, automatic closing entries

UI: chart of accounts view (with UZ/RU toggle and search), journal entries
log (with search/filter), screens for generating General Ledger and Trial
Balance reports in Uzbek or Russian.

IMPORTANT: this module must act as an "event listener" attached to
every document from Modules 2 and 3 — every event coming from the
warehouse or sales side must automatically become the correct journal
entry, with no need for manual entry.
```

---

## MODULE 5: Deep UX/UI Design System for CRM & i18n

**Goal:** A light, refined design language with native language switcher and text layout resilience.

```
Build a deeply considered, professional UX/UI design system for the
whole platform, with particular focus on the CRM/sales workflow and
seamless i18n language switching:

DIRECTION — LIGHT THEME:
- Background: warm/neutral off-white (#FAFAF9 or close to it)
- Accent color: soft indigo/teal + low-saturation status colors

SHAPE AND BORDERS — AVOID SQUARE CORNERS:
- Soft radius hierarchy (12–20px) across cards, inputs, modals, buttons
- Thin, low-contrast borders (#F0F0EE) or soft depth shadows

SPACING AND TEXT RESILIENCE:
- 8px-based spacing system (8, 16, 24, 32, 48, 64...)
- Layouts designed to accommodate text length variations between
  Uzbek (Latin) and Russian (Cyrillic) without text truncating awkwardly
  or breaking button bounds
- Both "compact" and "comfortable" table density modes

LANGUAGE SWITCHER COMPONENT:
- Prominent header language toggle button ('UZ' | 'RU')
- Instant client-side locale update without losing un-saved form state
- Date, currency (UZS / SUM), and number formatters auto-adjusting to locale

TYPOGRAPHY & SCRIPTS:
- Fonts supporting full Latin and Cyrillic character ranges (e.g. Inter)
- Standard type scale (12/14/16/20/24/32px) with tabular-nums for financial data

CRM-SPECIFIC COMPONENTS:
1. Customer card with status badge and localized activity feed
2. Pipeline/kanban board with draggable deal cards
3. Filter and search panel with pill-shaped filter tags

Output: reusable design-token system + i18n Language Switcher component +
sample core CRM screens built on this system.
```

---

## MODULE 6: Analytics and Dashboard

**Goal:** Bring together data from all modules into a single view with localized analytics exports.

```
Build the management dashboard on top of the data from Modules 2-5:

1. Main dashboard:
   - Daily/weekly/monthly sales trend chart
   - Ranking of fastest- and slowest-moving warehouse items
   - Cash and bank balance in UZS (So'm / Сум)
   - Pending payments (receivables/payables)

2. Financial analytics:
   - Revenue and expense trends
   - Margin and profitability calculation (by product/category)

3. Custom report builder:
   - Simple report builder letting users choose columns, apply
     filters, and save custom reports
   - All report column headers, summaries, and values generated in
     the user's chosen language (UZ or RU)

4. Export options: Excel, PDF (with UZ/RU language selection)

Technical note: pre-aggregate heavy calculations on the backend rather
than the frontend, and use caching (e.g. Redis) to keep things fast.
```

---

## MODULE 7: Billing and Subscription System (mandatory for SaaS)

**Goal:** For selling to other companies — pricing plans, payment infrastructure, and localized checkout.

```
Since this is a SaaS product, a dedicated billing module is needed to
collect payment from your own customers (built on top of the tenant
system created in Module 0):

1. Pricing plans:
   - Starter (warehouse + sales only), Professional (+ accounting),
     Enterprise (+ multiple branches, API access)
   - Localized plan descriptions, feature lists, and pricing in UZS

2. Subscription lifecycle:
   - Trial → active subscription → payment overdue → block/reminder
   - Upgrading/downgrading plans

3. Local Payment integration:
   - Accept automatic and manual payments through local Uzbekistan
     payment systems (Payme, Click)
   - Payme and Click checkout flows and SMS payment notifications in Uzbek and Russian
   - Generate official billing receipts/invoices in UZ/RU

4. Company Admin billing dashboard

UI: plan-selection page, payment history, current subscription status
panel (bilingual).
```

---

## MODULE 8: Super-Admin Panel (for the SaaS owner)

**Goal:** Your central hub for managing all client companies with multi-language broadcast notifications.

```
On top of the billing system from Module 7, build a separate
super-admin panel intended only for the SaaS owner (you):

1. List of all tenant companies: status, plan, primary language,
   sign-up date, activity level

2. Global metrics: total MRR (monthly recurring revenue), new
   sign-ups, churn rate

3. Manually activate/block a tenant, change their plan

4. System-level settings: add pricing plans, broadcast system
   announcements (ability to compose announcements in both Uzbek and
   Russian to reach all tenant users in their preferred language)

5. Support ticketing system: view and respond to support tickets with
   auto-translation assistance or dual UZ/RU response options

Security: separate subdomain (admin.yourdomain.uz), IP restriction, 2FA.
```

---

## MODULE 9: UI/UX Design System & Font Guidelines

**Goal:** A consistent, professional visual language supporting Latin and Cyrillic character sets.

```
Based on frontend-design principles, create a distinctive design
system for this SaaS platform:

1. Brand and visual direction: modern, trustworthy, distinct from dated 1C
   interfaces, tailored for Uzbekistan businesses.

2. Font and Typography selection:
   - Primary font family must support both Latin (`uz-UZ`) and Cyrillic (`ru-RU`, `uz-Cyrl`)
   - Recommended font: Inter, Outfit, or Roboto with clean glyph rendering for Uzbek specific letters (O', G', Sh, Ch / Ў, Қ, Ғ, Ҳ)

3. Component library:
   - Button, table, form, modal, kanban card, and i18n Language Switcher
   - Responsive layouts for desktop, tablet, and mobile (warehouse staff on mobile)

4. Support for dark/light mode

Output: reusable component library + sample pages (dashboard, table, form, report) tested in both Uzbek and Russian UI states.
```

---

## MODULE 10: Security, Backups, Monitoring and Compliance

**Goal:** Ensuring reliability and legal compliance for a financial system in Uzbekistan.

```
Build the security, operational reliability, and compliance layer:

1. Data backups: automatic daily backups, with per-tenant restore
   capability

2. Immutability of accounting entries: once a period is closed, its
   journal entries can only be changed via a special correcting entry

3. Uzbekistan Legal & Data Compliance:
   - Compliance with Uzbekistan Personal Data Legislation (Law No. ZRU-547)
   - Support for official tax document requirements in Uzbek (state language)
     and Russian (business language)
   - Data encryption at rest and in transit

4. System monitoring & error tracking:
   - Track backend and frontend errors with locale tag context to identify
     missing translation key errors in production

Implement this module in parallel with each core module.
```

---

## Note on execution order

Use the prompts in sequence: **0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10**.
Modules 2 and 3 (warehouse, sales) depend on the journal engine in Module 4 (accounting), so if your AI tool can't hold the full context in one session, prepend a short summary of the previous module before each new prompt.
