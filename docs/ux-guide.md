# Sklad UX guide

How screens in `frontend/` are built after the 2026-11 UX overhaul. Read with
`.claude/skills/apple-hig/SKILL.md` (principles) and `docs/ux-audit/README.md`
(audit, glossary).

## Tokens (`src/app/globals.css`)

| Group | Tokens | Rule |
|---|---|---|
| Spacing | `--space-1…16` (4 px steps, 8 px grid) | No ad-hoc pixel gaps in new code |
| Type | `--text-xs` 12 · `--text-sm` 14 (body) · `--text-base` 16 · `--text-lg/xl/2xl` | Nothing below 11 px; inputs ≥ 14 px (16 px on phones for auth fields) |
| Text colour | `--color-text-primary / secondary / tertiary` | All three meet WCAG AA on every surface (tertiary was 2.5:1, now ≥ 4.5:1) |
| Placeholder | `--color-text-placeholder` | Deliberately lighter than values, so an example (e.g. rate "12,800") never looks entered |
| Status | `--color-{success,warning,error,info}-{50,100,200,500,600,700}` | Text and white-on-colour buttons use **-600/-700**; -500 only for fills, bars, icons |
| Surfaces | `--color-bg-primary/secondary/tertiary`, `--color-bg-input`, `--color-border*` | Never `#fff`/`white`/`#000` (dark mode) |
| Radii | `--radius-sm 8 / md 12 / lg 16 / xl 20 / full` | |
| Layout | `--sidebar-width`, `--header-height`, `--ux-split-2-1`, `--ux-split-side` | Splits collapse to one column below 1024 px |

## Shell and navigation

- `lib/navigation.ts` is the **only** menu definition. Sidebar, breadcrumbs and the
  Go-to palette read it; add a page there and it is reachable everywhere. Labels are
  `nav.*` message keys; `keywords` (uz + ru) feed the palette search.
- `AppShell`: ≥ 1024 px fixed sidebar; below that the sidebar is a drawer opened from
  the header menu button (closes on route change, Esc or backdrop). Skip-to-content link.
- Keyboard: **Ctrl/⌘+K** Go-to (sections + quick actions), **?** shortcut list,
  **Ctrl+S** save draft and **Ctrl+Enter** post on document forms
  (`useDocumentShortcuts`), **Ctrl+Enter** in dialogs with `onSubmitShortcut`, **Esc** closes.

## Components

| Component | Use |
|---|---|
| `Button` | `variant` primary/secondary/outline/ghost/danger; `loading` + `loadingText` disables and shows a spinner (prevents double submit) |
| `PageHeader` / `Breadcrumbs` | Title, one-line purpose, actions (primary last); crumbs from the nav |
| `EmptyState` | What is missing + what to do next + the action button (`compact` inside cards) |
| `SkeletonRows`, `Skeleton` | Loading that keeps the layout; announces "Yuklanmoqda…" |
| `Modal` | role=dialog, focus trap, Esc, focus returns, pinned `footer`, full-screen on phones. Never hand-roll overlays |
| `ConfirmDialog` via `useConfirm()` | Destructive/irreversible actions with a sentence saying what happens (ADR 0021) |
| Toasts `toast.success/error/…` | Theme colours, polite live region (errors assertive), optional `action: { label, onClick }` for Undo, errors stay 7 s |
| `Select` | `error` prop for inline required-field messages; `onCreateNew` for quick-add |
| `.doc-banner.is-error/.is-warning/.is-info` | Form-level messages; give errors `role="alert"` and scroll them into view |
| `.doc-live-total` | Live document total in the sticky document header |
| `AuthCard`, `AuthField` | Sign-in / sign-up fields (label, hint, error, show-password, Caps Lock) |

## Patterns

- **Required fields**: validate on save, then mark the field (`Select error=…`) *and*
  show the banner; never silently disable the primary button — pressing it explains
  what is missing.
