# 04 — Safe Impersonation Engine with Visual Warning Banner

**What to build:**
Enable platform operators to enter a tenant's workspace for technical support with a temporary scoped token, displaying a persistent top warning banner across the customer workspace with a one-click return to `/admin`, and recording every session in the immutable audit log.

**Blocked by:**
03 — Automated Atomic Tenant Onboarding & Lifecycle Management

**Status:** ready-for-agent

- [x] Backend endpoint `POST /api/super-admin/impersonate/:tenantId` generating scoped token with `isImpersonated: true`.
- [x] Audit log entry with action `LOGIN` and `newValue: { impersonated: true }`.
- [x] Sticky `ImpersonationBanner.tsx` across the customer workspace showing company context and exit button.
- [x] Session preservation in `AuthContext.tsx` restoring original superadmin credentials upon exit.
