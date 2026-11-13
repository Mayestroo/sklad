import 'reflect-metadata';
import { SalesOrderStatus } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from '../../../common/prisma';
import { StockReservationService } from '../../inventory/stock-reservation/stock-reservation.service';
import { CounterpartySettlementService } from '../../settlements/counterparty-settlement.service';
import { SettlementAllocationService } from '../../settlements/settlement-allocation.service';
import { FilterSalesOrdersDto } from '../dto/filter-sales-orders.dto';
import { SalesOrdersService } from './sales-orders.service';
import { JournalService } from '../../accounting/journal/journal.service';

function createService() {
  const prisma = {
    salesOrder: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
      aggregate: jest
        .fn()
        .mockResolvedValue({ _sum: { totalAmount: 0, paidAmount: 0 } }),
      fields: { totalAmount: 'salesOrder.totalAmount' },
    },
  };
  const service = new SalesOrdersService(
    prisma as unknown as PrismaService,
    {} as StockReservationService,
    {} as CounterpartySettlementService,
    {} as SettlementAllocationService,
    {} as JournalService,
  );
  return { prisma, service };
}

describe('sales order list contract', () => {
  it.each(Object.values(SalesOrderStatus))(
    'accepts status filter %s that the UI offers',
    async (status) => {
      const dto = plainToInstance(FilterSalesOrdersDto, { status });
      expect(await validate(dto)).toEqual([]);
    },
  );

  it('filters by payment status in the query, so paging and total agree', async () => {
    const { prisma, service } = createService();

    await service.findAll('tenant-1', { paymentStatus: 'UNPAID', take: 20 });

    const findManyArgs = prisma.salesOrder.findMany.mock.calls[0] as [
      { where: Record<string, unknown>; take: number },
    ];
    const countArgs = prisma.salesOrder.count.mock.calls[0] as [
      { where: Record<string, unknown> },
    ];
    expect(findManyArgs[0].where).toMatchObject({ paidAmount: 0 });
    expect(findManyArgs[0].take).toBe(20);
    expect(countArgs[0].where).toEqual(findManyArgs[0].where);
  });

  it('counts both ready-to-ship statuses and the warehouse stages', async () => {
    const { prisma, service } = createService();
    prisma.salesOrder.groupBy.mockResolvedValue([
      { status: SalesOrderStatus.READY_TO_SHIP, _count: { _all: 1 } },
      { status: SalesOrderStatus.READY_FOR_SHIPMENT, _count: { _all: 2 } },
      { status: SalesOrderStatus.ACCEPTED, _count: { _all: 3 } },
      { status: SalesOrderStatus.PROCESSING, _count: { _all: 4 } },
      { status: SalesOrderStatus.SHIPPED, _count: { _all: 5 } },
      { status: SalesOrderStatus.CANCELLED, _count: { _all: 6 } },
    ]);

    const stats = await service.getStats('tenant-1');

    expect(stats.readyToShip).toBe(3);
    expect(stats.accepted).toBe(3);
    expect(stats.processing).toBe(4);
    expect(stats.shipped).toBe(5);
    expect(stats.activeOrders).toBe(1 + 2 + 3 + 4);
  });
});
