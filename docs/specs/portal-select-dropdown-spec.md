# Spec: Universal Portal-Based Select Dropdown & Overflow Clipping Elimination

## Problem Statement

Select dropdown menus located inside tables, modal dialogs, or card containers with `overflow-x: auto` or `overflow: hidden` (such as the item rows in `PurchaseDocumentForm.tsx` and data grids across the dashboard) suffer from CSS clipping and stacking context collisions. When opened near the bottom of a table, the dropdown menu is partially clipped by the table scroll container or appears underneath subsequent elements (such as the `+ Qator qo‘shish` button), obscuring menu options and quick-action buttons.

## Solution

1. Refactor the universal `Select.tsx` component to render its floating menu popup into `document.body` via `React.createPortal`.
2. Implement precise floating positioning using trigger bounding client rects (`top`, `bottom`, `left`, `width`).
3. Add a real-time `scroll` and `resize` listener (with passive window and capture container listeners) to keep the floating portal menu perfectly locked to the trigger button during scrolling.
4. Implement Smart Flip logic:
   - When available viewport space below the trigger is insufficient (< 260px) and space above is greater, open upward (`bottom = window.innerHeight - rect.top + 4`).
   - Otherwise open downward (`top = rect.bottom + 4`).
5. Ensure complete isolation from all parent CSS `overflow: hidden`, `overflow-x: auto`, and `z-index` stacking contexts (`z-index: 99999`).
6. Retain all existing features: search filtering, pinned quick-action header (`+ Yangi tovar qo‘shish`), click-outside dismissal, and keyboard navigation.

---

## User Stories

1. As an operator editing line items in a purchase receipt, when I click the Product dropdown on the last row of the table, I want the full dropdown menu to display clearly over the table boundary and the `+ Qator qo‘shish` button without being clipped.
2. As an operator searching for items, I want the dropdown menu to stay pinned to the input when scrolling the table horizontally or the page vertically.
3. As an operator with a small screen or scrolled near the bottom of the viewport, I want the dropdown menu to smartly open upward so that all options remain visible without requiring extra scrolling.
4. As an operator using any Select dropdown across the platform (Purchases, Sales, Finance, Warehouses), I want a consistent, lag-free, non-clipped dropdown experience.

---

## Implementation Decisions

- **Portal Rendering in `Select.tsx` (`frontend/src/components/ui/Select.tsx`)**:
  - Mount dropdown via `createPortal` only on client-side (`typeof document !== 'undefined' && mounted`).
  - Calculate trigger position with `containerRef.current.getBoundingClientRect()`.
  - Position dropdown with `position: fixed`, `left: rect.left`, `width: Math.max(rect.width, 220)`, `zIndex: 99999`.
  - Update position on `window.addEventListener('scroll', updatePosition, true)` and `window.addEventListener('resize', updatePosition)`.
  - Close dropdown when clicking outside (checking if click target is outside both trigger container and portal dropdown element).

---

## Testing Decisions

- **Automated Frontend Compilation / Typecheck**:
  - Verify `npx tsc --noEmit` on `frontend` passes with 0 errors.
  - Verify all Select instances throughout the app function without props regression.
- **Manual Verification**:
  - Open `/purchases/new`, add 5 rows so the table is tall.
  - Open the product dropdown on row 5 -> verify menu floats above the `+ Qator qo‘shish` button and table border without clipping.
  - Scroll the page -> verify dropdown smoothly tracks the row trigger.

---

## Out of Scope

- Third-party heavy dropdown libraries (e.g. Floating UI / Popper.js) — keep lightweight vanilla React implementation for speed and bundle size.
