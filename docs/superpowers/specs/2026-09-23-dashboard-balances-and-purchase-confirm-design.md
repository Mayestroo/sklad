# Dashboard Balances and Purchase Confirmation Design

## Context

The home dashboard currently shows an aggregate “Jami naqd pul” KPI, renders bank and cash balances again near the bottom of the page, and places those detailed balances away from the other key metrics. Return-cancellation dialogs use action-specific labels rather than the requested simple yes/no choices. Approving a purchase receipt also runs a save request followed by a post request, while the reported internal-server error does not identify which request failed.

## Goals

1. Bring individual bank and cash balances into the main KPI area in a visually clear, responsive presentation.
2. Make cancellation confirmation choices unambiguous across purchase-return and sales-return flows.
3. Find and fix the actual server-side failure reached when approving a purchase receipt, with a regression check at the appropriate seam.

## Design

### Dashboard balance cards

- Replace the aggregate “Jami naqd pul” KPI with one card per account in `data.finance.accounts`.
- Keep the sales, expenses, and gross-profit KPI cards alongside the balance cards in the existing responsive KPI grid.
- Remove the detailed balance panel from the bottom of the dashboard so balances are not duplicated.
- Each card shows the localized account name, its balance, and its native currency. Account type supplies a restrained visual accent and an appropriate icon; values from different currencies are never combined.
- Preserve the current dark dashboard theme. Use clear typographic hierarchy and compact, low-noise visual details rather than introducing a separate dashboard style.
- Let the grid wrap naturally on narrower screens. If there are no finance accounts, show no account cards.

### Return-cancellation confirmations

- Apply the same labels to purchase-return and sales-return cancellation dialogs, including both detail and list entry points.
- Uzbek affirmative/cancel choices are “Ha” and “Yo‘q”; Russian choices are “Да” and “Нет”. The affirmative button continues the cancellation, while the negative button, Escape, and close control dismiss the dialog without performing the action.
- Keep the existing confirmation provider, descriptions, warning treatment, keyboard behavior, and action handlers.

### Purchase receipt approval failure

- The approval flow first saves the draft with `PUT /purchases/receipts/:id`, then posts it with `POST /purchases/receipts/:id/post`.
- Diagnose and verify the failing request independently. Use the backend exception/log and a reproducible request or test before changing service behavior; the displayed generic 500 alone is not enough to identify a safe fix.
- Keep stack traces out of the user interface. Preserve useful domain-level error messages and add a regression check for the actual failing path once its cause is established.
- The local backend/DB is not currently running, so implementation must not treat the existing failing mock-based unit tests as proof of the reported production failure. Update stale test fixtures where needed to ensure the relevant purchase service tests exercise the current Prisma calls.

## Acceptance criteria

1. Dashboard bank/cash balances appear in the main KPI area as individual account cards; the old aggregate cash card and bottom duplicate balance panel are absent.
2. Sales, expenses, and gross-profit KPIs remain available, and all cards remain usable at desktop and narrow viewport widths.
3. Purchase and sales return-cancellation dialogs show localized yes/no labels and preserve the existing action semantics.
4. Approving a purchase receipt succeeds for the reported valid case, and a regression check fails if the identified server-side failure returns.
5. Relevant frontend checks and focused backend tests pass.

## Verification notes

- The purchase approval frontend handler makes a save request before the post request, so verification should observe both requests and their responses separately.
- The current focused `purchases.service.unit.spec.ts` run has failures because test doubles omit Prisma delegates now used by the service; those failures are test-fixture signals, not confirmation of the user's server error.
- A backend log/exception or captured failing request is needed if the real failure cannot be reproduced in the local environment.
