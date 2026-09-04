## Parent
Part of #83

## What to build
Allow business owners and administrators to configure Sales Settings under Settings -> Sales Settings (`/settings/sales`).
Add a toggle `enableMultiTierPriceLists` (Ko'p darajali narxlar va chegirma jadvallaridan foydalanish).
- When disabled (Simple Mode), the sidebar menu item `/sales/prices` is hidden, and sales documents strictly use `Product.salePrice`.
- When enabled (Tiered Mode), `/sales/prices` appears in the sidebar, and multi-tier pricing is activated.
Store configuration in `Company.settings Json?` on the backend with `GET /api/v1/tenants/settings` and `PATCH /api/v1/tenants/settings` guarded by `settings:edit` permissions.

## Acceptance criteria
- [ ] `Company.settings Json? @default("{}")` exists in Prisma schema
- [ ] `GET /api/v1/tenants/settings` returns company settings
- [ ] `PATCH /api/v1/tenants/settings` updates sales settings with validation and emits audit log
- [ ] Frontend page `/settings/sales` renders the toggle with instant save
- [ ] `Sidebar.tsx` hides `/sales/prices` when toggle is false/undefined, displays when true

## Blocked by
- None — can start immediately.
