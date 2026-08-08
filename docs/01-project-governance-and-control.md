# PROMPT 1: Project Governance & Quality Control System

**Purpose:** Once the SaaS platform (inventory + sales + accounting, native, no external integration, bilingual UZ/RU) is being built, this prompt sets up the control layer that keeps the codebase, releases, and team output reliable as the product grows.

```
I am running a multi-tenant SaaS platform that merges warehouse/sales
management (MoySklad-style) and full double-entry accounting (1C-style)
into one native system, sold to companies in Uzbekistan with native 
bilingual support (Uzbek - uz-UZ and Russian - ru-RU). The build
phase is underway across multiple modules (auth, inventory, sales/CRM,
accounting, analytics, billing, admin panel, design system). I now
need a governance and quality-control layer that keeps this codebase
trustworthy as more modules, more contributors, and more tenants are
added over time.

Set up the following, treating this as ongoing infrastructure rather
than a one-time task:

1. CODE REVIEW STANDARDS
   - Define a pull-request template: what must be described (what
     changed, why, which module, which tenant-facing behavior is
     affected, rollback plan)
   - Define mandatory review checklist items specific to this domain:
     - Any change touching the accounting journal engine requires a
       second reviewer with accounting-logic context, since a broken
       double-entry rule corrupts financial data silently
     - Any change to tenant-data queries must be checked for tenant
       isolation (no query should ever be able to return another
       tenant's rows)
     - Any new user-facing string or UI component MUST include both
       Uzbek (`uz.json`) and Russian (`ru.json`) localization keys.
       Hardcoded text strings in UI or API responses are strictly forbidden.
     - Any change touching printable financial document templates
       (invoices, waybills, receipts) must be tested for clean layout
       rendering in both Uzbek and Russian outputs.
     - Any new database migration must include a rollback migration

2. TESTING STRATEGY AND QUALITY GATES
   - Define the testing pyramid for this specific system:
     - Unit tests: accounting journal engine (balance must always validate
       to zero), i18n translation key completeness validation (asserting no
       missing keys in `uz` or `ru` files)
     - Integration tests: cross-module flows (a sale must correctly
       generate the matching journal entry and reduce warehouse stock in
       the same transaction)
     - End-to-end tests: critical user journeys (create invoice → receive
       payment → see it reflected in reports) in both Uzbek and Russian UI modes
   - Set minimum coverage thresholds per module, with the accounting,
     billing, and core i18n engine held to a stricter threshold than UI
   - Define what blocks a release: failing tests, coverage regression,
     missing translation keys, unresolved critical-severity bugs

3. CI/CD PIPELINE STRUCTURE
   - Design the pipeline stages: lint (including i18n key audit) → unit tests →
     build → integration tests → staging deploy → smoke tests → production deploy
   - Define how database migrations are safely applied in a multi-tenant
     environment (zero-downtime migration strategy, since tenants are
     actively using the system during deploys)
   - Define a feature-flag system so new modules can be shipped to a subset
     of tenants first before full rollout

4. TECHNICAL DEBT AND ISSUE TRACKING
   - Define a lightweight system for logging technical debt as it's
     discovered (not just bugs), including untranslated legacy strings
   - Define bug severity levels specific to this domain: a bug that
     miscalculates a financial balance or renders corrupted currency/locale
     data in financial documents is always critical severity

5. RELEASE AND CHANGE MANAGEMENT
   - Define a versioning and changelog process
   - Define how breaking changes to tenant-facing behavior are
     communicated in advance (in-app notice and email in both Uzbek and Russian)
   - Define a rollback procedure if a release causes data issues in
     the accounting module specifically

6. ENGINEERING HEALTH METRICS
   - Define what to track over time: deployment frequency, change
     failure rate, mean time to recovery, test coverage trend, i18n translation
     completeness (100% required), and open technical debt count
   - Define a simple recurring report format (weekly or biweekly) that
     surfaces these numbers so drift gets caught early

Output: a concrete, adoptable set of templates, checklists, pipeline
configuration outline, and a written policy document the team can
actually follow — not abstract principles.
```
