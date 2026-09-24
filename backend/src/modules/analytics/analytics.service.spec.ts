import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  it('uses per-currency settlement projections and reports advances separately', async () => {
    const prisma: any = {
      salesInvoice: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
      counterpartyBalance: {
        findMany: jest.fn().mockResolvedValue([
          { counterpartyId: 'cp-1', currency: 'USD', customerDebt: 100, supplierDebt: 25 },
          { counterpartyId: 'cp-2', currency: 'UZS', customerDebt: -40, supplierDebt: -15 },
        ]),
      },
      stockLevel: { findMany: jest.fn().mockResolvedValue([]) },
      purchaseReceipt: { findFirst: jest.fn().mockResolvedValue(null) },
      company: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new AnalyticsService(prisma);

    const result = await service.getKpiSummary('tenant-1');

    expect(result.totalAccountsReceivable).toBe(100);
    expect(result.totalAccountsPayable).toBe(25);
    expect(result.receivablesByCurrency).toEqual([{ currency: 'USD', amount: 100 }]);
    expect(result.payablesByCurrency).toEqual([{ currency: 'USD', amount: 25 }]);
    expect(result.customerAdvancesByCurrency).toEqual([{ currency: 'UZS', amount: 40 }]);
    expect(result.supplierAdvancesByCurrency).toEqual([{ currency: 'UZS', amount: 15 }]);
    expect(prisma.counterpartyBalance.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-1' } }));
  });
});
