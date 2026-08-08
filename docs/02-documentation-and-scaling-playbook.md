# PROMPT 2: Documentation & Scaling Playbook

**Purpose:** As the platform grows past the initial build, this prompt establishes the documentation and scaling groundwork needed to onboard new engineers, make architecture decisions traceable (including i18n architectural decisions), and grow the system to more tenants and higher load without rediscovering the same problems each time.

```
I am running the same multi-tenant SaaS platform described earlier
(inventory + sales/CRM + accounting, native, no external integration,
sold to companies in Uzbekistan, bilingual in Uzbek and Russian).
The core modules are built and the governance/control layer is in place.
I now need the documentation and scaling foundation that lets this
system grow safely — more engineers joining, more tenants signing up,
higher transaction volume — without tribal knowledge becoming a bottleneck.

Set up the following:

1. ARCHITECTURE DECISION RECORDS (ADR)
   - Set up an ADR system (a folder of short, numbered documents) that
     captures every significant technical decision going forward:
     - ADR 001: Row-level tenant isolation strategy (`tenant_id`)
     - ADR 002: Dual-language i18n implementation (JSONB dynamic content vs translation tables, `next-intl` / `react-i18next` for UI)
     - ADR 003: Double-entry accounting journal engine design compliant with Uzbekistan NAS
     - ADR 004: Multi-warehouse atomic transaction inventory posting
   - Define the template: context, decision, alternatives considered,
     consequences

2. SYSTEM DOCUMENTATION
   - Living architecture document: system diagram showing how modules relate,
     data ownership, tenant boundaries, and i18n translation pipelines
   - API documentation (OpenAPI/Swagger-style) for all endpoints, including
     `Accept-Language` header handling (`uz` or `ru`)
   - Data dictionary for the core schema, especially the accounting schema
     and bilingual JSONB entity models

3. ONBOARDING DOCUMENTATION & THREE-COLUMN GLOSSARY
   - New-engineer onboarding guide: local environment setup, tenant data
     isolation rules, document flow to journal entries, i18n translation rules
   - Comprehensive Domain Glossary translating between MoySklad inventory
     terms, 1C accounting terms, Uzbek domain terminology, Russian domain
     terminology, and actual code/table names:
     
     | Uzbek Term (uz) | Russian Term (ru) | Code / Database Name | Domain Context |
     | :--- | :--- | :--- | :--- |
     | Ombor | Склад | `warehouse` | Inventory |
     | Tovar / Mahsulot | Товар / Продукция | `product` | Inventory |
     | Qoldiq | Остаток | `stock_balance` | Inventory |
     | Kirim (Tushum) | Приход (Поступление) | `inbound_shipment` | Inventory |
     | Chiqim (Hujjat) | Расход (Списание) | `outbound_shipment` | Inventory |
     | Yuk xati | Товарная накладная | `waybill` | Sales & Inventory |
     | Hisob-faktura | Счет-фактура | `invoice` | Accounting & Tax |
     | Kontragent | Контрагент | `counterparty` | Sales & Purchasing |
     | Schyotlar rejasi | План счетов | `chart_of_accounts` | Accounting (NAS/BHMS) |
     | O'tkazma (Provodka) | Проводка | `journal_entry` | Accounting |
     | Bosh daftar | Главная книга | `general_ledger` | Accounting |
     | Aylanma-balans qaydnomasi | Оборотно-сальдовая ведомость | `trial_balance` | Accounting |
     | Kassa | Касса | `cash_desk` | Cash/Bank |
     | Shartnoma | Договор | `contract` | Sales & Legal |
     | To'lov cheki | Квитанция об оплате | `payment_receipt` | Billing & Sales |
     | Asosiy vositalar | Основные средства | `fixed_assets` | Accounting |

4. SCALING PLAYBOOK
   - Document current known limits of the system (approximate tenant count,
     transaction volume, database size)
   - Document the scaling path for each layer as load grows:
     database (read replicas, connection pooling, sharding), application
     layer (horizontal scaling), caching strategy (Redis caching for
     static UI translations and chart of accounts), background jobs
   - Document load-testing plan for high-volume transactions

5. CAPACITY PLANNING AND MONITORING
   - Key metrics to watch: database CPU/memory, query latency per module,
     API response time percentiles, job queue depth
   - Alert thresholds and escalation paths
   - Quarterly capacity review process

6. DISASTER RECOVERY AND OPERATIONAL RUNBOOKS
   - Backup and restore procedures with RPO and RTO metrics
   - Runbooks for database failure, bad accounting deployments, payment provider outages
   - Incident response process

Output: an actual documentation structure (folder layout and file templates)
plus the first real drafts of each document type listed above.
```
