# 26. Production: Finished Products, Recipes with Units and Loss, FIFO Costing

## Context
TZ "Ishlab chiqarish" v1.3 (20.11.2026) found the production module cut off
from the rest of the platform: a raw material's unit and price were not
pulled into the recipe (the recipe cost was 0 UZS), kg and g were mixed
without conversion, there was no "Tayyor mahsulot" type (a product made in
the recipe dialog stayed a Tovar), its purchase price and quantity were typed
by hand, documents had no extra costs or storno, and the UI was dense.

## Decision
1. **Nomenclature type `FINISHED_PRODUCT`** ("Tayyor mahsulot") next to
   `PRODUCT`, `RAW_MATERIAL`, `SERVICE`. A finished product may carry
   `isSemiFinished`: other recipes then use it as a material. Its card cost is
   read-only and comes from `costSource`: `RECIPE_ESTIMATE` (the active
   recipe's cost of one unit) until produced, then `PRODUCTION_ACTUAL` (the
   unit cost of the latest completed document). A finished product cannot be
   purchased (receipts refuse it); its stock comes from production or opening
   balances. The type of a product with a recipe or any stock movement cannot
   change. Products made by a recipe and never bought were migrated to the new
   type.
2. **Units**: the card unit is the base unit; `product_units` adds named units
   with a factor (1 qop = 50 kg), and every base unit offers standard
   sub-units (g, ml, cm, mm). All conversion and costing lives in one shared
   module, `shared/production/costing.ts`, used by the backend and the
   frontend: base = quantity × factor; consumption = base ÷ (1 − loss %);
   amount = consumption × unit cost; total = Σ amounts + extra costs; unit
   cost = total ÷ produced quantity. Intermediate values are not rounded;
   money is rounded to 2 decimals (UZS), per-unit costs to 4, stock
   quantities to 3.
3. **Recipes** store each line in its entry unit with the factor and a loss
   percent (0–99.99). Recipes are Faol/Nofaol (several per product; the
   document chooses one) and archived instead of deleted once a document used
   them. Editing changes the recipe in place: a document copies its material
   lines (with the unit at that time) when created. Nesting is allowed up to
   3 levels; cycles are refused with the chain of names. The estimate is
   never frozen: it is recalculated from the current card costs.
4. **Estimated cost setting** (`Company.settings.production.estimatedCostMethod`):
   `LAST` (default, ADR 0007: the last landed cost) or `AVERAGE` (weighted
   average of remaining batches). Actual cost is always FIFO. Posting or
   unposting a receipt and posting an Additional Expense refresh the averages
   and every recipe estimate that uses the items, up through semi-finished
   products.
5. **Document lifecycle**: Qoralama (`DRAFT`, editable, no stock effect) →
   Jarayonda (`IN_PROGRESS`, materials leave the raw-material warehouse FIFO;
   any shortage refuses the start and lists every short material) →
   Yakunlangan (`COMPLETED`, actual consumption settled, the output batch is
   created in the finished-goods warehouse through `createFifoBatch` at
   (FIFO materials + extra costs) ÷ produced quantity) → Bekor qilingan
   (`CANCELLED`, with a reason). Cancelling a completed document is a storno:
   refused once any of the output batch was sold or used, otherwise the batch
   and its stock are removed and every material returns to its batch, all in
   one transaction. Completed documents are never edited. `PLANNED` / `READY`
   remain only for older documents (treated as draft / in progress).
   Extra costs are manual lines (salary, energy, depreciation, other; UZS);
   taking them from Finance is left for v2.
6. **Rights** are separate: `production:view/create/edit/delete/complete/cancel`
   (new permission actions `COMPLETE`, `CANCEL`). The migration grants them
   from the inventory rights each role had, so nobody loses access.
7. A purchase receipt cannot be unposted once goods were taken from its
   batches (production, sale or transfer): the message names the items.

8. **Journal (ADR 0006)**: completing a document posts one entry dated with
   the document (source `ProductionDocument`): Dt 2910 / Kt 1010 for the raw
   materials consumed (FIFO cost) and Dt 2910 / Kt 6990 for each extra cost.
   Finished goods go to 2910 because sales relieve COGS from 2910 (Dt 9110 /
   Kt 2910). Semi-finished materials need no line: their value moves inside
   2910. Cancelling a completed document removes the entry with the stock
   (`deleteEntriesForSource`, as every other unposting does). Materials
   issued at start are not posted until completion (no work-in-progress
   account).

## Consequences
- Extra costs sit on 6990 (other liabilities) until v2 links them to Finance.
- v2: costing method per category, extra costs from Finance, automatic
  cascade production of semi-finished products.
