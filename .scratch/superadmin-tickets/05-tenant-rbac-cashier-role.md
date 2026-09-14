# 05 — Tenant RBAC Refinement & Dedicated Cashier (Kassir) Role

**What to build:**
Introduce a dedicated `cashier` (Kassir) system role for POS sales, receipt printing, and payment collection, and permanently exclude `super_admin` from customer staff creation and management interfaces (`/users`).

**Blocked by:**
01 — Decoupled Multi-Tenant Schema & Global SuperAdmin Guard

**Status:** ready-for-agent

- [x] Seed system role `cashier` with POS sales and finance receipt permissions in `seed.ts` and `seed-helper.ts`.
- [x] Add `cashier` option to role select dropdown and badge variant in `users/page.tsx`.
- [x] Exclude `super_admin` from customer staff creation modals.
