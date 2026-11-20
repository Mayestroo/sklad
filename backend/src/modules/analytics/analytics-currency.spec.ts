import { BadRequestException } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { analyticsRangeStart } from './analytics-range';

/**
 * ADR 0023 / 0022 for analytics: amounts in different currencies are
 * converted at each document's posted rate (never added as they are, never
 * at a rate of 1), only posted documents count, the selected period is
 * applied, and a ratio that cannot be computed is null, not a default.
 */
function prismaWith(overrides: Record<string, unknown> = {}): any {
  return {
    salesInvoice: { findMany: jest.fn().mockResolvedValue([]) },
    salesInvoiceItem: { findMany: jest.fn().mockResolvedValue([]) },
    salesReturn: { findMany: jest.fn().mockResolvedValue([]) },
    counterpartyBalance: { findMany: jest.fn().mockResolvedValue([]) },
    productBatch: { findMany: jest.fn().mockResolvedValue([]) },
    ...overrides,
  };
}

const usdItem = {
  quantity: 2,
  totalPrice: 100, // USD
  invoice: { currency: 'USD', exchangeRate: 12_000 },
  product: {
    id: 'p-usd',
    name: { uz: 'A' },
    sku: 'A',
    unitOfMeasure: 'pcs',
    category: null,
  },
};
const uzsItem = {
  quantity: 1,
  totalPrice: 600_000, // UZS
  invoice: { currency: 'UZS', exchangeRate: 1 },
  product: {
    id: 'p-uzs',
    name: { uz: 'B' },
    sku: 'B',
    unitOfMeasure: 'pcs',
    category: null,
  },
};

describe('analytics currency handling', () => {
  it('top products convert each line to UZS at its own rate', async () => {
    const prisma = prismaWith({
      salesInvoiceItem: {
        findMany: jest.fn().mockResolvedValue([uzsItem, usdItem]),
      },
    });
    const result = await new AnalyticsService(prisma).getTopProducts(
      't-1',
      10,
      'month',
    );

    expect(
      result.map((p) => [p.productId, p.totalRevenue, p.currency]),
    ).toEqual([
      ['p-usd', 1_200_000, 'UZS'],
      ['p-uzs', 600_000, 'UZS'],
    ]);
    const where = prisma.salesInvoiceItem.findMany.mock.calls[0][0].where;
    expect(where.invoice.status).toBe('POSTED');
    expect(where.invoice.invoiceDate.gte).toEqual(analyticsRangeStart('month'));
  });

  it('category shares are computed from UZS amounts', async () => {
    const prisma = prismaWith({
      salesInvoiceItem: {
        findMany: jest.fn().mockResolvedValue([uzsItem, usdItem]),
      },
    });
    const [only] = await new AnalyticsService(prisma).getCategoryBreakdown(
      't-1',
    );
    expect(only).toMatchObject({
      revenue: 1_800_000,
      percentage: 100,
      currency: 'UZS',
    });
  });

  it('a foreign invoice without a rate fails instead of counting at 1', async () => {
    const prisma = prismaWith({
      salesInvoiceItem: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { ...usdItem, invoice: { currency: 'USD', exchangeRate: 0 } },
          ]),
      },
    });
    await expect(
      new AnalyticsService(prisma).getTopProducts('t-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('top clients and the trend use posted invoices in UZS', async () => {
    const invoices = [
      {
        id: 'i1',
        invoiceDate: new Date('2026-11-02'),
        totalAmount: 100,
        vatAmount: 0,
        totalCogs: 900_000,
        currency: 'USD',
        exchangeRate: 12_000,
        counterparty: { id: 'c1', name: 'X', inn: null },
      },
      {
        id: 'i2',
        invoiceDate: new Date('2026-11-05'),
        totalAmount: 500_000,
        vatAmount: 0,
        totalCogs: 300_000,
        currency: 'UZS',
        exchangeRate: 1,
        counterparty: { id: 'c1', name: 'X', inn: null },
      },
    ];
    const prisma = prismaWith({
      salesInvoice: { findMany: jest.fn().mockResolvedValue(invoices) },
    });
    const service = new AnalyticsService(prisma);

    const [client] = await service.getTopClients('t-1');
    expect(client).toMatchObject({
      totalSpent: 1_700_000,
      invoiceCount: 2,
      currency: 'UZS',
    });

    const [month] = await service.getSalesTrend('t-1');
    expect(month).toMatchObject({
      period: '2026-11',
      revenue: 1_700_000,
      cogs: 1_200_000,
      profit: 500_000,
    });
    expect(prisma.salesInvoice.findMany.mock.calls[0][0].where.status).toBe(
      'POSTED',
    );
  });

  it('inventory is valued at FIFO landed cost', async () => {
    const prisma = prismaWith({
      productBatch: {
        findMany: jest.fn().mockResolvedValue([
          { remainingQty: 3, landedCost: 10_000 },
          { remainingQty: 1.5, landedCost: 2_000 },
        ]),
      },
    });
    const kpi = await new AnalyticsService(prisma).getKpiSummary('t-1');
    expect(kpi.inventoryValuation).toBe(33_000);
  });

  it('ratios that cannot be computed are null, not invented', async () => {
    const prisma = prismaWith({
      counterpartyBalance: {
        findMany: jest.fn().mockResolvedValue([
          {
            counterpartyId: 'c1',
            currency: 'USD',
            customerDebt: 50,
            supplierDebt: 0,
          },
        ]),
      },
    });
    const ratios = await new AnalyticsService(prisma).getFinancialRatios('t-1');
    expect(ratios).toEqual({
      currency: 'UZS',
      workingCapital: null, // a USD debt has no rate here
      inventoryTurnoverDays: null, // no COGS this year
      arCollectionDays: null, // receivables in USD, no revenue
    });
  });

  it('rejects an unknown period', () => {
    expect(() => analyticsRangeStart('decade')).toThrow(BadRequestException);
    expect(analyticsRangeStart(undefined)).toBeUndefined();
  });
});
