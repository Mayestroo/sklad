import { SalesOrdersController } from './sales-orders.controller';
import { SalesOrdersService } from './sales-orders.service';

/**
 * GET /api/sales/orders/by-counterparty/:id feeds the counterparty card's
 * "Jami summa". Orders in different currencies must not be added together
 * (ADR 0023): the summary gives one total per currency.
 */
describe('sales orders by counterparty', () => {
  const orders = [
    { id: 'o1', currency: 'USD', totalAmount: 100 },
    { id: 'o2', currency: 'UZS', totalAmount: 1_200_000 },
    { id: 'o3', currency: 'USD', totalAmount: 50.5 },
  ];
  const findAll = jest.fn().mockResolvedValue({ data: orders, total: 3 });
  const controller = new SalesOrdersController({
    findAll,
  } as unknown as SalesOrdersService);

  it('totals orders per currency, never across currencies', async () => {
    const result = await controller.findByCounterparty('tenant-1', 'cp-1');

    expect(findAll).toHaveBeenCalledWith('tenant-1', {
      counterpartyId: 'cp-1',
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
});
