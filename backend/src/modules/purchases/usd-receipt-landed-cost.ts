import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * USD receipt lines whose landed cost holds a UZS figure.
 *
 * Additional Expense posting used to copy the batch landed cost (UZS) onto the
 * receipt line of the same product, and cancelling never put it back. Such a
 * line must be repaired before another expense is added to it: adding a USD
 * per-unit amount on top of a UZS figure makes it worse.
 *
 * The rule lives here once, in two forms that must agree:
 * - `landedCostLooksUzs()` — used by Additional Expense posting (guard) and by
 *   the repair script;
 * - `LANDED_COST_LOOKS_UZS_SQL` — the same rule over the audit query's columns
 *   (`usdReceiptLandedCostAudit()`).
 * `usd-receipt-landed-cost.int-spec.ts` runs both over the same rows.
 */

const Decimal = Prisma.Decimal;
type Numeric = Prisma.Decimal | number | string;

/** A USD landed cost is about unit_price; a UZS one about unit_price × rate. */
export const LOOKS_UZS_SHARE_OF_PRICE_IN_UZS = '0.5';

export interface ReceiptLineCostFacts {
  /** The receipt line's landed cost as stored. */
  landedCost: Numeric;
  unitPrice: Numeric;
  /** The receipt's rate to UZS. */
  receiptRate: Numeric | null;
  /** UZS landed cost of the receipt's first batch of the line's product. */
  batchLandedCostUzs: Numeric | null;
}

/**
 * True when a USD receipt line's landed cost looks like a UZS figure: it
 * equals its batch's UZS landed cost, or is at least half of unit_price
 * converted to UZS. A zero landed cost, or a zero price for the second test,
 * says nothing (free goods are not flagged).
 */
export function landedCostLooksUzs(facts: ReceiptLineCostFacts): boolean {
  const landed = new Decimal(facts.landedCost);
  if (landed.lte(0)) return false;
  if (facts.batchLandedCostUzs != null && landed.eq(facts.batchLandedCostUzs)) {
    return true;
  }
  const price = new Decimal(facts.unitPrice);
  if (facts.receiptRate == null || price.lte(0)) return false;
  return landed.gte(
    price.mul(facts.receiptRate).mul(LOOKS_UZS_SHARE_OF_PRICE_IN_UZS),
  );
}

/** `landedCostLooksUzs()` over the audit query's `l` row (keep in step). */
export const LANDED_COST_LOOKS_UZS_SQL = `(
  l."landed_cost" > 0 AND (
    COALESCE(l."landed_cost" = l."batch_landed_cost_uzs", false)
    OR (
      l."unit_price" > 0
      AND COALESCE(
        l."landed_cost" >= l."unit_price" * l."receipt_rate" * ${LOOKS_UZS_SHARE_OF_PRICE_IN_UZS},
        false
      )
    )
  )
)`;

export interface UsdReceiptLandedCostAuditRow {
  tenant_id: string;
  receipt_id: string;
  receipt_number: string;
  receipt_rate: Prisma.Decimal | null;
  receipt_item_id: string;
  product_id: string;
  quantity: Prisma.Decimal;
  unit_price: Prisma.Decimal;
  landed_cost: Prisma.Decimal;
  batch_landed_cost_uzs: Prisma.Decimal | null;
  looks_uzs: boolean;
}

/**
 * READ-ONLY audit, one tenant: the USD receipt lines whose product a posted
 * or cancelled Additional Expense touched on that receipt, with `looks_uzs`.
 */
export async function usdReceiptLandedCostAudit(
  db: Pick<Prisma.TransactionClient, '$queryRaw'>,
  tenantId: string,
): Promise<UsdReceiptLandedCostAuditRow[]> {
  return db.$queryRaw<UsdReceiptLandedCostAuditRow[]>`
    WITH touched AS (
      SELECT DISTINCT e."tenant_id", e."receipt_id", i."product_id"
      FROM "additional_expenses" e
      JOIN "additional_expense_items" i ON i."expense_id" = e."id"
      WHERE e."tenant_id" = ${tenantId}
        AND e."status" IN ('POSTED', 'CANCELLED')
    ),
    lines AS (
      SELECT
        r."tenant_id",
        r."id" AS receipt_id,
        r."doc_number" AS receipt_number,
        r."exchange_rate" AS receipt_rate,
        ri."id" AS receipt_item_id,
        ri."product_id",
        ri."quantity",
        ri."unit_price",
        ri."landed_cost",
        (
          SELECT b."landed_cost"
          FROM "product_batches" b
          WHERE b."tenant_id" = r."tenant_id"
            AND b."receipt_id" = r."id"
            AND b."product_id" = ri."product_id"
          ORDER BY b."created_at"
          LIMIT 1
        ) AS batch_landed_cost_uzs
      FROM "purchase_receipts" r
      JOIN "purchase_receipt_items" ri ON ri."receipt_id" = r."id"
      JOIN touched t
        ON t."tenant_id" = r."tenant_id"
       AND t."receipt_id" = r."id"
       AND t."product_id" = ri."product_id"
      WHERE r."tenant_id" = ${tenantId}
        AND r."currency" = 'USD'
    )
    SELECT l.*, ${Prisma.raw(LANDED_COST_LOOKS_UZS_SQL)} AS looks_uzs
    FROM lines l
    ORDER BY l."receipt_number", l."receipt_item_id"`;
}

/**
 * The lines of a USD receipt, among `receiptItemIds`, whose landed cost looks
 * like UZS. Other currencies are never flagged (the bug only hit USD).
 */
export async function usdReceiptLinesWithUzsLandedCost(
  db: Pick<Prisma.TransactionClient, 'purchaseReceiptItem' | 'productBatch'>,
  tenantId: string,
  receipt: { id: string; currency: string; exchangeRate: Numeric | null },
  receiptItemIds: string[],
): Promise<string[]> {
  if (receipt.currency !== 'USD' || receiptItemIds.length === 0) return [];
  const lines = await db.purchaseReceiptItem.findMany({
    where: {
      receipt: { tenantId },
      receiptId: receipt.id,
      id: { in: receiptItemIds },
    },
    select: { id: true, productId: true, unitPrice: true, landedCost: true },
  });
  const batches = await db.productBatch.findMany({
    where: {
      tenantId,
      receiptId: receipt.id,
      productId: { in: lines.map((l) => l.productId) },
    },
    orderBy: { createdAt: 'asc' },
    select: { productId: true, landedCost: true },
  });
  return lines
    .filter((line) =>
      landedCostLooksUzs({
        landedCost: line.landedCost,
        unitPrice: line.unitPrice,
        receiptRate: receipt.exchangeRate,
        batchLandedCostUzs:
          batches.find((b) => b.productId === line.productId)?.landedCost ??
          null,
      }),
    )
    .map((line) => line.id)
    .sort();
}

/** Refuses an Additional Expense on receipt lines that need repair first. */
export function assertNoUzsLandedCost(
  receipt: { id: string; docNumber: string },
  flaggedLineIds: string[],
): void {
  if (flaggedLineIds.length === 0) return;
  const ids = flaggedLineIds.join(', ');
  throw new BadRequestException(
    `Xarid ${receipt.docNumber} (${receipt.id}) qatorlarining tannarxida so'mdagi summa turibdi: ${ids}. Xarajatni o'tkazishdan oldin xaridni tuzatish kerak (purchases:repair-usd-landed-cost) / ` +
      `В строках прихода ${receipt.docNumber} (${receipt.id}) себестоимость записана в сумах: ${ids}. Перед проведением расхода приход нужно исправить (purchases:repair-usd-landed-cost)`,
  );
}
