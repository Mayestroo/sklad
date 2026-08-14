# Spec: Slide-Over Drawer Architecture & Entity Creation UX Standard

## Problem Statement

Currently, when users click `+ Yangi` (or `+ Qo'shish`) on catalog and transaction list pages, creation forms either render beneath the existing data table, stretch the page vertically, or open clunky modals that obstruct context. This creates poor UX, forces awkward vertical scrolling, and disrupts the operator's mental context when performing rapid data entry.

## Solution

Implement a modern, hybrid entity creation standard:
1. **Large Multi-Line Documents** (Purchase Receipts, Sales Invoices, Stocktakes) open as dedicated full-screen `/new` pages with extensive tables.
2. **Catalog & Rapid Transaction Forms** (Products, Suppliers, Customers, Expense Allocations, Cash Transactions) open via a sleek, right-anchored **Slide-Over Drawer** panel.
3. The Slide-Over Drawer maintains page context, blurs the background, features sticky action buttons, supports keyboard hotkeys (`Esc` to close, `Ctrl+Enter` to submit), and triggers instant optimistic/refetch updates without page reload.

---

## User Stories

1. As an inventory manager, I want to click `+ Yangi tovar` on the products page and have a sleek drawer slide in from the right, so that I can create a product without losing my view of the catalog table.
2. As a procurement clerk, I want to click `+ Yangi yetkazib beruvchi` on the suppliers page and fill out INN/contact details in a side drawer, so that the main table does not get displaced downwards.
3. As an operator filling out a purchase receipt, I want in-flight quick-add modals for products and suppliers to slide in cleanly from the right, so that I can add missing items without leaving the purchase document.
4. As an accountant on the finance page, I want cash income/expense/transfer forms to open in a dedicated slide-over drawer, so that I can record cash movements rapidly.
5. As a warehouse manager on the expenses page, I want the expense allocation form to appear in a slide-over panel, so that I can distribute landed costs cleanly.
6. As a power user, I want to press `Esc` to dismiss any open drawer and `Ctrl+Enter` / `Cmd+Enter` to submit the form immediately, so that I can perform rapid data entry without reaching for the mouse.
7. As a mobile/tablet user, I want the drawer to responsively adapt to full-screen width on narrow screens, so that form inputs remain legible and accessible.
8. As a user, I want the drawer to show a semi-transparent blurred backdrop (`backdrop-filter: blur(4px)`), so that I clearly perceive modal focus while retaining table context.
9. As a user submitting a drawer form, I want a sticky footer with `Saqlash` (Save) and `Bekor qilish` (Cancel) buttons that never scrolls out of view, so that I can save or cancel at any scroll depth.
10. As a user after successfully creating an entity in a drawer, I want the drawer to close smoothly and the underlying list to refresh instantly, so that I immediately see my newly created item.

---

## Implementation Decisions

- **Universal Component**: Build `frontend/src/components/ui/Drawer.tsx` providing:
  - Width variants (`sm`: 420px, `md`: 560px, `lg`: 720px, `xl`: 900px, `full`: 100%).
  - Smooth slide transition (`transform: translateX(0)` with ease-out curve).
  - Background overlay with `backdrop-filter: blur(4px)` and click-outside dismissal.
  - Sticky header (title, subtitle, icon, close button) and sticky footer (`Cancel`, `Submit` with loading spinner).
  - Keyboard listeners for `Escape` and `Ctrl+Enter` / `Cmd+Enter`.
  - Body scrolling isolation (`overflow-y: auto` inside drawer, body scroll lock).
- **Adoption Scope**:
  - **Counterparties Module**: `/counterparties` and `/purchases/suppliers` creation forms migrated to `CreateCounterpartyDrawer`.
  - **Products Module**: `/products` creation form migrated to `CreateProductDrawer`.
  - **Purchases Module**: In-flight quick add forms (`QuickAddSupplier`, `QuickAddProduct`) and `AllocateExpenseModal` upgraded to drawer standard.
  - **Finance Module**: Cash transaction form (`/finance`) upgraded to `CreateTransactionDrawer`.
- **Hybrid Routing Rule**: Complex multi-table documents (e.g. `/purchases/new`, `/sales/new`, `/inventory/documents/new`) remain full-page views with rich layouts and breadcrumbs.

---

## Testing Decisions

- **Component & Integration Testing**:
  - Verify `Drawer` renders with correct title, description, and accessibility attributes (`role="dialog"`, `aria-modal="true"`).
  - Verify backdrop click and `Escape` key trigger `onClose`.
  - Verify `Ctrl+Enter` triggers form submission.
  - Verify form validation errors display cleanly inside the scrollable drawer body without breaking sticky footer layout.
  - Verify successful creation triggers `onSuccess` callback, closes the drawer, and updates parent state.

---

## Out of Scope

- Multi-step wizard drawers (wizard steps will be addressed in separate workflow tickets).
- Drag-and-drop column resizing of drawers.
- Offline IndexedDB caching of drawer draft state.

---

## Further Notes

All Drawer components will adhere to the project's design tokens (`var(--color-bg-primary)`, `var(--radius-xl)`, `var(--shadow-2xl)`) and bilingual localization (`uz` / `ru`).
