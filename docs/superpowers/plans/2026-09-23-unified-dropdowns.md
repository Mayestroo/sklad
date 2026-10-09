# Unified Dropdowns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all 17 frontend native dropdowns with the shared custom `Select` and prevent future JSX native selects from being added.

**Architecture:** Keep `frontend/src/components/ui/Select.tsx` as the only dropdown implementation. Add testable pure keyboard-index helpers and wire those into `Select`, migrate every native select while preserving its current state and options, then enable an ESLint restriction after the migration is complete.

**Tech Stack:** Next.js 16.3.0, React 19.2.8, TypeScript 5, ESLint 9 flat config, Node's built-in test runner.

## Global Constraints

- Use the existing shared `Select` component as the single implementation and visual source of truth; do not add a dropdown dependency or create a second select component.
- Keep each control's current selected value, change handler, option values and labels, placeholder text, disabled/read-only state, and layout sizing.
- Where a current native selector has an empty-valued option for clearing its selection, retain it as an empty-valued `SelectOption`; use only a placeholder for the non-selectable product-add prompt.
- For the VAT selector, convert the numeric rate to a string for `Select.value` and parse the selected value back to a number.
- The product-add selector remains unselected after an item is added.
- Large collections retain the shared component's automatic search.
- Arrow Down, Enter, or Space opens the menu; the active option starts at the selected item, or the first filtered item if there is no selected item. Arrow Up/Down moves the active option without wrapping past either end; Enter selects it; Escape closes the menu and returns focus to the trigger.
- Keep current click selection, outside-click dismissal, portal positioning, and search behavior.
- Future dropdowns must use the shared `Select` component; ESLint must report JSX `<select>` elements in frontend source.
- Do not change business rules, option values, or which options are available. Do not change native input, checkbox, or radio controls.

## File Map

- `frontend/src/components/ui/select-keyboard.ts` — pure keyboard index helpers used by the dropdown and covered by Node tests.
- `frontend/src/components/ui/select-keyboard.spec.ts` — tests for initial active-item choice and bounded arrow navigation.
- `frontend/src/components/ui/Select.tsx` — track the active option and support keyboard navigation from the trigger and searchable menu.
- `frontend/src/components/purchases/PurchaseReturnDocumentForm.tsx` — migrate reason, add-product, and VAT selectors.
- `frontend/src/components/purchases/CreateReturnModal.tsx` — migrate the return-reason selector.
- `frontend/src/app/[locale]/(dashboard)/purchases/returns/page.tsx` — migrate the status filter.
- `frontend/src/app/[locale]/(superadmin)/admin/page.tsx` — migrate tenant status/plan filters and create/edit fields.
- `frontend/src/app/[locale]/(dashboard)/opening-balances/page.tsx` — migrate account, product, warehouse, counterparty, advance category, and other category selectors.
- `frontend/eslint.config.mjs` — reject native JSX `<select>` elements after all migrations are complete.
- `frontend/package.json` — include the new keyboard helper spec in the existing test script.

---

### Task 1: Add tested keyboard-index helpers

**Files:**
- Create: `frontend/src/components/ui/select-keyboard.spec.ts`
- Create: `frontend/src/components/ui/select-keyboard.ts`
- Modify: `frontend/package.json`

**Interfaces:**
- Produces `getInitialActiveOptionIndex(selectedIndex: number, optionCount: number): number`.
- Produces `getNextActiveOptionIndex(currentIndex: number, direction: -1 | 1, optionCount: number): number`.
- Empty option lists return `-1`; the initial index uses a valid selected index or falls back to zero; navigation clamps at both ends.

- [ ] **Step 1: Write the failing helper tests**

Create `select-keyboard.spec.ts` with these cases:

