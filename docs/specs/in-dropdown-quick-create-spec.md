# Spec: In-Dropdown Quick Creation & Warehouse Slide-Over Drawer Standard

## Problem Statement

When operators fill out procurement documents or operational forms, encountering a missing entity (a new supplier, a new warehouse, or an unlisted product) currently forces them to either look for separate small action buttons elsewhere on the screen or navigate away from their active document. Additionally, warehouses cannot currently be created on-the-fly during purchase receipt creation. This slows down document workflows and creates friction during rapid data entry.

## Solution

1. Enhance the universal `Select` component with a **Pinned Top Action Bar** (`onCreateNew` / `createNewLabel`), ensuring a prominent `+ Yangi ...` button is always visible at the very top of the dropdown menu across all searches.
2. Build a dedicated `CreateWarehouseDrawer` enabling operators to create new warehouses (bilingual name, branch, address, phone) on-the-fly without leaving their current document.
3. Wire the In-Dropdown creation action for:
   - **Suppliers / Counterparties**: Opens `CreateCounterpartyDrawer` and auto-selects upon save.
   - **Warehouses**: Opens `CreateWarehouseDrawer` and auto-selects upon save.
   - **Products (in document tables)**: Opens `CreateProductDrawer` with pre-filled search query, and upon save, automatically fills the active row's product ID, unit of measure, and purchase price.

---

## User Stories

1. As a procurement clerk filling out a purchase receipt, I want to click the supplier dropdown and see a pinned `+ Yangi yetkazib beruvchi` button at the top, so that I can register a new vendor immediately without closing the dropdown.
2. As a procurement clerk, I want to click the warehouse dropdown and see a pinned `+ Yangi ombor` button, so that I can create a new warehouse location directly from the purchase receipt form.
3. As an operator entering line items in the purchase document, I want to search for a product in the row's dropdown and see a pinned `+ Yangi tovar` button with my search query pre-filled, so that I can create missing items on the fly.
4. As an operator after creating a product from an item row dropdown, I want that exact table row to automatically populate with the new product, its cost price, and its unit of measure, so that I do not have to re-select it manually.
5. As an operator after creating a supplier or warehouse from a header dropdown, I want the active dropdown to automatically select the newly created entity, so that I can proceed with document entry seamlessly.
6. As a user typing in the dropdown search box, I want the pinned `+ Yangi ...` action to stay fixed at the top of the menu, so that it remains accessible regardless of search filtering results.
7. As a mobile or desktop user, I want the `CreateWarehouseDrawer` to open smoothly from the right, isolate body scrolling, and support `Esc` to close and `Ctrl+Enter` to submit.

---

## Implementation Decisions

- **Select Component Extension**:
  - Add `onCreateNew?: (searchQuery?: string) => void;` and `createNewLabel?: string;` to `CustomSelectProps` in `frontend/src/components/ui/Select.tsx`.
  - When `onCreateNew` is provided, render a pinned top action button with `Plus` icon, high-contrast primary tint, and hover animation above the scrollable options list.
- **Warehouse Creation Drawer**:
  - Create `frontend/src/components/warehouses/CreateWarehouseDrawer.tsx` utilizing the `Drawer` component.
  - Fields: Bilingual name (`name.uz`, `name.ru`), optional `branchId` select, `address`, `phone`.
  - Calls `POST /tenants/warehouses` and invokes `onSuccess(createdWarehouse)`.
- **Purchase Document Form Integration**:
  - In `PurchaseDocumentForm.tsx`, bind `onCreateNew` on the Supplier Select to open `CreateCounterpartyDrawer`.
  - Bind `onCreateNew` on the Warehouse Select to open `CreateWarehouseDrawer`.
  - Bind `onCreateNew` on each item row's Product Select to open `CreateProductDrawer` (passing the current row index and search query to auto-fill the target row upon creation).
- **Backend API Consistency**:
  - Verify `POST /tenants/warehouses` validates tenant isolation and permission guards.

---

## Testing Decisions

- **Automated Frontend / Unit Testing**:
  - Verify `Select` renders the pinned `+ Yangi ...` action bar when `onCreateNew` is supplied.
  - Verify clicking the action bar triggers `onCreateNew` and closes the dropdown menu.
  - Verify `CreateWarehouseDrawer` validates required bilingual names and handles submission errors cleanly.
  - Verify `PurchaseDocumentForm` correctly auto-populates the targeted row when a product is created from inside the line items table.
- **Manual Verification**:
  - Open `/purchases/new`, click Supplier dropdown -> click `+ Yangi yetkazib beruvchi` -> verify drawer opens and newly created supplier is selected.
  - Click Warehouse dropdown -> click `+ Yangi ombor` -> verify drawer opens and newly created warehouse is selected.
  - Click table row Product dropdown -> click `+ Yangi tovar` -> verify drawer opens with query and row is auto-filled upon save.

---

## Out of Scope

- Merging duplicate warehouses or multi-warehouse batch creation in a single step.
- Real-time live chat inside the creation drawer.

---

## Further Notes

All UI elements will respect the project's design tokens and localization (`uz` / `ru`).
