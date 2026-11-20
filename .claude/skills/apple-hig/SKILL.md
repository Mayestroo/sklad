---
name: apple-hig
description: Apple Human Interface Guidelines principles applied to the Sklad web ERP (Next.js, uz/ru, light/dark). Load before designing, reviewing or changing any UI in frontend/ — pages, forms, tables, modals, buttons, colours, typography, empty/loading/error states, accessibility.
---

# Apple HIG for Sklad

Sklad is a dense business tool (warehouse, sales, finance) used all day by
operators in Uzbek and Russian. Apply the HIG principles below through the
project's own components and tokens; never copy Apple branding or system
assets.

## Core principles

- **Clarity.** Every screen answers "what is this, what can I do, what
  happened". Labels are words in the user's language, never codes
  (`POSTED`, `USD_CASH`) or English leftovers. Numbers always carry their
  meaning: money with its currency (`formatCurrency`, ADR 0010), quantities
  with their unit (`QuantityInput`, `quantityWithUnit`).
- **Deference.** Content first. Chrome (borders, shadows, colour) is quiet
  and serves hierarchy. One accent colour (`--color-primary-*`) for the
  primary action; status colours only for status.
- **Depth.** Hierarchy through layout, size, weight and spacing before
  colour. Modals and drawers for focused sub-tasks; do not stack modals.

## Layout and hierarchy

- 8 px grid: use `--space-*` tokens, not ad-hoc pixel values.
- One page title (`--text-2xl`), a one-line subtitle saying what the page
  is for, then content. Group related fields in cards with a short heading.
- Align numbers right and use `tabular-nums` in tables and totals.
- Primary action at the end of the action row (right in LTR); destructive
  action visually separated (left or behind a menu).
- Phone width: no horizontal page scroll; wide tables scroll inside their
  card (`overflowX: 'auto'`).

## Colour and dark mode

- Use semantic tokens only (`--color-text-*`, `--color-bg-*`,
  `--color-border*`, `--color-success|warning|error|info-*`). A token that
  is used must exist in `globals.css` in both themes
  (`design-tokens-scan.spec.ts`).
- No hard-coded `#fff` / `white` / `#000` backgrounds or text: they break
  dark mode. Text on tinted status backgrounds uses the `-700` tone, which
  becomes lighter in dark mode.
- Never rely on colour alone: pair it with an icon or a word (badge text,
  "Yetishmaydi").

## Typography

- Body `--text-sm` (14 px), captions `--text-xs` (12 px) — nothing smaller
  than 11 px. Inputs `--text-sm`+.
- Weights: 400 body, 500 labels, 600 headings/emphasis, 700 only for key
  figures.

## Controls

- Buttons say what they do ("Tasdiqlash", "Saqlash", "To‘lov qabul
  qilish"), not "OK". Disable while the request runs and show progress text
  ("Saqlanmoqda..."), so nothing is submitted twice.
- Hit targets at least 32 px high on desktop (HIG: 44 pt on touch) —
  icon-only buttons included.
- Every icon-only button has an accessible name (`aria-label`, and `title`
  for the tooltip).
- Clickable things are `<button>` / links, not `div onClick`; if a non-button
  must be clickable it gets `role="button"`, `tabIndex={0}` and Enter/Space.
- Money inputs: `MoneyInput` / `CurrencyInput` (thousands separators; an
  emptied field stays empty). Quantities: `QuantityInput` with the product
  unit. Exchange rates: `MoneyInput decimals={4}` (never guessed, ADR 0022).
- Selects with many options are `searchable`; creating a missing record is
  offered in place (`onCreateNew`).

## Feedback and states

- Every list has an empty state that says what to do next and offers the
  action.
- Loading: show a skeleton or "Yuklanmoqda..." in place, keep the layout
  stable.
- Errors appear where the user is looking: inside the open modal/drawer,
  next to the field when possible; text is the server's translated message.
- Destructive or irreversible actions (delete, unpost, post) confirm through
  `useConfirm` with a sentence saying what will happen (ADR 0021); no
  browser `alert/confirm`.
- Success: a short toast (`toast.success`) naming what changed.

## Accessibility

- Inputs have a visible label or `aria-label`; groups of inputs in a table
  row include the row number in the label.
- Focus is always visible (`:focus-visible` styles in globals.css); modals
  trap focus and close on Escape.
- Respect reduced motion; animations under 300 ms.

## Review checklist (run before finishing UI work)

1. No undefined tokens, no hard-coded light-only colours.
2. Every number shows its currency or unit.
3. Icon-only buttons named; clickable elements are buttons/links.
4. Busy states disable submit; errors visible inside the open surface.
5. Empty, loading and error states exist for each list.
6. Both languages for every new string; no English leftovers.
7. Destructive actions confirmed with a clear sentence.
