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
