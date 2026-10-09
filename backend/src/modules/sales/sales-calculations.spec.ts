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
});