```ts
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  getInitialActiveOptionIndex,
  getNextActiveOptionIndex,
} from './select-keyboard.ts';

describe('select keyboard navigation', () => {
  test('starts on a valid selected item', () => {
    assert.equal(getInitialActiveOptionIndex(2, 4), 2);
  });

  test('falls back to the first item when there is no valid selection', () => {
    assert.equal(getInitialActiveOptionIndex(-1, 3), 0);
    assert.equal(getInitialActiveOptionIndex(5, 3), 0);
  });

  test('returns -1 when there are no options', () => {
    assert.equal(getInitialActiveOptionIndex(-1, 0), -1);
    assert.equal(getNextActiveOptionIndex(0, 1, 0), -1);
  });

  test('moves one item and clamps at either end', () => {
    assert.equal(getNextActiveOptionIndex(1, 1, 4), 2);
    assert.equal(getNextActiveOptionIndex(0, -1, 4), 0);
    assert.equal(getNextActiveOptionIndex(3, 1, 4), 3);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails because the helper module does not exist**

Run from `frontend`:

```bash
node --test --experimental-strip-types src/components/ui/select-keyboard.spec.ts
```

Expected: FAIL with an unresolved `./select-keyboard.ts` import.

- [ ] **Step 3: Implement the two pure helpers**

Create `select-keyboard.ts`:

```ts
export function getInitialActiveOptionIndex(selectedIndex: number, optionCount: number): number {
  if (optionCount === 0) return -1;
  return selectedIndex >= 0 && selectedIndex < optionCount ? selectedIndex : 0;
}

