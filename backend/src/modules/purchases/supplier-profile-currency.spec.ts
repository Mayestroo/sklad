import { ExpenseAllocationMethod } from '@prisma/client';
import { PurchasesService } from './purchases.service';
import { ExpenseAllocationEngine } from './expense-allocation.engine';

/**
 * ADR 0023: the supplier profile keeps purchase, payment and return totals
 * per currency and counts posted documents only.
 */
describe('PurchasesService.getSupplierProfile totals', () => {
  it('splits totals by currency and ignores drafts', async () => {
    const prisma: any = {
      counterparty: {
        findFirst: jest.fn().mockResolvedValue({
          id: 's-1',
          name: 'S',
          debtBalance: 0,
          customerDebt: 0,
          supplierDebt: 0,
        }),
      },
      purchaseReceipt: {
        findMany: jest.fn().mockResolvedValue([
          { status: 'POSTED', currency: 'USD', totalAmount: 100 },
          { status: 'POSTED', currency: 'UZS', totalAmount: 500_000 },
          { status: 'DRAFT', currency: 'UZS', totalAmount: 999_999 },
        ]),
      },
      purchaseReturn: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { status: 'POSTED', currency: 'USD', totalAmount: 10 },
          ]),
      },
      financeTransaction: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ currency: 'USD', amount: 40 }]),
      },
      counterpartyBalance: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new PurchasesService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const { metrics } = await service.getSupplierProfile('t-1', 's-1');

    expect(metrics.totalPurchasedByCurrency).toEqual([
      { currency: 'USD', amount: 100 },
      { currency: 'UZS', amount: 500_000 },
    ]);
    expect(metrics.totalPurchased).toBe(0); // two currencies: no single total
    expect(metrics.totalPaidByCurrency).toEqual([
      { currency: 'USD', amount: 40 },
    ]);
    expect(metrics.totalPaid).toBe(40);
    expect(metrics.totalReturnedByCurrency).toEqual([
      { currency: 'USD', amount: 10 },
    ]);
  });
});

/** ADR 0022: allocation by weight never takes a missing weight as 1 kg. */
describe('BY_WEIGHT allocation', () => {
  const line = (weight: number | null, productWeight: number | null) => ({
    id: 'l',
    productId: 'p',
    product: { sku: 'SKU-1', weight: productWeight },
    quantity: 2,
    unitPrice: 10,
    totalPrice: 20,
    weight,
  });

  it('refuses a line without weight', () => {
    expect(() =>
      ExpenseAllocationEngine.computeBasisSum(
        [line(null, null)],
        ExpenseAllocationMethod.BY_WEIGHT,
      ),
    ).toThrow(/Weight is not set for product SKU-1/);
  });

  it('uses the line weight, else the product weight', () => {
    expect(
      ExpenseAllocationEngine.computeBasisSum(
        [line(0.5, null), line(null, 3)],
        ExpenseAllocationMethod.BY_WEIGHT,
      ),
    ).toBe(2 * 0.5 + 2 * 3);
  });

  it('other methods do not need weights', () => {
    expect(
      ExpenseAllocationEngine.computeBasisSum(
        [line(null, null)],
        ExpenseAllocationMethod.BY_AMOUNT,
      ),
    ).toBe(20);
  });
});
