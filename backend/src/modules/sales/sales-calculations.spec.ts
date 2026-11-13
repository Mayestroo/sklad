import {
  calculateSalesDocumentTotals,
  calculateSalesLineAmounts,
  grossProfitInUzs,
} from './sales-calculations';

describe('sales calculations', () => {
  it('calculates percentage discount and VAT on the discounted line amount', () => {
    expect(
      calculateSalesLineAmounts({
        quantity: 2,
        unitPrice: 100_000,
        discountPercent: 10,
        vatRate: 12,
      }),
    ).toEqual({
      subtotal: 200_000,
      discountAmount: 20_000,
      netAmount: 180_000,
      vatAmount: 21_600,
      totalAmount: 201_600,
    });
  });

  it('includes taxable customer-billed charges in a sales document total', () => {
    expect(
      calculateSalesDocumentTotals(
        [{ quantity: 2, unitPrice: 100_000, discountPercent: 10, vatRate: 12 }],
        50_000,
        12,
      ),
    ).toEqual({
      subtotalAmount: 200_000,
      discountAmount: 20_000,
      lineVatAmount: 21_600,
      additionalChargeAmount: 50_000,
      additionalChargeVatAmount: 6_000,
      vatAmount: 27_600,
      totalAmount: 257_600,
      netRevenueAmount: 230_000,
    });
  });

  it('reports gross profit in base UZS after converting foreign-currency revenue', () => {
    expect(grossProfitInUzs(230_000, 'USD', 12_500, 34_300)).toBe(
      2_874_965_700,
    );
  });

  it('uses the plan example: 2 x 100, 10% discount, 12% VAT -> 201.6', () => {
    expect(
      calculateSalesLineAmounts({
        quantity: 2,
        unitPrice: 100,
        discountPercent: 10,
        vatRate: 12,
      }),
    ).toEqual({
      subtotal: 200,
      discountAmount: 20,
      netAmount: 180,
      vatAmount: 21.6,
      totalAmount: 201.6,
    });
  });

  it('adds no VAT at a zero rate', () => {
    expect(
      calculateSalesLineAmounts({
        quantity: 3,
        unitPrice: 50,
        discountPercent: 10,
        vatRate: 0,
      }),
    ).toEqual({
      subtotal: 150,
      discountAmount: 15,
      netAmount: 135,
      vatAmount: 0,
      totalAmount: 135,
    });
  });

  it('a 100% discount leaves nothing to tax or pay', () => {
    expect(
      calculateSalesLineAmounts({
        quantity: 2,
        unitPrice: 100,
        discountPercent: 100,
        vatRate: 12,
      }),
    ).toEqual({
      subtotal: 200,
      discountAmount: 200,
      netAmount: 0,
      vatAmount: 0,
      totalAmount: 0,
    });
  });

  it('header totals are the sums of the line amounts', () => {
    const lines = [
      { quantity: 2, unitPrice: 100, discountPercent: 10, vatRate: 12 },
      { quantity: 1, unitPrice: 33.33, discountPercent: 0, vatRate: 0 },
      { quantity: 7, unitPrice: 9.99, discountPercent: 100, vatRate: 12 },
    ];
    const amounts = lines.map(calculateSalesLineAmounts);
    const sum = (key: keyof (typeof amounts)[number]) =>
      Math.round(amounts.reduce((s, a) => s + a[key], 0) * 100) / 100;
    const totals = calculateSalesDocumentTotals(lines, 0, 12);

    expect(totals.subtotalAmount).toBe(sum('subtotal'));
    expect(totals.discountAmount).toBe(sum('discountAmount'));
    expect(totals.vatAmount).toBe(sum('vatAmount'));
    expect(totals.totalAmount).toBe(sum('totalAmount'));
    expect(totals.totalAmount).toBe(
      Math.round(
        (totals.subtotalAmount - totals.discountAmount + totals.vatAmount) *
          100,
      ) / 100,
    );
  });

  it('rejects a discount outside 0-100', () => {
    expect(() =>
      calculateSalesLineAmounts({
        quantity: 1,
        unitPrice: 10,
        discountPercent: 101,
        vatRate: 0,
      }),
    ).toThrow();
  });
});
