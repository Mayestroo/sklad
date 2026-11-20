import { Prisma, PurchaseDocStatus } from '@prisma/client';
import {
  landedCostLooksUzs,
  usdReceiptLandedCostAudit,
  type UsdReceiptLandedCostAuditRow,
} from './usd-receipt-landed-cost';

/**
 * Repair of USD receipt lines whose landed cost holds a UZS figure (see
 * usd-receipt-landed-cost.ts). Not a migration: run on purpose, per tenant,
 * dry-run unless `apply` is set. Only lines the audit flags are touched; a
 * line whose correct value cannot be derived exactly is listed for manual
 * review and left as it is.
 *
 * Correct landed cost, receipt currency, per unit:
 *   (total_price + allocated_expenses) / quantity, rounded to 2 decimals
 *     — what receipt posting wrote (allocateReceiptLines). Overwritten lines
 *     come from postings before the 4-decimal migration (20261120110000), so
 *     their original value was stored at 2 decimals; and
 *   + receipt_unit_delta of every POSTED Additional Expense row on the line.
 * Cancelled expenses add nothing (posting and cancelling net to zero). A
 * posted row without receipt_unit_delta (posted before the snapshot existed)
 * leaves the value unknown: manual review.
 */

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

export type RepairStatus = 'repair' | 'manual_review';

export interface RepairLine {
  tenantId: string;
  receiptId: string;
  receiptNumber: string;
  receiptItemId: string;
  productId: string;
  /** landed_cost as stored. */
  before: string;
  /** The derived value; null for manual review. */
  after: string | null;
  status: RepairStatus;
  reason?: string;
}

export interface RepairReport {
  tenantId: string;
  apply: boolean;
  lines: RepairLine[];
  written: number;
}

export interface ReceiptLineForRepair {
  quantity: Prisma.Decimal.Value;
  unitPrice: Prisma.Decimal.Value;
  discount: Prisma.Decimal.Value;
  vatRate: Prisma.Decimal.Value;
  totalPrice: Prisma.Decimal.Value;
  allocatedExpenses: Prisma.Decimal.Value;
}

export interface PostedExpenseRowForRepair {
  docNumber: string;
  receiptItemId: string;
  receiptUnitDelta: Prisma.Decimal.Value | null;
}

/** A float stored into a 2-decimal column (Postgres rounds halves away). */
const storedMoney = (value: number) =>
  new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/**
 * The landed cost receipt posting wrote, or why it cannot be known exactly.
 * Receipt code computed it in floats, from the stored line total or from the
 * unrounded one; every way must give the same 2-decimal value, otherwise the
 * stored figure is a rounding coin-flip and is not guessed.
 */
export function receiptPostingLandedCost(
  line: ReceiptLineForRepair,
): { value: Decimal } | { reason: string } {
  const qty = new Decimal(line.quantity);
  if (qty.lte(0)) return { reason: 'quantity is not positive' };
  const total = new Decimal(line.totalPrice);
  const allocated = new Decimal(line.allocatedExpenses);

  // The unrounded line total, as createDraft/updateDraft computed it.
  const q = Number(line.quantity);
  const afterDiscount = Math.max(
    0,
    q * Number(line.unitPrice) - Number(line.discount),
  );
  const unroundedTotal =
    afterDiscount + (afterDiscount * Number(line.vatRate)) / 100;
  if (!storedMoney(unroundedTotal).eq(total)) {
    return {
      reason: `total_price ${total.toFixed(2)} does not match quantity × price − discount + VAT (${storedMoney(unroundedTotal).toFixed(2)})`,
    };
  }

  const candidates = [
    total.add(allocated).div(qty).toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    storedMoney((Number(total) + Number(allocated)) / q),
    storedMoney((unroundedTotal + Number(allocated)) / q),
  ];
  if (!candidates.every((c) => c.eq(candidates[0]))) {
    return {
      reason: `original landed cost is ambiguous after rounding (${candidates.map((c) => c.toFixed(2)).join(' / ')})`,
    };
  }
  return { value: candidates[0] };
}

/**
 * The correct landed cost of a receipt line, or why it cannot be derived.
 * `postedRows` are the POSTED Additional Expense rows on the same receipt and
 * product (the old bug wrote to the receipt line found by product).
 */
export function deriveReceiptLandedCost(
  receiptItemId: string,
  line: ReceiptLineForRepair,
  postedRows: PostedExpenseRowForRepair[],
): { value: Decimal } | { reason: string } {
  const legacy = postedRows.filter((r) => r.receiptUnitDelta == null);
  if (legacy.length > 0) {
    return {
      reason: `posted expense ${[...new Set(legacy.map((r) => r.docNumber))].join(', ')} has no stored receipt_unit_delta`,
    };
  }
  const base = receiptPostingLandedCost(line);
  if ('reason' in base) return base;
  const deltas = postedRows
    .filter((r) => r.receiptItemId === receiptItemId)
    .reduce(
      (sum, r) => sum.add(new Decimal(r.receiptUnitDelta!)),
      new Decimal(0),
    );
  return { value: base.value.add(deltas) };
}

