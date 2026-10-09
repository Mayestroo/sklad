import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CashAccountType, CounterpartySettlementSide } from '@prisma/client';
import { PrismaService } from '../../../common/prisma';
import { AuditService } from '../../audit/audit.service';
import { JournalService } from '../../accounting/journal/journal.service';
import { SalesOrdersService } from '../orders/sales-orders.service';
import { CounterpartySettlementService } from '../../settlements/counterparty-settlement.service';
import { SettlementAllocationService } from '../../settlements/settlement-allocation.service';
import { PaymentsService } from './payments.service';

describe('PaymentsService settlement ledger integration', () => {
  let service: PaymentsService;
  let prisma: any;
  let settlementService: { recordMovement: jest.Mock };
  let allocationService: { recordAllocation: jest.Mock };
  let auditService: { logAction: jest.Mock };
  let journalService: { autoPostPayment: jest.Mock };
  let salesOrdersService: { onPaymentRegistered: jest.Mock };

  beforeEach(async () => {
    settlementService = { recordMovement: jest.fn().mockResolvedValue({ created: true }) };
    allocationService = { recordAllocation: jest.fn().mockResolvedValue({ created: true }) };
    auditService = { logAction: jest.fn().mockResolvedValue(undefined) };
    journalService = { autoPostPayment: jest.fn().mockResolvedValue(undefined) };
    salesOrdersService = { onPaymentRegistered: jest.fn().mockResolvedValue(undefined) };
    prisma = {
      counterparty: {
        findFirst: jest.fn().mockResolvedValue({ id: 'cp-1', tenantId: 'tenant-1' }),
        update: jest.fn(),
      },
      salesInvoice: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({
            id: 'invoice-1', tenantId: 'tenant-1', counterpartyId: 'cp-1',
            currency: 'USD', exchangeRate: 12800, status: 'POSTED', paidAmount: 0, totalAmount: 300,
          })
          .mockResolvedValueOnce({
            id: 'invoice-1', tenantId: 'tenant-1', counterpartyId: 'cp-1',
            currency: 'USD', exchangeRate: 12800, status: 'POSTED', paidAmount: 0, totalAmount: 300,
          }),
        update: jest.fn(),
      },
      salesOrder: { findFirst: jest.fn(), update: jest.fn() },
      cashAccount: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cash-usd', tenantId: 'tenant-1', accountType: CashAccountType.USD_CASH,
          currency: 'USD', balance: 500,
        }),
        update: jest.fn(),
      },
      payment: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({
          id: 'payment-1', paymentNumber: 'PAY-000001', amount: 100, counterpartyId: 'cp-1',
        }),
      },
      financeTransaction: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({
          id: 'finance-1', amount: 100, currency: 'USD', settlementSide: CounterpartySettlementSide.CUSTOMER,
        }),
      },
      $transaction: jest.fn(async (callback) => callback(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: JournalService, useValue: journalService },
        { provide: SalesOrdersService, useValue: salesOrdersService },
        { provide: CounterpartySettlementService, useValue: settlementService },
        { provide: SettlementAllocationService, useValue: allocationService },
      ],
    }).compile();
    service = module.get(PaymentsService);
  });

  it('records exactly one customer-side USD movement and invoice allocation', async () => {
    await service.registerPayment('tenant-1', {
      counterpartyId: 'cp-1',
      invoiceId: 'invoice-1',
      method: 'CASH',
      amount: 100,
      currency: 'USD',
      exchangeRate: 12800,
      cashAccountId: 'cash-usd',
    }, 'user-1');

    expect(prisma.counterparty.update).not.toHaveBeenCalled();
    expect(prisma.financeTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ exchangeRate: 12800 }),
    }));
    expect(settlementService.recordMovement).toHaveBeenCalledWith(prisma, expect.objectContaining({
      tenantId: 'tenant-1',
      counterpartyId: 'cp-1',
      currency: 'USD',
      side: CounterpartySettlementSide.CUSTOMER,
      amount: -100,
      sourceDocType: 'FinanceTransaction',
      sourceDocId: 'finance-1',
    }));
    expect(allocationService.recordAllocation).toHaveBeenCalledWith(prisma, expect.objectContaining({
      tenantId: 'tenant-1',
      counterpartyId: 'cp-1',
      financeTransactionId: 'finance-1',
      amount: 100,
    }));
  });

  it('requires a real same-currency cash or bank account for a sales payment', async () => {
    prisma.cashAccount.findFirst.mockResolvedValue(null);

    await expect(service.registerPayment('tenant-1', {
      counterpartyId: 'cp-1',
      invoiceId: 'invoice-1',
      method: 'CASH',
      amount: 100,
      currency: 'USD',
    }, 'user-1')).rejects.toThrow(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires a sales payment to be linked to exactly one invoice or order', async () => {
    await expect(service.registerPayment('tenant-1', {
      counterpartyId: 'cp-1',
      method: 'CASH',
      amount: 100,
      currency: 'UZS',
    }, 'user-1')).rejects.toThrow(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['cash', 'CASH', CashAccountType.BANK],
    ['bank', 'BANK_TRANSFER', CashAccountType.UZS_CASH],
  ] as const)(
    'does not route a %s payment through the wrong account type',
    async (_label, method, accountType) => {
      prisma.salesInvoice.findFirst.mockReset().mockResolvedValue({
        id: 'invoice-1',
        tenantId: 'tenant-1',
        counterpartyId: 'cp-1',
        currency: 'UZS',
        exchangeRate: 1,
        status: 'POSTED',
        paidAmount: 0,
        totalAmount: 300,
      });
      prisma.cashAccount.findFirst.mockResolvedValue({
        id: 'wrong-account',
        tenantId: 'tenant-1',
        accountType,
        currency: 'UZS',
        balance: 500,
        isActive: true,
      });

      await expect(service.registerPayment('tenant-1', {
        counterpartyId: 'cp-1',
        invoiceId: 'invoice-1',
        method,
        amount: 100,
        currency: 'UZS',
        cashAccountId: 'wrong-account',
      }, 'user-1')).rejects.toThrow(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
});
