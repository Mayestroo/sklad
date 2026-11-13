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
  return sumSalesDocumentTotals(
    items.map(calculateSalesLineAmounts),
    additionalChargeAmount,
    additionalChargeVatRate,
  );
}

/** Header totals from line amounts already calculated (header = sum of lines). */
export function sumSalesDocumentTotals(
  lines: SalesLineAmounts[],
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

const ZERO_LINE: SalesLineAmounts = {
  subtotal: 0,
  discountAmount: 0,
  netAmount: 0,
  vatAmount: 0,
  totalAmount: 0,
};

/**
 * The amounts of shipping `quantity` more of an order line after
 * `alreadyQuantity` has been shipped: the line amounts at the new cumulative
 * quantity minus those at the old one. Shipments of one line therefore add
 * up to the whole line exactly, however it is split (plan T3.7); rounding
 * each shipment on its own could leave a cent over or short.
 */
export function calculateIncrementalLineAmounts(
  line: Omit<SalesLineInput, 'quantity'>,
  alreadyQuantity: number,
  quantity: number,
): SalesLineAmounts {
  if (!Number.isFinite(alreadyQuantity) || alreadyQuantity < 0) {
    throw new Error('Already shipped quantity must be non-negative');
  }
  const before =
    alreadyQuantity > 0
      ? calculateSalesLineAmounts({ ...line, quantity: alreadyQuantity })
      : ZERO_LINE;
  const after = calculateSalesLineAmounts({
    ...line,
    quantity: alreadyQuantity + quantity,
  });
  return {
    subtotal: roundMoney(after.subtotal - before.subtotal),
    discountAmount: roundMoney(after.discountAmount - before.discountAmount),
    netAmount: roundMoney(after.netAmount - before.netAmount),
    vatAmount: roundMoney(after.vatAmount - before.vatAmount),
    totalAmount: roundMoney(after.totalAmount - before.totalAmount),
  };
}

export interface SourceLineAmounts {
  quantity: number;
  /** VAT-inclusive line total. */
  totalAmount: number;
  vatAmount: number;
}

/**
 * The share of a source (invoice) line for returning `quantity` more after
 * `alreadyQuantity` was returned: cumulative proration differenced, so
 * returns of one line give back exactly the line's total and VAT once the
 * whole quantity is back (plan T3.7).
 */
export function prorateSourceLine(
  source: SourceLineAmounts,
  alreadyQuantity: number,
  quantity: number,
): { netAmount: number; vatAmount: number; totalAmount: number } {
  const sold = source.quantity;
  if (!Number.isFinite(sold) || sold <= 0) {
    throw new Error('Source line quantity must be greater than zero');
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('Return quantity must be greater than zero');
  }
  if (
    !Number.isFinite(alreadyQuantity) ||
    alreadyQuantity < 0 ||
    alreadyQuantity + quantity > sold + 0.0005
  ) {
    throw new Error('Return quantity exceeds the source line quantity');
  }
  const share = (amount: number, qty: number) =>
    qty >= sold - 0.0005
      ? roundMoney(amount)
      : roundMoney((amount * qty) / sold);
  const after = alreadyQuantity + quantity;
  const totalAmount = roundMoney(
    share(source.totalAmount, after) -
      share(source.totalAmount, alreadyQuantity),
  );
  const vatAmount = roundMoney(
    share(source.vatAmount, after) - share(source.vatAmount, alreadyQuantity),
  );
  return {
    netAmount: roundMoney(totalAmount - vatAmount),
    vatAmount,
    totalAmount,
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
