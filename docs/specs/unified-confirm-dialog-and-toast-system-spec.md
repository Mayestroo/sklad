# Specification: Unified Custom Confirmation Dialog & Toast Notification System (Zero Browser Alert/Confirm Mandate)

## Problem Statement

Across modern enterprise web applications, relying on native browser dialog popups (`window.confirm()` and `window.alert()`) introduces severe user experience, accessibility, and functional flaws:
1. **Unprofessional & Disruptive Aesthetics**: Native browser dialogs display an unbranded, jarring browser popup (e.g. displaying "sklad-azure.vercel.app says") that completely clashes with the application's design system and looks untrustworthy to corporate enterprise operators.
2. **Synchronous Thread Freezing**: Browser native dialogs freeze JavaScript execution on the main thread, halting ongoing animations, background data fetching, and real-time state updates until the user responds.
3. **Permanent Action Suppression Vulnerability**: In modern browsers (Chromium, Safari, Firefox), users who check "Prevent this page from creating additional dialogs" permanently disable subsequent confirmations in their session, breaking critical application workflows with no recovery mechanism.
4. **Lack of Visual Hierarchy & Semantic Guidance**: Native dialogs cannot display contextual color accents (such as warning amber for reversions versus destructive red for permanent deletions), cannot display iconography, and cannot customize action button labels beyond standard generic "OK" and "Cancel" labels.
5. **Intrusive Error Notifications**: Calling `alert(err.message)` for API or validation errors interrupts the user's active workflow and steals keyboard focus, requiring an explicit dismissal click rather than providing non-blocking, self-dismissing feedback.

## Solution

A bespoke, lightweight, and cohesive **Custom Confirmation Dialog & Toast Notification Architecture** fully integrated into the frontend application, completely eliminating native `window.confirm` and `window.alert`:

1. **Imperative Promise-Based `useConfirm()` Hook**:
   - A global context provider mounted at the dashboard layout root.
   - Any component, page, or hook can invoke an asynchronous confirmation dialog via `const ok = await confirm({ title, description, variant, confirmText, cancelText })`.
   - Returns a clean `Promise<boolean>`, resolving to `true` on confirmation or `false` on cancellation/dismissal, providing a drop-in replacement for `if (!confirm(...)) return;` without declaring dozens of ad-hoc local `useState` flags.
2. **Contextual Semantic Variants**:
   - `danger`: Red accent, destructive icon badge, high-emphasis red action button for permanent record deletions and irreversible operations.
   - `warning`: Amber accent, warning icon badge, amber action button for document unposting, status rollbacks, and financial/stock reversions.
   - `info` / `primary`: Indigo/blue accent, help icon badge, primary action button for standard transactional affirmations (posting documents, finalizing dispatches).
3. **Non-Blocking Floating Toast Notification System (`useToast` / `toast`)**:
   - Replaces disruptive `alert()` with elegant floating toasts (top-right desktop, top-center mobile).
   - Distinct notification types: `toast.success()`, `toast.error()`, `toast.warning()`, and `toast.info()`.
   - Auto-dismisses smoothly after a configurable timeout with progress indicators, pause-on-hover, and manual close triggers.
4. **Comprehensive System-Wide Sweep**:
   - Every occurrence of `window.confirm`, `confirm(`, and `alert(` across all application modules (Purchases, Sales, Services, Inventory, Master Data, Finance, Settings, Super-Admin) is refactored to use the unified `useConfirm` and `toast` architecture.

## User Stories

