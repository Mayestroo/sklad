import { DashboardService } from './dashboard.service';

describe('DashboardService debt projection', () => {
  it('groups receivables, payables, and advances without combining currencies', async () => {
    const prisma: any = {
      counterpartyBalance: {
        findMany: jest.fn().mockResolvedValue([
          {
            counterpartyId: 'cp-1',
            currency: 'USD',
            customerDebt: 100,
            supplierDebt: 0,
            counterparty: { name: 'Customer One' },
          },
          {
            counterpartyId: 'cp-2',
            currency: 'UZS',
            customerDebt: 0,
            supplierDebt: 200000,
            counterparty: { name: 'Supplier Two' },
          },
          {
            counterpartyId: 'cp-3',
            currency: 'USD',
            customerDebt: -30,
            supplierDebt: -40,
            counterparty: { name: 'Partner Three' },
          },
        ]),
      },
    };
    const service = new DashboardService(prisma);

    const result = await service.getDebts('tenant-1');

    expect(result.receivable).toMatchObject({
      total: 100,
      byCurrency: [{ currency: 'USD', amount: 100 }],
      advancesByCurrency: [{ currency: 'USD', amount: 30 }],
      topDebtors: [{ id: 'cp-1', name: 'Customer One', amount: 100, currency: 'USD' }],
    });
    expect(result.payable).toMatchObject({
      total: 200000,
      byCurrency: [{ currency: 'UZS', amount: 200000 }],
      advancesByCurrency: [{ currency: 'USD', amount: 40 }],
      topCreditors: [{ id: 'cp-2', name: 'Supplier Two', amount: 200000, currency: 'UZS' }],
    });
  });
});
