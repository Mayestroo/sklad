# Ticket 2: Warehouses UI: CreateWarehouseDrawer Component & API Integration

## Parent

Part of #25

## What to build

Build `frontend/src/components/warehouses/CreateWarehouseDrawer.tsx` utilizing the `Drawer` component to allow creating warehouses with bilingual name, branch selector, address, and phone details via `POST /tenants/warehouses`.

## Acceptance criteria

- [ ] Drawer form with fields for bilingual name (`name.uz`, `name.ru`), branch selector, address, and phone.
- [ ] Validates required fields and displays inline error alerts.
- [ ] Submits payload to `POST /tenants/warehouses` using `apiFetch`.
- [ ] Supports `Esc` to close and `Ctrl+Enter` to save.
- [ ] Invokes `onSuccess(createdWarehouse)` callback upon successful creation.

## Blocked by

- None — can start immediately.
