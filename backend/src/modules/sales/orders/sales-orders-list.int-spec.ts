import { useTestDatabase } from '../../../../test/use-test-database';
useTestDatabase();

import { PrismaService } from '../../../common/prisma';
import { StockReservationService } from '../../inventory/stock-reservation/stock-reservation.service';
import { CounterpartySettlementService } from '../../settlements/counterparty-settlement.service';
import { SettlementAllocationService } from '../../settlements/settlement-allocation.service';
import { SalesOrdersService } from './sales-orders.service';
import { JournalService } from '../../accounting/journal/journal.service';

describe('sales order list queries (real database)', () => {
  const prisma = new PrismaService();
  const service = new SalesOrdersService(
    prisma,
    {} as StockReservationService,
    {} as CounterpartySettlementService,
    {} as SettlementAllocationService,
    {} as JournalService,
  );

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it.each(['PAID', 'PARTIALLY_PAID', 'UNPAID'] as const)(
    'runs the %s payment filter as SQL',
    async (paymentStatus) => {
      const result = await service.findAll('no-such-tenant', { paymentStatus });
      expect(result).toMatchObject({ data: [], total: 0 });
    },
  );

  it('computes pipeline stats with one grouped query', async () => {
    const stats = await service.getStats('no-such-tenant');
    expect(stats.activeOrders).toBe(0);
  });
});
