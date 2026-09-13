# 21. Unified Custom Confirmation Dialog and Toast Notification System

## Context
Across enterprise ERP workflows, user actions frequently involve high-impact operations: permanent record deletions, unposting and stock/ledger reversals, status updates, and form submissions. Previously, the frontend relied heavily on browser-native `window.confirm()` and `window.alert()` dialogs. These native popups freeze the browser main thread, display crude unbranded alerts ("sklad-azure.vercel.app says"), break if the user checks "Prevent this page from creating additional dialogs", lack semantic visual indicators (warning vs destructive vs informational), and disrupt the user workflow.

## Decision
1. **Zero Native Dialog Mandate**: The entire frontend strictly disallows `window.confirm()` and `window.alert()`.
2. **Imperative Asynchronous Confirmation (`useConfirm`)**: A global `ConfirmProvider` and `useConfirm()` hook allow any component to invoke `await confirm({ title, description, variant, confirmText, cancelText })` returning a `Promise<boolean>`. This eliminates dozens of boilerplate `useState` flags while providing a rich, animated modal with glassmorphism backdrop, icon badges (`danger`, `warning`, `info`), and contextual localized action buttons.
3. **Non-Blocking Toast System (`useToast` / `toast`)**: In place of disruptive `alert()`, operations and errors dispatch smooth, auto-dismissing floating toasts (`toast.success`, `toast.error`, `toast.warning`, `toast.info`) positioned at the top corner of the screen.
4. **Bilingual Support & Accessibility**: Modals support keyboard navigation (`Escape` to cancel, focus trapping), small-screen touch responsiveness, and automated translations in both Uzbek (`uz`) and Russian (`ru`).