1. As a warehouse manager deleting a draft procurement document, I want to see a styled red confirmation modal with a destructive icon and explicit "Ha, o‘chirish" / "Bekor qilish" buttons, so that I clearly recognize this is a permanent deletion.
2. As a procurement officer clicking Edit on a posted receipt, I want to see an amber warning dialog explaining that the document will be unposted to draft, so that I understand stock and supplier balances will be reversed before proceeding.
3. As a procurement officer deleting an unposted purchase document, I want the modal backdrop to blur the background content, so that my visual focus remains centered on the destructive confirmation.
4. As a purchasing specialist cancelling a purchase return, I want to see an amber confirmation modal informing me that items will remain in warehouse stock, so that I do not cancel inadvertently.
5. As a landed cost specialist unposting an additional expense document, I want an amber warning modal alerting me that landed cost recalibrations will take effect, so that I am aware of the batch costing implications.
6. As a sales representative unposting a posted sales invoice, I want a warning modal explaining that customer debt and inventory allocations will be reversed, so that I confirm before reverting accounting entries.
7. As a sales manager deleting a draft sales invoice, I want a red danger confirmation dialog, so that I never accidentally discard an invoice draft.
8. As a sales representative cancelling a customer order, I want a clear confirmation dialog asking for confirmation before the order status transitions to cancelled, so that active customer orders are protected.
9. As a sales specialist processing a customer return, I want a confirmation modal explaining the stock restoration and debt deduction impact, so that return documents are posted intentionally.
10. As a storekeeper deleting a draft inventory transfer between warehouses, I want a danger confirmation modal to verify deletion, so that transfer movements are not lost by accident.
11. As a service coordinator confirming a service act, I want to see an informational confirmation dialog detailing accruals and counterparties, so that I double-check before posting.
12. As a service coordinator deleting a service act, I want a danger confirmation modal, so that service records cannot be wiped without explicit operator confirmation.
13. As a catalog manager deleting a product record, I want a danger modal warning that associated barcoding and category links will be removed, so that catalog integrity is preserved.
14. As a counterparty manager deleting an inactive customer profile, I want a danger confirmation dialog warning me about historical reference checks, so that critical accounts are not removed carelessly.
15. As a counterparty manager deleting an inactive supplier profile, I want a danger confirmation dialog, so that vendor records are protected against inadvertent clicks.
16. As a branch manager deleting a branch or warehouse location, I want a high-emphasis danger confirmation modal, so that organizational structure is not disrupted.
17. As an administrator updating security credentials or system configurations, I want a green floating toast confirming success, so that I receive immediate feedback without screen interruptions.
18. As a cashier encountering an error while recording a finance transaction, I want to see a non-blocking red floating toast with the specific backend error message, so that I am informed without my entire application thread being blocked.
19. As an inventory clerk successfully creating a product, I want to see a green success toast indicating "Mahsulot muvaffaqiyatli yaratildi", so that I know the creation succeeded while remaining on my active workflow.
20. As a keyboard power user, I want pressing the `Escape` key while a confirmation dialog is open to safely dismiss the dialog and resolve the confirmation to `false`, so that I can cancel via keyboard.
21. As a keyboard power user, I want focus trapped within the confirmation dialog and the confirm button focused by default, so that I can confirm with `Enter` or `Space` without reaching for the mouse.
22. As an operator clicking outside the dialog card on the backdrop, I want the modal to dismiss safely without executing the action, so that misclicks never execute destructive tasks.
23. As a mobile operator managing warehouse receipts on a smartphone, I want confirmation modals to render responsively with full-width touch buttons and comfortable padding, so that I can easily operate on mobile devices.
24. As an Uzbek-speaking operator, I want all confirmation titles, descriptions, and buttons to display grammatically accurate Uzbek text ("Tasdiqlash", "Bekor qilish", "O‘chirish"), so that I understand every prompt natively.
25. As a Russian-speaking operator, I want all confirmation titles, descriptions, and buttons to display grammatically accurate Russian text ("Подтвердить", "Отмена", "Удалить"), so that I operate comfortably in Russian.
26. As an enterprise user, I want to never see the browser's native popup ("sklad-azure.vercel.app says") anywhere across the entire software suite, so that the application looks modern, bespoke, and professional.

## Implementation Decisions

### 1. Global Imperative Confirmation Interface
A centralized confirmation provider wraps the application dashboard root. The context provides a hook returning an asynchronous invoker:

```typescript
type ConfirmVariant = 'danger' | 'warning' | 'info';

interface ConfirmOptions {
  title: string;
  description: string;
  variant?: ConfirmVariant;
  confirmText?: string;
  cancelText?: string;
}

type ConfirmFunction = (options: ConfirmOptions) => Promise<boolean>;
```

