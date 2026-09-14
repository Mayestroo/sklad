import { Test, TestingModule } from '@nestjs/testing';
import { ServicesService } from './services.service';
import { PrismaService } from '../../common/prisma';
import { JournalService } from '../accounting/journal/journal.service';
import {
  ServiceActStatus,
  ServicePaymentStatus,
  ServiceActType,
} from '@prisma/client';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('ServicesService Unit Tests', () => {
  let service: ServicesService;
  let prisma: any;
  let journalService: any;

  const tenantId = 'test-tenant-uuid';
  const counterpartyId = 'test-cp-uuid';

  beforeEach(async () => {
    prisma = {
      serviceAct: {
        count: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      serviceActItem: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      counterparty: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      financeTransaction: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
      journalEntry: {
        deleteMany: jest.fn(),
      },
      openingBalanceDocument: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn(async (cb) => cb(prisma)),
    };

    journalService = {
      autoPostServiceAct: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServicesService,
        { provide: PrismaService, useValue: prisma },
        { provide: JournalService, useValue: journalService },
      ],
    }).compile();

    service = module.get<ServicesService>(ServicesService);
  });

  describe('Document Creation & Calculations', () => {
    it('should throw BadRequestException if no items provided', async () => {
      await expect(
        service.create(tenantId, {
          type: ServiceActType.PROVIDED,
          counterpartyId,
          items: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should calculate line subtotal, VAT, and total correctly on create', async () => {
      prisma.counterparty.findFirst.mockResolvedValue({ id: counterpartyId });
      prisma.serviceAct.count.mockResolvedValue(0);
      prisma.serviceAct.create.mockImplementation(({ data }) => ({
        id: 'act-1',
        ...data,
      }));

      const res = await service.create(tenantId, {
        type: ServiceActType.PROVIDED,
        counterpartyId,
        items: [
          {
            serviceName: 'Yuk yetkazish',
            quantity: 5,
            unitPrice: 200000,
            vatRate: 12,
          },
          {
            serviceName: 'Yuk ortish',
            quantity: 1,
            unitPrice: 100000,
            vatRate: 0,
          },
        ],
      });

      // Item 1: 5 * 200,000 = 1,000,000; VAT 12% = 120,000; Total = 1,120,000
      // Item 2: 1 * 100,000 = 100,000; VAT 0% = 0; Total = 100,000
      // Subtotal = 1,100,000; VAT = 120,000; Total = 1,220,000
      expect(prisma.serviceAct.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: ServiceActType.PROVIDED,
            status: ServiceActStatus.DRAFT,
            paymentStatus: ServicePaymentStatus.UNPAID,
            actNumber: expect.stringMatching(/^ACT-\d{4}-0001$/),
          }),
        }),
      );
      expect(Number(res.subtotal)).toBe(1100000);
      expect(Number(res.vatAmount)).toBe(120000);
      expect(Number(res.totalAmount)).toBe(1220000);
    });
  });

  describe('Posting & Debt Accrual', () => {
    it('should post a PROVIDED DRAFT act, increment customerDebt & debtBalance, and trigger journal auto-posting', async () => {
      prisma.serviceAct.findFirst.mockResolvedValue({
        id: 'act-1',
        tenantId,
        counterpartyId,
        type: ServiceActType.PROVIDED,
        status: ServiceActStatus.DRAFT,
        totalAmount: 1000000,
        actDate: new Date('2026-10-15'),
      });
      prisma.serviceAct.update.mockResolvedValue({
        id: 'act-1',
        type: ServiceActType.PROVIDED,
        status: ServiceActStatus.POSTED,
        totalAmount: 1000000,
      });

      const res = await service.post(tenantId, 'act-1');

      expect(prisma.serviceAct.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'act-1' },
          data: { status: ServiceActStatus.POSTED },
        }),
      );

      // Verify customer debt and positive debt balance were incremented
      expect(prisma.counterparty.update).toHaveBeenCalledWith({
        where: { id: counterpartyId },
        data: {
          customerDebt: { increment: 1000000 },
          debtBalance: { increment: 1000000 },
        },
      });

      // Verify double-entry journal posting was called
      expect(journalService.autoPostServiceAct).toHaveBeenCalled();
    });

    it('should post a RECEIVED DRAFT act, increment supplierDebt & decrement debtBalance', async () => {
      prisma.serviceAct.findFirst.mockResolvedValue({
        id: 'act-2',
        tenantId,
        counterpartyId,
        type: ServiceActType.RECEIVED,
        status: ServiceActStatus.DRAFT,
        totalAmount: 500000,
        actDate: new Date('2026-10-15'),
      });
      prisma.serviceAct.update.mockResolvedValue({
        id: 'act-2',
        type: ServiceActType.RECEIVED,
        status: ServiceActStatus.POSTED,
        totalAmount: 500000,
      });

      await service.post(tenantId, 'act-2');

      // Verify supplier debt incremented and debtBalance decremented
      expect(prisma.counterparty.update).toHaveBeenCalledWith({
        where: { id: counterpartyId },
        data: {
          supplierDebt: { increment: 500000 },
          debtBalance: { decrement: 500000 },
        },
      });
    });

    it('should throw BadRequestException if posting an already posted act', async () => {
      prisma.serviceAct.findFirst.mockResolvedValue({
        id: 'act-1',
        status: ServiceActStatus.POSTED,
      });

      await expect(service.post(tenantId, 'act-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if actDate is before cutoff date', async () => {
      prisma.openingBalanceDocument.findFirst.mockResolvedValue({
        id: 'ob-doc-1',
        openingDate: new Date('2026-10-01'),
      });

      prisma.serviceAct.findFirst.mockResolvedValue({
        id: 'act-1',
        tenantId,
        counterpartyId,
        type: ServiceActType.PROVIDED,
        status: ServiceActStatus.DRAFT,
        totalAmount: 1000000,
        actDate: new Date('2026-09-15'),
      });

      await expect(service.post(tenantId, 'act-1')).rejects.toThrow(
        BadRequestException,
      );

      // Reset mock
      prisma.openingBalanceDocument.findFirst.mockResolvedValue(null);
    });
  });

  describe('Service Rollback Invariant & Safe Cancellation', () => {
    it('should block cancellation if paidAmount > 0', async () => {
      prisma.serviceAct.findFirst.mockResolvedValue({
        id: 'act-1',
        status: ServiceActStatus.POSTED,
        paidAmount: 500000,
      });

      await expect(service.cancel(tenantId, 'act-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should block cancellation if active finance transaction exists', async () => {
      prisma.serviceAct.findFirst.mockResolvedValue({
        id: 'act-1',
        status: ServiceActStatus.POSTED,
        paidAmount: 0,
      });
      prisma.financeTransaction.count.mockResolvedValue(1);

      await expect(service.cancel(tenantId, 'act-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should safely cancel an unpaid PROVIDED posted act, revert customerDebt, and delete journal entries', async () => {
      prisma.serviceAct.findFirst.mockResolvedValue({
        id: 'act-1',
        type: ServiceActType.PROVIDED,
        counterpartyId,
        status: ServiceActStatus.POSTED,
        paidAmount: 0,
        totalAmount: 1000000,
      });
      prisma.financeTransaction.count.mockResolvedValue(0);
      prisma.serviceAct.update.mockResolvedValue({
        id: 'act-1',
        status: ServiceActStatus.CANCELLED,
      });

      await service.cancel(tenantId, 'act-1');

      expect(prisma.counterparty.update).toHaveBeenCalledWith({
        where: { id: counterpartyId },
        data: {
          customerDebt: { decrement: 1000000 },
          debtBalance: { decrement: 1000000 },
        },
      });

      expect(prisma.journalEntry.deleteMany).toHaveBeenCalledWith({
        where: {
          tenantId,
          sourceDocType: 'ServiceAct',
          sourceDocId: 'act-1',
        },
      });

      expect(prisma.serviceAct.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: ServiceActStatus.CANCELLED },
        }),
      );
    });

    it('should safely cancel an unpaid RECEIVED posted act, revert supplierDebt, and delete journal entries', async () => {
      prisma.serviceAct.findFirst.mockResolvedValue({
        id: 'act-2',
        type: ServiceActType.RECEIVED,
        counterpartyId,
        status: ServiceActStatus.POSTED,
        paidAmount: 0,
        totalAmount: 500000,
      });
      prisma.financeTransaction.count.mockResolvedValue(0);
      prisma.serviceAct.update.mockResolvedValue({
        id: 'act-2',
        status: ServiceActStatus.CANCELLED,
      });

      await service.cancel(tenantId, 'act-2');

      expect(prisma.counterparty.update).toHaveBeenCalledWith({
        where: { id: counterpartyId },
        data: {
          supplierDebt: { decrement: 500000 },
          debtBalance: { increment: 500000 },
        },
      });
    });
  });

  describe('Deletion Guardrails', () => {
    it('should reject deleting a POSTED act', async () => {
      prisma.serviceAct.findFirst.mockResolvedValue({
        id: 'act-1',
        status: ServiceActStatus.POSTED,
      });

      await expect(service.remove(tenantId, 'act-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should successfully delete a DRAFT act', async () => {
      prisma.serviceAct.findFirst.mockResolvedValue({
        id: 'act-1',
        status: ServiceActStatus.DRAFT,
      });
      prisma.serviceAct.delete.mockResolvedValue({ id: 'act-1' });

      await service.remove(tenantId, 'act-1');
      expect(prisma.serviceAct.delete).toHaveBeenCalledWith({
        where: { id: 'act-1' },
      });
    });

    it('should successfully delete a CANCELLED act', async () => {
      prisma.serviceAct.findFirst.mockResolvedValue({
        id: 'act-1',
        status: ServiceActStatus.CANCELLED,
      });
      prisma.serviceAct.delete.mockResolvedValue({ id: 'act-1' });

      await service.remove(tenantId, 'act-1');
      expect(prisma.serviceAct.delete).toHaveBeenCalledWith({
        where: { id: 'act-1' },
      });
    });
  });

  describe('Unpost to Draft Lifecycle', () => {
    it('should block unpost if paidAmount > 0', async () => {
      prisma.serviceAct.findFirst.mockResolvedValue({
        id: 'act-1',
        status: ServiceActStatus.POSTED,
        paidAmount: 500000,
      });

      await expect(service.unpost(tenantId, 'act-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should safely unpost an unpaid PROVIDED posted act back to DRAFT', async () => {
      prisma.serviceAct.findFirst.mockResolvedValue({
        id: 'act-1',
        type: ServiceActType.PROVIDED,
        status: ServiceActStatus.POSTED,
        paidAmount: 0,
        totalAmount: 1000000,
        counterpartyId,
      });
      prisma.financeTransaction.count.mockResolvedValue(0);
      prisma.serviceAct.update.mockResolvedValue({
        id: 'act-1',
        status: ServiceActStatus.DRAFT,
      });

      const res = await service.unpost(tenantId, 'act-1');

      expect(prisma.counterparty.update).toHaveBeenCalledWith({
        where: { id: counterpartyId },
        data: {
          customerDebt: { decrement: 1000000 },
          debtBalance: { decrement: 1000000 },
        },
      });

      expect(prisma.journalEntry.deleteMany).toHaveBeenCalledWith({
        where: {
          tenantId,
          sourceDocType: 'ServiceAct',
          sourceDocId: 'act-1',
        },
      });

      expect(prisma.serviceAct.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: ServiceActStatus.DRAFT },
        }),
      );
      expect(res.status).toBe(ServiceActStatus.DRAFT);
    });

    it('should safely unpost an unpaid RECEIVED posted act back to DRAFT', async () => {
      prisma.serviceAct.findFirst.mockResolvedValue({
        id: 'act-2',
        type: ServiceActType.RECEIVED,
        status: ServiceActStatus.POSTED,
        paidAmount: 0,
        totalAmount: 500000,
        counterpartyId,
      });
      prisma.financeTransaction.count.mockResolvedValue(0);
      prisma.serviceAct.update.mockResolvedValue({
        id: 'act-2',
        status: ServiceActStatus.DRAFT,
      });

      await service.unpost(tenantId, 'act-2');

      expect(prisma.counterparty.update).toHaveBeenCalledWith({
        where: { id: counterpartyId },
        data: {
          supplierDebt: { decrement: 500000 },
          debtBalance: { increment: 500000 },
        },
      });
    });
  });
});