- **Defaults**: never pick a customer/supplier for the user (wrong debt). Remember
  harmless choices per browser with `usePersistentState` / `remember()` (last
  warehouse, list filters, dashboard period). Currency and exchange rate are never
  guessed (ADR 0022).
- **Dates**: "today" is `localIsoDate(new Date())` (`lib/date-range.ts`), never
  `toISOString()` (UTC is yesterday between 00:00 and 05:00 in Tashkent). Quick periods:
  `quickPeriodRange()` (weeks start Monday).
- **Money**: `formatCurrency(amount, locale, currency)` (appends the code — never add it
  again); per-currency lines, never summed across currencies (ADR 0023).
- **Lists on phones**: add `className="app-table-stack"` to the table, `data-primary` to
  the first cell and `data-label={…}` to the others (`.local/uxrun/stack-table.cjs`
  automates it from the `<th>` labels). KPI tiles: `className="ux-kpi-grid"`. Long filter
  forms: `.ux-filters-toggle` + `.ux-filters` (folded below 640 px).
- **Grids**: `repeat(auto-fit, minmax(min(100%, Npx), 1fr))` — never a bare `minmax(Npx…)`
  or fixed `1fr 1fr` that cannot shrink on a 390 px screen.
- **Text**: all new strings in `messages/{uz,ru}.json` (both languages); glossary terms
  from `docs/ux-audit/README.md`; sentence case; no English or Russian words in Uzbek
  text ("Skidka", "Nukladnoy", "schyot", "Below-Cost Guardrail").

## Verification

App against a **local** database only (see UX_PROGRESS / MORNING_REPORT for the guarded
launcher — `backend/.env` is the real Neon database).

```bash
cd frontend
MSYS_NO_PATHCONV=1 node e2e/ux/shots.mjs <label> --routes=/,/sales/new --widths=1440,1280,390 --locales=uz,ru --axe --out=../docs/ux-audit/screens
node e2e/ux/overflow.mjs /route 390        # which element widens the page
node e2e/ux/axe-detail.mjs /route          # contrast failures with colours
node e2e/ux/flows.mjs sale ru 1280         # login|sale|receipt|expense|order|product|palette|drawer|finance|users|delorder
```
The harness caches the sign-in token (`%TEMP%/sklad-ux-auth.json`) because the API
allows 5 logins per minute.

## Page patterns (2026-11 redesign, branch ux/redesign)

Every page answers "what does the person come here to do?" first. The shared kit
lives in `src/components/ui/filters/` (FilterBar), `src/components/ui/stats/` (StatCard),
`src/components/ui/list/` (DataTable), `src/components/ui/DocChecklist.tsx` and the
`rd-*` / `doc-*` classes at the end of `globals.css`. New strings: `rd.*` messages.

### Lists (sales, purchases, orders, returns, expenses, stock, products, counterparties…)

