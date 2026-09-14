# 02 — Standalone Superadmin Console Layout & Smart Navigation (/admin)

**What to build:**
A dedicated, independent dark-slate SaaS owner console layout at `/[locale]/(superadmin)/admin` completely separated from customer enterprise operations. Remove superadmin links from customer sidebars and enforce smart role-based redirection on login (superadmin -> `/admin`, tenant staff -> `/`).

**Blocked by:**
01 — Decoupled Multi-Tenant Schema & Global SuperAdmin Guard

**Status:** ready-for-agent

- [x] Create standalone layout with dedicated sidebar, platform badge, and profile logout.
- [x] Remove `/super-admin` from customer enterprise `Sidebar.tsx`.
- [x] Automatically route `super_admin` users to `/[locale]/admin` upon logging in via `/login`.
- [x] Redirect legacy `/super-admin` route to `/admin`.
