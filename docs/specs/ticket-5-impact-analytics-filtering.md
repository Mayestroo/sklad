## Parent

Part of #34 (Spec) / Part of #35 (Map)

## What to build

Deliver a management and analytics hub for additional expenses at `/purchases/expenses`:
1. **KPI Summary Cards**: Header KPI cards displaying Total Transport Expenses, Total Customs Duties, Total Brokerage & Handling, and Total Capitalized Landed Cost.
2. **Multi-Criteria Filter Toolbar**: Real-time filtering by search text (document number, counterparty, receipt number, comment), document status tabs (`All`, `DRAFT`, `POSTED`, `CANCELLED`), expense type dropdown, counterparty dropdown, and date range picker.
3. **Landed Cost Impact Analytics Tab**: Dedicated tab on `/purchases/expenses` visualizing initial purchase price vs allocated expenses, percentage cost increase per product, and category-level logistics cost distribution.
4. **Document Export & Print**: Export expense reports to Excel/PDF and print formatted expense allocation slips.
5. **Localization & Accessibility**: Full bilingual support (`uz` and `ru`), responsive mobile/tablet layout, and standard keyboard navigation.

## Acceptance criteria

- [ ] `/purchases/expenses` displays live aggregated KPI cards.
- [ ] Multi-criteria filter toolbar filters table rows in real time.
- [ ] Landed Cost Impact tab renders clear cost escalation breakdowns and analytics.
- [ ] Export and print actions generate clean, formatted outputs.
- [ ] UI fully localized in Uzbek and Russian matching Sklad ERP design tokens.

## Blocked by

- #36 (Ticket 1)