| Piece | Rule |
|---|---|
| `StatCardGrid` + `StatCard` | 2–4 key numbers above the list: label · value · optional secondary line · optional trend. **Not** buttons, links or filters — the same view is reached through the FilterBar. One neutral frame (no stripes, no tinted backgrounds); colour only for a negative value (`negative`) or a trend text. 4 columns, 2 below 1200 px |
| `FilterBar` + `useFilterState(pageKey, DEFAULTS)` | The one toolbar of every list, in this order: search (`/` focuses it) · the main status as `segmented` · other filters as `select` dropdowns (`searchable` for long lists) · `toggle`s · `period` (always last) · `columns` (ColumnChooser). Under it: removable chips, "Tozalash", the result count. One row when everything fits; otherwise search + Columns on the first line and all filters together on the second (measured, not by breakpoint). Phones: "Filtrlar (n)" opens a bottom sheet |
| Filter state | `DEFAULTS` is a module constant. Values live in the URL (`?status=DRAFT&q=…`, so links and Back work) and are remembered per user and page. The page maps values to its **existing** API parameters; `periodRange(value)` gives `{from, to}` in local dates. Two bars on one page (production) use different keys and `{ searchKey: 'rq' }` |
| Paged lists | Derive the page from a key of the filters (`pageAt = { key, page }`) instead of calling `setPage(1)` in every handler |
| View switches | A choice of *which list or view* (List / Analytics, Provided / Received, Operations: Income / Expenses…) is a `SegmentedFilter` above the FilterBar, not a filter inside it. Report periods that are named API ranges (analytics) are a `SegmentedFilter` too |
| Task tiles | Tiles that **start** something ("Kirim qilish") are buttons with `.task-tile`, not stat cards |
| `DataTable` | Sticky sortable header, `onRowClick` + Enter, `footer` totals row, phone card rows. Columns: `primary` (first, bold), `numeric`, `locked` (cannot be hidden via `ColumnChooser`) |
| `CurrencyTotals` / `totalsByCurrency` | Footer and tile sums per currency (ADR 0023) |
| Row actions | One `ActionsMenu` (⋯) per row; destructive items `danger: true`, hidden (not disabled) without permission |

### Documents (sale, receipt, order, returns, expenses)

- `doc-layout` = `doc-main` (header fields, lines) + sticky `doc-aside` (300 px): totals,
  `DocChecklist` ("ready to post": what is still missing, each item jumps to the field),
  primary actions. Below 1024 px the aside follows the main column.
- Rarely used fields (contract, comment, delivery address, discount/VAT) sit in a
  `details.doc-more` fold whose summary says what is inside.
- Lines table `doc-lines`: Enter in a cell moves to the same cell in the next row, or adds a
  row from the last one (`linesKeyDown`). Quantity cells keep ≥ 124 px.
- Posted documents: actions move into ⋯ (`ActionsMenu`), the page reads as a result.
  If a banner asks the person to press something, that button is **in the banner**.

### Detail and settings

- Detail pages: `PreviewHead` (number, status, counterparty) → `Facts` → `PaidProgress`
  → sections titled with `SectionTitle`.
- Settings: `SettingsShell` (route layout) gives every section a searchable list with a
  one-line description; keywords in both languages. Forms that save settings use
  `.set-savebar`: it appears only when something changed, says **what** will change in
  words, and offers Discard / Save. It compares with what was last saved, not with the
  first loaded value.

### Reports and dashboards

- An answer first (`an-answer`, dashboard attention row): a written sentence with the
  number and a link to act ("Customers owe 12 000 000 UZS — Collect").
- Section titles are questions ("What sells best?"), each with a link to the page where
  you act.
- Logs (audit, journal): grouped by **local** day with a one-line summary; noisy rows
  (sign-ins) hidden by default; a FilterBar toggle ("with sign-ins") shows them.

### Inboxes and composers (platform admin)

- Tickets: list + conversation side by side; "waiting for our answer" first; inline reply
  with Ctrl+Enter; say what the action does ("the ticket becomes Resolved").
- Announcements and other publish-to-everyone actions: a live preview per interface
  language, and an explicit warning when one language is missing.

### Dialogs and drawers

-  (centre) and  (side) share : focus moves in and stays inside (Tab wraps), returns
  to the opener, Esc closes, Ctrl+Enter submits, the page behind does not scroll, only the top surface reacts to keys.
- **Typed input is never lost by accident.** Backdrop / Esc / ✕ after an edit show "Saqlamasdan yopilsinmi?" inside the
  same surface (Davom etish / Yopish) — never a second dialog on top. Search boxes and comboboxes are not edits; picks in
  Select / DatePicker / radios / checkboxes are.  for read-only or filter-only surfaces;
   on a field that is not data.
- A press inside released on the backdrop (selecting text) does not close.
- Actions always go in  (pinned, visible however long the content). Forms:  in the body, the
  submit button  in the footer,  → .
