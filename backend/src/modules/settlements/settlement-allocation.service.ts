import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CounterpartySettlementSide,
  Prisma,
  SettlementAllocationTarget,
  TransactionDirection,
} from '@prisma/client';
import { SUPPORTED_CURRENCIES } from '../../common/validators/currency.validator';

export interface RecordSettlementAllocationInput {
  tenantId: string;
  counterpartyId: string;
  financeTransactionId: string;
  targetType: SettlementAllocationTarget;
  targetId: string;
  amount: number;
  idempotencyKey: string;
}

interface SettlementTarget {
  id: string;
  tenantId: string;
  counterpartyId: string;
  currency: string;
  side: CounterpartySettlementSide;
  expectedDirection: TransactionDirection;
  status: string;
  totalAmount: Prisma.Decimal | number | string;
  paidAmount?: Prisma.Decimal | number | string | null;
  isPaid?: boolean;
}

@Injectable()
export class SettlementAllocationService {
  private readonly targetTables: Record<SettlementAllocationTarget, string> = {
    [SettlementAllocationTarget.SALES_INVOICE]: 'sales_invoices',
    [SettlementAllocationTarget.SALES_ORDER]: 'sales_orders',
    [SettlementAllocationTarget.SALES_RETURN]: 'sales_returns',
    [SettlementAllocationTarget.PURCHASE_RECEIPT]: 'purchase_receipts',
    [SettlementAllocationTarget.PURCHASE_RETURN]: 'purchase_returns',
    [SettlementAllocationTarget.ADDITIONAL_EXPENSE]: 'additional_expenses',
    [SettlementAllocationTarget.SERVICE_ACT]: 'service_acts',
  };

  async recordAllocation(
    tx: Prisma.TransactionClient,
    input: RecordSettlementAllocationInput,
  ) {
    this.validateInput(input);

    const existing = await tx.settlementAllocation.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      this.assertSameAllocation(existing, input);
      return { allocation: existing, created: false };
    }

    await this.lockFinanceTransaction(tx, input.tenantId, input.financeTransactionId);
    const financeTransaction = await tx.financeTransaction.findFirst({
      where: {
        id: input.financeTransactionId,
        tenantId: input.tenantId,
        status: 'POSTED',
        isDeleted: false,
      },
      select: {
        id: true,
        tenantId: true,
        counterpartyId: true,
        settlementSide: true,
        direction: true,
        currency: true,
        amount: true,
      },
    });
    if (!financeTransaction) {
      throw new NotFoundException('Posted settlement Finance transaction not found');
    }
    if (!financeTransaction.counterpartyId || !financeTransaction.settlementSide) {
      throw new BadRequestException('Finance transaction is not classified as a counterparty settlement');
    }
    if (
      financeTransaction.counterpartyId !== input.counterpartyId ||
      !SUPPORTED_CURRENCIES.includes(financeTransaction.currency as (typeof SUPPORTED_CURRENCIES)[number])
    ) {
      throw new BadRequestException('Finance transaction counterparty or currency is invalid');
    }

    await this.lockTarget(tx, input.tenantId, input.targetType, input.targetId);
    const target = await this.loadTarget(tx, input.tenantId, input.targetType, input.targetId);
    if (!target) {
      throw new NotFoundException('Settlement target document not found');
    }
    if (
      target.counterpartyId !== input.counterpartyId ||
      target.currency !== financeTransaction.currency ||
      target.side !== financeTransaction.settlementSide ||
      target.expectedDirection !== financeTransaction.direction
    ) {
      throw new BadRequestException('Settlement target counterparty, side, direction, or currency does not match');
    }

    const existingPaymentAllocations = await tx.settlementAllocation.findMany({
      where: { financeTransactionId: input.financeTransactionId },
      select: { amount: true },
    });
    const alreadyAllocated = this.sumAmounts(existingPaymentAllocations.map((item) => item.amount));
    const paymentRemaining = new Prisma.Decimal(financeTransaction.amount).minus(alreadyAllocated);
    const requestedAmount = new Prisma.Decimal(input.amount);
    if (requestedAmount.gt(paymentRemaining)) {
      throw new BadRequestException('Allocation exceeds the Finance transaction unapplied amount');
    }

