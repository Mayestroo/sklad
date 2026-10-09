import { ConflictException } from '@nestjs/common';
import { CounterpartySettlementService } from './counterparty-settlement.service';

describe('CounterpartySettlementService', () => {
  let service: CounterpartySettlementService;
  let tx: any;

  const movement = (overrides: Record<string, unknown> = {}) => ({
    tenantId: 'tenant-1',
    counterpartyId: 'counterparty-1',
    currency: 'USD',
    side: 'CUSTOMER' as const,
    amount: 125,
    entryType: 'DOCUMENT_POSTED',
    effectiveAt: new Date('2026-09-24T00:00:00.000Z'),
    sourceDocType: 'SalesInvoice',
    sourceDocId: 'invoice-1',
    idempotencyKey: 'SalesInvoice:invoice-1:POSTED',
    ...overrides,
  });

  beforeEach(() => {
    tx = {
      counterparty: {
        findFirst: jest.fn().mockResolvedValue({ id: 'counterparty-1', tenantId: 'tenant-1' }),
      },
      counterpartySettlementEntry: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'entry-1',
          tenantId: 'tenant-1',
          counterpartyId: 'counterparty-1',
          currency: 'USD',
          side: 'CUSTOMER',
          amount: 125,
          entryType: 'DOCUMENT_POSTED',
          effectiveAt: new Date('2026-09-24T00:00:00.000Z'),
          sourceDocType: 'SalesInvoice',
          sourceDocId: 'invoice-1',
          sourceLineId: null,
          idempotencyKey: 'SalesInvoice:invoice-1:POSTED',
          reversesEntryId: null,
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      counterpartyBalance: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'balance-1',
          tenantId: 'tenant-1',
          counterpartyId: 'counterparty-1',
          currency: 'USD',
          customerDebt: 125,
          supplierDebt: 0,
        }),
        upsert: jest.fn().mockResolvedValue({
          id: 'balance-1',
          tenantId: 'tenant-1',
          counterpartyId: 'counterparty-1',
          currency: 'USD',
          customerDebt: 125,
          supplierDebt: 0,
        }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    service = new CounterpartySettlementService();
  });

  it('increments only the selected side and native currency', async () => {
    const result = await service.recordMovement(tx, movement());

    expect(result.created).toBe(true);
    expect(tx.counterpartySettlementEntry.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        tenantId: 'tenant-1',
        counterpartyId: 'counterparty-1',
        currency: 'USD',
        side: 'CUSTOMER',
        amount: 125,
        idempotencyKey: 'SalesInvoice:invoice-1:POSTED',
      })],
      skipDuplicates: true,
    });
    expect(tx.counterpartyBalance.upsert).toHaveBeenCalledWith({
      where: {
        counterpartyId_currency: {
          counterpartyId: 'counterparty-1',
          currency: 'USD',
        },
      },
      create: expect.objectContaining({
        tenantId: 'tenant-1',
        counterpartyId: 'counterparty-1',
        currency: 'USD',
        customerDebt: 125,
        supplierDebt: 0,
      }),
      update: { customerDebt: { increment: 125 } },
    });
  });

  it('decrements the selected supplier projection for an advance or reversal', async () => {
    const input = movement({
      currency: 'UZS',
      side: 'SUPPLIER',
      amount: -750_000,
      entryType: 'PAYMENT',
      sourceDocType: 'FinanceTransaction',
      sourceDocId: 'finance-1',
      idempotencyKey: 'FinanceTransaction:finance-1:SUPPLIER',
    });
    tx.counterpartySettlementEntry.findUnique.mockResolvedValue({
      ...input,
      sourceLineId: null,
      reversesEntryId: null,
      id: 'entry-2',
    });

    await service.recordMovement(tx, input);

    expect(tx.counterpartyBalance.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        counterpartyId_currency: {
          counterpartyId: 'counterparty-1',
          currency: 'UZS',
        },
      },
      create: expect.objectContaining({ supplierDebt: -750_000 }),
      update: { supplierDebt: { increment: -750_000 } },
    }));
  });

  it('does not increment the projection when the identical source event is retried', async () => {
    tx.counterpartySettlementEntry.createMany.mockResolvedValue({ count: 0 });

    const result = await service.recordMovement(tx, movement());

    expect(result.created).toBe(false);
    expect(tx.counterpartyBalance.upsert).not.toHaveBeenCalled();
  });

  it('rejects reuse of an idempotency key for different movement data', async () => {
    tx.counterpartySettlementEntry.createMany.mockResolvedValue({ count: 0 });
    tx.counterpartySettlementEntry.findUnique.mockResolvedValue({
      ...movement(),
      amount: 999,
      id: 'entry-1',
    });

    await expect(service.recordMovement(tx, movement())).rejects.toThrow(ConflictException);
    expect(tx.counterpartyBalance.upsert).not.toHaveBeenCalled();
  });

  it('rejects unsupported currency and zero movement before writing', async () => {
    await expect(service.recordMovement(tx, movement({ currency: 'EUR' }))).rejects.toThrow();
    await expect(service.recordMovement(tx, movement({ amount: 0 }))).rejects.toThrow();
    expect(tx.counterpartySettlementEntry.createMany).not.toHaveBeenCalled();
    expect(tx.counterpartyBalance.upsert).not.toHaveBeenCalled();
  });

  it('rebuilds balances by counterparty, currency, and side', async () => {
    tx.counterpartySettlementEntry.findMany.mockResolvedValue([
      { counterpartyId: 'counterparty-1', currency: 'USD', side: 'CUSTOMER', amount: 500 },
      { counterpartyId: 'counterparty-1', currency: 'USD', side: 'CUSTOMER', amount: -125 },
      { counterpartyId: 'counterparty-1', currency: 'USD', side: 'SUPPLIER', amount: 40 },
      { counterpartyId: 'counterparty-1', currency: 'UZS', side: 'CUSTOMER', amount: 100_000 },
    ]);

    await service.rebuildBalances(tx, 'tenant-1');

    expect(tx.counterpartyBalance.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
    });
    const rebuilt = tx.counterpartyBalance.createMany.mock.calls[0][0].data;
    expect(rebuilt).toHaveLength(2);
    expect(rebuilt.map((row: any) => ({
      currency: row.currency,
      customerDebt: Number(row.customerDebt),
      supplierDebt: Number(row.supplierDebt),
    }))).toEqual(expect.arrayContaining([
      { currency: 'USD', customerDebt: 375, supplierDebt: 40 },
      { currency: 'UZS', customerDebt: 100_000, supplierDebt: 0 },
    ]));
  });
});
