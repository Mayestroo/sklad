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
  CounterpartySettlementSide,
  SettlementAllocationTarget,
} from '@prisma/client';
import { CounterpartySettlementService } from '../settlements/counterparty-settlement.service';
import { SettlementAllocationService } from '../settlements/settlement-allocation.service';

describe('FinanceService Settlement Unit Test Suite', () => {
  let service: FinanceService;
  let prisma: any;
  let settlementService: { recordMovement: jest.Mock };
  let allocationService: { recordAllocation: jest.Mock; reverseAllocation: jest.Mock };

  beforeEach(async () => {
    settlementService = { recordMovement: jest.fn().mockResolvedValue({ created: true }) };
    allocationService = {
      recordAllocation: jest.fn().mockResolvedValue({ created: true }),
      reverseAllocation: jest.fn().mockResolvedValue({ created: true }),
    };
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
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      counterparty: {
        findFirst: jest.fn().mockResolvedValue({ id: 'cp-1', tenantId: 'tenant-1', type: 'CUSTOMER' }),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      counterpartyBalance: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
      },
      settlementAllocation: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      counterpartySettlementEntry: {
        findUnique: jest.fn().mockResolvedValue({ id: 'ledger-entry-1' }),
      },
      salesInvoice: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      salesOrder: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      purchaseReceipt: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      serviceAct: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      salesReturn: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      purchaseReturn: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      additionalExpense: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      $transaction: jest.fn(async (cb) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinanceService,
        { provide: PrismaService, useValue: prisma },
        { provide: CounterpartySettlementService, useValue: settlementService },
        { provide: SettlementAllocationService, useValue: allocationService },
      ],
    }).compile();

    service = module.get<FinanceService>(FinanceService);
  });

  describe('Dashboard settlement projections', () => {
    it('returns receivables, payables, and advances by native currency', async () => {
      prisma.cashAccount.findMany.mockResolvedValue([]);
      prisma.financeTransaction.findMany.mockResolvedValue([]);
      prisma.counterpartyBalance.findMany = jest.fn().mockResolvedValue([
        { currency: 'USD', customerDebt: 100, supplierDebt: 20 },
        { currency: 'UZS', customerDebt: -30, supplierDebt: -40 },
      ]);
      prisma.purchaseReceipt = { findFirst: jest.fn().mockResolvedValue(null) };
      prisma.salesInvoice = { ...prisma.salesInvoice, findFirst: jest.fn().mockResolvedValue(null) };
      prisma.company = { findUnique: jest.fn().mockResolvedValue(null) };

      const metrics = await service.getDashboardMetrics('tenant-1');

      expect(metrics.debts).toEqual({
        receivables: 100,
        payables: 20,
        receivablesByCurrency: [{ currency: 'USD', amount: 100 }],
        payablesByCurrency: [{ currency: 'USD', amount: 20 }],
        customerAdvancesByCurrency: [{ currency: 'UZS', amount: 30 }],
        supplierAdvancesByCurrency: [{ currency: 'UZS', amount: 40 }],
      });
      expect(metrics.debts.receivablesByCurrency).not.toContainEqual(expect.objectContaining({ currency: 'UZS' }));
    });
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
        tenantId: 'tenant-1',
        counterpartyId: 'cust-1',
        currency: 'UZS',
        status: SalesDocStatus.POSTED,
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

      expect(settlementService.recordMovement).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        tenantId: 'tenant-1',
        counterpartyId: 'cust-1',
        currency: 'UZS',
        side: CounterpartySettlementSide.CUSTOMER,
        amount: -5000000,
      }));
      expect(allocationService.recordAllocation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        tenantId: 'tenant-1',
        counterpartyId: 'cust-1',
        financeTransactionId: 'tx-1',
        targetType: SettlementAllocationTarget.SALES_INVOICE,
        targetId: 'inv-1',
        amount: 5000000,
      }));

      expect(prisma.salesInvoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: {
          paidAmount: 5000000,
          paymentStatus: SalesPaymentStatus.PAID,
        },
      });
    });

    it('requires a settlement side for an unlinked counterparty income', async () => {
      prisma.cashAccount.findFirst.mockResolvedValue({ id: 'acc-1', balance: 1000, currency: 'UZS' });
      prisma.counterparty.findFirst.mockResolvedValue({ id: 'cp-both', tenantId: 'tenant-1', type: 'BOTH' });

      await expect(service.createIncome('tenant-1', {
        accountId: 'acc-1',
        amount: 100,
        currency: 'UZS',
        counterpartyId: 'cp-both',
      })).rejects.toThrow(BadRequestException);
    });

    it('classifies a supplier refund separately from customer income', async () => {
      prisma.cashAccount.findFirst.mockResolvedValue({ id: 'acc-1', balance: 1000, currency: 'USD' });
      prisma.financeTransaction.create.mockResolvedValue({ id: 'tx-supplier-refund', amount: 100 });
      prisma.counterparty.findFirst.mockResolvedValue({ id: 'cp-both', tenantId: 'tenant-1', type: 'BOTH' });
      prisma.counterpartyBalance.findUnique.mockResolvedValue({ supplierDebt: -250, customerDebt: 0 });

      await service.createIncome('tenant-1', {
        accountId: 'acc-1',
        amount: 100,
        currency: 'USD',
        counterpartyId: 'cp-both',
        settlementSide: CounterpartySettlementSide.SUPPLIER,
      });

      expect(settlementService.recordMovement).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        side: CounterpartySettlementSide.SUPPLIER,
        amount: 100,
        currency: 'USD',
      }));
      expect(prisma.counterparty.update).not.toHaveBeenCalled();
    });

  });

  describe('Sales Order Pre-Payment Settlement', () => {
    it('should accept prepayment on SalesOrder and transition status to PAYMENT_CONFIRMED when 100% paid', async () => {
      prisma.cashAccount.findFirst.mockResolvedValue({ id: 'acc-1', balance: 500000 });
      prisma.financeTransaction.create.mockResolvedValue({ id: 'tx-ord-1', amount: 10000000 });
      prisma.salesOrder.findFirst.mockResolvedValue({
        id: 'ord-1',
        counterpartyId: 'cust-1',
        currency: 'UZS',
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
      prisma.salesInvoice.findFirst.mockImplementation(({ where }: any) => ({
        id: where.id,
        totalAmount: where.id === 'inv-1' ? 3000000 : 5000000,
        paidAmount: where.id === 'inv-1' ? 1000000 : 0,
      }));

      await service.createIncome('tenant-1', {
        accountId: 'acc-1',
        amount: 4000000,
        currency: 'UZS',
        counterpartyId: 'cust-1',
        settlementSide: CounterpartySettlementSide.CUSTOMER,
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
        counterpartyId: 'supp-1',
        currency: 'UZS',
        status: PurchaseDocStatus.POSTED,
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

      expect(settlementService.recordMovement).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        counterpartyId: 'supp-1',
        currency: 'UZS',
        side: CounterpartySettlementSide.SUPPLIER,
        amount: -15000000,
      }));
      expect(allocationService.recordAllocation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        targetType: SettlementAllocationTarget.PURCHASE_RECEIPT,
        targetId: 'rcp-1',
        financeTransactionId: 'tx-exp-1',
        amount: 15000000,
      }));

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
          docDate: new Date('2026-01-01'),
          totalAmount: 4000000,
          paidAmount: 0,
        },
        {
          id: 'rcp-2',
          docDate: new Date('2026-01-05'),
          totalAmount: 5000000,
          paidAmount: 0,
        },
      ]);
      prisma.purchaseReceipt.findFirst.mockImplementation(({ where }: any) => ({
        id: where.id,
        totalAmount: where.id === 'rcp-1' ? 4000000 : 5000000,
        paidAmount: 0,
      }));

      await service.createExpense('tenant-1', {
        accountId: 'acc-bank',
        amount: 6000000,
        currency: 'UZS',
        counterpartyId: 'supp-1',
        settlementSide: CounterpartySettlementSide.SUPPLIER,
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
        currency: 'UZS',
        counterpartyId: 'cust-1',
        settlementSide: CounterpartySettlementSide.CUSTOMER,
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

      expect(settlementService.recordMovement).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        counterpartyId: 'cust-1',
        currency: 'UZS',
        side: CounterpartySettlementSide.CUSTOMER,
        amount: 2000000,
        entryType: 'FINANCE_TRANSACTION_CANCELLED',
        sourceDocId: 'tx-inc',
        reversesEntryId: 'ledger-entry-1',
      }));

      expect(prisma.salesInvoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: {
          paidAmount: 0,
          paymentStatus: SalesPaymentStatus.UNPAID,
        },
      });
      expect(prisma.financeTransaction.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'tx-inc',
          tenantId: 'tenant-1',
          isDeleted: false,
          status: TransactionStatus.POSTED,
        },
        data: expect.objectContaining({
          status: TransactionStatus.CANCELLED,
        }),
      });
      expect(prisma.financeTransaction.updateMany.mock.calls[0][0].data).not.toHaveProperty('isDeleted');
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

    it('rejects when the POSTED compare-and-set no longer matches', async () => {
      prisma.financeTransaction.findFirst.mockResolvedValue({
        id: 'tx-stale-cancel',
        tenantId: 'tenant-1',
        direction: TransactionDirection.INCOME,
        status: TransactionStatus.POSTED,
        accountId: 'acc-1',
        amount: 100,
      });
      prisma.cashAccount.findUnique.mockResolvedValue({ id: 'acc-1', balance: 500 });
      prisma.financeTransaction.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.cancelTransaction('tenant-1', 'tx-stale-cancel'),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.financeTransaction.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'tx-stale-cancel',
          tenantId: 'tenant-1',
          isDeleted: false,
          status: TransactionStatus.POSTED,
        },
        data: expect.objectContaining({
          status: TransactionStatus.CANCELLED,
          cancelledById: null,
          cancellationReason: null,
        }),
      });
      expect(prisma.financeTransaction.updateMany.mock.calls[0][0].data).not.toHaveProperty('isDeleted');
    });
  });

  describe('Deleted Finance Transactions', () => {
    it('reverses posted income and marks it deleted atomically', async () => {
      prisma.financeTransaction.findFirst.mockResolvedValue({
        id: 'tx-delete',
        tenantId: 'tenant-1',
        direction: TransactionDirection.INCOME,
        status: TransactionStatus.POSTED,
        accountId: 'acc-1',
        amount: 2000000,
        currency: 'UZS',
        counterpartyId: 'cust-1',
        settlementSide: CounterpartySettlementSide.CUSTOMER,
        sourceDocType: 'SalesInvoice',
        sourceDocId: 'inv-1',
      });
      prisma.cashAccount.findUnique.mockResolvedValue({ id: 'acc-1', balance: 3000000 });
      prisma.salesInvoice.findFirst.mockResolvedValue({
        id: 'inv-1',
        totalAmount: 5000000,
        paidAmount: 2000000,
      });

      const result = await service.deleteTransaction('tenant-1', 'tx-delete', 'user-1');

      expect(result).toEqual({
        success: true,
        id: 'tx-delete',
        status: TransactionStatus.CANCELLED,
        isDeleted: true,
      });
      expect(prisma.cashAccount.update).toHaveBeenCalledWith({
        where: { id: 'acc-1' },
        data: { balance: { decrement: 2000000 } },
      });
      expect(prisma.financeTransaction.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'tx-delete',
          tenantId: 'tenant-1',
          isDeleted: false,
          status: TransactionStatus.POSTED,
        },
        data: expect.objectContaining({
          status: TransactionStatus.CANCELLED,
          cancelledById: 'user-1',
          isDeleted: true,
        }),
      });
      expect(settlementService.recordMovement).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        counterpartyId: 'cust-1',
        currency: 'UZS',
        side: CounterpartySettlementSide.CUSTOMER,
        amount: 2000000,
        entryType: 'FINANCE_TRANSACTION_DELETED',
        sourceDocId: 'tx-delete',
        reversesEntryId: 'ledger-entry-1',
      }));
      expect(prisma.salesInvoice.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { paidAmount: 0, paymentStatus: SalesPaymentStatus.UNPAID },
      });
    });

    it('restores expense cash, supplier debt, and receipt balance before soft deletion', async () => {
      prisma.financeTransaction.findFirst.mockResolvedValue({
        id: 'tx-expense',
        tenantId: 'tenant-1',
        direction: TransactionDirection.EXPENSE,
        status: TransactionStatus.POSTED,
        accountId: 'acc-1',
        amount: 2000000,
        currency: 'UZS',
        counterpartyId: 'supplier-1',
        settlementSide: CounterpartySettlementSide.SUPPLIER,
        sourceDocType: 'PurchaseReceipt',
        sourceDocId: 'receipt-1',
      });
      prisma.purchaseReceipt.findFirst.mockResolvedValue({
        id: 'receipt-1',
        totalAmount: 5000000,
        paidAmount: 2000000,
      });

      await service.deleteTransaction('tenant-1', 'tx-expense', 'user-1');

      expect(prisma.cashAccount.update).toHaveBeenCalledWith({
        where: { id: 'acc-1' },
        data: { balance: { increment: 2000000 } },
      });
      expect(settlementService.recordMovement).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        counterpartyId: 'supplier-1',
        currency: 'UZS',
        side: CounterpartySettlementSide.SUPPLIER,
        amount: 2000000,
        entryType: 'FINANCE_TRANSACTION_DELETED',
        sourceDocId: 'tx-expense',
        reversesEntryId: 'ledger-entry-1',
      }));
      expect(prisma.purchaseReceipt.update).toHaveBeenCalledWith({
        where: { id: 'receipt-1' },
        data: { paidAmount: 0, paymentStatus: PurchasePaymentStatus.UNPAID },
      });
      expect(prisma.financeTransaction.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'tx-expense',
          tenantId: 'tenant-1',
          isDeleted: false,
          status: TransactionStatus.POSTED,
        },
        data: expect.objectContaining({ isDeleted: true, status: TransactionStatus.CANCELLED }),
      });
    });

    it('reverses both cash-account movements before soft deleting a transfer', async () => {
      prisma.financeTransaction.findFirst.mockResolvedValue({
        id: 'tx-transfer',
        tenantId: 'tenant-1',
        direction: TransactionDirection.TRANSFER,
        status: TransactionStatus.POSTED,
        accountId: 'acc-source',
        transferToId: 'acc-destination',
        amount: 100,
        transferToAmount: 120,
        currency: 'USD',
      });
      prisma.cashAccount.findUnique.mockResolvedValue({ id: 'acc-destination', balance: 200 });

      await service.deleteTransaction('tenant-1', 'tx-transfer', 'user-1');

      expect(prisma.cashAccount.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'acc-destination' },
        data: { balance: { decrement: 120 } },
      });
      expect(prisma.cashAccount.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'acc-source' },
        data: { balance: { increment: 100 } },
      });
      expect(prisma.financeTransaction.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'tx-transfer',
          tenantId: 'tenant-1',
          isDeleted: false,
          status: TransactionStatus.POSTED,
        },
        data: expect.objectContaining({ isDeleted: true, status: TransactionStatus.CANCELLED }),
      });
    });

    it('rejects a delete when the POSTED compare-and-set affects no row', async () => {
      prisma.financeTransaction.findFirst.mockResolvedValue({
        id: 'tx-stale-delete',
        tenantId: 'tenant-1',
        direction: TransactionDirection.INCOME,
        status: TransactionStatus.POSTED,
        accountId: 'acc-1',
        amount: 100,
      });
      prisma.cashAccount.findUnique.mockResolvedValue({ id: 'acc-1', balance: 500 });
      prisma.financeTransaction.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.deleteTransaction('tenant-1', 'tx-stale-delete', 'user-1'),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.financeTransaction.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'tx-stale-delete',
          tenantId: 'tenant-1',
          isDeleted: false,
          status: TransactionStatus.POSTED,
        },
        data: expect.objectContaining({
          status: TransactionStatus.CANCELLED,
          cancelledById: 'user-1',
          isDeleted: true,
        }),
      });
    });

    it('discards transaction-local cash reversal when the settlement ledger write fails', async () => {
      const failure = new Error('settlement ledger write failed');
      settlementService.recordMovement.mockRejectedValueOnce(failure);
      const initialPersistedState = {
        cashBalance: 500,
        counterparty: { customerDebt: 250, debtBalance: 400 },
        counterpartyBalance: { customerDebt: 75 },
        transaction: {
          status: TransactionStatus.POSTED,
          isDeleted: false,
        },
      };
      let persistedState = {
        cashBalance: initialPersistedState.cashBalance,
        counterparty: { ...initialPersistedState.counterparty },
        counterpartyBalance: { ...initialPersistedState.counterpartyBalance },
        transaction: { ...initialPersistedState.transaction },
      };
      let transactionState: typeof persistedState | undefined;
      const transactionClient = {
        financeTransaction: {
          findFirst: jest.fn().mockImplementation(async () => ({
            id: 'tx-failed-reversal',
            tenantId: 'tenant-1',
            direction: TransactionDirection.INCOME,
            status: transactionState?.transaction.status,
            isDeleted: transactionState?.transaction.isDeleted,
            accountId: 'acc-1',
            amount: 100,
            currency: 'UZS',
            counterpartyId: 'cust-1',
            settlementSide: CounterpartySettlementSide.CUSTOMER,
          })),
          updateMany: jest.fn().mockImplementation(async ({ where, data }) => {
            if (
              where.id !== 'tx-failed-reversal' ||
              where.tenantId !== 'tenant-1' ||
              where.isDeleted !== transactionState?.transaction.isDeleted ||
              where.status !== transactionState?.transaction.status ||
              transactionState?.transaction.status !== TransactionStatus.POSTED ||
              transactionState?.transaction.isDeleted !== false
            ) {
              return { count: 0 };
            }

            transactionState!.transaction.status = data.status;
            if (data.isDeleted !== undefined) {
              transactionState!.transaction.isDeleted = data.isDeleted;
            }
            return { count: 1 };
          }),
        },
        cashAccount: {
          findUnique: jest.fn().mockImplementation(async () => ({
            id: 'acc-1',
            balance: transactionState?.cashBalance,
          })),
          update: jest.fn().mockImplementation(async ({ data }) => {
            const balanceChange = data.balance;
            if (balanceChange.decrement !== undefined) {
              transactionState!.cashBalance -= balanceChange.decrement;
            }
            if (balanceChange.increment !== undefined) {
              transactionState!.cashBalance += balanceChange.increment;
            }
          }),
        },
        counterpartySettlementEntry: {
          findUnique: jest.fn().mockResolvedValue({ id: 'ledger-entry-1' }),
        },
        counterparty: {
          update: jest.fn().mockImplementation(async ({ data }) => {
            for (const field of ['customerDebt', 'debtBalance'] as const) {
              if (data[field].increment !== undefined) {
                transactionState!.counterparty[field] += data[field].increment;
              }
              if (data[field].decrement !== undefined) {
                transactionState!.counterparty[field] -= data[field].decrement;
              }
            }
          }),
        },
        counterpartyBalance: { upsert: jest.fn().mockRejectedValue(failure) },
      };
      prisma.$transaction.mockImplementation(async (callback) => {
        const workingState = {
          cashBalance: persistedState.cashBalance,
          counterparty: { ...persistedState.counterparty },
          counterpartyBalance: { ...persistedState.counterpartyBalance },
          transaction: { ...persistedState.transaction },
        };
        transactionState = workingState;

        const result = await callback(transactionClient);
        persistedState = workingState;
        return result;
      });

      await expect(
        service.deleteTransaction('tenant-1', 'tx-failed-reversal', 'user-1'),
      ).rejects.toThrow('settlement ledger write failed');

      expect(transactionState).toEqual({
        cashBalance: 400,
        counterparty: { customerDebt: 250, debtBalance: 400 },
        counterpartyBalance: { customerDebt: 75 },
        transaction: {
          status: TransactionStatus.POSTED,
          isDeleted: false,
        },
      });
      expect(persistedState).toEqual(initialPersistedState);
      expect(transactionClient.cashAccount.update).toHaveBeenCalledWith({
        where: { id: 'acc-1' },
        data: { balance: { decrement: 100 } },
      });
      expect(settlementService.recordMovement).toHaveBeenCalledWith(
        transactionClient,
        expect.objectContaining({
          counterpartyId: 'cust-1',
          currency: 'UZS',
          side: CounterpartySettlementSide.CUSTOMER,
          amount: 100,
          reversesEntryId: 'ledger-entry-1',
        }),
      );
      expect(transactionClient.financeTransaction.updateMany).not.toHaveBeenCalled();
      expect(prisma.cashAccount.update).not.toHaveBeenCalled();
      expect(prisma.counterparty.update).not.toHaveBeenCalled();
      expect(prisma.counterpartyBalance.upsert).not.toHaveBeenCalled();
      expect(prisma.financeTransaction.update).not.toHaveBeenCalled();
      expect(prisma.financeTransaction.updateMany).not.toHaveBeenCalled();
    });

    it('does not mark income deleted when reversal would make cash negative', async () => {
      prisma.financeTransaction.findFirst.mockResolvedValue({
        id: 'tx-insufficient',
        tenantId: 'tenant-1',
        direction: TransactionDirection.INCOME,
        status: TransactionStatus.POSTED,
        accountId: 'acc-1',
        amount: 2000000,
      });
      prisma.cashAccount.findUnique.mockResolvedValue({ id: 'acc-1', balance: 500000 });

      await expect(service.deleteTransaction('tenant-1', 'tx-insufficient', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.financeTransaction.update).not.toHaveBeenCalled();
      expect(prisma.financeTransaction.updateMany).not.toHaveBeenCalled();
      expect(prisma.cashAccount.update).not.toHaveBeenCalled();
    });

    it('moves an already-cancelled transaction to trash without repeating the reversal', async () => {
      prisma.financeTransaction.findFirst.mockResolvedValue({
        id: 'tx-cancelled',
        tenantId: 'tenant-1',
        direction: TransactionDirection.INCOME,
        status: TransactionStatus.CANCELLED,
        accountId: 'acc-1',
        amount: 2000000,
      });

      await service.deleteTransaction('tenant-1', 'tx-cancelled', 'user-1');

      expect(prisma.financeTransaction.update).toHaveBeenCalledWith({
        where: { id: 'tx-cancelled' },
        data: { isDeleted: true },
      });
      expect(prisma.cashAccount.update).not.toHaveBeenCalled();
      expect(prisma.salesInvoice.update).not.toHaveBeenCalled();
    });

    it('restores a deleted transaction to the journal without reapplying its financial effect', async () => {
      prisma.financeTransaction.findFirst.mockResolvedValue({
        id: 'tx-restore',
        tenantId: 'tenant-1',
        status: TransactionStatus.CANCELLED,
        isDeleted: true,
      });
      prisma.financeTransaction.update.mockResolvedValue({
        id: 'tx-restore',
        status: TransactionStatus.CANCELLED,
        isDeleted: false,
      });

      const result = await service.restoreTransaction('tenant-1', 'tx-restore');

      expect(result).toEqual({
        id: 'tx-restore',
        status: TransactionStatus.CANCELLED,
        isDeleted: false,
      });
      expect(prisma.financeTransaction.update).toHaveBeenCalledWith({
        where: { id: 'tx-restore' },
        data: { isDeleted: false },
      });
      expect(prisma.cashAccount.update).not.toHaveBeenCalled();
    });

    it('lists journal and deleted transactions with opposite soft-delete filters', async () => {
      prisma.financeTransaction.count.mockResolvedValue(0);
      prisma.financeTransaction.findMany.mockResolvedValue([]);

      await service.getTransactions('tenant-1', { page: 1, limit: 25 });
      await service.getDeletedTransactions('tenant-1', { page: 1, limit: 25 });

      expect(prisma.financeTransaction.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-1', isDeleted: false }) }),
      );
      expect(prisma.financeTransaction.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-1', isDeleted: true }) }),
      );
    });
  });

  describe('ServiceAct Settlement in Finance', () => {
    it('should reconcile income payment to ServiceAct, updating paidAmount and paymentStatus to PAID', async () => {
      prisma.cashAccount.findFirst.mockResolvedValue({ id: 'acc-1', balance: 500000 });
      prisma.financeTransaction.create.mockResolvedValue({ id: 'tx-srv-1', amount: 1200000 });
      prisma.serviceAct.findFirst.mockResolvedValue({
        id: 'act-1',
        tenantId: 'tenant-1',
        counterpartyId: 'cust-1',
        currency: 'UZS',
        status: 'POSTED',
        type: 'PROVIDED',
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
