import { Test, TestingModule } from '@nestjs/testing';
import { SalesOrdersService } from './sales-orders.service';
import { PrismaService } from '../../../common/prisma';
import { StockReservationService } from '../../inventory/stock-reservation/stock-reservation.service';
import { CounterpartySettlementService } from '../../settlements/counterparty-settlement.service';
import { SettlementAllocationService } from '../../settlements/settlement-allocation.service';
import {
  SalesOrderStatus,
  PaymentCondition,
  ProductionOrderStatus,
  SalesPaymentStatus,
} from '@prisma/client';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AccountsService } from '../../accounting/accounts/accounts.service';
import { JournalService } from '../../accounting/journal/journal.service';

jest.mock('../../../common/sequences/document-sequence');
jest.mock('../../../common/prisma/assert-tenant-owned');
jest.mock('../../../common/accounting-period/period-lock');

describe('SalesOrdersService', () => {
  let service: SalesOrdersService;
  let prisma: any;
  let stockReservationService: any;
  let settlementService: { recordMovement: jest.Mock };
  let settlementAllocationService: {
    recordAllocation: jest.Mock;
    reverseAllocation: jest.Mock;
  };

  beforeEach(async () => {
    settlementService = {
      recordMovement: jest.fn().mockResolvedValue({ created: true }),
    };
    settlementAllocationService = {
      recordAllocation: jest.fn().mockResolvedValue({ created: true }),
      reverseAllocation: jest.fn().mockResolvedValue({ created: true }),
    };
    stockReservationService = {
      reserveStockForOrder: jest.fn().mockResolvedValue([
        {
          orderItemId: 'item-1',
          productId: 'prod-1',
          requestedQty: 5,
          reservedQty: 0,
          remainingGap: 5,
        },
      ]),
      releaseOrderReservations: jest.fn().mockResolvedValue(undefined),
      consumeReservation: jest.fn().mockResolvedValue(undefined),
      getFreeStock: jest.fn().mockResolvedValue({
        productId: 'prod-1',
        warehouseId: 'wh-1',
        physicalStock: 10,
        reservedStock: 0,
        freeStock: 10,
      }),
    };

    prisma = {
      salesOrder: {
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        groupBy: jest.fn(),
        aggregate: jest.fn(),
      },
      salesOrderItem: {
        deleteMany: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      productionOrder: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      payment: {
        aggregate: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      salesInvoice: {
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      salesInvoiceItem: {
        update: jest.fn(),
      },
      stockLevel: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      productBatch: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      batchConsumption: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
      },
      counterparty: {
        update: jest.fn(),
      },
      counterpartyBalance: {
        upsert: jest.fn(),
      },
      financeTransaction: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      settlementAllocation: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      account: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      journalEntry: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      product: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      warehouse: {
        findFirst: jest.fn().mockResolvedValue({ id: 'wh-1' }),
      },
      // Row lock of the order edit (F9): the order is still editable.
      $queryRaw: jest.fn().mockResolvedValue([{ status: 'NEW' }]),
      $transaction: jest.fn(async (callback) => callback(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JournalService,
        { provide: AccountsService, useValue: {} },
        SalesOrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: StockReservationService, useValue: stockReservationService },
        { provide: CounterpartySettlementService, useValue: settlementService },
        {
          provide: SettlementAllocationService,
          useValue: settlementAllocationService,
        },
      ],
    }).compile();

    service = module.get<SalesOrdersService>(SalesOrdersService);
  });

  describe('1. Create Sales Order', () => {
    it('should create an order in NEW status and compute totals', async () => {
      prisma.salesOrder.count.mockResolvedValue(0);
      prisma.salesOrder.create.mockImplementation(({ data }: any) => ({
        id: 'order-1',
        ...data,
        items: data.items.create,
        payments: [],
        salesInvoices: [],
      }));

      const dto: any = {
        counterpartyId: 'cust-1',
        warehouseId: 'wh-1',
        paymentCondition: 'PREPAID_100',
        currency: 'UZS',
        items: [
          { productId: 'prod-1', quantity: 5, unitPrice: 100000, discount: 10 },
          { productId: 'prod-2', quantity: 2, unitPrice: 200000, discount: 0 },
        ],
      };

      const result = await service.create(
        'tenant-1',
        'user-1',
        ['SELLER'],
        dto,
      );

      expect(prisma.salesOrder.create).toHaveBeenCalled();
      expect(result.subtotalAmount).toBe(900000); // (5*100000) + (2*200000) = 500000 + 400000
      expect(result.discountAmount).toBe(50000);
      expect(result.totalAmount).toBe(850000);
      expect(result.status).toBe(SalesOrderStatus.NEW);
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('includes line VAT and taxable customer charges in the order total', async () => {
      prisma.salesOrder.count.mockResolvedValue(0);
      prisma.product.findMany.mockResolvedValue([
        { id: 'prod-1', vatRate: 12, costPrice: 0 },
      ]);
      prisma.salesOrder.create.mockImplementation(({ data }: any) => ({
        id: 'order-vat',
        ...data,
        items: data.items.create,
        payments: [],
        salesInvoices: [],
      }));

      const result = await service.create('tenant-1', 'user-1', ['SELLER'], {
        counterpartyId: 'cust-1',
        warehouseId: 'wh-1',
        paymentCondition: 'CREDIT',
        currency: 'UZS',
        additionalChargeAmount: 50_000,
        additionalChargeVatRate: 12,
        items: [
          {
            productId: 'prod-1',
            quantity: 2,
            unitPrice: 100_000,
            discount: 10,
            vatRate: 12,
          },
        ],
      });

      expect(result.subtotalAmount).toBe(200_000);
      expect(result.discountAmount).toBe(20_000);
      expect(result.vatAmount).toBe(27_600);
      expect(result.additionalChargeAmount).toBe(50_000);
      expect(result.additionalChargeVatAmount).toBe(6_000);
      expect(result.totalAmount).toBe(257_600);
      expect(result.items[0]).toMatchObject({
        discount: 10,
        vatRate: 12,
        vatAmount: 21_600,
        totalPrice: 201_600,
      });
    });

    it('recalculates percentage discount and VAT the same way on a draft update (plan T3.3)', async () => {
      prisma.salesOrder.findFirst.mockResolvedValue({
        id: 'order-draft',
        tenantId: 'tenant-1',
        status: 'NEW',
        currency: 'UZS',
        exchangeRate: 1,
        additionalChargeAmount: 0,
        additionalChargeVatRate: 12,
        warehouseId: 'wh-1',
        items: [],
      });
      prisma.product.findMany.mockResolvedValue([
        { id: 'prod-1', vatRate: 12 },
        { id: 'prod-2', vatRate: 0 },
      ]);
      prisma.salesOrder.update.mockImplementation(({ data }: any) => ({
        id: 'order-draft',
        ...data,
        warehouseId: 'wh-1',
        items: data.items.create.map((item: any, i: number) => ({
          id: `item-${i}`,
          ...item,
        })),
        payments: [],
        salesInvoices: [],
      }));

      await service.update('tenant-1', 'user-1', 'order-draft', {
        items: [
          { productId: 'prod-1', quantity: 2, unitPrice: 100, discount: 10 },
          { productId: 'prod-2', quantity: 1, unitPrice: 50, discount: 100 },
        ],
      });

      const { data } = prisma.salesOrder.update.mock.calls[0][0];
      // Line 1: 200 - 20 = 180 + 21.6 VAT = 201.6; line 2: fully discounted.
      expect(data).toMatchObject({
        subtotalAmount: 250,
        discountAmount: 70,
        vatAmount: 21.6,
        totalAmount: 201.6,
      });
      expect(data.items.create).toEqual([
        expect.objectContaining({
          discount: 10,
          vatRate: 12,
          vatAmount: 21.6,
          totalPrice: 201.6,
        }),
        expect.objectContaining({
          discount: 100,
          vatRate: 0,
          vatAmount: 0,
          totalPrice: 0,
        }),
      ]);
    });

    it('should throw Error if items list is empty or invalid', async () => {
      await expect(
        service.create('tenant-1', 'user-1', ['SELLER'], {
          counterpartyId: 'cust-1',
          warehouseId: 'wh-1',
          paymentCondition: 'CREDIT',
          currency: 'UZS',
          items: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if currency is missing or unsupported in sales order', async () => {
      await expect(
        service.create('tenant-1', 'user-1', ['SELLER'], {
          counterpartyId: 'cust-1',
          warehouseId: 'wh-1',
          paymentCondition: 'CREDIT',
          currency: '' as any,
          items: [{ productId: 'p1', quantity: 1, unitPrice: 100 }],
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.create('tenant-1', 'user-1', ['SELLER'], {
          counterpartyId: 'cust-1',
          warehouseId: 'wh-1',
          paymentCondition: 'CREDIT',
          currency: 'RUB' as any,
          items: [{ productId: 'p1', quantity: 1, unitPrice: 100 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if order currency is USD and exchangeRate is missing, 0, or negative', async () => {
      await expect(
        service.create('tenant-1', 'user-1', ['SELLER'], {
          counterpartyId: 'cust-1',
          warehouseId: 'wh-1',
          paymentCondition: 'CREDIT',
          currency: 'USD',
          items: [{ productId: 'p1', quantity: 1, unitPrice: 100 }],
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.create('tenant-1', 'user-1', ['SELLER'], {
          counterpartyId: 'cust-1',
          warehouseId: 'wh-1',
          paymentCondition: 'CREDIT',
          currency: 'USD',
          exchangeRate: 0,
          items: [{ productId: 'p1', quantity: 1, unitPrice: 100 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if order item quantity is zero or negative', async () => {
      await expect(
        service.create('tenant-1', 'user-1', ['SELLER'], {
          counterpartyId: 'cust-1',
          warehouseId: 'wh-1',
          paymentCondition: 'CREDIT',
          currency: 'UZS',
          items: [{ productId: 'p1', quantity: 0, unitPrice: 100 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Designated warehouse (ADR 0018)', () => {
    type CreateDto = Parameters<SalesOrdersService['create']>[3];
    type CreateArgs = {
      data: { items: { create: Record<string, unknown>[] } } & Record<
        string,
        unknown
      >;
    };
    const db = () =>
      prisma as {
        salesOrder: Record<
          'count' | 'create' | 'findFirst' | 'update',
          jest.Mock
        >;
        warehouse: { findFirst: jest.Mock };
      };
    const reservations = () =>
      stockReservationService as { reserveStockForOrder: jest.Mock };
    const orderDto = (warehouseId?: string) =>
      ({
        counterpartyId: 'cust-1',
        paymentCondition: 'CREDIT',
        currency: 'UZS',
        warehouseId,
        items: [{ productId: 'prod-1', quantity: 5, unitPrice: 1000 }],
      }) as unknown as CreateDto;

    beforeEach(() => {
      db().salesOrder.count.mockResolvedValue(0);
      db().salesOrder.create.mockImplementation(({ data }: CreateArgs) => ({
        id: 'order-1',
        ...data,
        items: data.items.create.map((item, index) => ({
          id: `item-${index + 1}`,
          ...item,
        })),
        payments: [],
        salesInvoices: [],
      }));
    });

    it('rejects an order without a warehouse instead of reserving stock in the first warehouse', async () => {
      await expect(
        service.create('tenant-1', 'user-1', ['SELLER'], orderDto(undefined)),
      ).rejects.toThrow('Buyurtma uchun ombor tanlanishi shart');
      expect(reservations().reserveStockForOrder).not.toHaveBeenCalled();
    });

    it('rejects a warehouse that does not belong to the tenant', async () => {
      db().warehouse.findFirst.mockResolvedValue(null);
      await expect(
        service.create(
          'tenant-1',
          'user-1',
          ['SELLER'],
          orderDto('wh-foreign'),
        ),
      ).rejects.toThrow('Ombor topilmadi');
      expect(db().warehouse.findFirst).toHaveBeenCalledWith({
        where: { id: 'wh-foreign', tenantId: 'tenant-1' },
      });
    });

    it('reserves stock in the designated warehouse', async () => {
      db().warehouse.findFirst.mockResolvedValue({ id: 'wh-2' });
      await service.create('tenant-1', 'user-1', ['SELLER'], orderDto('wh-2'));
      expect(reservations().reserveStockForOrder).toHaveBeenCalledWith(
        'tenant-1',
        'order-1',
        'wh-2',
        expect.any(Array),
      );
    });

    it("rejects moving an order to another tenant's warehouse", async () => {
      db().salesOrder.findFirst.mockResolvedValue({
        id: 'order-1',
        tenantId: 'tenant-1',
        status: SalesOrderStatus.NEW,
        currency: 'UZS',
        exchangeRate: 1,
        warehouseId: 'wh-1',
        items: [],
      });
      db().warehouse.findFirst.mockResolvedValue(null);
      await expect(
        service.update('tenant-1', 'user-1', 'order-1', {
          warehouseId: 'wh-foreign',
        }),
      ).rejects.toThrow('Ombor topilmadi');
      expect(db().salesOrder.update).not.toHaveBeenCalled();
    });

    it('does not dispatch from an arbitrary warehouse when none is designated', async () => {
      db().salesOrder.findFirst.mockResolvedValue({
        id: 'order-1',
        tenantId: 'tenant-1',
        status: SalesOrderStatus.READY_FOR_SHIPMENT,
        paymentCondition: PaymentCondition.CREDIT,
        warehouseId: null,
        items: [],
        payments: [],
      });
      await expect(
        service.dispatch('tenant-1', 'user-1', 'order-1', {}),
      ).rejects.toThrow('Chiqarish uchun ombor tanlanmagan');
      expect(db().warehouse.findFirst).not.toHaveBeenCalled();
    });

    it('does not approve an order without a warehouse by reserving in the first warehouse', async () => {
      db().salesOrder.findFirst.mockResolvedValue({
        id: 'order-1',
        tenantId: 'tenant-1',
        status: SalesOrderStatus.PENDING_APPROVAL,
        warehouseId: null,
        items: [
          { id: 'item-1', productId: 'prod-1', quantity: 5, reservedQty: 0 },
        ],
      });
      await expect(
        service.transition('tenant-1', 'user-1', 'order-1', 'APPROVE', [
          'MANAGER',
        ]),
      ).rejects.toThrow('Buyurtma uchun ombor tanlanishi shart');
      expect(reservations().reserveStockForOrder).not.toHaveBeenCalled();
    });
  });

  describe('2. State Machine Transitions', () => {
    it('should submit NEW order to PENDING_APPROVAL', async () => {
      prisma.salesOrder.findFirst.mockResolvedValue({
        id: 'order-1',
        tenantId: 'tenant-1',
        status: SalesOrderStatus.NEW,
        items: [],
      });

      await service.transition('tenant-1', 'user-1', 'order-1', 'SUBMIT', [
        'SELLER',
      ]);

      expect(prisma.salesOrder.update).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', id: 'order-1' },
        data: { status: SalesOrderStatus.PENDING_APPROVAL },
      });
    });

    it('should approve order when user has MANAGER role', async () => {
      prisma.salesOrder.findFirst.mockResolvedValue({
        id: 'order-1',
        tenantId: 'tenant-1',
        status: SalesOrderStatus.PENDING_APPROVAL,
        warehouseId: 'wh-1',
        items: [],
      });

      await service.transition('tenant-1', 'user-1', 'order-1', 'APPROVE', [
        'MANAGER',
      ]);

      expect(prisma.salesOrder.update).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', id: 'order-1' },
        data: { status: SalesOrderStatus.APPROVED },
      });
    });

    it('should reject approval if user is only SELLER', async () => {
      prisma.salesOrder.findFirst.mockResolvedValue({
        id: 'order-1',
        tenantId: 'tenant-1',
        status: SalesOrderStatus.PENDING_APPROVAL,
        items: [],
      });

      await expect(
        service.transition('tenant-1', 'user-1', 'order-1', 'APPROVE', [
          'SELLER',
        ]),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should send to production and auto-create production order stubs', async () => {
      prisma.salesOrder.findFirst.mockResolvedValue({
        id: 'order-1',
        tenantId: 'tenant-1',
        status: SalesOrderStatus.APPROVED,
        items: [
          { id: 'item-1', productId: 'prod-1', quantity: 10 },
          { id: 'item-2', productId: 'prod-2', quantity: 5 },
        ],
      });

      await service.transition(
        'tenant-1',
        'user-1',
        'order-1',
        'SEND_TO_PRODUCTION',
        ['MANAGER'],
      );

      expect(prisma.salesOrder.update).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', id: 'order-1' },
        data: { status: SalesOrderStatus.SENT_TO_PRODUCTION },
      });
      expect(prisma.productionOrder.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('3. Production Progress and Status Resolution', () => {
    it('should update production readyQty and set order status to PARTIALLY_READY when in progress', async () => {
      prisma.productionOrder.findFirst.mockResolvedValue({
        id: 'po-1',
        salesOrderId: 'order-1',
        salesOrderItemId: 'item-1',
        requiredQty: 10,
        salesOrder: {
          id: 'order-1',
          status: SalesOrderStatus.SENT_TO_PRODUCTION,
          paymentCondition: PaymentCondition.PREPAID_100,
          paidAmount: 0,
          totalAmount: 1000000,
          items: [{ id: 'item-1', reservedQty: 0 }],
        },
      });

      prisma.productionOrder.findMany.mockResolvedValue([
        { id: 'po-1', requiredQty: 10, readyQty: 4 },
      ]);

      await service.updateProductionReadyQty('tenant-1', 'user-1', 'po-1', 4);

      expect(prisma.productionOrder.update).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', id: 'po-1' },
        data: { readyQty: 4, status: ProductionOrderStatus.IN_PROGRESS },
      });
      expect(prisma.salesOrderItem.update).toHaveBeenCalledWith({
        where: { order: { tenantId: 'tenant-1' }, id: 'item-1' },
        data: { readyQty: 4 },
      });
      expect(prisma.salesOrder.update).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', id: 'order-1' },
        data: { status: SalesOrderStatus.PARTIALLY_READY },
      });
    });

    it('should transition to AWAITING_PAYMENT when production is complete but prepaid gate not satisfied', async () => {
      prisma.productionOrder.findFirst.mockResolvedValue({
        id: 'po-1',
        salesOrderId: 'order-1',
        salesOrderItemId: 'item-1',
        requiredQty: 10,
        salesOrder: {
          id: 'order-1',
          status: SalesOrderStatus.IN_PRODUCTION,
          paymentCondition: PaymentCondition.PREPAID_100,
          paidAmount: 0,
          totalAmount: 1000000,
          requiredPaymentPercent: null,
          items: [{ id: 'item-1', reservedQty: 0 }],
        },
      });

      prisma.productionOrder.findMany.mockResolvedValue([
        { id: 'po-1', requiredQty: 10, readyQty: 10 },
      ]);

      await service.updateProductionReadyQty('tenant-1', 'user-1', 'po-1', 10);

      expect(prisma.salesOrder.update).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', id: 'order-1' },
        data: { status: SalesOrderStatus.AWAITING_PAYMENT },
      });
    });

    it('should transition to READY_TO_SHIP when production complete and paymentCondition is CREDIT', async () => {
      prisma.productionOrder.findFirst.mockResolvedValue({
        id: 'po-1',
        salesOrderId: 'order-1',
        salesOrderItemId: 'item-1',
        requiredQty: 10,
        salesOrder: {
          id: 'order-1',
          status: SalesOrderStatus.IN_PRODUCTION,
          paymentCondition: PaymentCondition.CREDIT,
          paidAmount: 0,
          totalAmount: 1000000,
          items: [{ id: 'item-1', reservedQty: 0 }],
        },
      });

      prisma.productionOrder.findMany.mockResolvedValue([
        { id: 'po-1', requiredQty: 10, readyQty: 10 },
      ]);

      await service.updateProductionReadyQty('tenant-1', 'user-1', 'po-1', 10);

      expect(prisma.salesOrder.update).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', id: 'order-1' },
        data: { status: SalesOrderStatus.READY_TO_SHIP },
      });
    });
  });

  describe('4. Payment Hook and Dispatch Gate', () => {
    it('should transition order from AWAITING_PAYMENT to READY_TO_SHIP when payment satisfies requirement', async () => {
      prisma.salesOrder.findFirst.mockResolvedValue({
        id: 'order-1',
        status: SalesOrderStatus.AWAITING_PAYMENT,
        paymentCondition: PaymentCondition.PARTIAL,
        requiredPaymentPercent: 50,
        totalAmount: 1000000,
        paidAmount: 0,
      });

      prisma.payment.aggregate.mockResolvedValue({
        _sum: { amount: 500000 },
      });

      await service.onPaymentRegistered('tenant-1', 'user-1', 'order-1');

      expect(prisma.salesOrder.update).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', id: 'order-1' },
        data: { status: SalesOrderStatus.READY_TO_SHIP },
      });
    });
  });

  describe('5. Dispatch and FIFO stock deduction', () => {
    it('should block dispatch if status is not READY_TO_SHIP', async () => {
      prisma.salesOrder.findFirst.mockResolvedValue({
        id: 'order-1',
        status: SalesOrderStatus.IN_PRODUCTION,
        paymentCondition: PaymentCondition.CREDIT,
        items: [],
      });

      await expect(
        service.dispatch('tenant-1', 'user-1', 'order-1', {
          warehouseId: 'wh-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('bills the last shipment of a line as the rest of that line, so shipments add up exactly (plan T3.7)', async () => {
      // 3 x 10.05, 10% discount, 12% VAT: whole line 27.13 net + 3.26 VAT.
      // 1 already shipped (9.04 + 1.08); the last 2 must be 18.09 + 2.18.
      prisma.salesOrder.findFirst.mockResolvedValue({
        id: 'order-1',
        tenantId: 'tenant-1',
        orderNumber: 'Z-2026-0002',
        counterpartyId: 'cust-1',
        warehouseId: 'wh-1',
        currency: 'UZS',
        exchangeRate: 1,
        status: SalesOrderStatus.READY_TO_SHIP,
        paymentCondition: PaymentCondition.CREDIT,
        paidAmount: 0,
        totalAmount: 30.39,
        additionalChargeAmount: 0,
        additionalChargeVatRate: 12,
        items: [
          {
            id: 'item-1',
            productId: 'prod-1',
            quantity: 3,
            unitPrice: 10.05,
            discount: 10,
            vatRate: 12,
            shippedQty: 1,
            product: { name: { uz: 'Mahsulot 1' }, costPrice: 5 },
          },
        ],
      });
      prisma.salesOrderItem.findMany.mockResolvedValue([
        { id: 'item-1', quantity: 3, shippedQty: 3 },
      ]);
      prisma.salesInvoice.count.mockResolvedValue(0);
      prisma.account.findFirst.mockImplementation(({ where }: any) => ({
        id: `acc-${where.code}`,
        code: where.code,
      }));
      prisma.salesInvoice.create.mockImplementation(({ data }: any) => ({
        id: 'inv-2',
        tenantId: 'tenant-1',
        invoiceDate: new Date('2026-09-25T00:00:00.000Z'),
        ...data,
        items: data.items.create.map((item: any, i: number) => ({
          id: `inv-item-${i}`,
          ...item,
          product: { name: { uz: 'Mahsulot 1' } },
        })),
      }));
      prisma.stockLevel.findUnique.mockResolvedValue({
        id: 'stock-1',
        quantity: 10,
      });
      prisma.productBatch.findMany.mockResolvedValue([
        {
          id: 'batch-1',
          createdAt: new Date('2026-01-01T00:00:01Z'),
          remainingQty: 5,
          landedCost: 5,
          purchasePrice: 5,
        },
      ]);

      await service.dispatch('tenant-1', 'user-1', 'order-1', {
        warehouseId: 'wh-1',
        items: [{ orderItemId: 'item-1', quantity: 2 }],
      });

      const { data } = prisma.salesInvoice.create.mock.calls[0][0];
      expect(data.items.create[0]).toMatchObject({
        quantity: 2,
        vatAmount: 2.18,
        totalPrice: 20.27,
      });
      expect(data).toMatchObject({
        subtotalAmount: 20.1,
        discountAmount: 2.01,
        vatAmount: 2.18,
        totalAmount: 20.27,
      });
    });

    it('should successfully dispatch, deduct stock via FIFO, create POSTED invoice, and transition order to SHIPPED', async () => {
      prisma.salesOrder.findFirst.mockResolvedValue({
        id: 'order-1',
        tenantId: 'tenant-1',
        orderNumber: 'Z-2026-0001',
        counterpartyId: 'cust-1',
        currency: 'UZS',
        exchangeRate: 1,
        status: SalesOrderStatus.READY_TO_SHIP,
        paymentCondition: PaymentCondition.CREDIT,
        paidAmount: 0,
        totalAmount: 1176000,
        additionalChargeAmount: 50000,
        additionalChargeVatRate: 12,
        items: [
          {
            id: 'item-1',
            productId: 'prod-1',
            quantity: 5,
            unitPrice: 200000,
            discount: 0,
            vatRate: 12,
            shippedQty: 0,
            product: { name: { uz: 'Mahsulot 1' }, costPrice: 120000 },
          },
        ],
      });

      prisma.salesOrderItem.findMany.mockResolvedValue([
        { id: 'item-1', quantity: 5, shippedQty: 5 },
      ]);

      prisma.salesInvoice.count.mockResolvedValue(0);
      prisma.account.findFirst.mockImplementation(({ where }: any) => ({
        id: `acc-${where.code}`,
        code: where.code,
      }));
      prisma.salesInvoice.create.mockResolvedValue({
        id: 'inv-1',
        tenantId: 'tenant-1',
        invoiceDate: new Date('2026-09-24T00:00:00.000Z'),
        subtotalAmount: 1000000,
        discountAmount: 0,
        vatAmount: 126000,
        additionalChargeAmount: 50000,
        additionalChargeVatRate: 12,
        additionalChargeVatAmount: 6000,
        totalAmount: 1176000,
        items: [
          {
            id: 'inv-item-1',
            productId: 'prod-1',
            quantity: 5,
            unitPrice: 200000,
            vatRate: 12,
            vatAmount: 120000,
            totalPrice: 1120000,
            product: { name: { uz: 'Mahsulot 1' } },
          },
        ],
      });

      prisma.stockLevel.findUnique.mockResolvedValue({
        id: 'stock-1',
        quantity: 10,
      });

      prisma.productBatch.findMany.mockResolvedValue([
        {
          id: 'batch-1',
          createdAt: new Date('2026-01-01T00:00:01Z'),
          remainingQty: 5,
          landedCost: 120000,
          purchasePrice: 120000,
        },
      ]);

      await service.dispatch('tenant-1', 'user-1', 'order-1', {
        warehouseId: 'wh-1',
      });

      expect(prisma.stockLevel.update).toHaveBeenCalledWith({
        where: {
          tenantId_warehouseId_productId: {
            tenantId: 'tenant-1',
            warehouseId: 'wh-1',
            productId: 'prod-1',
          },
        },
        data: { quantity: { decrement: 5 } },
      });

      expect(settlementService.recordMovement).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          tenantId: 'tenant-1',
          counterpartyId: 'cust-1',
          currency: 'UZS',
          side: 'CUSTOMER',
          amount: 1176000,
          sourceDocType: 'SalesInvoice',
          sourceDocId: 'inv-1',
        }),
      );

      expect(prisma.salesInvoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            additionalChargeAmount: 50000,
            additionalChargeVatAmount: 6000,
            vatAmount: 126000,
            totalAmount: 1176000,
            items: {
              create: [
                expect.objectContaining({
                  vatRate: 12,
                  vatAmount: 120000,
                  totalPrice: 1120000,
                }),
              ],
            },
          }),
        }),
      );
      // F5: the dispatch invoice entry is dated by the invoice, not by now.
      expect(prisma.journalEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            entryDate: new Date('2026-09-24T00:00:00.000Z'),
            lines: {
              create: expect.arrayContaining([
                expect.objectContaining({
                  creditAccountId: 'acc-9010',
                  amount: 1050000,
                }),
                expect.objectContaining({
                  creditAccountId: 'acc-6410',
                  amount: 126000,
                }),
              ]),
            },
          }),
        }),
      );

      expect(prisma.salesOrder.update).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', id: 'order-1' },
        data: { status: SalesOrderStatus.SHIPPED, warehouseId: 'wh-1' },
      });
    });

    it('should allocate order advance payments to created sales invoice and set paymentStatus to PAID', async () => {
      prisma.salesOrder.findFirst.mockResolvedValue({
        id: 'order-prepaid-1',
        tenantId: 'tenant-1',
        orderNumber: 'Z-2026-0002',
        counterpartyId: 'cust-1',
        currency: 'UZS',
        exchangeRate: 1,
        status: SalesOrderStatus.READY_FOR_SHIPMENT,
        paymentCondition: PaymentCondition.PREPAID_100,
        paidAmount: 1000000,
        totalAmount: 1000000,
        items: [
          {
            id: 'item-1',
            productId: 'prod-1',
            quantity: 5,
            unitPrice: 200000,
            discount: 0,
            shippedQty: 0,
            product: { name: { uz: 'Mahsulot 1' }, costPrice: 120000 },
          },
        ],
      });
      prisma.payment.findMany.mockResolvedValue([
        {
          id: 'payment-1',
          amount: 1000000,
          paymentDate: new Date('2026-09-20T00:00:00.000Z'),
        },
      ]);
      prisma.financeTransaction.findMany.mockResolvedValue([
        {
          id: 'finance-1',
          sourceDocId: 'payment-1',
          amount: 1000000,
          currency: 'UZS',
          settlementSide: 'CUSTOMER',
        },
      ]);

      prisma.salesOrderItem.findMany.mockResolvedValue([
        { id: 'item-1', quantity: 5, shippedQty: 5 },
      ]);

      prisma.salesInvoice.count.mockResolvedValue(1);
      prisma.salesInvoice.create.mockResolvedValue({
        id: 'inv-prepaid-1',
        tenantId: 'tenant-1',
        invoiceDate: new Date('2026-09-24T00:00:00.000Z'),
        totalAmount: 1000000,
        paidAmount: 0,
        paymentStatus: SalesPaymentStatus.UNPAID,
        items: [
          {
            id: 'inv-item-1',
            productId: 'prod-1',
            quantity: 5,
            unitPrice: 200000,
            totalPrice: 1000000,
            product: { name: { uz: 'Mahsulot 1' } },
          },
        ],
      });

      prisma.stockLevel.findUnique.mockResolvedValue({
        id: 'stock-1',
        quantity: 10,
      });

      prisma.productBatch.findMany.mockResolvedValue([
        {
          id: 'batch-1',
          createdAt: new Date('2026-01-01T00:00:02Z'),
          remainingQty: 5,
          landedCost: 120000,
          purchasePrice: 120000,
        },
      ]);

      await service.dispatch('tenant-1', 'user-1', 'order-prepaid-1', {
        warehouseId: 'wh-1',
      });

      expect(prisma.salesInvoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paidAmount: 0,
            paymentStatus: SalesPaymentStatus.UNPAID,
          }),
        }),
      );
      expect(prisma.salesInvoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-prepaid-1', tenantId: 'tenant-1' },
          data: expect.objectContaining({
            paidAmount: 1000000,
            paymentStatus: SalesPaymentStatus.PAID,
          }),
        }),
      );

      expect(settlementAllocationService.recordAllocation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          tenantId: 'tenant-1',
          counterpartyId: 'cust-1',
          financeTransactionId: 'finance-1',
          targetType: 'SALES_INVOICE',
          targetId: 'inv-prepaid-1',
          amount: 1000000,
        }),
      );
    });
  });

  describe('6. Warehouse Operational State Machine & 1-Click Otgruzka', () => {
    it('should transition NEW -> ACCEPTED when role is WAREHOUSE', async () => {
      prisma.salesOrder.findFirst.mockResolvedValue({
        id: 'order-1',
        tenantId: 'tenant-1',
        status: SalesOrderStatus.NEW,
        warehouseId: 'wh-1',
        items: [],
      });

      await service.updateStatus(
        'tenant-1',
        'user-1',
        'order-1',
        SalesOrderStatus.ACCEPTED,
        ['WAREHOUSE'],
      );

      expect(prisma.salesOrder.update).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', id: 'order-1' },
        data: { status: SalesOrderStatus.ACCEPTED },
      });
    });

    it('should reject warehouse transition if role is only SELLER', async () => {
      prisma.salesOrder.findFirst.mockResolvedValue({
        id: 'order-1',
        tenantId: 'tenant-1',
        status: SalesOrderStatus.NEW,
        items: [],
      });

      await expect(
        service.updateStatus(
          'tenant-1',
          'user-1',
          'order-1',
          SalesOrderStatus.ACCEPTED,
          ['SELLER'],
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should transition ACCEPTED -> PROCESSING -> READY_FOR_SHIPMENT for warehouse manager', async () => {
      prisma.salesOrder.findFirst.mockResolvedValue({
        id: 'order-1',
        tenantId: 'tenant-1',
        status: SalesOrderStatus.ACCEPTED,
        items: [],
      });

      await service.updateStatus(
        'tenant-1',
        'user-1',
        'order-1',
        SalesOrderStatus.PROCESSING,
        ['WAREHOUSE_MANAGER'],
      );

      expect(prisma.salesOrder.update).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', id: 'order-1' },
        data: { status: SalesOrderStatus.PROCESSING },
      });
    });

    it('should release all stock reservations when order is cancelled from warehouse status', async () => {
      prisma.salesOrder.findFirst.mockResolvedValue({
        id: 'order-1',
        tenantId: 'tenant-1',
        status: SalesOrderStatus.PROCESSING,
        items: [{ id: 'item-1' }],
      });

      await service.updateStatus(
        'tenant-1',
        'user-1',
        'order-1',
        SalesOrderStatus.CANCELLED,
        ['WAREHOUSE_MANAGER'],
      );

      expect(
        stockReservationService.releaseOrderReservations,
      ).toHaveBeenCalledWith('tenant-1', 'order-1', expect.anything());
      expect(prisma.salesOrder.update).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', id: 'order-1' },
        data: { status: SalesOrderStatus.CANCELLED },
      });
    });

    it('should trigger 1-click dispatch when updateStatus is called with SHIPPED', async () => {
      prisma.salesOrder.findFirst.mockResolvedValue({
        id: 'order-1',
        tenantId: 'tenant-1',
        status: SalesOrderStatus.READY_FOR_SHIPMENT,
        warehouseId: 'wh-1',
        paymentCondition: PaymentCondition.CREDIT,
        counterpartyId: 'cust-1',
        currency: 'UZS',
        exchangeRate: 1,
        items: [
          {
            id: 'item-1',
            productId: 'prod-1',
            quantity: 2,
            unitPrice: 150000,
            discount: 0,
            shippedQty: 0,
            product: { name: { uz: 'Mahsulot' } },
          },
        ],
      });

      prisma.salesInvoice.count.mockResolvedValue(1);
      prisma.salesInvoice.create.mockResolvedValue({
        id: 'inv-1',
        tenantId: 'tenant-1',
        invoiceDate: new Date('2026-09-24T00:00:00.000Z'),
        totalAmount: 300000,
        items: [
          {
            id: 'inv-item-1',
            productId: 'prod-1',
            quantity: 2,
            unitPrice: 150000,
            totalPrice: 300000,
            product: { name: { uz: 'Mahsulot' } },
          },
        ],
      });

      prisma.stockLevel.findUnique.mockResolvedValue({
        id: 'stock-1',
        quantity: 10,
      });

      prisma.productBatch.findMany.mockResolvedValue([
        {
          id: 'batch-1',
          createdAt: new Date('2026-01-01T00:00:03Z'),
          remainingQty: 5,
          landedCost: 100000,
          purchasePrice: 100000,
        },
      ]);

      await service.updateStatus(
        'tenant-1',
        'user-1',
        'order-1',
        SalesOrderStatus.SHIPPED,
        ['WAREHOUSE_MANAGER'],
      );

      expect(prisma.salesInvoice.create).toHaveBeenCalled();
      expect(settlementService.recordMovement).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          tenantId: 'tenant-1',
          counterpartyId: 'cust-1',
          currency: 'UZS',
          side: 'CUSTOMER',
          amount: 300000,
          sourceDocType: 'SalesInvoice',
          sourceDocId: 'inv-1',
        }),
      );
      expect(prisma.salesOrder.update).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', id: 'order-1' },
        data: { status: SalesOrderStatus.SHIPPED, warehouseId: 'wh-1' },
      });
    });
  });
});
