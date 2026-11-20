import { SalesOrdersService } from './sales-orders.service';

/**
 * GET /api/sales/orders/by-counterparty/:id feeds the counterparty card's
 * "Jami summa". Orders in different currencies must not be added together
 * (ADR 0023), and the totals cover all of the customer's orders, not only
 * the page of orders returned with them.
 */
describe('sales orders by counterparty', () => {
  function serviceWith(page: unknown[], total: number, sums: unknown[]) {
    const groupBy = jest.fn().mockResolvedValue(sums);
    const service = Object.create(
      SalesOrdersService.prototype,
    ) as SalesOrdersService;
    (service as unknown as { prisma: unknown }).prisma = {
      salesOrder: { groupBy },
    };
    const findAll = jest.spyOn(service, 'findAll').mockResolvedValue({
      data: page,
      total,
      page: 1,
      pageSize: 50,
    } as Awaited<ReturnType<SalesOrdersService['findAll']>>);
    return { service, groupBy, findAll };
  }

  it('totals orders per currency, never across currencies', async () => {
    const { service, groupBy, findAll } = serviceWith(
      [{ id: 'o1' }, { id: 'o2' }, { id: 'o3' }],
      3,
      [
        { currency: 'USD', _sum: { totalAmount: 150.5 } },
        { currency: 'UZS', _sum: { totalAmount: 1_200_000 } },
      ],
    );

    const result = await service.findByCounterparty('tenant-1', 'cp-1');

    expect(findAll).toHaveBeenCalledWith('tenant-1', {
      counterpartyId: 'cp-1',
    });
    expect(groupBy).toHaveBeenCalledWith({
      by: ['currency'],
      where: { tenantId: 'tenant-1', counterpartyId: 'cp-1' },
      _sum: { totalAmount: true },
      orderBy: { currency: 'asc' },
    });
    expect(result.summary).toEqual({
      totalOrders: 3,
      totalsByCurrency: [
        { currency: 'USD', totalAmount: 150.5 },
        { currency: 'UZS', totalAmount: 1_200_000 },
      ],
    });
    expect(result.summary).not.toHaveProperty('totalAmount');
  });

  it('totals every order, not only the page that is listed', async () => {
    const page = Array.from({ length: 50 }, (_, i) => ({ id: `o${i}` }));
    const { service } = serviceWith(page, 120, [
      { currency: 'UZS', _sum: { totalAmount: 12_000_000 } },
    ]);

    const result = await service.findByCounterparty('tenant-1', 'cp-1');

    expect(result.orders).toHaveLength(50);
    expect(result.summary).toEqual({
      totalOrders: 120,
      totalsByCurrency: [{ currency: 'UZS', totalAmount: 12_000_000 }],
    });
  });
});
