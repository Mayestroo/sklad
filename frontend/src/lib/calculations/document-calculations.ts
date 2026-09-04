/**
 * Pure calculation engine for document lines and totals across sales and purchases
 */

export interface LineCalculationInput {
  quantity: number;
  unitPrice: number;
  discount?: number;
  vatRate?: number;
}

export interface LineCalculationResult {
  subtotal: number;
  discount: number;
  amountAfterDiscount: number;
  vatAmount: number;
  total: number;
}

export interface DocumentTotalsResult {
  subtotal: number;
  totalDiscount: number;
  totalVat: number;
  totalAmount: number;
}

/**
 * Calculates a single line item's subtotal, discount, VAT, and final total
 */
export function calculateLineItemTotal(item: LineCalculationInput): LineCalculationResult {
  const qty = Number(item.quantity) || 0;
  const unitPrice = Number(item.unitPrice) || 0;
  const discount = Math.max(0, Number(item.discount) || 0);
  const vatRate = Math.max(0, Number(item.vatRate) || 0);

  const subtotal = Math.round(qty * unitPrice * 100) / 100;
  const amountAfterDiscount = Math.max(0, subtotal - discount);
  const vatAmount = Math.round(((amountAfterDiscount * vatRate) / 100) * 100) / 100;
  const total = Math.round((amountAfterDiscount + vatAmount) * 100) / 100;

  return {
    subtotal,
    discount,
    amountAfterDiscount,
    vatAmount,
    total,
  };
}

/**
 * Calculates summary totals for a list of document items
 */
export function calculateDocumentTotals(items: LineCalculationInput[]): DocumentTotalsResult {
  let subtotal = 0;
  let totalDiscount = 0;
  let totalVat = 0;

  for (const item of items) {
    const line = calculateLineItemTotal(item);
    subtotal += line.subtotal;
    totalDiscount += line.discount;
    totalVat += line.vatAmount;
  }

  const totalAmount = Math.max(0, Math.round((subtotal - totalDiscount + totalVat) * 100) / 100);

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    totalDiscount: Math.round(totalDiscount * 100) / 100,
    totalVat: Math.round(totalVat * 100) / 100,
    totalAmount,
  };
}
