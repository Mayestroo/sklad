import { Test, TestingModule } from '@nestjs/testing';
import { SalesOrdersService } from './sales-orders.service';
import { PrismaService } from '../../../common/prisma';
import { StockReservationService } from '../../inventory/stock-reservation/stock-reservation.service';
import {
  SalesOrderStatus,
  PaymentCondition,
  ProductionOrderStatus,
  SalesDocStatus,
} from '@prisma/client';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

describe('SalesOrdersService', () => {
  let service: SalesOrdersService;
  let prisma: any;
  let stockReservationService: any;

  beforeEach(async () => {
    stockReservationService = {
      reserveStockForOrder: jest.fn().mockResolvedValue([
        { orderItemId: 'item-1', productId: 'prod-1', requestedQty: 5, reservedQty: 0, remainingGap: 5 },
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
      },
      salesInvoice: {
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      salesInvoiceItem: {
        update: jest.fn(),
      },
      stockLevel: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      productBatch: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      batchConsumption: {
        create: jest.fn(),
      },
      counterparty: {
        update: jest.fn(),
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
      $transaction: jest.fn(async (callback) => callback(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesOrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: StockReservationService, useValue: stockReservationService },
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
        paymentCondition: 'PREPAID_100',
        items: [
          { productId: 'prod-1', quantity: 5, unitPrice: 100000, discount: 50000 },
          { productId: 'prod-2', quantity: 2, unitPrice: 200000, discount: 0 },
        ],
      };

      const result = await service.create('tenant-1', 'user-1', ['SELLER'], dto);

      expect(prisma.salesOrder.create).toHaveBeenCalled();
      expect(result.subtotalAmount).toBe(900000); // (5*100000) + (2*200000) = 500000 + 400000
      expect(result.discountAmount).toBe(50000);
      expect(result.totalAmount).toBe(850000);
      expect(result.status).toBe(SalesOrderStatus.NEW);
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('should throw Error if items list is empty or invalid', async () => {
      await expect(
        service.create('tenant-1', 'user-1', ['SELLER'], {
          counterpartyId: 'cust-1',
          paymentCondition: 'CREDIT',
          items: [],
        }),
      ).rejects.toThrow(BadRequestException);
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

      await service.transition(
        'tenant-1',
        'user-1',
        'order-1',
        'SUBMIT',
        ['SELLER'],
      );

      expect(prisma.salesOrder.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { status: SalesOrderStatus.PENDING_APPROVAL },
      });
    });

    it('should approve order when user has MANAGER role', async () => {
      prisma.salesOrder.findFirst.mockResolvedValue({
        id: 'order-1',
        tenantId: 'tenant-1',
        status: SalesOrderStatus.PENDING_APPROVAL,
        items: [],
      });

      await service.transition(
        'tenant-1',
        'user-1',
        'order-1',
        'APPROVE',
        ['MANAGER'],
      );

      expect(prisma.salesOrder.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
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
        service.transition(
          'tenant-1',
          'user-1',
          'order-1',
          'APPROVE',
          ['SELLER'],
        ),
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
        where: { id: 'order-1' },
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
        where: { id: 'po-1' },
        data: { readyQty: 4, status: ProductionOrderStatus.IN_PROGRESS },
      });
      expect(prisma.salesOrderItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { readyQty: 4 },
      });
      expect(prisma.salesOrder.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
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
        where: { id: 'order-1' },
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
        where: { id: 'order-1' },
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
        where: { id: 'order-1' },
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
        service.dispatch('tenant-1', 'user-1', 'order-1', { warehouseId: 'wh-1' }),
      ).rejects.toThrow(BadRequestException);
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

      prisma.salesOrderItem.findMany.mockResolvedValue([
        { id: 'item-1', quantity: 5, shippedQty: 5 },
      ]);

      prisma.salesInvoice.count.mockResolvedValue(0);
      prisma.salesInvoice.create.mockResolvedValue({
        id: 'inv-1',
        tenantId: 'tenant-1',
        totalAmount: 1000000,
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
          remainingQty: 5,
          landedCost: 120000,
          purchasePrice: 120000,
        },
      ]);

      const result = await service.dispatch(
        'tenant-1',
        'user-1',
        'order-1',
        { warehouseId: 'wh-1' },
      );

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

      expect(prisma.counterparty.update).toHaveBeenCalledWith({
        where: { id: 'cust-1' },
        data: { debtBalance: { increment: 1000000 } },
      });

      expect(prisma.salesOrder.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { status: SalesOrderStatus.SHIPPED, warehouseId: 'wh-1' },
      });
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
        where: { id: 'order-1' },
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
        where: { id: 'order-1' },
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

      expect(stockReservationService.releaseOrderReservations).toHaveBeenCalledWith(
        'tenant-1',
        'order-1',
        expect.anything(),
      );
      expect(prisma.salesOrder.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
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
      expect(prisma.counterparty.update).toHaveBeenCalledWith({
        where: { id: 'cust-1' },
        data: { debtBalance: { increment: 300000 } },
      });
      expect(prisma.salesOrder.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { status: SalesOrderStatus.SHIPPED, warehouseId: 'wh-1' },
      });
    });
  });
});
