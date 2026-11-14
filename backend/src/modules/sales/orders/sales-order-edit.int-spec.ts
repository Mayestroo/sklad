/**
 * Integration test (real Postgres, DATABASE_URL_TEST). F9: editing a sales
 * order (header, lines, stock reservations, totals) is one transaction under
 * a row lock on the order. A failure in the middle leaves the order, its
 * lines, its reservations and the stock level's reserved quantity unchanged.
 */
import { useTestDatabase } from '../../../../test/use-test-database';
useTestDatabase();

import { randomUUID } from 'crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SalesOrderStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma';
import { AccountsService } from '../../accounting/accounts/accounts.service';
import { JournalService } from '../../accounting/journal/journal.service';
import { StockReservationService } from '../../inventory/stock-reservation/stock-reservation.service';
import { CounterpartySettlementService } from '../../settlements/counterparty-settlement.service';
import { SettlementAllocationService } from '../../settlements/settlement-allocation.service';
import { SalesOrdersService } from './sales-orders.service';

describe('Sales order edit is atomic (F9, integration)', () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let orders: SalesOrdersService;
  let reservations: StockReservationService;
  let tenantId: string;
  let otherTenantId: string;
  let counterpartyId: string;
  let warehouseId: string;
  let productId: string;
  let userId: string;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        PrismaService,
        AccountsService,
        JournalService,
        StockReservationService,
        CounterpartySettlementService,
        SettlementAllocationService,
        SalesOrdersService,
      ],
    }).compile();
    prisma = module.get(PrismaService);
    orders = module.get(SalesOrdersService);
    reservations = module.get(StockReservationService);

    const runId = randomUUID().slice(0, 8);
    const company = (slug: string) =>
      prisma.company.create({
        data: { name: { uz: slug, ru: slug }, slug: slug + '-' + runId },
      });
    tenantId = (await company('order-edit')).id;
    otherTenantId = (await company('order-edit-other')).id;
    warehouseId = (
      await prisma.warehouse.create({
        data: { tenantId, name: { uz: 'Ombor', ru: 'Склад' } },
      })
    ).id;
    counterpartyId = (
      await prisma.counterparty.create({
        data: { tenantId, name: 'Mijoz', type: 'CUSTOMER' },
      })
    ).id;
    productId = (
      await prisma.product.create({
        data: {
          tenantId,
          name: { uz: 'Tovar', ru: 'Товар' },
          sku: 'OE-' + runId,
        },
      })
    ).id;
    userId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: 'order-edit-' + runId + '@sklad.test',
          passwordHash: 'hashed',
          firstName: 'Test',
          lastName: 'User',
        },
      })
    ).id;
    await prisma.stockLevel.create({
      data: { tenantId, warehouseId, productId, quantity: 100 },
    });
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await prisma.company.delete({ where: { id: tenantId } });
    await prisma.company.delete({ where: { id: otherTenantId } });
    await prisma.$disconnect();
    await module.close();
  });

  const createOrder = async () => {
    // Start each test from a known reserved quantity (orders share the stock level).
    const order = await orders.create(tenantId, userId, ['OWNER'], {
      counterpartyId,
      warehouseId,
      currency: 'UZS',
      items: [{ productId, quantity: 2, unitPrice: 100 }],
    } as never);
    return order;
  };
  const edit = (id: string, quantity: number, tenant = tenantId) =>
    orders.update(tenant, userId, id, {
      items: [
        { productId, quantity, unitPrice: 100, discount: 10, vatRate: 12 },
      ] as never,
    });

  /** Everything an edit touches, for before/after comparison. */
  async function snapshot(orderId: string) {
    const order = await prisma.salesOrder.findFirstOrThrow({
      where: { id: orderId },
      include: { items: { orderBy: { id: 'asc' } } },
    });
    const orderReservations = await prisma.stockReservation.findMany({
      where: { orderId },
    });
    return {
      status: order.status,
      totalAmount: Number(order.totalAmount),
      vatAmount: Number(order.vatAmount),
      warehouseId: order.warehouseId,
      lines: order.items.map((item) => ({
        id: item.id,
        quantity: Number(item.quantity),
        reservedQty: Number(item.reservedQty),
      })),
      reserved: orderReservations.reduce((s, r) => s + Number(r.quantity), 0),
    };
  }
  const reservedOnStockLevel = async () =>
    Number(
      (
        await prisma.stockLevel.findFirstOrThrow({
          where: { tenantId, warehouseId, productId },
        })
      ).reservedQuantity,
    );
  const reservedByAllOrders = async () =>
    (
      await prisma.stockReservation.findMany({
        where: { tenantId, warehouseId, productId },
      })
    ).reduce((s, r) => s + Number(r.quantity), 0);

  it('a successful edit replaces lines, totals and reservations as before', async () => {
    const order = await createOrder();
    const levelBefore = await reservedOnStockLevel();

    const edited = await edit(order.id, 3);

    expect(edited.orderNumber).toBe(order.orderNumber);
    // 3 x 100 - 10% = 270, + 12% VAT = 302.4
    expect(Number(edited.totalAmount)).toBe(302.4);
    const after = await snapshot(order.id);
    expect(after.lines).toHaveLength(1);
    expect(after.lines[0]).toMatchObject({ quantity: 3, reservedQty: 3 });
    expect(after.reserved).toBe(3);
    expect(await reservedOnStockLevel()).toBe(levelBefore - 2 + 3);
    expect(await reservedOnStockLevel()).toBe(await reservedByAllOrders());
  });

  it('a failure after the lines are rewritten rolls the whole edit back', async () => {
    const order = await createOrder();
    const before = await snapshot(order.id);
    const levelBefore = await reservedOnStockLevel();
    jest
      .spyOn(reservations, 'reserveStockForOrder')
      .mockRejectedValueOnce(new Error('injected failure while reserving'));

    await expect(edit(order.id, 5)).rejects.toThrow('injected failure');

    expect(await snapshot(order.id)).toEqual(before);
    expect(await reservedOnStockLevel()).toBe(levelBefore);
  });

  it('an order without a warehouse is refused before anything is changed', async () => {
    const order = await createOrder();
    // Release first so the stock level stays consistent with the reservations.
    await reservations.releaseOrderReservations(tenantId, order.id);
    await prisma.salesOrder.update({
      where: { id: order.id },
      data: { warehouseId: null },
    });
    const before = await snapshot(order.id);
    const levelBefore = await reservedOnStockLevel();

    await expect(edit(order.id, 4)).rejects.toThrow(BadRequestException);

    expect(await snapshot(order.id)).toEqual(before);
    expect(await reservedOnStockLevel()).toBe(levelBefore);
  });

  it('re-checks the status inside the transaction (order approved meanwhile)', async () => {
    const order = await createOrder();
    // The warehouse check runs before the transaction; approve the order there,
    // as a concurrent approval committing between the first read and the write.
    const svc = orders as unknown as {
      requireTenantWarehouse: (...args: unknown[]) => Promise<void>;
    };
    const original = svc.requireTenantWarehouse.bind(orders);
    jest
      .spyOn(svc, 'requireTenantWarehouse')
      .mockImplementationOnce(async (...args: unknown[]) => {
        await original(...args);
        await prisma.salesOrder.update({
          where: { id: order.id },
          data: { status: SalesOrderStatus.APPROVED },
        });
      });
    const before = await snapshot(order.id);

    await expect(
      orders.update(tenantId, userId, order.id, {
        warehouseId,
        items: [{ productId, quantity: 6, unitPrice: 100 }] as never,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(await snapshot(order.id)).toEqual({
      ...before,
      status: SalesOrderStatus.APPROVED,
    });
  });

  it('two concurrent edits of one order leave it consistent (the second waits)', async () => {
    const order = await createOrder();
    const levelBefore = await reservedOnStockLevel();

    const results = await Promise.allSettled([
      edit(order.id, 3),
      edit(order.id, 4),
    ]);

    // Both run one after the other under the row lock; the last one wins.
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    const after = await snapshot(order.id);
    expect(after.lines).toHaveLength(1);
    const quantity = after.lines[0].quantity;
    expect([3, 4]).toContain(quantity);
    expect(after.lines[0].reservedQty).toBe(quantity);
    expect(after.reserved).toBe(quantity);
    expect(after.totalAmount).toBe(
      Math.round(quantity * 90 * 1.12 * 100) / 100,
    );
    expect(await reservedOnStockLevel()).toBe(levelBefore - 2 + quantity);
    expect(await reservedOnStockLevel()).toBe(await reservedByAllOrders());
  });

  it("another tenant's order cannot be edited", async () => {
    const order = await createOrder();
    const before = await snapshot(order.id);

    await expect(edit(order.id, 7, otherTenantId)).rejects.toThrow(
      NotFoundException,
    );

    expect(await snapshot(order.id)).toEqual(before);
  });
});
