import {
  calculateSalesDocumentTotals,
  calculateIncrementalLineAmounts,
  calculateSalesLineAmounts,
  grossProfitInUzs,
  prorateSourceLine,
  sumSalesDocumentTotals,
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

describe('partial shipments and returns add up exactly (plan T3.7)', () => {
  const line = { unitPrice: 10.05, discountPercent: 10, vatRate: 12 };
  const whole = calculateSalesLineAmounts({ ...line, quantity: 3 });

  it('two shipments of one order line sum to the whole line (1 + 2 of 3)', () => {
    const first = calculateIncrementalLineAmounts(line, 0, 1);
    const second = calculateIncrementalLineAmounts(line, 1, 2);
    const sum = (k: keyof typeof whole) =>
      Math.round((first[k] + second[k]) * 100) / 100;

    // Rounding each shipment on its own gave VAT 1.08 + 2.17 = 3.25, not 3.26.
    expect(whole.vatAmount).toBe(3.26);
    expect(sum('subtotal')).toBe(whole.subtotal);
    expect(sum('discountAmount')).toBe(whole.discountAmount);
    expect(sum('netAmount')).toBe(whole.netAmount);
    expect(sum('vatAmount')).toBe(whole.vatAmount);
    expect(sum('totalAmount')).toBe(whole.totalAmount);
  });

  it('a first shipment is the plain line calculation', () => {
    expect(calculateIncrementalLineAmounts(line, 0, 2)).toEqual(
      calculateSalesLineAmounts({ ...line, quantity: 2 }),
    );
  });

  it('header totals of a shipment are the sums of its line amounts', () => {
    const lines = [
      calculateIncrementalLineAmounts(line, 1, 2),
      calculateIncrementalLineAmounts(
        { unitPrice: 5, discountPercent: 0, vatRate: 0 },
        0,
        1,
      ),
    ];
    const totals = sumSalesDocumentTotals(lines, 10, 12);
    expect(totals.subtotalAmount).toBe(
      Math.round((lines[0].subtotal + lines[1].subtotal) * 100) / 100,
    );
    expect(totals.vatAmount).toBe(
      Math.round((lines[0].vatAmount + 1.2) * 100) / 100,
    );
    expect(totals.totalAmount).toBe(
      Math.round(
        (totals.subtotalAmount -
          totals.discountAmount +
          totals.additionalChargeAmount +
          totals.vatAmount) *
          100,
      ) / 100,
    );
  });

  it('three returns of one unit give back exactly the source line (612.16 incl. 65.50 VAT)', () => {
    const source = { quantity: 3, totalAmount: 612.16, vatAmount: 65.5 };
    const parts = [0, 1, 2].map((already) =>
      prorateSourceLine(source, already, 1),
    );
    const sum = (k: 'totalAmount' | 'vatAmount' | 'netAmount') =>
      Math.round(parts.reduce((s, p) => s + p[k], 0) * 100) / 100;

    expect(sum('totalAmount')).toBe(612.16);
    expect(sum('vatAmount')).toBe(65.5);
    expect(sum('netAmount')).toBe(546.66);
  });

  it('a partial return is the proportional share and cannot exceed the source quantity', () => {
    const source = { quantity: 2, totalAmount: 201.6, vatAmount: 21.6 };
    expect(prorateSourceLine(source, 0, 1)).toEqual({
      netAmount: 90,
      vatAmount: 10.8,
      totalAmount: 100.8,
    });
    expect(() => prorateSourceLine(source, 1, 2)).toThrow();
  });
});

describe('gross profit (plan T5.1, kept in UZS: see progress N4)', () => {
  it('converts USD net revenue at the document rate before subtracting UZS COGS', () => {
    // Net revenue USD 100 at 12,000 = 1,200,000 UZS; FIFO COGS 600,000 UZS.
    // 600,000 UZS is the plan's USD 50 at the document rate.
    expect(grossProfitInUzs(100, 'USD', 12_000, 600_000)).toBe(600_000);
    expect(grossProfitInUzs(100, 'USD', 12_000, 600_000) / 12_000).toBe(50);
  });

  it('does not convert UZS documents', () => {
    expect(grossProfitInUzs(1_000_000, 'UZS', 1, 600_000)).toBe(400_000);
  });

  it('excludes VAT: profit is taken on the net line amount', () => {
    const line = calculateSalesLineAmounts({
      quantity: 1,
      unitPrice: 100,
      discountPercent: 0,
      vatRate: 12,
    });
    expect(line.totalAmount).toBe(112);
    expect(grossProfitInUzs(line.netAmount, 'USD', 12_000, 600_000)).toBe(
      600_000,
    );
  });
});