    const targetOpenAmount = await this.getTargetOpenAmount(
      tx,
      target,
      input.targetType,
      input.targetId,
    );
    if (requestedAmount.gt(targetOpenAmount)) {
      throw new BadRequestException('Allocation exceeds the target document open amount');
    }

    const createResult = await tx.settlementAllocation.createMany({
      data: [
        {
          tenantId: input.tenantId,
          counterpartyId: input.counterpartyId,
          financeTransactionId: input.financeTransactionId,
          side: financeTransaction.settlementSide,
          currency: financeTransaction.currency,
          targetType: input.targetType,
          targetId: input.targetId,
          amount: input.amount,
          idempotencyKey: input.idempotencyKey,
        },
      ],
      skipDuplicates: true,
    });
    const allocation = await tx.settlementAllocation.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (!allocation) {
      throw new ConflictException('Settlement allocation was not created');
    }
    if (createResult.count === 0) {
      this.assertSameAllocation(allocation, input);
      return { allocation, created: false };
    }
    return { allocation, created: true };
  }

  async reverseAllocation(
    tx: Prisma.TransactionClient,
    input: { tenantId: string; allocationId: string; idempotencyKey: string },
  ) {
    if (!input.tenantId?.trim() || !input.allocationId?.trim() || !input.idempotencyKey?.trim()) {
      throw new BadRequestException('Tenant, allocation, and idempotency key are required');
    }

    const existingReversal = await tx.settlementAllocation.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existingReversal) {
      if (existingReversal.reversesAllocationId !== input.allocationId) {
        throw new ConflictException('Settlement allocation reversal key already describes another event');
      }
      return { allocation: existingReversal, created: false };
    }

    const original = await tx.settlementAllocation.findFirst({
      where: { id: input.allocationId, tenantId: input.tenantId },
    });
    if (!original || Number(original.amount) <= 0 || original.reversesAllocationId) {
      throw new BadRequestException('Only an active positive settlement allocation can be reversed');
    }
    await this.lockFinanceTransaction(tx, input.tenantId, original.financeTransactionId);
    await this.lockTarget(tx, input.tenantId, original.targetType, original.targetId);

    const createResult = await tx.settlementAllocation.createMany({
      data: [
        {
          tenantId: original.tenantId,
          counterpartyId: original.counterpartyId,
          financeTransactionId: original.financeTransactionId,
          side: original.side,
          currency: original.currency,
          targetType: original.targetType,
          targetId: original.targetId,
          amount: new Prisma.Decimal(original.amount).negated(),
          idempotencyKey: input.idempotencyKey,
          reversesAllocationId: original.id,
        },
      ],
      skipDuplicates: true,
    });
    const reversal = await tx.settlementAllocation.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (!reversal) {
      throw new ConflictException('Settlement allocation reversal was not created');
    }
    return { allocation: reversal, created: createResult.count === 1 };
  }

  private validateInput(input: RecordSettlementAllocationInput) {
    if (
      !input.tenantId?.trim() ||
      !input.counterpartyId?.trim() ||
      !input.financeTransactionId?.trim() ||
      !input.targetId?.trim() ||
      !input.idempotencyKey?.trim()
    ) {
      throw new BadRequestException('Settlement allocation source and target are required');
    }
    if (!Object.values(SettlementAllocationTarget).includes(input.targetType)) {
      throw new BadRequestException('Settlement target type is invalid');
    }
    if (!Number.isFinite(Number(input.amount)) || Number(input.amount) <= 0) {
      throw new BadRequestException('Settlement allocation amount must be greater than zero');
    }
  }

  private async lockFinanceTransaction(
    tx: Prisma.TransactionClient,
    tenantId: string,
    financeTransactionId: string,
  ) {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "finance_transactions"
      WHERE "id" = ${financeTransactionId} AND "tenant_id" = ${tenantId}
      FOR UPDATE
    `);
  }

  private async lockTarget(
    tx: Prisma.TransactionClient,
    tenantId: string,
    targetType: SettlementAllocationTarget,
    targetId: string,
  ) {
    const table = this.targetTables[targetType];
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM ${Prisma.raw(`"${table}"`)}
      WHERE "id" = ${targetId} AND "tenant_id" = ${tenantId}
      FOR UPDATE
    `);
  }

  private async loadTarget(
    tx: Prisma.TransactionClient,
    tenantId: string,
    targetType: SettlementAllocationTarget,
    targetId: string,
  ): Promise<SettlementTarget | null> {
    switch (targetType) {
      case SettlementAllocationTarget.SALES_INVOICE: {
        const invoice = await tx.salesInvoice.findFirst({
          where: { id: targetId, tenantId },
          select: { id: true, tenantId: true, counterpartyId: true, currency: true, status: true, totalAmount: true, paidAmount: true },
        });
        return invoice
          ? {
              ...invoice,
              side: CounterpartySettlementSide.CUSTOMER,
              expectedDirection: TransactionDirection.INCOME,
            }
          : null;
      }
      case SettlementAllocationTarget.SALES_ORDER: {
        const order = await tx.salesOrder.findFirst({
          where: { id: targetId, tenantId },
          select: { id: true, tenantId: true, counterpartyId: true, currency: true, status: true, totalAmount: true, paidAmount: true },
        });
        return order
          ? {
              ...order,
              side: CounterpartySettlementSide.CUSTOMER,
              expectedDirection: TransactionDirection.INCOME,
            }
          : null;
      }
      case SettlementAllocationTarget.SALES_RETURN: {
        const salesReturn = await tx.salesReturn.findFirst({
          where: { id: targetId, tenantId },
          select: { id: true, tenantId: true, counterpartyId: true, currency: true, status: true, totalAmount: true },
        });
        return salesReturn
          ? {
              ...salesReturn,
              side: CounterpartySettlementSide.CUSTOMER,
              expectedDirection: TransactionDirection.EXPENSE,
            }
          : null;
      }
      case SettlementAllocationTarget.PURCHASE_RECEIPT: {
        const receipt = await tx.purchaseReceipt.findFirst({
          where: { id: targetId, tenantId },
          select: { id: true, tenantId: true, counterpartyId: true, currency: true, status: true, totalAmount: true, paidAmount: true },
        });
        return receipt
          ? {
              ...receipt,
              side: CounterpartySettlementSide.SUPPLIER,
              expectedDirection: TransactionDirection.EXPENSE,
            }
          : null;
      }
      case SettlementAllocationTarget.PURCHASE_RETURN: {
        const purchaseReturn = await tx.purchaseReturn.findFirst({
          where: { id: targetId, tenantId },
          select: { id: true, tenantId: true, counterpartyId: true, currency: true, status: true, totalAmount: true },
        });
        return purchaseReturn
          ? {
              ...purchaseReturn,
              side: CounterpartySettlementSide.SUPPLIER,
              expectedDirection: TransactionDirection.INCOME,
            }
          : null;
      }
      case SettlementAllocationTarget.ADDITIONAL_EXPENSE: {
        const expense = await tx.additionalExpense.findFirst({
          where: { id: targetId, tenantId },
          select: { id: true, tenantId: true, counterpartyId: true, currency: true, status: true, amount: true, vatAmount: true, isPaid: true },
        });
        return expense
          ? {
              ...expense,
              totalAmount: new Prisma.Decimal(expense.amount).plus(expense.vatAmount),
              side: CounterpartySettlementSide.SUPPLIER,
              expectedDirection: TransactionDirection.EXPENSE,
            }
          : null;
      }
      case SettlementAllocationTarget.SERVICE_ACT: {
        const serviceAct = await tx.serviceAct.findFirst({
          where: { id: targetId, tenantId },
          select: { id: true, tenantId: true, counterpartyId: true, currency: true, status: true, totalAmount: true, paidAmount: true, type: true },
        });
        if (!serviceAct) return null;
        return {
          ...serviceAct,
          side: serviceAct.type === 'PROVIDED'
            ? CounterpartySettlementSide.CUSTOMER
            : CounterpartySettlementSide.SUPPLIER,
          expectedDirection: serviceAct.type === 'PROVIDED'
            ? TransactionDirection.INCOME
            : TransactionDirection.EXPENSE,
        };
      }
    }
  }

  private async getTargetOpenAmount(
    tx: Prisma.TransactionClient,
    target: SettlementTarget,
    targetType: SettlementAllocationTarget,
    targetId: string,
  ) {
    const salesInvoiceBeingPosted =
      targetType === SettlementAllocationTarget.SALES_INVOICE && target.status === 'DRAFT';
    if (
      target.status !== 'POSTED' &&
      targetType !== SettlementAllocationTarget.SALES_ORDER &&
      !salesInvoiceBeingPosted
    ) {
      return new Prisma.Decimal(0);
    }
    if (targetType === SettlementAllocationTarget.SALES_ORDER && target.status === 'CANCELLED') {
      return new Prisma.Decimal(0);
    }
    if (targetType === SettlementAllocationTarget.ADDITIONAL_EXPENSE && target.isPaid) {
      return new Prisma.Decimal(0);
    }

    if (
      targetType === SettlementAllocationTarget.SALES_RETURN ||
      targetType === SettlementAllocationTarget.PURCHASE_RETURN ||
      targetType === SettlementAllocationTarget.ADDITIONAL_EXPENSE
    ) {
      const allocations = await tx.settlementAllocation.findMany({
        where: { targetType, targetId },
        select: { amount: true },
      });
      const allocated = this.sumAmounts(allocations.map((item) => item.amount));
      const documentOpenAmount = Prisma.Decimal.max(
        new Prisma.Decimal(0),
        new Prisma.Decimal(target.totalAmount).minus(allocated),
      );
      if (
        targetType === SettlementAllocationTarget.SALES_RETURN ||
        targetType === SettlementAllocationTarget.PURCHASE_RETURN
      ) {
        const balance = await tx.counterpartyBalance.findUnique({
          where: {
            counterpartyId_currency: {
              counterpartyId: target.counterpartyId,
              currency: target.currency,
            },
          },
          select: { customerDebt: true, supplierDebt: true },
        });
        const sideBalance = target.side === CounterpartySettlementSide.CUSTOMER
          ? new Prisma.Decimal(balance?.customerDebt ?? 0)
          : new Prisma.Decimal(balance?.supplierDebt ?? 0);
        const availableAdvance = Prisma.Decimal.max(new Prisma.Decimal(0), sideBalance.negated());
        return Prisma.Decimal.min(documentOpenAmount, availableAdvance);
      }
      return documentOpenAmount;
    }

    return Prisma.Decimal.max(
      new Prisma.Decimal(0),
      new Prisma.Decimal(target.totalAmount).minus(target.paidAmount ?? 0),
    );
  }

  private sumAmounts(amounts: Array<Prisma.Decimal | number | string>) {
    return amounts.reduce<Prisma.Decimal>(
      (sum, amount) => sum.plus(new Prisma.Decimal(amount)),
      new Prisma.Decimal(0),
    );
  }

  private assertSameAllocation(
    allocation: {
      tenantId: string;
      counterpartyId: string;
      financeTransactionId: string;
      side: CounterpartySettlementSide;
      currency: string;
      targetType: SettlementAllocationTarget;
      targetId: string;
      amount: Prisma.Decimal;
      reversesAllocationId: string | null;
    },
    input: RecordSettlementAllocationInput,
  ) {
    const matches =
      allocation.tenantId === input.tenantId &&
      allocation.counterpartyId === input.counterpartyId &&
      allocation.financeTransactionId === input.financeTransactionId &&
      allocation.targetType === input.targetType &&
      allocation.targetId === input.targetId &&
      Number(allocation.amount) === Number(input.amount) &&
      allocation.reversesAllocationId === null;
    if (!matches) {
      throw new ConflictException('Settlement allocation idempotency key already describes a different event');
    }
  }
}
