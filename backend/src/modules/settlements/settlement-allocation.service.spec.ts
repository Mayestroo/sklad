import { BadRequestException, ConflictException } from '@nestjs/common';
import { CounterpartySettlementSide, SettlementAllocationTarget } from '@prisma/client';
import { SettlementAllocationService } from './settlement-allocation.service';

describe('SettlementAllocationService', () => {
  let service: SettlementAllocationService;
  let tx: any;

  const allocation = (overrides: Record<string, unknown> = {}) => ({
    tenantId: 'tenant-1',
    counterpartyId: 'counterparty-1',
    financeTransactionId: 'finance-1',
    targetType: SettlementAllocationTarget.SALES_INVOICE,
    targetId: 'invoice-1',
    amount: 100,
    idempotencyKey: 'finance-1:invoice-1:100',
    ...overrides,
  });

  beforeEach(() => {
    tx = {
      financeTransaction: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'finance-1',
          tenantId: 'tenant-1',
          counterpartyId: 'counterparty-1',
          direction: 'INCOME',
          settlementSide: CounterpartySettlementSide.CUSTOMER,
          currency: 'USD',
          amount: 300,
          status: 'POSTED',
          isDeleted: false,
        }),
      },
      salesInvoice: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'invoice-1',
          tenantId: 'tenant-1',
          counterpartyId: 'counterparty-1',
          currency: 'USD',
          status: 'POSTED',
          totalAmount: 500,
          paidAmount: 100,
        }),
      },
      settlementAllocation: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn(),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    service = new SettlementAllocationService();
  });

  it('records a partial allocation using the source transaction side and currency', async () => {
    tx.settlementAllocation.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'allocation-1',
        ...allocation(),
        side: CounterpartySettlementSide.CUSTOMER,
        currency: 'USD',
        reversesAllocationId: null,
      });

    const result = await service.recordAllocation(tx, allocation());

    expect(result.created).toBe(true);
    expect(tx.settlementAllocation.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        tenantId: 'tenant-1',
        counterpartyId: 'counterparty-1',
        financeTransactionId: 'finance-1',
        side: CounterpartySettlementSide.CUSTOMER,
        currency: 'USD',
        targetType: SettlementAllocationTarget.SALES_INVOICE,
        targetId: 'invoice-1',
        amount: 100,
      })],
      skipDuplicates: true,
    });
  });

  it('rejects a source and target with different currencies', async () => {
    tx.salesInvoice.findFirst.mockResolvedValue({
      id: 'invoice-1',
      tenantId: 'tenant-1',
      counterpartyId: 'counterparty-1',
      currency: 'UZS',
      status: 'POSTED',
      totalAmount: 500,
      paidAmount: 100,
    });

    await expect(service.recordAllocation(tx, allocation())).rejects.toThrow(BadRequestException);
    expect(tx.settlementAllocation.createMany).not.toHaveBeenCalled();
  });

  it('allows an in-flight draft invoice to receive order-payment allocation before posting', async () => {
    tx.salesInvoice.findFirst.mockResolvedValue({
      id: 'invoice-1',
      tenantId: 'tenant-1',
      counterpartyId: 'counterparty-1',
      currency: 'USD',
      status: 'DRAFT',
      totalAmount: 500,
      paidAmount: 0,
    });
    tx.settlementAllocation.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'allocation-1',
        ...allocation(),
        side: CounterpartySettlementSide.CUSTOMER,
        currency: 'USD',
        reversesAllocationId: null,
      });

    const result = await service.recordAllocation(tx, allocation());

    expect(result.created).toBe(true);
  });

  it('rejects allocation beyond the source or target open amount', async () => {
    await expect(
      service.recordAllocation(tx, allocation({ amount: 400 })),
    ).rejects.toThrow(BadRequestException);
    expect(tx.settlementAllocation.createMany).not.toHaveBeenCalled();
  });

  it('does not create a duplicate allocation on an identical retry', async () => {
    tx.settlementAllocation.findUnique.mockResolvedValue({
      id: 'allocation-1',
      ...allocation(),
      side: CounterpartySettlementSide.CUSTOMER,
      currency: 'USD',
      reversesAllocationId: null,
    });

    const result = await service.recordAllocation(tx, allocation());

    expect(result.created).toBe(false);
    expect(tx.settlementAllocation.createMany).not.toHaveBeenCalled();
  });

  it('rejects reusing an allocation idempotency key for different data', async () => {
    tx.settlementAllocation.findUnique.mockResolvedValue({
      id: 'allocation-1',
      ...allocation(),
      amount: 99,
      side: CounterpartySettlementSide.CUSTOMER,
      currency: 'USD',
      reversesAllocationId: null,
    });

    await expect(service.recordAllocation(tx, allocation())).rejects.toThrow(ConflictException);
  });

  it('reverses an allocation by appending an equal negative event', async () => {
    tx.settlementAllocation.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'reversal-1',
        ...allocation(),
        side: CounterpartySettlementSide.CUSTOMER,
        currency: 'USD',
        amount: -100,
        reversesAllocationId: 'allocation-1',
      });
    tx.settlementAllocation.findFirst.mockResolvedValue({
      id: 'allocation-1',
      ...allocation(),
      side: CounterpartySettlementSide.CUSTOMER,
      currency: 'USD',
      amount: 100,
      reversesAllocationId: null,
    });

    await service.reverseAllocation(tx, {
      tenantId: 'tenant-1',
      allocationId: 'allocation-1',
      idempotencyKey: 'allocation-1:reversal',
    });

    const reversalData = tx.settlementAllocation.createMany.mock.calls[0][0].data[0];
    expect(Number(reversalData.amount)).toBe(-100);
    expect(reversalData.reversesAllocationId).toBe('allocation-1');
    expect(reversalData.idempotencyKey).toBe('allocation-1:reversal');
  });
});
