import { BadRequestException } from '@nestjs/common';
import { ExpenseAllocationMethod, Prisma } from '@prisma/client';
import {
  AllocationTargetItem,
  convertAndAllocate,
  ConvertAndAllocateInput,
  documentRateToUzs,
} from './expense-allocation.engine';

const rateDate = new Date('2026-11-01T00:00:00Z');

function line(
  id: string,
  quantity: number,
  totalPrice: number,
  extra: Partial<AllocationTargetItem> = {},
): AllocationTargetItem {
  return {
    id,
    productId: `p-${id}`,
    quantity,
    unitPrice: totalPrice / quantity,
    totalPrice,
    ...extra,
  };
}

function run(overrides: Partial<ConvertAndAllocateInput>) {
  return convertAndAllocate({
    items: [line('a', 1, 100)],
    amount: 100,
    allocationMethod: ExpenseAllocationMethod.BY_AMOUNT,
    expense: { currency: 'UZS', exchangeRate: 1 },
    receipt: { currency: 'UZS', exchangeRate: 1 },
    rateDate,
    ...overrides,
  });
}

/** Sum a column with Decimal so the test itself adds no float drift. */
function sum(values: number[]): string {
  return values
    .reduce((s, v) => s.add(new Prisma.Decimal(v)), new Prisma.Decimal(0))
    .toFixed(2);
}

