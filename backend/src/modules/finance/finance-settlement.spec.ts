import { Test, TestingModule } from '@nestjs/testing';
import { FinanceService } from './finance.service';
import { PrismaService } from '../../common/prisma';
import {
  TransactionDirection,
  SalesDocStatus,
  SalesPaymentStatus,
  ServicePaymentStatus,
} from '@prisma/client';

describe('FinanceService Settlement Unit Test Suite', () => {
  let service: FinanceService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      cashAccount: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      financeTransaction: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      counterparty: {
        update: jest.fn(),
      },
      salesInvoice: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      serviceAct: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinanceService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<FinanceService>(FinanceService);
  });

  describe('Direct Sales Invoice Payment Settlement', () => {
    it('should directly update paidAmount and transition paymentStatus to PAID when amount satisfies debt', async () => {
      prisma.cashAccount.findFirst.mockResolvedValue({
        id: 'acc-1',
        balance: 1000000,
      });
      prisma.financeTransaction.create.mockResolvedValue({
        id: 'tx-1',
        amount: 5000000,
      });
      prisma.salesInvoice.findFirst.mockResolvedValue({
        id: 'inv-1',
        totalAmount: 5000000,
        paidAmount: 0,
      });

      const res = await service.createIncome('tenant-1', {
        accountId: 'acc-1',
        amount: 5000000,
        currency: 'UZS',
        counterpartyId: 'cust-1',
        sourceDocType: 'SalesInvoice',
        sourceDocId: 'inv-1',
      });

      expect(prisma.counterparty.update).toHaveBeenCalledWith({
        where: { id: 'cust-1' },
        data: { debtBalance: { decrement: 5000000 } },
      });

      expect(prisma.salesInvoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: {
          paidAmount: 5000000,
          paymentStatus: SalesPaymentStatus.PAID,
        },
      });
    });
  });

  describe('FIFO Auto-Allocation Settlement across open Invoices', () => {
    it('should auto-distribute unassigned customer payment across open invoices via FIFO order', async () => {
      prisma.cashAccount.findFirst.mockResolvedValue({
        id: 'acc-1',
        balance: 0,
      });
      prisma.financeTransaction.create.mockResolvedValue({
        id: 'tx-2',
        amount: 4000000,
      });

      // 2 open invoices:
      // Invoice 1: Total 3,000,000, Paid 1,000,000 -> Remaining 2,000,000
      // Invoice 2: Total 5,000,000, Paid 0 -> Remaining 5,000,000
      prisma.salesInvoice.findMany.mockResolvedValue([
        {
          id: 'inv-1',
          totalAmount: 3000000,
          paidAmount: 1000000,
          invoiceDate: new Date('2026-01-01'),
        },
        {
          id: 'inv-2',
          totalAmount: 5000000,
          paidAmount: 0,
          invoiceDate: new Date('2026-01-05'),
        },
      ]);

      const res = await service.createIncome('tenant-1', {
        accountId: 'acc-1',
        amount: 4000000,
        currency: 'UZS',
        counterpartyId: 'cust-1',
      });

      // Invoice 1 gets 2,000,000 -> Total Paid 3,000,000 (PAID)
      expect(prisma.salesInvoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: {
          paidAmount: 3000000,
          paymentStatus: SalesPaymentStatus.PAID,
        },
      });

      // Invoice 2 gets remaining 2,000,000 -> Total Paid 2,000,000 (PARTIALLY_PAID)
      expect(prisma.salesInvoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-2' },
        data: {
          paidAmount: 2000000,
          paymentStatus: SalesPaymentStatus.PARTIALLY_PAID,
        },
      });
    });
  });

  describe('ServiceAct Settlement in Finance', () => {
    it('should reconcile income payment to ServiceAct, updating paidAmount and paymentStatus to PAID', async () => {
      prisma.cashAccount.findFirst.mockResolvedValue({ id: 'acc-1', balance: 500000 });
      prisma.financeTransaction.create.mockResolvedValue({ id: 'tx-srv-1', amount: 1200000 });
      prisma.serviceAct.findFirst.mockResolvedValue({
        id: 'act-1',
        totalAmount: 1200000,
        paidAmount: 0,
      });

      await service.createIncome('tenant-1', {
        accountId: 'acc-1',
        amount: 1200000,
        currency: 'UZS',
        counterpartyId: 'cust-1',
        sourceDocType: 'ServiceAct',
        sourceDocId: 'act-1',
      });

      expect(prisma.serviceAct.update).toHaveBeenCalledWith({
        where: { id: 'act-1' },
        data: {
          paidAmount: 1200000,
          paymentStatus: ServicePaymentStatus.PAID,
        },
      });
    });

    it('should reconcile expense payment to RECEIVED ServiceAct, updating paidAmount to PARTIALLY_PAID', async () => {
      prisma.cashAccount.findFirst.mockResolvedValue({ id: 'acc-1', balance: 5000000 });
      prisma.financeTransaction.create.mockResolvedValue({ id: 'tx-srv-2', amount: 400000 });
      prisma.serviceAct.findFirst.mockResolvedValue({
        id: 'act-vendor-1',
        totalAmount: 1000000,
        paidAmount: 0,
      });

      await service.createExpense('tenant-1', {
        accountId: 'acc-1',
        amount: 400000,
        currency: 'UZS',
        counterpartyId: 'vendor-1',
        sourceDocType: 'ServiceAct',
        sourceDocId: 'act-vendor-1',
      });

      expect(prisma.serviceAct.update).toHaveBeenCalledWith({
        where: { id: 'act-vendor-1' },
        data: {
          paidAmount: 400000,
          paymentStatus: ServicePaymentStatus.PARTIALLY_PAID,
        },
      });
    });
  });
});
