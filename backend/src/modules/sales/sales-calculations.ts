export interface SalesLineInput {
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  vatRate: number;
}

export interface SalesLineAmounts {
  subtotal: number;
  discountAmount: number;
  netAmount: number;
  vatAmount: number;
  totalAmount: number;
}

export interface SalesDocumentTotals {
  subtotalAmount: number;
  discountAmount: number;
  lineVatAmount: number;
  additionalChargeAmount: number;
  additionalChargeVatAmount: number;
  vatAmount: number;
  totalAmount: number;
  netRevenueAmount: number;
}

function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function calculateSalesLineAmounts(
  input: SalesLineInput,
): SalesLineAmounts {
  const { quantity, unitPrice, discountPercent, vatRate } = input;
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('Sales quantity must be greater than zero');
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    throw new Error('Sales unit price must be non-negative');
  }
  if (
    !Number.isFinite(discountPercent) ||
    discountPercent < 0 ||
    discountPercent > 100
  ) {
    throw new Error('Sales discount percent must be between 0 and 100');
  }
  if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) {
    throw new Error('VAT rate must be between 0 and 100');
  }

  const subtotal = roundMoney(quantity * unitPrice);
  const discountAmount = roundMoney((subtotal * discountPercent) / 100);
  const netAmount = roundMoney(subtotal - discountAmount);
  const vatAmount = roundMoney((netAmount * vatRate) / 100);
  return {
    subtotal,
    discountAmount,
    netAmount,
    vatAmount,
    totalAmount: roundMoney(netAmount + vatAmount),
  };
}

export function calculateSalesDocumentTotals(
  items: SalesLineInput[],
  additionalChargeAmount: number,
  additionalChargeVatRate: number,
): SalesDocumentTotals {
  if (!Number.isFinite(additionalChargeAmount) || additionalChargeAmount < 0) {
    throw new Error('Additional charge must be non-negative');
  }
  if (
    !Number.isFinite(additionalChargeVatRate) ||
    additionalChargeVatRate < 0 ||
    additionalChargeVatRate > 100
  ) {
    throw new Error('Additional charge VAT rate must be between 0 and 100');
  }

  const lines = items.map(calculateSalesLineAmounts);
  const subtotalAmount = roundMoney(
    lines.reduce((sum, line) => sum + line.subtotal, 0),
  );
  const discountAmount = roundMoney(
    lines.reduce((sum, line) => sum + line.discountAmount, 0),
  );
  const lineVatAmount = roundMoney(
    lines.reduce((sum, line) => sum + line.vatAmount, 0),
  );
  const charge = roundMoney(additionalChargeAmount);
  const additionalChargeVatAmount = roundMoney(
    (charge * additionalChargeVatRate) / 100,
  );
  const vatAmount = roundMoney(lineVatAmount + additionalChargeVatAmount);
  const netRevenueAmount = roundMoney(subtotalAmount - discountAmount + charge);

  return {
    subtotalAmount,
    discountAmount,
    lineVatAmount,
    additionalChargeAmount: charge,
    additionalChargeVatAmount,
    vatAmount,
    totalAmount: roundMoney(netRevenueAmount + vatAmount),
    netRevenueAmount,
  };
}

export function grossProfitInUzs(
  netRevenueAmount: number,
  currency: string,
  exchangeRate: number,
  cogsInUzs: number,
): number {
  if (!Number.isFinite(netRevenueAmount) || netRevenueAmount < 0) {
    throw new Error('Net revenue must be a non-negative amount');
  }
  if (!Number.isFinite(cogsInUzs) || cogsInUzs < 0) {
    throw new Error('COGS must be a non-negative UZS amount');
  }
  if (currency !== 'USD' && currency !== 'UZS') {
    throw new Error('Sales currency must be USD or UZS');
  }
  if (
    currency !== 'UZS' &&
    (!Number.isFinite(exchangeRate) || exchangeRate <= 0)
  ) {
    throw new Error(
      'A positive exchange rate is required for foreign-currency revenue',
    );
  }
  const rate = currency === 'UZS' ? 1 : exchangeRate;
  return roundMoney(netRevenueAmount * rate - cogsInUzs);
}