describe('convertAndAllocate', () => {
  describe('mixed currencies', () => {
    it('USD receipt, UZS expense: receipt share at the receipt rate, UZS share as is', () => {
      const result = run({
        items: [line('a', 3, 300), line('b', 3, 300), line('c', 3, 300)],
        amount: 100000,
        expense: { currency: 'UZS', exchangeRate: 1 },
        receipt: { currency: 'USD', exchangeRate: 12500 },
      });

      expect(result.rateSource).toBe('DOCUMENT');
      expect(result.expenseRate).toBe(1);
      expect(result.receiptRate).toBe(12500);
      expect(result.receiptTotal).toBe(8);
      expect(result.baseTotal).toBe(100000);
      expect(result.items.map((i) => i.allocatedAmount)).toEqual([
        33333.34, 33333.33, 33333.33,
      ]);
      expect(result.items.map((i) => i.receiptAmount)).toEqual([
        2.66, 2.67, 2.67,
      ]);
      expect(sum(result.items.map((i) => i.receiptAmount))).toBe('8.00');
      expect(sum(result.items.map((i) => i.baseAmount))).toBe('100000.00');
      // Per unit: receipt currency on the receipt line, UZS on the batch.
      expect(result.items[1].receiptUnitDelta).toBe(0.89);
      expect(result.items[1].baseUnitDelta).toBe(11111.11);
      // Landed cost stays in the receipt currency (USD 100 a unit + 0.89).
      expect(result.items[1].initialLandedCost).toBe(100);
      expect(result.items[1].newLandedCost).toBe(100.89);
    });

    it('UZS receipt, USD expense: UZS shares at the expense rate', () => {
      const result = run({
        items: [line('a', 7, 700), line('b', 7, 700), line('c', 7, 700)],
        amount: 10,
        expense: { currency: 'USD', exchangeRate: 12345.6789 },
        receipt: { currency: 'UZS', exchangeRate: 1 },
      });

      expect(result.receiptTotal).toBe(123456.79);
      expect(result.baseTotal).toBe(123456.79);
      expect(result.items.map((i) => i.allocatedAmount)).toEqual([
        3.34, 3.33, 3.33,
      ]);
      expect(sum(result.items.map((i) => i.allocatedAmount))).toBe('10.00');
      expect(sum(result.items.map((i) => i.receiptAmount))).toBe('123456.79');
      expect(sum(result.items.map((i) => i.baseAmount))).toBe('123456.79');
    });

    it('one currency converts 1:1 even when the documents carry different rates', () => {
      const result = run({
        items: [line('a', 4, 400)],
        amount: 10,
        expense: { currency: 'USD', exchangeRate: 12500 },
        receipt: { currency: 'USD', exchangeRate: 12000 },
      });

      expect(result.rateSource).toBe('SAME_CURRENCY');
      expect(result.receiptRate).toBe(12500);
      expect(result.items[0].receiptAmount).toBe(10);
      // UZS at the expense's own rate (ADR 0008), not the receipt's.
      expect(result.items[0].baseAmount).toBe(125000);
      expect(result.items[0].baseUnitDelta).toBe(31250);
    });

    it('never adds an expense-currency share to a receipt-currency cost', () => {
      // The old engine reported newLandedCost = 100 USD + 33333.33 UZS / 3.
      const result = run({
        items: [line('a', 3, 300)],
        amount: 33333.33,
        receipt: { currency: 'USD', exchangeRate: 12500 },
      });
      expect(result.items[0].newLandedCost).toBe(100.89);
    });
  });

  describe('rounding remainder', () => {
    it('goes on the line with the largest basis, not the largest amount', () => {
      // By quantity: line b has the most units, line a the largest amount.
      const result = run({
        items: [line('a', 1, 1000), line('b', 5, 50), line('c', 1, 10)],
        amount: 100,
        allocationMethod: ExpenseAllocationMethod.BY_QUANTITY,
      });
      // 100 / 7 = 14.2857…: 14.29, 71.43, 14.29 sums to 100.01; b takes -0.01.
      expect(result.remainderReceiptItemId).toBe('b');
      expect(result.items.map((i) => i.allocatedAmount)).toEqual([
        14.29, 71.42, 14.29,
      ]);
      expect(sum(result.items.map((i) => i.allocatedAmount))).toBe('100.00');
    });

    it('ties go to the first line', () => {
      const result = run({
        items: [line('a', 1, 100), line('b', 1, 100), line('c', 1, 100)],
        amount: 100,
      });
      expect(result.remainderReceiptItemId).toBe('a');
      expect(result.items.map((i) => i.allocatedAmount)).toEqual([
        33.34, 33.33, 33.33,
      ]);
    });

    it('every column adds up exactly to its total over many lines', () => {
      const items = Array.from({ length: 17 }, (_, i) =>
        line(`l${i}`, i + 1, (i + 1) * 13.37),
      );
      const result = run({
        items,
        amount: 987.65,
        expense: { currency: 'USD', exchangeRate: 12777.7777 },
        receipt: { currency: 'UZS', exchangeRate: 1 },
      });
      expect(sum(result.items.map((i) => i.allocatedAmount))).toBe('987.65');
      expect(sum(result.items.map((i) => i.receiptAmount))).toBe(
        result.receiptTotal.toFixed(2),
      );
      expect(sum(result.items.map((i) => i.baseAmount))).toBe(
        result.baseTotal.toFixed(2),
      );
    });

    it('rounds halves up', () => {
      // 0.05 split in two equal halves: 0.025 each rounds to 0.03, leftover -0.01 on a.
      const result = run({
        items: [line('a', 1, 1), line('b', 1, 1)],
        amount: 0.05,
      });
      expect(result.items.map((i) => i.allocatedAmount)).toEqual([0.02, 0.03]);
    });

    it('splits equally when no line has a basis', () => {
      const result = run({
        items: [line('a', 1, 0), line('b', 1, 0)],
        amount: 10,
      });
      expect(result.items.map((i) => i.allocatedAmount)).toEqual([5, 5]);
    });
  });

  describe('missing rate', () => {
    it('refuses a USD expense without a rate', () => {
      for (const exchangeRate of [null, undefined, 0, -1, '', 'abc']) {
        expect(() =>
          run({
            expense: { currency: 'USD', exchangeRate },
            receipt: { currency: 'UZS', exchangeRate: 1 },
          }),
        ).toThrow(BadRequestException);
      }
    });

    it('refuses a USD receipt without a rate when the expense is in UZS', () => {
      expect(() =>
        run({ receipt: { currency: 'USD', exchangeRate: 0 } }),
      ).toThrow(/курс USD не указан/);
    });

    it('refuses an unsupported currency instead of treating it as UZS', () => {
      expect(() =>
        run({ expense: { currency: 'EUR', exchangeRate: 14000 } }),
      ).toThrow(BadRequestException);
    });

    it('keeps the rate as stored (4 decimals)', () => {
      expect(
        documentRateToUzs(
          { currency: 'USD', exchangeRate: 12345.678949 },
          'expense',
        ).toString(),
      ).toBe('12345.6789');
    });
  });

  describe('sold quantity', () => {
    it('puts the sold part into COGS (UZS) and the rest into stock', () => {
      const result = run({
        items: [line('a', 10, 1000)],
        amount: 1000,
        batches: [{ productId: 'p-a', remainingQty: 6 }],
      });
      expect(result.items[0].soldQuantity).toBe(4);
      expect(result.items[0].baseUnitDelta).toBe(100);
      expect(result.items[0].cogsAdjustment).toBe(400);
      expect(result.items[0].stockAdjustment).toBe(600);
    });
  });

  it('refuses a BY_WEIGHT allocation with a line without weight', () => {
    expect(() =>
      run({
        items: [line('a', 1, 100, { weight: 0 })],
        allocationMethod: ExpenseAllocationMethod.BY_WEIGHT,
      }),
    ).toThrow(/Weight is not set/);
  });

  it('refuses a non-positive amount and an empty line list', () => {
    expect(() => run({ amount: 0 })).toThrow(BadRequestException);
    expect(() => run({ items: [] })).toThrow(BadRequestException);
  });
});
