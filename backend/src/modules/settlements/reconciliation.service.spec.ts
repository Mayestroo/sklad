import { CounterpartySettlementSide } from '@prisma/client';
import { ReconciliationService } from './reconciliation.service';

describe('ReconciliationService', () => {
  let service: ReconciliationService;
  let prisma: any;
  let settlementService: { recordMovement: jest.Mock; rebuildBalances: jest.Mock };

  beforeEach(() => {
    prisma = {
      openingBalanceLine: { findMany: jest.fn().mockResolvedValue([]) },
      salesInvoice: { findMany: jest.fn().mockResolvedValue([]) },
      salesOrder: { findMany: jest.fn().mockResolvedValue([]) },
      salesReturn: { findMany: jest.fn().mockResolvedValue([]) },
      purchaseReceipt: { findMany: jest.fn().mockResolvedValue([]) },
      purchaseReturn: { findMany: jest.fn().mockResolvedValue([]) },
      additionalExpense: { findMany: jest.fn().mockResolvedValue([]) },
      serviceAct: { findMany: jest.fn().mockResolvedValue([]) },
      financeTransaction: { findMany: jest.fn().mockResolvedValue([]) },
      payment: { findMany: jest.fn().mockResolvedValue([]) },
      counterpartySettlementEntry: { findMany: jest.fn().mockResolvedValue([]) },
      settlementAllocation: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      counterpartyBalance: { findMany: jest.fn().mockResolvedValue([]) },
      counterparty: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (callback) => callback(prisma)),
    };
    settlementService = {
      recordMovement: jest.fn().mockResolvedValue({ created: true }),
      rebuildBalances: jest.fn().mockResolvedValue([]),
    };
    service = new ReconciliationService(prisma, settlementService as any);
  });

  it('plans posted source movements in native currency and preserves side separation', async () => {
    prisma.openingBalanceLine.findMany.mockResolvedValue([
      {
        id: 'opening-customer-debt',
        counterpartyId: 'cp-1',
        currency: 'USD',
        category: 'CUSTOMER_DEBT',
        amount: 100,
        document: { status: 'POSTED', openingDate: new Date('2025-01-01') },
      },
      {
        id: 'opening-supplier-advance',
        counterpartyId: 'cp-1',
        currency: 'UZS',
        category: 'SUPPLIER_ADVANCE',
        amount: 20,
        document: { status: 'POSTED', openingDate: new Date('2025-01-01') },
      },
    ]);
    prisma.salesInvoice.findMany.mockResolvedValue([
      {
        id: 'invoice-1',
        counterpartyId: 'cp-1',
        currency: 'USD',
        totalAmount: 200,
        paidAmount: 0,
        invoiceDate: new Date('2025-01-02'),
      },
    ]);
    prisma.salesReturn.findMany.mockResolvedValue([
      {
        id: 'sales-return-1',
        counterpartyId: 'cp-1',
        currency: 'USD',
        totalAmount: 10,
        returnDate: new Date('2025-01-03'),
      },
    ]);
    prisma.purchaseReceipt.findMany.mockResolvedValue([
      {
        id: 'receipt-1',
        counterpartyId: 'cp-1',
        currency: 'USD',
        totalAmount: 300,
        paidAmount: 0,
        docDate: new Date('2025-01-04'),
      },
    ]);
    prisma.purchaseReturn.findMany.mockResolvedValue([
      {
        id: 'purchase-return-1',
        counterpartyId: 'cp-1',
        currency: 'UZS',
        totalAmount: 30,
        returnDate: new Date('2025-01-05'),
      },
    ]);
    prisma.additionalExpense.findMany.mockResolvedValue([
      {
        id: 'expense-unpaid',
        counterpartyId: 'cp-1',
        currency: 'UZS',
        amount: 40,
        vatAmount: 4,
        isPaid: false,
        docDate: new Date('2025-01-06'),
      },
      {
        id: 'expense-paid',
        counterpartyId: 'cp-1',
        currency: 'UZS',
        amount: 50,
        vatAmount: 5,
        isPaid: true,
        docDate: new Date('2025-01-06'),
      },
    ]);
    prisma.serviceAct.findMany.mockResolvedValue([
      {
        id: 'service-customer',
        counterpartyId: 'cp-1',
        currency: 'USD',
        type: 'PROVIDED',
        totalAmount: 50,
        paidAmount: 0,
        actDate: new Date('2025-01-07'),
      },
      {
        id: 'service-supplier',
        counterpartyId: 'cp-1',
        currency: 'UZS',
        type: 'RECEIVED',
        totalAmount: 60,
        paidAmount: 0,
        actDate: new Date('2025-01-07'),
      },
    ]);
    prisma.financeTransaction.findMany.mockResolvedValue([
      {
        id: 'payment-tx',
        counterpartyId: 'cp-1',
        settlementSide: null,
        direction: 'INCOME',
        amount: 25,
        currency: 'USD',
        transactionDate: new Date('2025-01-08'),
        sourceDocType: 'PAYMENT',
        sourceDocId: 'payment-1',
      },
      {
        id: 'ambiguous-finance-tx',
        counterpartyId: 'cp-1',
        settlementSide: null,
        direction: 'INCOME',
        amount: 10,
        currency: 'UZS',
        transactionDate: new Date('2025-01-09'),
        sourceDocType: null,
        sourceDocId: null,
      },
    ]);
    prisma.payment.findMany.mockResolvedValue([
      {
        id: 'payment-1',
        counterpartyId: 'cp-1',
        invoiceId: null,
        orderId: null,
        amount: 25,
        paymentDate: new Date('2025-01-08'),
        invoice: null,
        salesOrder: null,
        cashAccount: { currency: 'USD' },
      },
    ]);

    const result = await service.reconcileCounterpartyLedger('tenant-1', { apply: false });
    const movementById = new Map(result.plannedEntries.map((entry) => [entry.sourceDocId, entry]));

    expect(movementById.get('opening-customer-debt')).toMatchObject({
      side: CounterpartySettlementSide.CUSTOMER,
      currency: 'USD',
      amount: 100,
    });
    expect(movementById.get('opening-supplier-advance')).toMatchObject({
      side: CounterpartySettlementSide.SUPPLIER,
      currency: 'UZS',
      amount: -20,
    });
    expect(movementById.get('invoice-1')?.amount).toBe(200);
    expect(movementById.get('sales-return-1')?.amount).toBe(-10);
    expect(movementById.get('receipt-1')?.side).toBe(CounterpartySettlementSide.SUPPLIER);
    expect(movementById.get('purchase-return-1')?.amount).toBe(-30);
    expect(movementById.get('expense-unpaid')?.amount).toBe(44);
    expect(movementById.has('expense-paid')).toBe(false);
    expect(movementById.get('service-customer')?.side).toBe(CounterpartySettlementSide.CUSTOMER);
    expect(movementById.get('service-supplier')?.side).toBe(CounterpartySettlementSide.SUPPLIER);
    expect(movementById.get('payment-tx')).toMatchObject({
      sourceDocType: 'FinanceTransaction',
      amount: -25,
      side: CounterpartySettlementSide.CUSTOMER,
    });
    expect(result.exceptions).toContainEqual(expect.objectContaining({
      sourceType: 'FinanceTransaction',
      sourceId: 'ambiguous-finance-tx',
    }));
    expect(result.entriesCreated).toBe(0);
    expect(settlementService.recordMovement).not.toHaveBeenCalled();
    expect(prisma.settlementAllocation.createMany).not.toHaveBeenCalled();
  });

  it('does not duplicate a payment when Payment metadata and FinanceTransaction refer to the same cash event', async () => {
    prisma.salesInvoice.findMany.mockResolvedValue([
      {
        id: 'invoice-1',
        counterpartyId: 'cp-1',
        currency: 'USD',
        totalAmount: 500,
        paidAmount: 100,
        invoiceDate: new Date('2025-01-01'),
      },
    ]);
    prisma.financeTransaction.findMany.mockResolvedValue([
      {
        id: 'finance-1',
        counterpartyId: 'cp-1',
        settlementSide: null,
        direction: 'INCOME',
        amount: 100,
        currency: 'USD',
        transactionDate: new Date('2025-01-02'),
        sourceDocType: 'PAYMENT',
        sourceDocId: 'payment-1',
      },
    ]);
    prisma.payment.findMany.mockResolvedValue([
      {
        id: 'payment-1',
        counterpartyId: 'cp-1',
        invoiceId: 'invoice-1',
        orderId: null,
        amount: 100,
        paymentDate: new Date('2025-01-02'),
        invoice: { currency: 'USD' },
        salesOrder: null,
        cashAccount: { currency: 'USD' },
      },
    ]);

    const result = await service.reconcileCounterpartyLedger('tenant-1', { apply: false });

    const paymentMovements = result.plannedEntries.filter((entry) => entry.sourceDocType === 'FinanceTransaction');
    expect(paymentMovements).toHaveLength(1);
    expect(paymentMovements[0]).toMatchObject({
      sourceDocType: 'FinanceTransaction',
      sourceDocId: 'finance-1',
      amount: -100,
    });
    expect(result.plannedAllocations).toEqual([
      expect.objectContaining({
        financeTransactionId: 'finance-1',
        targetType: 'SALES_INVOICE',
        targetId: 'invoice-1',
        amount: 100,
      }),
    ]);
    expect(result.exceptions).toHaveLength(0);
  });

  it('reports orphan scalar balances and unsupported currencies without guessing', async () => {
    prisma.salesInvoice.findMany.mockResolvedValue([
      {
        id: 'invoice-eur',
        counterpartyId: 'cp-eur',
        currency: 'EUR',
        totalAmount: 100,
        paidAmount: 0,
        invoiceDate: new Date('2025-01-01'),
      },
    ]);
    prisma.counterparty.findMany.mockResolvedValue([
      { id: 'cp-orphan', debtBalance: 500, customerDebt: 500, supplierDebt: 0 },
    ]);

    const result = await service.reconcileCounterpartyLedger('tenant-1', { apply: true });

    expect(result.plannedEntries).toHaveLength(0);
    expect(result.exceptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceType: 'SalesInvoice', sourceId: 'invoice-eur' }),
      expect.objectContaining({ sourceType: 'Counterparty', sourceId: 'cp-orphan' }),
    ]));
    expect(settlementService.recordMovement).not.toHaveBeenCalled();
    expect(settlementService.rebuildBalances).not.toHaveBeenCalled();
  });

  it('does not apply a partial backfill when document paidAmount cannot be explained', async () => {
    prisma.salesInvoice.findMany.mockResolvedValue([
      {
        id: 'invoice-unexplained-paid',
        counterpartyId: 'cp-1',
        currency: 'USD',
        totalAmount: 300,
        paidAmount: 50,
        invoiceDate: new Date('2025-01-01'),
      },
    ]);

    const result = await service.reconcileCounterpartyLedger('tenant-1', { apply: true });

    expect(result.exceptions).toContainEqual(expect.objectContaining({
      sourceType: 'SALES_INVOICE',
      sourceId: 'invoice-unexplained-paid',
    }));
    expect(result.entriesCreated).toBe(0);
    expect(settlementService.recordMovement).not.toHaveBeenCalled();
    expect(settlementService.rebuildBalances).not.toHaveBeenCalled();
  });

  it('records planned entries and allocations, then rebuilds the selected tenant projection on apply', async () => {
    prisma.salesInvoice.findMany.mockResolvedValue([
      {
        id: 'invoice-1',
        counterpartyId: 'cp-1',
        currency: 'USD',
        totalAmount: 300,
        paidAmount: 100,
        invoiceDate: new Date('2025-01-01'),
      },
    ]);
    prisma.financeTransaction.findMany.mockResolvedValue([
      {
        id: 'finance-1',
        counterpartyId: 'cp-1',
        settlementSide: CounterpartySettlementSide.CUSTOMER,
        direction: 'INCOME',
        amount: 100,
        currency: 'USD',
        transactionDate: new Date('2025-01-02'),
        sourceDocType: 'SalesInvoice',
        sourceDocId: 'invoice-1',
      },
    ]);
    settlementService.rebuildBalances.mockResolvedValue([
      { counterpartyId: 'cp-1', currency: 'USD', customerDebt: 200, supplierDebt: 0 },
    ]);

    const result = await service.reconcileCounterpartyLedger('tenant-1', { apply: true });

    expect(settlementService.recordMovement).toHaveBeenCalledTimes(2);
    expect(prisma.settlementAllocation.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        tenantId: 'tenant-1',
        financeTransactionId: 'finance-1',
        targetType: 'SALES_INVOICE',
        targetId: 'invoice-1',
        amount: 100,
      })],
      skipDuplicates: true,
    });
    expect(settlementService.rebuildBalances).toHaveBeenCalledWith(prisma, 'tenant-1');
    expect(result.entriesCreated).toBe(2);
    expect(result.allocationsCreated).toBe(1);
    expect(result.balanceRowsRebuilt).toBe(1);
    expect(result.differences.after).toHaveLength(0);
  });
});