export function getNextActiveOptionIndex(
  currentIndex: number,
  direction: -1 | 1,
  optionCount: number,
): number {
  if (optionCount === 0) return -1;
  return Math.max(0, Math.min(currentIndex + direction, optionCount - 1));
}
```

- [ ] **Step 4: Run the focused test and confirm all cases pass**

Run from `frontend`:

```bash
node --test --experimental-strip-types src/components/ui/select-keyboard.spec.ts
```

Expected: 4 passing subtests.

- [ ] **Step 5: Add the helper test to the frontend test script and run it**

Set `frontend/package.json`'s `test` script to:

```json
"test": "node --test --experimental-strip-types src/lib/utils.spec.ts src/components/ui/select-keyboard.spec.ts"
```

Run from `frontend`:

```bash
npm test
```

Expected: existing utility tests and all keyboard helper tests pass.

### Task 2: Wire keyboard navigation into the shared Select

**Files:**
- Modify: `frontend/src/components/ui/Select.tsx`
- Consume: `getInitialActiveOptionIndex` and `getNextActiveOptionIndex` from `./select-keyboard.ts`.

**Interfaces:**
- The selected option and filtered option array remain the existing sources of truth.
- The helper functions from Task 1 calculate active-option indexes; `Select` continues to call its existing `onChange(value: string)` when an option is selected.

- [ ] **Step 1: Initialize and refresh the active index**

Add an active-index state initialized to `-1`. After calculating `filteredOptions`, derive `const selectedIndex = filteredOptions.findIndex((option) => option.value === value)` in render scope. Whenever the menu opens or `filteredOptions` changes, call `getInitialActiveOptionIndex(selectedIndex, filteredOptions.length)`. This ensures search results with no selected option start at their first item and an empty search result remains at `-1`; the same render-scoped `selectedIndex` is available to the open-key handler.

- [ ] **Step 2: Add one shared keyboard handler for the trigger and portal menu**

The handler must implement the approved keys without changing mouse behavior:

```tsx
if (event.key === 'Escape') {
  event.preventDefault();
  setIsOpen(false);
  containerRef.current?.querySelector<HTMLButtonElement>('[role="combobox"]')?.focus();
} else if (
  !isOpen &&
  (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')
) {
  event.preventDefault();
  setActiveIndex(getInitialActiveOptionIndex(selectedIndex, filteredOptions.length));
  setIsOpen(true);
} else if (isOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
  event.preventDefault();
  setActiveIndex((index) =>
    getNextActiveOptionIndex(index, event.key === 'ArrowDown' ? 1 : -1, filteredOptions.length),
  );
} else if (isOpen && event.key === 'Enter' && activeIndex >= 0) {
  event.preventDefault();
  onChange(filteredOptions[activeIndex].value);
  setIsOpen(false);
  containerRef.current?.querySelector<HTMLButtonElement>('[role="combobox"]')?.focus();
}
```

Attach it to the trigger and portal menu root so it receives keys when focus is in the auto-focused search field. Replace the trigger's current opening-only handler with this shared handler so Enter opens a closed dropdown and selects the active option in an open dropdown. Space opens from the trigger; in the search field it remains normal text input. Give the active option a visible active treatment distinct from the selected-value checkmark. Escape returns focus to the trigger.

- [ ] **Step 3: Run the keyboard helper tests and targeted lint/type checks**

Run from `frontend`:

```bash
npm test
npx eslint src/components/ui/Select.tsx src/components/ui/select-keyboard.ts
npx tsc --noEmit
```

Expected: all commands pass. Manually open a short and searchable dropdown; verify arrows clamp at first/last item, Enter selects the active item, search still filters, and Escape closes and returns focus.

### Task 3: Migrate purchase-return dropdowns and status filter

**Files:**
- Modify: `frontend/src/components/purchases/PurchaseReturnDocumentForm.tsx`
- Modify: `frontend/src/components/purchases/CreateReturnModal.tsx`
- Modify: `frontend/src/app/[locale]/(dashboard)/purchases/returns/page.tsx`

**Interfaces:**
- Use `Select` and `SelectOption` from `@/components/ui/Select` where needed.
- Keep existing state setters and `handleAddItem` behavior; pass each option's existing string value to `onChange`.

- [ ] **Step 1: Replace the return-reason controls**

In both return forms, keep the blank entry as an actual empty-valued option so an operator can clear a previously selected reason. Map `REASON_PRESETS` to `{ value: item, label: item }`; preserve each form's exact existing localized blank-option label, the `reason`/`setReason` state, and the current external field label.

```tsx
<Select
  value={reason}
  onChange={setReason}
  options={[
    { value: '', label: isRu ? '— Выберите причину —' : '— Sababni tanlang —' },
    ...REASON_PRESETS.map((item) => ({ value: item, label: item })),
  ]}
/>
```

Use the double-dash blank label already present in `CreateReturnModal.tsx` rather than the em-dash variant shown for `PurchaseReturnDocumentForm.tsx`.

- [ ] **Step 2: Replace product-add and VAT controls**

Map products to their existing ID and rendered label; use `value=""` and the current add-item prompt as the `placeholder` prop. Keep `handleAddItem` as the change handler so selection remains blank after the item is added; the prompt is not a selectable action. Replace VAT options with string values and convert the selected rate back to a number:

```tsx
<Select
  value={String(row.vatRate)}
  options={[{ value: '0', label: '0%' }, { value: '12', label: '12%' }]}
  onChange={(value) => handleUpdateItem(idx, 'vatRate', Number(value))}
  size="md"
/>
```

Keep the return form's `isReadOnly` disabled state and existing table/form dimensions.

- [ ] **Step 3: Replace the returns-page status filter**

Map `ALL`, `DRAFT`, `POSTED`, and `CANCELLED` to their current localized labels. Keep `statusFilter`/`setStatusFilter` and the 160px layout using the `Select` wrapper's `style` prop:

```tsx
<Select
  value={statusFilter}
  onChange={setStatusFilter}
  style={{ width: 160 }}
  options={[
    { value: 'ALL', label: isRu ? 'Все статусы' : 'Barcha statuslar' },
    { value: 'DRAFT', label: isRu ? 'Черновик' : 'Qoralama' },
    { value: 'POSTED', label: isRu ? 'Проведено' : 'Tasdiqlangan' },
    { value: 'CANCELLED', label: isRu ? 'Отменено' : 'Bekor qilingan' },
  ]}
/>
```

- [ ] **Step 4: Run targeted lint and TypeScript checks**

Run from `frontend`:

```bash
npx eslint src/components/purchases/PurchaseReturnDocumentForm.tsx src/components/purchases/CreateReturnModal.tsx 'src/app/[locale]/(dashboard)/purchases/returns/page.tsx'
npx tsc --noEmit
```

Expected: both commands pass. Manually verify localized reason values, product addition/reset, numeric VAT updates, and return status filtering.

### Task 4: Migrate superadmin dropdowns

**Files:**
- Modify: `frontend/src/app/[locale]/(superadmin)/admin/page.tsx`

**Interfaces:**
- Consume the shared `Select` component.
- Preserve existing string state and typed company-plan/status state; keep the current `as any` state conversions only if TypeScript requires them after using `Select.value`.

- [ ] **Step 1: Import Select and replace both filters**

Add `import { Select } from '@/components/ui/Select';`. Map the current status and plan filter values and labels into `options`; keep `statusFilter`/`setStatusFilter` and `planFilter`/`setPlanFilter`. Preserve compact filter layout by setting `style={{ width: 'max-content' }}` on both filter wrappers and retaining the adjacent labels.

For example, the status filter keeps each current value/translation and passes the selected string directly to state:

```tsx
<Select
  value={statusFilter}
  onChange={setStatusFilter}
  style={{ width: 'max-content' }}
  options={[
    { value: 'ALL', label: isRu ? 'Все статусы' : 'Barcha statuslar' },
    { value: 'ACTIVE', label: isRu ? 'Активные' : 'Faol' },
    { value: 'TRIAL', label: isRu ? 'Пробный (Trial)' : 'Sinov (Trial)' },
    { value: 'SUSPENDED', label: isRu ? 'Приостановленные' : 'To‘xtatilgan' },
    { value: 'BLOCKED', label: isRu ? 'Заблокированные' : 'Bloklangan' },
  ]}
/>
```

- [ ] **Step 2: Replace create/edit plan and edit-status controls**

Use the existing STARTER, PROFESSIONAL, ENTERPRISE, ACTIVE, TRIAL, SUSPENDED, and BLOCKED values and their existing localized labels. Keep `companyPlan`, `editPlan`, and `editStatus` controlled and leave the form labels and submit handlers intact.

Each modal control uses `style={{ width: '100%' }}` to match `inputStyle` and follows the same controlled shape; for example, the create-plan dropdown maps the three existing plans and updates the existing state:

```tsx
<Select
  value={companyPlan}
  onChange={(value) => setCompanyPlan(value as typeof companyPlan)}
  style={{ width: '100%' }}
  options={[
    { value: 'STARTER', label: 'STARTER (490 000 soʻm/oy)' },
    { value: 'PROFESSIONAL', label: 'PROFESSIONAL (990 000 soʻm/oy)' },
    { value: 'ENTERPRISE', label: 'ENTERPRISE (1 990 000 soʻm/oy)' },
  ]}
/>
```

- [ ] **Step 3: Run targeted lint and TypeScript checks**

Run from `frontend`:

```bash
npx eslint 'src/app/[locale]/(superadmin)/admin/page.tsx'
npx tsc --noEmit
```

Expected: both commands pass. Manually verify filters, create modal, and edit modal selection in both supported locales.

### Task 5: Migrate opening-balance table dropdowns

**Files:**
- Modify: `frontend/src/app/[locale]/(dashboard)/opening-balances/page.tsx`

**Interfaces:**
- Reuse the existing `Select` / `SelectOption` imports in this file.
- Keep `onUpdate(index, field, value)` behavior and all account-dependent updates.

- [ ] **Step 1: Replace cash/bank account selector**

Map each account to an option with its ID and existing name/currency label. Keep the empty-valued option in the options array so the account can be cleared, preserve its current localized label and `isReadOnly`, and preserve the account-dependent currency/category updates. The value handler continues to receive strings:

```tsx
<Select
  value={line.accountId || ''}
  disabled={isReadOnly}
  onChange={(value) => {
    const account = accounts.find((item: any) => item.id === value);
    onUpdate(index, 'accountId', value);
    if (account) {
      onUpdate(index, 'currency', account.currency || 'USD');
      onUpdate(index, 'category', account.accountType === 'BANK' ? 'BANK' : 'CASH');
    }
  }}
  style={{ width: '100%', maxWidth: 300 }}
  options={[
    { value: '', label: isRu ? 'Выберите кассу/банк' : 'Kassa yoki bankni tanlang' },
    ...accounts.map((account: any) => ({
      value: account.id,
      label: `${getAccountName(account)} (${account.currency})`,
    })),
  ]}
/>
```

- [ ] **Step 2: Replace inventory product and warehouse selectors**

Map product IDs and existing SKU/name labels, and warehouse IDs and localized names. Keep each current empty option as `{ value: '', label: currentLocalizedPlaceholder }` so it remains possible to clear a row. Preserve disabled state, full-cell width, and existing `onUpdate(index, 'productId'|'warehouseId', value)` calls. For the product list, use the existing label shape:

```tsx
options={[
  { value: '', label: isRu ? 'Выберите товар' : 'Tovarni tanlang' },
  ...products.map((product: any) => ({
    value: product.id,
    label: `${product.sku ? `[${product.sku}] ` : ''}${getProductName(product)}`,
  })),
]}
```

- [ ] **Step 3: Replace counterparty and advance selectors**

Map counterparties to the current name/STIR label and preserve the empty-valued placeholder option in both the customer/supplier and advance tables. Map the two existing advance categories and localized labels. Preserve `isReadOnly` and use each row's existing category/counterparty update handler.

- [ ] **Step 4: Replace the other/equity category selector**

Map `EQUITY`, `OTHER_ASSET`, and `OTHER_LIABILITY` to the current localized labels. Preserve the category state and disabled/read-only behavior.

- [ ] **Step 5: Run targeted lint and TypeScript checks**

Run from `frontend`:

```bash
npx eslint 'src/app/[locale]/(dashboard)/opening-balances/page.tsx'
npx tsc --noEmit
```

Expected: both commands pass. Manually verify all seven migrated dropdown instances across opening-balance cash, inventory, customer/supplier, advances, and other/equity sections, including table-cell sizing, searchable long lists, clearable empty values, and read-only rows.

### Task 6: Enforce the shared dropdown and run final checks

**Files:**
- Modify: `frontend/eslint.config.mjs`
- Verify: all files listed above.

**Interfaces:**
- ESLint rejects JSX `select` opening elements in frontend source with a message directing developers to `@/components/ui/Select`.

- [ ] **Step 1: Add the JSX restriction**

Append this flat-config override for `src/**/*.{ts,tsx}`:

```js
{
  files: ['src/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: "JSXOpeningElement[name.name='select']",
        message: 'Use the shared Select component from @/components/ui/Select instead of a native <select>.',
      },
    ],
  },
}
```

Confirm the rule catches a future JSX native selector without creating a source file:

```bash
node -e "process.stdout.write('const Probe = () => <select />;')" | npx eslint --stdin --stdin-filename src/__select-rule-probe__.tsx
```

Expected: ESLint exits with a violation on the JSX opening element and prints the shared-`Select` guidance.

- [ ] **Step 2: Run full frontend checks**

Run from `frontend`:

```bash
npm run lint
npx tsc --noEmit
npm test
```

Expected: all three commands pass.

- [ ] **Step 3: Verify source has no native JSX selects**

Use the repository content search on `frontend/src` for `<select\b`; expected: zero matches. Run ESLint on the full frontend source; expected: the new restriction reports no violations.

- [ ] **Step 4: Perform the acceptance walkthrough**

Verify purchase return reason/product/VAT selectors, returns status filter, superadmin status/plan filters and forms, and opening-balance account/product/warehouse/counterparty/category selectors. In each representative view, confirm the shared trigger/menu styling, click selection, keyboard navigation and Escape, disabled/read-only state, and search on large lists. Confirm the add-product selection resets after adding a row.

## Self-Review

- **Spec coverage:** Shared visual source and all 17 selectors are covered by Tasks 2–5; keyboard behavior by Tasks 1–2; future-native-select guard by Task 6; automated and manual verification by every task and final acceptance walkthrough.
- **Placeholder scan:** No TODO/TBD or unspecified implementation steps remain.
- **Type consistency:** Helper signatures are defined in Task 1 and consumed with the same names and types in Task 2. All migrated values remain strings except the VAT callback, which explicitly parses back to a number.
