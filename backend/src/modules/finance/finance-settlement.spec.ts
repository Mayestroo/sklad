import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { PrismaService } from '../../common/prisma';
import {
  TransactionDirection,
  TransactionStatus,
  SalesDocStatus,
  SalesPaymentStatus,
  PurchaseDocStatus,
  PurchasePaymentStatus,
  ServicePaymentStatus,
} from '@prisma/client';

describe('FinanceService Settlement Unit Test Suite', () => {
  let service: FinanceService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      cashAccount: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
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
        findMany: jest.fn(),
      },
      salesInvoice: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      salesOrder: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      purchaseReceipt: {
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

      await service.createIncome('tenant-1', {
        accountId: 'acc-1',
        amount: 5000000,
        currency: 'UZS',
        counterpartyId: 'cust-1',
        sourceDocType: 'SalesInvoice',
        sourceDocId: 'inv-1',
      });

      expect(prisma.counterparty.update).toHaveBeenCalledWith({
        where: { id: 'cust-1' },
        data: {
          customerDebt: { decrement: 5000000 },
          debtBalance: { decrement: 5000000 },
        },
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

  describe('Sales Order Pre-Payment Settlement', () => {
    it('should accept prepayment on SalesOrder and transition status to PAYMENT_CONFIRMED when 100% paid', async () => {
      prisma.cashAccount.findFirst.mockResolvedValue({ id: 'acc-1', balance: 500000 });
      prisma.financeTransaction.create.mockResolvedValue({ id: 'tx-ord-1', amount: 10000000 });
      prisma.salesOrder.findFirst.mockResolvedValue({
        id: 'ord-1',
        totalAmount: 10000000,
        paidAmount: 0,
        paymentCondition: 'PREPAID_100',
        status: 'AWAITING_PAYMENT',
      });

      await service.createIncome('tenant-1', {
        accountId: 'acc-1',
        amount: 10000000,
        currency: 'UZS',
        counterpartyId: 'cust-1',
        sourceDocType: 'SalesOrder',
        sourceDocId: 'ord-1',
      });

      expect(prisma.salesOrder.update).toHaveBeenCalledWith({
        where: { id: 'ord-1' },
        data: {
          paidAmount: 10000000,
          status: 'PAYMENT_CONFIRMED',
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

      await service.createIncome('tenant-1', {
        accountId: 'acc-1',
        amount: 4000000,
        currency: 'UZS',
        counterpartyId: 'cust-1',
      });

      expect(prisma.salesInvoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: {
          paidAmount: 3000000,
          paymentStatus: SalesPaymentStatus.PAID,
        },
      });

      expect(prisma.salesInvoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-2' },
        data: {
          paidAmount: 2000000,
          paymentStatus: SalesPaymentStatus.PARTIALLY_PAID,
        },
      });
    });
  });

  describe('Direct Purchase Receipt Settlement (Expense)', () => {
    it('should reduce supplierDebt and update PurchaseReceipt to PAID', async () => {
      prisma.cashAccount.findFirst.mockResolvedValue({
        id: 'acc-bank',
        balance: 20000000,
        currency: 'UZS',
      });
      prisma.financeTransaction.create.mockResolvedValue({
        id: 'tx-exp-1',
        amount: 15000000,
      });
      prisma.purchaseReceipt.findFirst.mockResolvedValue({
        id: 'rcp-1',
        totalAmount: 15000000,
        paidAmount: 0,
      });

      await service.createExpense('tenant-1', {
        accountId: 'acc-bank',
        amount: 15000000,
        currency: 'UZS',
        counterpartyId: 'supp-1',
        sourceDocType: 'PurchaseReceipt',
        sourceDocId: 'rcp-1',
      });

      expect(prisma.cashAccount.update).toHaveBeenCalledWith({
        where: { id: 'acc-bank' },
        data: { balance: { decrement: 15000000 } },
      });

      expect(prisma.counterparty.update).toHaveBeenCalledWith({
        where: { id: 'supp-1' },
        data: {
          supplierDebt: { decrement: 15000000 },
          debtBalance: { decrement: 15000000 },
        },
      });

      expect(prisma.purchaseReceipt.update).toHaveBeenCalledWith({
        where: { id: 'rcp-1' },
        data: {
          paidAmount: 15000000,
          paymentStatus: PurchasePaymentStatus.PAID,
        },
      });
    });

    it('should reject expense if cash account has insufficient funds', async () => {
      prisma.cashAccount.findFirst.mockResolvedValue({
        id: 'acc-cash',
        balance: 100000,
        currency: 'UZS',
      });

      await expect(
        service.createExpense('tenant-1', {
          accountId: 'acc-cash',
          amount: 500000,
          currency: 'UZS',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('FIFO Auto-Allocation across open Purchase Receipts', () => {
    it('should allocate supplier payment across open purchase receipts via FIFO', async () => {
      prisma.cashAccount.findFirst.mockResolvedValue({
        id: 'acc-bank',
        balance: 10000000,
        currency: 'UZS',
      });
      prisma.financeTransaction.create.mockResolvedValue({
        id: 'tx-exp-fifo',
        amount: 6000000,
      });

      prisma.purchaseReceipt.findMany.mockResolvedValue([
        {
          id: 'rcp-1',
          totalAmount: 4000000,
          paidAmount: 0,
        },
        {
          id: 'rcp-2',
          totalAmount: 5000000,
          paidAmount: 0,
        },
      ]);

      await service.createExpense('tenant-1', {
        accountId: 'acc-bank',
        amount: 6000000,
        currency: 'UZS',
        counterpartyId: 'supp-1',
      });

      expect(prisma.purchaseReceipt.update).toHaveBeenCalledWith({
        where: { id: 'rcp-1' },
        data: {
          paidAmount: 4000000,
          paymentStatus: PurchasePaymentStatus.PAID,
        },
      });

      expect(prisma.purchaseReceipt.update).toHaveBeenCalledWith({
        where: { id: 'rcp-2' },
        data: {
          paidAmount: 2000000,
          paymentStatus: PurchasePaymentStatus.PARTIALLY_PAID,
        },
      });
    });
  });

  describe('Cancel Transaction (Storno) Invariants', () => {
    it('should safely cancel income, restore customer debt and invoice paidAmount', async () => {
      prisma.financeTransaction.findFirst.mockResolvedValue({
        id: 'tx-inc',
        tenantId: 'tenant-1',
        direction: TransactionDirection.INCOME,
        status: TransactionStatus.POSTED,
        accountId: 'acc-1',
        amount: 2000000,
        counterpartyId: 'cust-1',
        sourceDocType: 'SalesInvoice',
        sourceDocId: 'inv-1',
      });
      prisma.cashAccount.findUnique.mockResolvedValue({
        id: 'acc-1',
        balance: 3000000, // plenty of funds to reverse 2M
      });
      prisma.salesInvoice.findFirst.mockResolvedValue({
        id: 'inv-1',
        totalAmount: 5000000,
        paidAmount: 2000000,
      });

      const res = await service.cancelTransaction('tenant-1', 'tx-inc', {
        reason: 'Client cancelled transaction',
      });

      expect(res.status).toBe(TransactionStatus.CANCELLED);

      expect(prisma.cashAccount.update).toHaveBeenCalledWith({
        where: { id: 'acc-1' },
        data: { balance: { decrement: 2000000 } },
      });

      expect(prisma.counterparty.update).toHaveBeenCalledWith({
        where: { id: 'cust-1' },
        data: {
          customerDebt: { increment: 2000000 },
          debtBalance: { increment: 2000000 },
        },
      });

      expect(prisma.salesInvoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: {
          paidAmount: 0,
          paymentStatus: SalesPaymentStatus.UNPAID,
        },
      });
    });

    it('should block income cancellation if cash balance would go negative', async () => {
      prisma.financeTransaction.findFirst.mockResolvedValue({
        id: 'tx-inc-block',
        tenantId: 'tenant-1',
        direction: TransactionDirection.INCOME,
        status: TransactionStatus.POSTED,
        accountId: 'acc-1',
        amount: 2000000,
      });
      prisma.cashAccount.findUnique.mockResolvedValue({
        id: 'acc-1',
        balance: 500000, // only 500k left, cannot deduct 2M!
      });

      await expect(
        service.cancelTransaction('tenant-1', 'tx-inc-block'),
      ).rejects.toThrow(BadRequestException);
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
  });
});