async function planTenant(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<RepairLine[]> {
  const audit = await usdReceiptLandedCostAudit(tx, tenantId);
  const flagged: UsdReceiptLandedCostAuditRow[] = [];
  for (const row of audit) {
    const facts = {
      landedCost: row.landed_cost,
      unitPrice: row.unit_price,
      receiptRate: row.receipt_rate,
      batchLandedCostUzs: row.batch_landed_cost_uzs,
    };
    // The SQL and the TypeScript rule must agree; a mismatch is a bug.
    if (landedCostLooksUzs(facts) !== row.looks_uzs) {
      throw new Error(
        `looks_uzs mismatch between SQL and TypeScript on receipt line ${row.receipt_item_id}`,
      );
    }
    if (row.looks_uzs) flagged.push(row);
  }
  if (flagged.length === 0) return [];

  const items = await tx.purchaseReceiptItem.findMany({
    where: {
      receipt: { tenantId },
      id: { in: flagged.map((r) => r.receipt_item_id) },
    },
  });
  const posted = await tx.additionalExpenseItem.findMany({
    where: {
      expense: {
        tenantId,
        status: PurchaseDocStatus.POSTED,
        receiptId: { in: [...new Set(flagged.map((r) => r.receipt_id))] },
      },
    },
    select: {
      receiptItemId: true,
      productId: true,
      receiptUnitDelta: true,
      expense: { select: { docNumber: true, receiptId: true } },
    },
  });

  return flagged.map((row): RepairLine => {
    const head = {
      tenantId,
      receiptId: row.receipt_id,
      receiptNumber: row.receipt_number,
      receiptItemId: row.receipt_item_id,
      productId: row.product_id,
      before: new Decimal(row.landed_cost).toFixed(4),
    };
    const item = items.find((i) => i.id === row.receipt_item_id)!;
    const derived = deriveReceiptLandedCost(
      row.receipt_item_id,
      item,
      posted
        .filter(
          (p) =>
            p.expense.receiptId === row.receipt_id &&
            p.productId === row.product_id,
        )
        .map((p) => ({
          docNumber: p.expense.docNumber,
          receiptItemId: p.receiptItemId,
          receiptUnitDelta: p.receiptUnitDelta,
        })),
    );
    if ('reason' in derived) {
      return {
        ...head,
        after: null,
        status: 'manual_review',
        reason: derived.reason,
      };
    }
    if (
      landedCostLooksUzs({
        landedCost: derived.value,
        unitPrice: row.unit_price,
        receiptRate: row.receipt_rate,
        batchLandedCostUzs: row.batch_landed_cost_uzs,
      })
    ) {
      return {
        ...head,
        after: null,
        status: 'manual_review',
        reason: `derived value ${derived.value.toFixed(4)} still looks like UZS`,
      };
    }
    return { ...head, after: derived.value.toFixed(4), status: 'repair' };
  });
}

/**
 * Plans (and with `apply`, writes) the repair for one tenant in one
 * transaction. A write only lands if the line still holds the value it was
 * planned from; a second run finds nothing left to repair.
 */
export async function repairUsdReceiptLandedCost(
  prisma: {
    $transaction<T>(
      fn: (tx: Prisma.TransactionClient) => Promise<T>,
      options?: { timeout?: number },
    ): Promise<T>;
  },
  tenantId: string,
  options: { apply: boolean },
): Promise<RepairReport> {
  return prisma.$transaction(
    async (tx) => {
      const lines = await planTenant(tx, tenantId);
      let written = 0;
      if (options.apply) {
        for (const line of lines) {
          if (line.status !== 'repair') continue;
          const { count } = await tx.purchaseReceiptItem.updateMany({
            where: {
              id: line.receiptItemId,
              receipt: { tenantId },
              landedCost: new Decimal(line.before),
            },
            data: { landedCost: new Decimal(line.after!) },
          });
          if (count !== 1) {
            throw new Error(
              `Receipt line ${line.receiptItemId} changed while repairing; nothing was written for tenant ${tenantId}`,
            );
          }
          written += 1;
        }
      }
      return { tenantId, apply: options.apply, lines, written };
    },
    { timeout: 120_000 },
  );
}

/** One line of the before/after listing. */
export function formatRepairLine(line: RepairLine): string {
  const where = `receipt ${line.receiptNumber} (${line.receiptId}) line ${line.receiptItemId}`;
  return line.status === 'repair'
    ? `REPAIR         ${where}: before ${line.before} -> after ${line.after}`
    : `MANUAL REVIEW  ${where}: before ${line.before} -> unchanged (${line.reason})`;
}