- Order in the footer: Cancel (secondary) first, the action last (primary, or danger when it destroys).
- Confirmations:  (ADR 0021). A destructive confirmation focuses Cancel first.
- Title says the task ("Yangi mijoz", "To'lov qabul qilish — INV-…");  for one line on what changes.

### Buttons

| Variant | When |
|---|---|
|  | The one main action of a surface (Saqlash, Tasdiqlash, To'lov qabul qilish) |
|  /  | Any other action (same neutral look) |
|  | Quiet actions in toolbars and rows |
|  | Confirms something destructive (O'chirish in a confirmation) |
|  /  | A destructive action that is not the confirming one (Storno, Qayta ochish, remove line) |

No inline colours on buttons: no green "income" or red "expense" buttons — status colours are for status (badges,
amounts). The accent colour on a non-button control only marks a selection (tab, chosen option, selected day).

### Number input

- `CurrencyInput` / `MoneyInput` / `QuantityInput` show the same text as the rest of the
  app: `15 000,5` (NBSP groups, comma decimal, no trailing zeros).
- Typing accepts `15,000.5` and `15.000,5` (the last separator is the decimal). A single
  separator followed by exactly three digits is ambiguous: in fields with < 3 decimals it
  is a group; typed key by key it is a decimal; pasted it is read as thousands **and** a
  note under the field says so with a one-click "It was a decimal". Rules and tests:
  `src/lib/money-input.ts`, `money-input.spec.ts`.
- `onChange` always reports a plain number — inputs never change what is sent to the API.

### Words (glossary for the redesigned pages)

Domain terms and their English names come from `CONTEXT.md` (use its terms, not its _Avoid_ list, in code and issues). This table only fixes the **interface** words in uz/ru.

| Use | Not | Meaning |
|---|---|---|
| Tasdiqlash / Проведение (post) | "Provodka qilish" in UI text | Make a document affect stock, money and the journal |
| Qoralama / Черновик | Draft (English) | Saved, not posted |
| Kirim hujjati / Приходный документ | Nakladnoy | Goods receipt from a supplier |
| Qo‘shimcha xarajat / Доп. расход | Landed cost (English) | Transport, customs… spread over a receipt's cost |
| Qarz / Долг (customer owes / we owe) | Debitorka, kreditorka in headings | Settlement balance per currency |
| Ombor / Склад | Sklad in Uzbek text | Warehouse |
| Kassa / Касса, Hisob / Счёт | Cash account (English) | Where money is kept, one currency each |

### Checks before a page commit

```bash
cd frontend
npx tsc --noEmit -p .                 # after adding a route: npx next typegen first
npx vitest run <page folder>          # DOM tests
npm test                              # node runner: source scans (money, i18n, wiring) — run it too
bash ../.local/uxrun/lintbase.sh <file>   # no new ESLint errors vs HEAD
MSYS_NO_PATHCONV=1 node e2e/ux/shot-one.mjs <outDir> <name> <route> 1 1440,390 uz,ru   # overflow 0
MSYS_NO_PATHCONV=1 node e2e/ux/fc-verify.mjs <route> <outDir>   # FilterBar: search, /, segments, dropdown keys, period, URL, Back, remembered view, phone sheet
MSYS_NO_PATHCONV=1 node e2e/ux/fb-shot.mjs <route> <out.jpg> [width] [locale]   # how many lines the bar takes
node e2e/ux/axe-sweep.mjs out.json both    # WCAG 2.1 A/AA, light + dark
```
Task flows used for verification: `e2e/ux/rd-*.mjs` (sale form, transfer, prices,
inventory document, product, returns, ticket reply, announcement, branch attach,
finance operations, money input). They write only to the local database. Platform-owner pages: `UX_EMAIL=superadmin@local.test UX_PASSWORD=…`
(the local account; see the create-superadmin script for its default).
