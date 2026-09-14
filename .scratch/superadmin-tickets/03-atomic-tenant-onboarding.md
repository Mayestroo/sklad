# 03 — Automated Atomic Tenant Onboarding & Lifecycle Management

**What to build:**
An automated customer onboarding pipeline accessible directly from the `/admin` console. Provisioning a tenant atomically creates the Company, Main Branch, Central Warehouse, primary Company Administrator, and Subscription in a single transaction, with real-time status management (Active, Trial, Suspended, Blocked).

**Blocked by:**
02 — Standalone Superadmin Console Layout & Smart Navigation (/admin)

**Status:** ready-for-agent

- [x] Backend endpoint `POST /api/super-admin/tenants` executing atomic provisioning transaction.
- [x] Conflict validation on company slug and administrator email.
- [x] Interactive onboarding modal in the `/admin` console.
- [x] Tenant status updating (`ACTIVE`, `TRIAL`, `SUSPENDED`, `BLOCKED`) and subscription plan upgrades.
