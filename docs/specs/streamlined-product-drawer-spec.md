# Spec: Streamlined Product Creation Drawer & Quantity Auto-Fill Standard

## Problem Statement

The previous product creation drawer contained too many technical fields (separate Uzbek and Russian names, SKU, barcode, category, minimum stock threshold, weight in kg) that introduced unnecessary friction during rapid data entry, especially when clerks create missing items on-the-fly while drafting purchase receipts. Furthermore, the quantity specified during item creation was not captured, requiring operators to re-enter the quantity manually in the line item table row.

## Solution

1. Streamline `CreateProductDrawer` to only 5 essential, high-utility fields:
   - **Product Name** (single unified input; automatically saved for both `uz` and `ru`).
   - **Unit of Measure** (`dona/piece`, `kg`, `litr/liter`, `metr/meter`, `quti/box`, `pachka/pack`).
   - **Quantity** (dynamic label & step matching the selected unit of measure, e.g. `Soni (kg)` allowing decimals or `Soni (dona)` defaulting to 1).
   - **Cost Price** (purchase price per unit).
   - **Selling Price** (optional expected selling price).
2. Automatically generate `sku` (`PRD-${random}`) and apply standard defaults for omitted technical fields (`weight: 1`, `minStock: 0`, `type: GOODS`, `isActive: true`).
3. Enhance `onSuccess(createdProduct, initialQuantity)` so that when a product is created from within `PurchaseDocumentForm`, the targeted row immediately populates:
   - `productId`
   - `quantity` (from the drawer's quantity input)
   - `unitPrice` (from the drawer's cost price input)
   - `unitOfMeasure`
   and automatically recalculates the row and document totals.

---

## User Stories

1. As an operator drafting a purchase receipt, I want to click `+ Yangi tovar qo‘shish` and see a clean, 5-field form without clutter, so that I can add items in seconds without cognitive overload.
2. As an operator, I want to type the product name once without having to fill separate Uzbek and Russian inputs.
3. As an operator selecting `Kilogramm (kg)` or `Litr (l)`, I want the quantity field to display `Soni (kg)` and allow fractional numbers (e.g. `1.75`), whereas selecting `Dona (dona)` displays `Soni (dona)`.
4. As an operator saving a newly created product from an item row dropdown, I want that specific line item to auto-populate with the product ID, the entered quantity, and the cost price, updating the line total immediately.
5. As an operator creating a product from the main catalog page (`/products`), I want the simplified drawer to create the product cleanly and refresh the catalog list.

---

## Implementation Decisions

- **Drawer Component Refactoring (`frontend/src/components/products/CreateProductDrawer.tsx`)**:
  - Remove UI fields for SKU, barcode, category, minimum stock, and weight.
  - Collapse `nameUz` and `nameRu` into a single `name` state; on submit, send `{ uz: name.trim(), ru: name.trim() }`.
  - Auto-generate `sku` if not provided: `PRD-${Math.floor(100000 + Math.random() * 900000)}`.
  - Add `quantity` state (default `1`); adjust input `step="any"` or `step="0.001"` when `unitOfMeasure` is `kg`, `liter`, or `meter`.
  - Update `onSuccess?: (createdProduct: any, quantity?: number) => void`.
- **Purchase Document Form Integration (`frontend/src/components/purchases/PurchaseDocumentForm.tsx`)**:
  - In `handleProductAdded(newProduct, quantity)`:
    - If `activeRowIndexForNewProduct !== null`, populate that row with `newProduct.id`, `unitPrice = Number(newProduct.costPrice) || 0`, and `quantity = Number(quantity) || 1`.
    - If created via general button/scanner, populate an empty row or append a new row with the specified `quantity` and `unitPrice`.

---

## Testing Decisions

- **Automated Frontend / Unit Testing**:
  - Verify `CreateProductDrawer` renders only the 5 specified fields.
  - Verify dynamic unit label updates when switching between `dona`, `kg`, and `litr`.
  - Verify `POST /inventory/products` receives valid payload with auto-generated SKU and mirrored `name`.
  - Verify `handleProductAdded` correctly sets `quantity` and `unitPrice` on the targeted table row.
- **Manual Verification**:
  - Open `/purchases/new`, click `Tovar tanlang` -> `+ Yangi tovar qo‘shish`.
  - Enter name: "Olma Qizil", Unit: "Kilogramm (kg)", Quantity: 25.5, Cost price: 12000.
  - Click Save -> verify row has "Olma Qizil", quantity 25.5, unit price 12000, and line total = 306,000 UZS.

---

## Out of Scope

- Multi-warehouse batch stock transfers.
- Advanced matrix/variant generation in quick add drawer.
