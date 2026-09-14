# 01 — Decoupled Multi-Tenant Schema & Global SuperAdmin Guard

**What to build:**
Decouple user records from mandatory tenant assignment so that platform-level Superadmin accounts can exist globally (`tenantId: null`). Protect platform-wide superadmin endpoints with a dedicated `SuperAdminGuard` that enforces the `super_admin` role without requiring tenant context.

**Blocked by:**
None — can start immediately.

**Status:** ready-for-agent

- [x] Make `User.tenantId` and `company` relation optional in Prisma schema.
- [x] Handle optional `tenantId` and null `company` gracefully in JWT strategy and authentication service.
- [x] Implement `SuperAdminGuard` allowing access strictly to users with `super_admin` role.
- [x] Protect `SuperAdminController` with `JwtAuthGuard` and `SuperAdminGuard`.
