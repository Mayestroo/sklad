## Parent

Part of #12

## What to build

Operators can create, list, filter, view, edit, and delete draft purchase receipts (`PurchaseReceipt`) with multiple line items (products, quantities, purchase prices, line discounts, and VAT rates). The interface features single target warehouse selection in the header, supplier debt display, active contract auto-fill, barcode scanning for fast line-item addition/increment, and inline quick-add modals for suppliers and products without leaving the screen.

## Acceptance criteria

- [ ] Operator can create a new purchase receipt in `DRAFT` status with automatic document numbering (`PUR-YYYY-XXXX`).
- [ ] Selecting a supplier displays their current accounts payable debt balance and auto-populates their active contract if present.
- [ ] Quick-add modals allow creating a new counterparty (supplier) and new product on the fly from the purchase receipt screen without losing form state.
- [ ] Barcode scanning automatically finds the matching product and adds it to the line items table or increments its quantity if already present.
- [ ] Table automatically calculates line totals (`quantity * unitPrice - discount + vatAmount`), subtotal, discount total, VAT total, and grand total.
- [ ] Draft receipts can be viewed, updated, and deleted prior to posting.
- [ ] Filterable list displays all draft receipts with search by document number, supplier, warehouse, date range, and currency.
- [ ] Automated integration tests verify draft CRUD and mathematical calculations.

## Blocked by

None — can start immediately.
