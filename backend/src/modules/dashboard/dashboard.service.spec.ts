import { DashboardService } from './dashboard.service';

describe('DashboardService debt projection', () => {
  it('converts sales totals to UZS while keeping native totals grouped by currency', async () => {
    const date = new Date('2026-10-09T10:00:00.000Z');
    const prisma: any = {
      salesInvoice: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'uzs-invoice', invoiceDate: date, totalAmount: 2000000, status: 'POSTED', currency: 'UZS', exchangeRate: 1 },
          { id: 'usd-invoice', invoiceDate: date, totalAmount: 100, status: 'POSTED', currency: 'USD', exchangeRate: 12800 },
        ]),
      },
    };
    const service = new DashboardService(prisma);

    const result = await service.getSalesKPIs('tenant-1', {});

    expect(result.totalSales).toBe(3280000);
    expect(result.byCurrency).toEqual([
      { currency: 'UZS', amount: 2000000 },
      { currency: 'USD', amount: 100 },
    ]);
    expect(result.dynamics).toEqual([
      { period: date.toISOString().slice(0, 10), amount: 3280000 },
    ]);
  });

  it('keeps gross profit KPIs in UZS and excludes unposted invoices', async () => {
    const date = new Date('2026-10-09T10:00:00.000Z');
    const prisma: any = {
      financeTransaction: { findMany: jest.fn().mockResolvedValue([]) },
      cashAccount: { findMany: jest.fn().mockResolvedValue([]) },
      salesInvoice: {
        findMany: jest.fn().mockResolvedValue([
          { totalAmount: 110, vatAmount: 10, totalCogs: 600000, grossProfit: 600000, currency: 'USD', exchangeRate: 12000 },
        ]),
      },
    };
    const service = new DashboardService(prisma);

    const result = await service.getFinanceKPIs('tenant-1', {});

    expect(prisma.salesInvoice.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'POSTED' }),
    }));
    expect(result.profit).toEqual({
      grossProfit: 600000,
      netProfit: 600000,
      revenue: 1320000,
      cogs: 600000,
    });
  });

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
      total: 110,
      byCurrency: [{ currency: 'USD', amount: 110 }],
      advancesByCurrency: [{ currency: 'USD', amount: 30 }],
      topDebtors: [
        { id: 'cp-1', name: 'Customer One', amount: 100, currency: 'USD' },
        { id: 'cp-3', name: 'Partner Three', amount: 10, currency: 'USD' },
      ],
    });
    expect(result.payable).toMatchObject({
      total: 200000,
      byCurrency: [{ currency: 'UZS', amount: 200000 }],
      advancesByCurrency: [{ currency: 'USD', amount: 40 }],
      topCreditors: [{ id: 'cp-2', name: 'Supplier Two', amount: 200000, currency: 'UZS' }],
    });
  });

  it('keeps finance KPI activity separate by cash account and transfer currency', async () => {
    const accounts = [
      {
        id: 'uzs-cash',
        accountType: 'UZS_CASH',
        name: { uz: 'UZS kassa', ru: 'UZS касса' },
        currency: 'UZS',
        balance: 0,
      },
      {
        id: 'usd-bank',
        accountType: 'BANK',
        name: { uz: 'USD bank', ru: 'USD банк' },
        currency: 'USD',
        balance: 10,
      },
      {
        id: 'uzs-bank',
        accountType: 'BANK',
        name: { uz: 'UZS bank', ru: 'UZS банк' },
        currency: 'UZS',
        balance: 0,
      },
    ];
    const prisma: any = {
      financeTransaction: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'tx-transfer',
            direction: 'TRANSFER',
            amount: 128000,
            currency: 'UZS',
            accountId: 'uzs-cash',
            account: accounts[0],
            transferToId: 'usd-bank',
            transferToAmount: 10,
            transferToAccount: accounts[1],
          },
          {
            id: 'tx-expense',
            direction: 'EXPENSE',
            amount: 100000,
            currency: 'UZS',
            accountId: 'uzs-bank',
            account: accounts[2],
            transferToId: null,
            transferToAmount: null,
            transferToAccount: null,
          },
        ]),
      },
      cashAccount: { findMany: jest.fn().mockResolvedValue(accounts) },
      salesInvoice: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new DashboardService(prisma);

    const result = await service.getFinanceKPIs('tenant-1', {});

    expect(result.summaryByAccount).toEqual([
      expect.objectContaining({
        accountId: 'uzs-cash', currency: 'UZS', transferOut: 128000, netCashFlow: -128000,
      }),
      expect.objectContaining({
        accountId: 'usd-bank', currency: 'USD', transferIn: 10, netCashFlow: 10,
      }),
      expect.objectContaining({
        accountId: 'uzs-bank', currency: 'UZS', totalExpense: 100000, netCashFlow: -100000,
      }),
    ]);

    const usdResult = await service.getFinanceKPIs('tenant-1', { currency: 'USD' });
    expect(usdResult.summaryByAccount).toEqual([
      expect.objectContaining({ accountId: 'usd-bank', currency: 'USD', transferIn: 10 }),
    ]);
  });
});
