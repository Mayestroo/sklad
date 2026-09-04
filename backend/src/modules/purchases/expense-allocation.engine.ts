import { ExpenseAllocationMethod } from '@prisma/client';

export interface AllocationTargetItem {
  id: string;
  productId: string;
  product?: {
    name?: any;
    sku?: string;
    weight?: number | null;
    unitOfMeasure?: string;
  } | null;
  quantity: number;
  unitPrice: number;
  totalPrice?: number;
  weight?: number;
  landedCost?: number;
}

export interface BatchInfo {
  productId: string;
  remainingQty: number;
}

export interface AllocationPreviewItem {
  receiptItemId: string;
  productId: string;
  productName: any;
  sku: string;
  unitOfMeasure: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  weight: number;
  initialLandedCost: number;
  allocatedAmount: number;
  allocatedPerUnit: number;
  newLandedCost: number;
  costIncreasePercent: number;
  soldQuantity: number;
  remainingQuantity: number;
  cogsAdjustment: number;
  stockAdjustment: number;
}

export interface AllocationPreviewResult {
  expenseAmount: number;
  allocationMethod: ExpenseAllocationMethod;
  allocatedTotal: number;
  remainder: number;
  items: AllocationPreviewItem[];
}

/**
 * Pure Mathematical Engine for Expense Allocation across Inventory Items
 * Handles BY_AMOUNT, BY_QUANTITY, BY_WEIGHT methods and enforces the Allocation Remainder Rule.
 */
export class ExpenseAllocationEngine {
  /**
   * Calculates the allocation basis sum based on the chosen method
   */
  static computeBasisSum(
    items: AllocationTargetItem[],
    method: ExpenseAllocationMethod,
  ): number {
    let basisSum = 0;
    if (method === ExpenseAllocationMethod.BY_AMOUNT) {
      basisSum = items.reduce((sum, i) => sum + (Number(i.totalPrice) || 0), 0);
    } else if (method === ExpenseAllocationMethod.BY_QUANTITY) {
      basisSum = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
    } else if (method === ExpenseAllocationMethod.BY_WEIGHT) {
      basisSum = items.reduce((sum, i) => {
        const unitWeight =
          Number(i.weight) > 0
            ? Number(i.weight)
            : Number(i.product?.weight) || 1;
        return sum + (Number(i.quantity) || 0) * unitWeight;
      }, 0);
    }

    return basisSum <= 0 ? items.length : basisSum;
  }

  /**
   * Distributes total expense amount across target items with the exact Allocation Remainder Rule.
   */
  static allocateExpense(
    targetItems: AllocationTargetItem[],
    totalAmount: number,
    allocationMethod: ExpenseAllocationMethod = ExpenseAllocationMethod.BY_AMOUNT,
    batches: BatchInfo[] = [],
  ): AllocationPreviewResult {
    const basisSum = this.computeBasisSum(targetItems, allocationMethod);

    let runningAllocated = 0;
    let maxLineItemIndex = 0;
    let maxLineItemValue = -1;

    const previewItems: AllocationPreviewItem[] = targetItems.map((item, index) => {
      const qty = Number(item.quantity) || 1;
      const lineTotal = Number(item.totalPrice) || 0;
      const unitWeight =
        Number(item.weight) > 0
          ? Number(item.weight)
          : Number(item.product?.weight) || 1;

      if (lineTotal > maxLineItemValue) {
        maxLineItemValue = lineTotal;
        maxLineItemIndex = index;
      }

      let ratio = 0;
      if (allocationMethod === ExpenseAllocationMethod.BY_AMOUNT) {
        ratio = lineTotal / basisSum;
      } else if (allocationMethod === ExpenseAllocationMethod.BY_QUANTITY) {
        ratio = qty / basisSum;
      } else if (allocationMethod === ExpenseAllocationMethod.BY_WEIGHT) {
        ratio = (qty * unitWeight) / basisSum;
      } else {
        ratio = 1 / targetItems.length;
      }

      const allocatedRaw = Math.round(totalAmount * ratio * 100) / 100;
      runningAllocated += allocatedRaw;

      // Find batch for remaining vs sold quantities
      const batch = batches.find((b) => b.productId === item.productId);
      const remainingQty = batch ? Number(batch.remainingQty) : qty;
      const soldQty = Math.max(0, qty - remainingQty);

      const initialLandedCost =
        Number(item.landedCost) > 0
          ? Number(item.landedCost)
          : Number(item.unitPrice);

      return {
        receiptItemId: item.id,
        productId: item.productId,
        productName: item.product?.name,
        sku: item.product?.sku || '',
        unitOfMeasure: item.product?.unitOfMeasure || 'piece',
        quantity: qty,
        unitPrice: Number(item.unitPrice),
        totalPrice: lineTotal,
        weight: unitWeight,
        initialLandedCost,
        allocatedAmount: allocatedRaw,
        allocatedPerUnit: 0,
        newLandedCost: 0,
        costIncreasePercent: 0,
        soldQuantity: soldQty,
        remainingQuantity: remainingQty,
        cogsAdjustment: 0,
        stockAdjustment: 0,
      };
    });

    // Remainder Rule: allocate penny/tiyin drift to highest-value line item
    const remainder = Math.round((totalAmount - runningAllocated) * 100) / 100;
    if (remainder !== 0 && previewItems[maxLineItemIndex]) {
      previewItems[maxLineItemIndex].allocatedAmount =
        Math.round(
          (previewItems[maxLineItemIndex].allocatedAmount + remainder) * 100,
        ) / 100;
    }

    // Finalize unit costs and COGS / stock adjustments
    let finalAllocatedTotal = 0;
    for (const p of previewItems) {
      finalAllocatedTotal += p.allocatedAmount;
      p.allocatedPerUnit = p.quantity > 0 ? p.allocatedAmount / p.quantity : 0;
      p.newLandedCost = p.initialLandedCost + p.allocatedPerUnit;
      p.costIncreasePercent =
        p.initialLandedCost > 0
          ? (p.allocatedPerUnit / p.initialLandedCost) * 100
          : 0;

      const soldFraction = p.quantity > 0 ? p.soldQuantity / p.quantity : 0;
      p.cogsAdjustment =
        Math.round(p.allocatedAmount * soldFraction * 100) / 100;
      p.stockAdjustment =
        Math.round((p.allocatedAmount - p.cogsAdjustment) * 100) / 100;
    }

    return {
      expenseAmount: totalAmount,
      allocationMethod,
      allocatedTotal: finalAllocatedTotal,
      remainder,
      items: previewItems,
    };
  }
}
