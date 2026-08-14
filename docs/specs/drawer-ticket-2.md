# Ticket 2: Counterparties & Suppliers Creation Drawer Migration

## Parent

Part of #19

## What to build

Migrate the `+ Yangi kontragent` / `+ Yangi yetkazib beruvchi` creation flows on `/counterparties` and `/purchases/suppliers` to the new Slide-Over Drawer standard, removing inline table-expansion forms and updating table state immediately upon creation.

## Acceptance criteria

- [ ] Replaces inline forms and modal dialogs with a right-sliding `CreateCounterpartyDrawer`.
- [ ] Fields for type (`CUSTOMER`, `SUPPLIER`, `BOTH`), name, INN/STIR, phone, email, address, bank details, and folder assignment.
- [ ] Validates required fields and displays inline errors.
- [ ] Optimistically or asynchronously refetches counterparties upon successful submission and displays a toast.
- [ ] Fully functional on both `/counterparties` and `/purchases/suppliers` pages.

## Blocked by

- #20 (Drawer UI: Core Slide-Over Drawer Component & Accessibility Framework)
