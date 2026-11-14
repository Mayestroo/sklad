import { PurchaseDocStatus } from '@prisma/client';
import { AdditionalExpensesService } from './additional-expenses.service';

/**
 * F8 / ADR 0023: the additional-expense KPI totals used to sum USD and UZS
 * expenses into one number and label it with the first expense's currency,
 * or 'USD' when there was none. They are now one amount per currency.
 */
describe('AdditionalExpensesService.findAll stats (F8)', () => {
  function serviceWith(
    posted: Array<{ expenseType: string; amount: number; currency: string }>,
  ) {
    const prisma = {
      additionalExpense: {
        findMany: jest.fn((args: { where: { status?: string } }) =>
          Promise.resolve(
            args.where.status === PurchaseDocStatus.POSTED ? posted : [],
          ),
        ),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    return {
      prisma,
      service: new AdditionalExpensesService(
        prisma as never,
        {} as never,
        {} as never,
        {} as never,
      ),
    };
  }

  it('keeps each currency separate instead of summing USD and UZS', async () => {
    const { service } = serviceWith([
      { expenseType: 'TRANSPORT', amount: 100, currency: 'USD' },
      { expenseType: 'TRANSPORT', amount: 500000, currency: 'UZS' },
      { expenseType: 'CUSTOMS', amount: 200000, currency: 'UZS' },
      { expenseType: 'BROKER', amount: 50, currency: 'USD' },
    ]);
    const { stats } = await service.findAll('tenant-1', {});
    expect(stats).toEqual({
      transport: [
        { currency: 'UZS', amount: 500000 },
        { currency: 'USD', amount: 100 },
      ],
      customs: [{ currency: 'UZS', amount: 200000 }],
      broker: [{ currency: 'USD', amount: 50 }],
      all: [
        { currency: 'UZS', amount: 700000 },
        { currency: 'USD', amount: 150 },
      ],
    });
  });

  it('returns empty lists, not a guessed USD label, when nothing is posted', async () => {
    const { service, prisma } = serviceWith([]);
    const { stats } = await service.findAll('tenant-1', {});
    expect(stats).toEqual({ transport: [], customs: [], broker: [], all: [] });
    expect(prisma.additionalExpense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-1', status: PurchaseDocStatus.POSTED },
      }),
    );
  });
});
