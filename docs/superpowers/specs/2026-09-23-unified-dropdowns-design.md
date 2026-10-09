# Unified Dropdowns Design

**Status:** Design approved; implementation underway

**Date:** 2026-09-23

## Problem

The frontend currently mixes the shared custom `Select` component with 17 native
HTML `<select>` elements. Native menus differ from the custom dropdown shown in
the reference and can continue to appear in newly added screens, leaving the
interface inconsistent.

## Goal

Use the shared custom `Select` for every dropdown in the frontend, including
superadmin screens, and prevent new native `<select>` elements from being added
to frontend JSX.

## Design

### One shared dropdown

Migrate all 17 native dropdowns to `frontend/src/components/ui/Select.tsx`.
Keep that existing component as the single implementation and visual source of
truth; do not add a dropdown dependency or create a second select component.

The migration covers:

- Return form reason, product-add, and VAT selectors in
  `PurchaseReturnDocumentForm.tsx`.
- Return reason in `CreateReturnModal.tsx`.
- Return status filter in the purchases returns page.
- Tenant status/plan filters and create/edit fields in the superadmin admin
  page.
- Account, product, warehouse, counterparty, advance category, and other
  category selectors in the opening balances page.

Keep each control's current selected value, change handler, option values and
labels, placeholder text, disabled/read-only state, and layout sizing. Map
native option collections to `SelectOption[]`. For the VAT selector, convert
the numeric rate to a string for `Select.value` and parse the selected value
back to a number. The product-add selector remains unselected after an item is
added. Large collections retain the shared component's automatic search.

### Keyboard interaction

Extend the shared `Select` keyboard behavior so replacing native controls does
not remove basic keyboard selection. Arrow Down, Enter, or Space opens the menu;
the active option starts at the selected item, or the first filtered item if
there is no selected item. Arrow Up/Down moves the active option without wrapping
past either end; Enter selects it; Escape closes the menu and returns focus to
the trigger. Handle navigation while focus is on the trigger or the auto-focused
search field. Keep current click selection, outside-click dismissal, portal
positioning, and search behavior.

### Guard against native dropdowns

Add an ESLint restriction in `frontend/eslint.config.mjs` that reports JSX
`<select>` elements in frontend source. Future dropdowns must use the shared
`Select` component. This rule applies to app and component JSX, including
superadmin screens.

## Non-goals

- Replacing or restyling dropdowns already implemented with the shared `Select`.
- Changing business rules, option values, or which options are available.
- Adding a third-party dropdown library.
- Changing native input, checkbox, or radio controls.

## Verification

- Run `npm run lint` from `frontend` and confirm the JSX restriction itself
  passes while no native `<select>` remains in source.
- Run `npx tsc --noEmit` from `frontend`.
- Run the frontend test script if relevant files or existing checks require it.
- Manually verify representative standard, searchable, table-cell, and
  superadmin dropdowns, including keyboard open/navigation/selection/Escape,
  read-only behavior, and the product-add reset behavior.