- When `confirm(options)` is called, the provider stores the options, marks the dialog visible, and retains the Promise's `resolve` callback.
- Confirming triggers `resolve(true)` and unmounts the modal.
- Cancelling, pressing `Escape`, or clicking the backdrop triggers `resolve(false)` and unmounts the modal.
- This imperative API allows consuming components to write synchronous-style async code (`if (!await confirm(...)) return;`) without adding boolean state, handler wrappers, or modal markup in 30+ separate consumer files.

### 2. Global Toast Notification Architecture
A lightweight notification queue provider replaces `window.alert()`:

```typescript
type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}
```

- Exposed via `useToast()` hook and a standalone singleton helper `toast.success()`, `toast.error()`, `toast.warning()`, `toast.info()`.
- Toasts render in a fixed floating container (top-right on desktop, top-center mobile) at high z-index above all other UI elements.
- Each toast auto-dismisses after a configurable period (default 4000ms), with smooth entry/exit animations, progress indicators, pause-on-hover, and manual close icons.

### 3. Visual Styling & Modal Semantics
- **Backdrop**: Semi-transparent dark overlay with `backdrop-blur-sm` and fade animation.
- **Card**: Elevated rounded card with subtle border matching the active light/dark design system.
- **Header Badge**: Prominent circular icon container tinted according to variant:
  - `danger`: Red tint with warning/trash icon for deletions and irrevocable actions.
  - `warning`: Amber tint with alert triangle icon for unposting, revisions, and status downgrades.
  - `info`: Blue/indigo tint with help/info icon for standard operational actions.
- **Action Buttons**: Distinct visual priority; secondary button for cancellation, primary or danger button for execution.

### 4. Localization Contract
- Dialogs and toasts default to bilingual labels according to active locale (`uz` vs `ru`).
- When specific consumer calls omit `confirmText` or `cancelText`, defaults are automatically selected based on locale and variant (e.g. "O‘chirish" / "Удалить" for danger, "Ha, davom etish" / "Да, продолжить" for warning).

### 5. Architectural Modules Under Sweep
All modules containing native browser interactions will be systematically migrated:
- **Procurement & Inbound**: Receipts list, receipt detail form, purchase returns, supplier expenses.
- **Sales & Distribution**: Invoices list, invoice detail form, sales orders, customer returns, price lists.
- **Services & Accruals**: Service acts list, service act detail modal, service act drawer.
- **Inventory & Movement**: Stock transfers, product catalog list, product drawer.
- **Master Data & Counterparties**: Customers list, suppliers list.
- **Administration & Settings**: Branches, security, billing, users, super-admin console.

## Testing Decisions

### What Makes a Good Test
A good test exercises the observable user interaction and outcome at the highest boundary, without coupling to internal state implementation details:
- Triggering an action displays the custom confirmation dialog with the correct semantic title and description.
- Dismissing or cancelling the dialog ensures no mutation request is dispatched and the dialog unmounts cleanly.
- Confirming the dialog executes the intended mutation and closes the modal.
- Failed operations trigger the floating toast with error details instead of crashing or freezing the UI.
- Native browser dialogs (`window.confirm` and `window.alert`) are never invoked.

### Modules Tested
- Confirmation dialog lifecycle (render, confirm resolution, cancel resolution, Escape dismiss, backdrop dismiss).
- Toast notification lifecycle (dispatch, display, auto-dismissal, multiple stacked toasts).
- Consumer page integration (verifying that delete and unpost operations await confirmation).

### Prior Art
- Accessible modal dialog patterns and notification stacks in modern component design systems (e.g. Radix UI, Headless UI, Shadcn UI).

## Out of Scope
- External heavyweight third-party popup libraries (no SweetAlert, Swal, or external runtime dependencies).
- Operating system desktop push notifications (Web Notifications API is out of scope).

## Further Notes
- This specification enforces a strict zero-tolerance policy for native `window.confirm()` and `window.alert()` across the entire codebase.
