import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CounterpartySettlementSide,
  OpeningBalanceCategory,
  Prisma,
  SettlementAllocationTarget,
  TransactionDirection,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma';
import { SUPPORTED_CURRENCIES } from '../../common/validators/currency.validator';
import { CounterpartySettlementService, RecordSettlementMovementInput } from './counterparty-settlement.service';

type ReconciliationException = {
  sourceType: string;
  sourceId: string;
  reason: string;
};

type ProjectionDifference = {
  counterpartyId: string;
  currency: string;
  expected: { customerDebt: number; supplierDebt: number };
  actual: { customerDebt: number; supplierDebt: number };
};

type PlannedAllocation = {
  tenantId: string;
  counterpartyId: string;
  financeTransactionId: string;
  side: CounterpartySettlementSide;
  currency: string;
  targetType: SettlementAllocationTarget;
  targetId: string;
  amount: number;
  idempotencyKey: string;
};

type ReconciliationTarget = {
  id: string;
  targetType: SettlementAllocationTarget;
  counterpartyId: string;
  currency: string;
  side: CounterpartySettlementSide;
  effectiveAt: Date;
  totalAmount: number;
  allocationGoal: number;
  allocated: number;
};

type FinanceSettlement = {
  id: string;
  counterpartyId: string;
  currency: string;
  side: CounterpartySettlementSide;
  direction: FinanceDirection;
  amount: number;
  movementAmount: number;
  effectiveAt: Date;
  sourceDocType: string | null;
  sourceDocId: string | null;
  directTarget?: { targetType: SettlementAllocationTarget; targetId: string };
  paymentOrderId?: string;
};

const EPSILON = 0.01;
type FinanceDirection = Extract<TransactionDirection, 'INCOME' | 'EXPENSE'>;

@Injectable()
export class ReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settlementService: CounterpartySettlementService,
  ) {}

  async reconcileCounterpartyLedger(tenantId: string, options: { apply: boolean }) {
    if (!tenantId?.trim()) throw new BadRequestException('Tenant is required for settlement reconciliation');
    return this.prisma.$transaction((tx) => this.runReconciliation(tx, tenantId, options.apply));
  }

  private async runReconciliation(
    tx: Prisma.TransactionClient,
    tenantId: string,
    apply: boolean,
  ) {
    const [
      openingLines,
      salesInvoices,
      salesOrders,
      salesReturns,
      purchaseReceipts,
      purchaseReturns,
      additionalExpenses,
      serviceActs,
      financeTransactions,
      paymentSourceTransactions,
      payments,
      existingEntries,
      existingAllocations,
      currentBalances,
      counterparties,
    ] = await Promise.all([
      tx.openingBalanceLine.findMany({
        where: { tenantId },
        include: { document: { select: { status: true, openingDate: true } } },
      }),
      tx.salesInvoice.findMany({ where: { tenantId, status: 'POSTED' } }),
      tx.salesOrder.findMany({ where: { tenantId } }),
      tx.salesReturn.findMany({ where: { tenantId, status: 'POSTED' } }),
      tx.purchaseReceipt.findMany({ where: { tenantId, status: 'POSTED' } }),
      tx.purchaseReturn.findMany({ where: { tenantId, status: 'POSTED' } }),
      tx.additionalExpense.findMany({ where: { tenantId, status: 'POSTED' } }),
      tx.serviceAct.findMany({ where: { tenantId, status: 'POSTED' } }),
      tx.financeTransaction.findMany({
        where: {
          tenantId,
          status: 'POSTED',
          isDeleted: false,
          direction: { in: [TransactionDirection.INCOME, TransactionDirection.EXPENSE] },
          counterpartyId: { not: null },
        },
      }),
      tx.financeTransaction.findMany({
        where: { tenantId, sourceDocType: { in: ['PAYMENT', 'Payment'] } },
        select: { sourceDocId: true },
      }),
      tx.payment.findMany({
        where: { tenantId },
        include: {
          invoice: { select: { id: true, counterpartyId: true, currency: true, totalAmount: true, paidAmount: true, invoiceDate: true } },
          salesOrder: { select: { id: true, counterpartyId: true, currency: true, totalAmount: true, paidAmount: true, orderDate: true, status: true } },
          cashAccount: { select: { id: true, currency: true } },
        },
      }),
      tx.counterpartySettlementEntry.findMany({ where: { tenantId } }),
      tx.settlementAllocation.findMany({ where: { tenantId } }),
      tx.counterpartyBalance.findMany({ where: { tenantId } }),
      tx.counterparty.findMany({
        where: { tenantId },
        select: { id: true, debtBalance: true, customerDebt: true, supplierDebt: true },
      }),
    ]);

    const exceptions: ReconciliationException[] = [];
    const plannedEntries: RecordSettlementMovementInput[] = [];
    const plannedAllocations: PlannedAllocation[] = [];
    const financeSettlements: FinanceSettlement[] = [];
    const targets = new Map<string, ReconciliationTarget>();
    const hasEvidence = new Set<string>();
    const existingFinanceTransactionIds = new Set<string>();
    const paymentSourceIds = new Set(
      paymentSourceTransactions.map((transaction) => transaction.sourceDocId).filter((id): id is string => Boolean(id)),
    );
    const paymentById = new Map(payments.map((payment) => [payment.id, payment]));
    const orderById = new Map(salesOrders.map((order) => [order.id, order]));
    const serviceActById = new Map(serviceActs.map((act) => [act.id, act]));
    const additionalExpenseById = new Map(additionalExpenses.map((expense) => [expense.id, expense]));

    const movementIdentity = (movement: {
      sourceDocType: string;
      sourceDocId: string;
      entryType: string;
      side: CounterpartySettlementSide;
      currency: string;
    }) => [movement.sourceDocType, movement.sourceDocId, movement.entryType, movement.side, movement.currency].join('\u0000');

    for (const allocation of existingAllocations) {
      existingFinanceTransactionIds.add(allocation.financeTransactionId);
    }

    const addMovement = (movement: RecordSettlementMovementInput) => {
      if (!Number.isFinite(Number(movement.amount)) || Number(movement.amount) === 0) return;
      if (!movement.counterpartyId) {
        exceptions.push({ sourceType: movement.sourceDocType, sourceId: movement.sourceDocId, reason: 'Counterparty is missing' });
        return;
      }
      hasEvidence.add(movement.counterpartyId);
      if (!SUPPORTED_CURRENCIES.includes(movement.currency as (typeof SUPPORTED_CURRENCIES)[number])) {
        exceptions.push({
          sourceType: movement.sourceDocType,
          sourceId: movement.sourceDocId,
          reason: `Unsupported or missing currency: ${movement.currency || '(empty)'}`,
        });
        return;
      }
      const identity = movementIdentity(movement);
      const existing = existingEntries.find((entry) => movementIdentity(entry) === identity);
      if (existing) {
        if (Number(existing.amount) !== Number(movement.amount)) {
          exceptions.push({
            sourceType: movement.sourceDocType,
            sourceId: movement.sourceDocId,
            reason: `Existing ${movement.entryType} movement amount does not match the source document`,
          });
        }
        return;
      }
      if (!plannedEntries.some((item) => item.idempotencyKey === movement.idempotencyKey)) {
        plannedEntries.push(movement);
      }
    };

    const addTarget = (
      targetType: SettlementAllocationTarget,
      source: {
        id: string;
        counterpartyId: string;
        currency: string;
        effectiveAt: Date;
        totalAmount: number;
        allocationGoal: number;
        side: CounterpartySettlementSide;
      },
    ) => {
      if (!SUPPORTED_CURRENCIES.includes(source.currency as (typeof SUPPORTED_CURRENCIES)[number])) return;
      targets.set(`${targetType}:${source.id}`, {
        id: source.id,
        targetType,
        counterpartyId: source.counterpartyId,
        currency: source.currency,
        effectiveAt: source.effectiveAt,
        totalAmount: source.totalAmount,
        allocationGoal: Math.max(0, source.allocationGoal),
        allocated: 0,
        side: source.side,
      });
    };

    for (const line of openingLines) {
      if (line.document.status !== 'POSTED' || !line.counterpartyId) continue;
      const side = line.category === OpeningBalanceCategory.CUSTOMER_DEBT || line.category === OpeningBalanceCategory.CUSTOMER_ADVANCE
        ? CounterpartySettlementSide.CUSTOMER
        : line.category === OpeningBalanceCategory.SUPPLIER_DEBT || line.category === OpeningBalanceCategory.SUPPLIER_ADVANCE
          ? CounterpartySettlementSide.SUPPLIER
          : null;
      if (!side) continue;
      const amount = Number(line.amount) * (
        line.category === OpeningBalanceCategory.CUSTOMER_ADVANCE || line.category === OpeningBalanceCategory.SUPPLIER_ADVANCE
          ? -1
          : 1
      );
      addMovement({
        tenantId,
        counterpartyId: line.counterpartyId,
        currency: line.currency,
        side,
        amount,
        entryType: 'OPENING_BALANCE_POSTED',
        effectiveAt: line.document.openingDate,
        sourceDocType: 'OpeningBalanceLine',
        sourceDocId: line.id,
        idempotencyKey: `Legacy:OpeningBalanceLine:${line.id}:POSTED`,
      });
    }

    for (const invoice of salesInvoices) {
      addMovement({
        tenantId,
        counterpartyId: invoice.counterpartyId,
        currency: invoice.currency,
        side: CounterpartySettlementSide.CUSTOMER,
        amount: Number(invoice.totalAmount),
        entryType: 'SALES_INVOICE_POSTED',
        effectiveAt: invoice.invoiceDate,
        sourceDocType: 'SalesInvoice',
        sourceDocId: invoice.id,
        idempotencyKey: `Legacy:SalesInvoice:${invoice.id}:POSTED`,
      });
      addTarget(SettlementAllocationTarget.SALES_INVOICE, {
        id: invoice.id,
        counterpartyId: invoice.counterpartyId,
        currency: invoice.currency,
        effectiveAt: invoice.invoiceDate,
        totalAmount: Number(invoice.totalAmount),
        allocationGoal: Number(invoice.paidAmount),
        side: CounterpartySettlementSide.CUSTOMER,
      });
    }

    for (const order of salesOrders) {
      if (order.status === 'CANCELLED') continue;
      addTarget(SettlementAllocationTarget.SALES_ORDER, {
        id: order.id,
        counterpartyId: order.counterpartyId,
        currency: order.currency,
        effectiveAt: order.orderDate,
        totalAmount: Number(order.totalAmount),
        allocationGoal: Number(order.paidAmount),
        side: CounterpartySettlementSide.CUSTOMER,
      });
    }

    for (const salesReturn of salesReturns) {
      addMovement({
        tenantId,
        counterpartyId: salesReturn.counterpartyId,
        currency: salesReturn.currency,
        side: CounterpartySettlementSide.CUSTOMER,
        amount: -Number(salesReturn.totalAmount),
        entryType: 'SALES_RETURN_POSTED',
        effectiveAt: salesReturn.returnDate,
        sourceDocType: 'SalesReturn',
        sourceDocId: salesReturn.id,
        idempotencyKey: `Legacy:SalesReturn:${salesReturn.id}:POSTED`,
      });
      addTarget(SettlementAllocationTarget.SALES_RETURN, {
        id: salesReturn.id,
        counterpartyId: salesReturn.counterpartyId,
        currency: salesReturn.currency,
        effectiveAt: salesReturn.returnDate,
        totalAmount: Number(salesReturn.totalAmount),
        allocationGoal: Number(salesReturn.totalAmount),
        side: CounterpartySettlementSide.CUSTOMER,
      });
    }

    for (const receipt of purchaseReceipts) {
      addMovement({
        tenantId,
        counterpartyId: receipt.counterpartyId,
        currency: receipt.currency,
        side: CounterpartySettlementSide.SUPPLIER,
        amount: Number(receipt.totalAmount),
        entryType: 'PURCHASE_RECEIPT_POSTED',
        effectiveAt: receipt.docDate,
        sourceDocType: 'PurchaseReceipt',
        sourceDocId: receipt.id,
        idempotencyKey: `Legacy:PurchaseReceipt:${receipt.id}:POSTED`,
      });
      addTarget(SettlementAllocationTarget.PURCHASE_RECEIPT, {
        id: receipt.id,
        counterpartyId: receipt.counterpartyId,
        currency: receipt.currency,
        effectiveAt: receipt.docDate,
        totalAmount: Number(receipt.totalAmount),
        allocationGoal: Number(receipt.paidAmount),
        side: CounterpartySettlementSide.SUPPLIER,
      });
    }

    for (const purchaseReturn of purchaseReturns) {
      addMovement({
        tenantId,
        counterpartyId: purchaseReturn.counterpartyId,
        currency: purchaseReturn.currency,
        side: CounterpartySettlementSide.SUPPLIER,
        amount: -Number(purchaseReturn.totalAmount),
        entryType: 'PURCHASE_RETURN_POSTED',
        effectiveAt: purchaseReturn.returnDate,
        sourceDocType: 'PurchaseReturn',
        sourceDocId: purchaseReturn.id,
        idempotencyKey: `Legacy:PurchaseReturn:${purchaseReturn.id}:POSTED`,
      });
      addTarget(SettlementAllocationTarget.PURCHASE_RETURN, {
        id: purchaseReturn.id,
        counterpartyId: purchaseReturn.counterpartyId,
        currency: purchaseReturn.currency,
        effectiveAt: purchaseReturn.returnDate,
        totalAmount: Number(purchaseReturn.totalAmount),
        allocationGoal: Number(purchaseReturn.totalAmount),
        side: CounterpartySettlementSide.SUPPLIER,
      });
    }

    for (const expense of additionalExpenses) {
      if (expense.isPaid) continue;
      const totalAmount = Number(expense.amount) + Number(expense.vatAmount);
      addMovement({
        tenantId,
        counterpartyId: expense.counterpartyId,
        currency: expense.currency,
        side: CounterpartySettlementSide.SUPPLIER,
        amount: totalAmount,
        entryType: 'ADDITIONAL_EXPENSE_POSTED',
        effectiveAt: expense.docDate,
        sourceDocType: 'AdditionalExpense',
        sourceDocId: expense.id,
        idempotencyKey: `Legacy:AdditionalExpense:${expense.id}:POSTED`,
      });
      addTarget(SettlementAllocationTarget.ADDITIONAL_EXPENSE, {
        id: expense.id,
        counterpartyId: expense.counterpartyId,
        currency: expense.currency,
        effectiveAt: expense.docDate,
        totalAmount,
        allocationGoal: totalAmount,
        side: CounterpartySettlementSide.SUPPLIER,
      });
    }

    for (const act of serviceActs) {
      const side = act.type === 'PROVIDED'
        ? CounterpartySettlementSide.CUSTOMER
        : CounterpartySettlementSide.SUPPLIER;
      addMovement({
        tenantId,
        counterpartyId: act.counterpartyId,
        currency: act.currency,
        side,
        amount: Number(act.totalAmount),
        entryType: 'SERVICE_ACT_POSTED',
        effectiveAt: act.actDate,
        sourceDocType: 'ServiceAct',
        sourceDocId: act.id,
        idempotencyKey: `Legacy:ServiceAct:${act.id}:POSTED`,
      });
      addTarget(SettlementAllocationTarget.SERVICE_ACT, {
        id: act.id,
        counterpartyId: act.counterpartyId,
        currency: act.currency,
        effectiveAt: act.actDate,
        totalAmount: Number(act.totalAmount),
        allocationGoal: Number(act.paidAmount),
        side,
      });
    }

    const transactionByPaymentId = new Map<string, (typeof financeTransactions)[number]>();
    for (const transaction of financeTransactions) {
      if (!transaction.counterpartyId) continue;
      if (
        transaction.direction !== TransactionDirection.INCOME &&
        transaction.direction !== TransactionDirection.EXPENSE
      ) continue;
      if (
        transaction.sourceDocType &&
        ['SalesInvoice', 'SalesOrder', 'SalesReturn', 'PurchaseReceipt', 'PurchaseReturn', 'AdditionalExpense', 'ServiceAct', 'PAYMENT', 'Payment'].includes(transaction.sourceDocType) &&
        !transaction.sourceDocId
      ) {
        exceptions.push({
          sourceType: 'FinanceTransaction',
          sourceId: transaction.id,
          reason: 'Typed settlement source is missing its document ID',
        });
        continue;
      }
      const sourceSide = this.sideFromSource(transaction.sourceDocType, transaction.sourceDocId, serviceActById);
      if (transaction.settlementSide && sourceSide && transaction.settlementSide !== sourceSide) {
        exceptions.push({
          sourceType: 'FinanceTransaction',
          sourceId: transaction.id,
          reason: 'Stored settlement side conflicts with the linked source document',
        });
        continue;
      }
      const side = transaction.settlementSide ?? sourceSide;
      if (!side) {
        exceptions.push({
          sourceType: 'FinanceTransaction',
          sourceId: transaction.id,
          reason: 'Settlement side is missing and cannot be derived from a typed source document',
        });
        continue;
      }
      const sourceDirection = this.directionFromSource(
        transaction.sourceDocType,
        transaction.sourceDocId,
        serviceActById,
      );
      if (sourceDirection && transaction.direction !== sourceDirection) {
        exceptions.push({
          sourceType: 'FinanceTransaction',
          sourceId: transaction.id,
          reason: 'Finance transaction direction conflicts with the linked settlement source',
        });
        continue;
      }
      if (transaction.sourceDocType === 'AdditionalExpense') {
        const expense = transaction.sourceDocId ? additionalExpenseById.get(transaction.sourceDocId) : undefined;
        if (expense?.isPaid) continue;
      }

      let directTarget = this.targetFromSource(transaction.sourceDocType, transaction.sourceDocId);
      let paymentOrderId: string | undefined;
      if (transaction.sourceDocType === 'PAYMENT' || transaction.sourceDocType === 'Payment') {
        if (transaction.sourceDocId) transactionByPaymentId.set(transaction.sourceDocId, transaction);
        const payment = transaction.sourceDocId ? paymentById.get(transaction.sourceDocId) : undefined;
        if (payment && payment.counterpartyId !== transaction.counterpartyId) {
          exceptions.push({
            sourceType: 'FinanceTransaction',
            sourceId: transaction.id,
            reason: 'Linked Payment counterparty does not match the Finance transaction',
          });
          continue;
        }
        const paymentCurrencies = [payment?.invoice?.currency, payment?.salesOrder?.currency, payment?.cashAccount?.currency]
          .filter((currency): currency is string => Boolean(currency));
        if (paymentCurrencies.some((currency) => currency !== transaction.currency)) {
          exceptions.push({
            sourceType: 'FinanceTransaction',
            sourceId: transaction.id,
            reason: 'Finance transaction currency conflicts with its Payment document or cash account',
          });
          continue;
        }
        if (payment?.invoiceId) {
          directTarget = { targetType: SettlementAllocationTarget.SALES_INVOICE, targetId: payment.invoiceId };
        } else if (payment?.orderId) {
          paymentOrderId = payment.orderId;
          const orderInvoices = salesInvoices
            .filter((invoice) => invoice.salesOrderId === payment.orderId)
            .sort((left, right) => left.invoiceDate.getTime() - right.invoiceDate.getTime());
          if (orderInvoices.length === 0) {
            directTarget = { targetType: SettlementAllocationTarget.SALES_ORDER, targetId: payment.orderId };
          } else {
            directTarget = undefined;
          }
        }
      }
      if (directTarget) {
        const target = targets.get(`${directTarget.targetType}:${directTarget.targetId}`);
        if (
          !target ||
          target.counterpartyId !== transaction.counterpartyId ||
          target.currency !== transaction.currency ||
          target.side !== side
        ) {
          exceptions.push({
            sourceType: 'FinanceTransaction',
            sourceId: transaction.id,
            reason: 'Linked settlement target is missing or has a different counterparty, side, or currency',
          });
          continue;
        }
      }
      const movementAmount = this.movementAmount(transaction.direction, side, Number(transaction.amount));
      const settlement: FinanceSettlement = {
        id: transaction.id,
        counterpartyId: transaction.counterpartyId,
        currency: transaction.currency,
        side,
        direction: transaction.direction,
        amount: Number(transaction.amount),
        movementAmount,
        effectiveAt: transaction.transactionDate,
        sourceDocType: transaction.sourceDocType,
        sourceDocId: transaction.sourceDocId,
        directTarget,
        paymentOrderId,
      };
      financeSettlements.push(settlement);
      hasEvidence.add(transaction.counterpartyId);
      addMovement({
        tenantId,
        counterpartyId: transaction.counterpartyId,
        currency: transaction.currency,
        side,
        amount: movementAmount,
        entryType: 'FINANCE_SETTLEMENT',
        effectiveAt: transaction.transactionDate,
        sourceDocType: 'FinanceTransaction',
        sourceDocId: transaction.id,
        idempotencyKey: `FinanceTransaction:${transaction.id}:SETTLEMENT`,
      });
    }

    // Some pre-ledger installations have Payment rows but no FinanceTransaction.
    // Count that cash event once, using document/account currency evidence only.
    for (const payment of payments) {
      if (transactionByPaymentId.has(payment.id)) continue;
      if (paymentSourceIds.has(payment.id)) continue;
      const currencies = [payment.invoice?.currency, payment.salesOrder?.currency, payment.cashAccount?.currency]
        .filter((currency): currency is string => Boolean(currency));
      const currency = currencies[0];
      if (!currency || currencies.some((candidate) => candidate !== currency)) {
        exceptions.push({
          sourceType: 'Payment',
          sourceId: payment.id,
          reason: 'Payment currency is missing or conflicts across its linked document and cash account',
        });
        continue;
      }
      addMovement({
        tenantId,
        counterpartyId: payment.counterpartyId,
        currency,
        side: CounterpartySettlementSide.CUSTOMER,
        amount: -Number(payment.amount),
        entryType: 'LEGACY_PAYMENT_SETTLEMENT',
        effectiveAt: payment.paymentDate,
        sourceDocType: 'Payment',
        sourceDocId: payment.id,
        idempotencyKey: `Legacy:Payment:${payment.id}:SETTLEMENT`,
      });
      exceptions.push({
        sourceType: 'Payment',
        sourceId: payment.id,
        reason: 'Cash settlement is included, but no FinanceTransaction exists for an allocation link',
      });
    }

    for (const [key, total] of this.sumExistingAllocations(existingAllocations)) {
      const target = targets.get(key);
      if (target) target.allocated = total;
    }

    for (const settlement of financeSettlements.sort((left, right) => left.effectiveAt.getTime() - right.effectiveAt.getTime())) {
      if (existingFinanceTransactionIds.has(settlement.id)) continue;
      const isDocumentSettlement = settlement.movementAmount < 0 || Boolean(
        settlement.directTarget && (
          settlement.directTarget.targetType === SettlementAllocationTarget.SALES_RETURN ||
          settlement.directTarget.targetType === SettlementAllocationTarget.PURCHASE_RETURN
        ),
      );
      if (!isDocumentSettlement) continue;

      const candidates = this.allocationCandidates(settlement, targets, salesInvoices, orderById);
      let remaining = settlement.amount;
      for (const target of candidates) {
        if (remaining <= 0) break;
        if (
          target.counterpartyId !== settlement.counterpartyId ||
          target.currency !== settlement.currency ||
          target.side !== settlement.side
        ) continue;
        const amount = Math.min(
          remaining,
          Math.max(0, target.allocationGoal - target.allocated),
          Math.max(0, target.totalAmount - target.allocated),
        );
        if (amount <= EPSILON) continue;
        target.allocated += amount;
        remaining -= amount;
        plannedAllocations.push({
          tenantId,
          counterpartyId: settlement.counterpartyId,
          financeTransactionId: settlement.id,
          side: settlement.side,
          currency: settlement.currency,
          targetType: target.targetType,
          targetId: target.id,
          amount,
          idempotencyKey: `Legacy:FinanceTransaction:${settlement.id}:${target.targetType}:${target.id}`,
        });
      }
    }

    const allocationCheckedTargets = new Set<SettlementAllocationTarget>([
      SettlementAllocationTarget.SALES_INVOICE,
      SettlementAllocationTarget.PURCHASE_RECEIPT,
      SettlementAllocationTarget.SERVICE_ACT,
    ]);
    for (const target of targets.values()) {
      if (
        allocationCheckedTargets.has(target.targetType) &&
        Math.abs(target.allocationGoal - target.allocated) > EPSILON
      ) {
        exceptions.push({
          sourceType: target.targetType,
          sourceId: target.id,
          reason: `Document paid amount ${target.allocationGoal} does not match reconstructable active allocations ${target.allocated}`,
        });
      }
    }

    for (const counterparty of counterparties) {
      if (
        !hasEvidence.has(counterparty.id) &&
        !currentBalances.some((balance) => balance.counterpartyId === counterparty.id) &&
        (Number(counterparty.debtBalance) !== 0 || Number(counterparty.customerDebt) !== 0 || Number(counterparty.supplierDebt) !== 0)
      ) {
        exceptions.push({
          sourceType: 'Counterparty',
          sourceId: counterparty.id,
          reason: 'Non-zero legacy scalar balance has no source record or currency evidence',
        });
      }
    }

    const ledgerEvidence = new Set([
      ...existingEntries.map((entry) => `${entry.counterpartyId}\u0000${entry.currency}`),
      ...plannedEntries.map((entry) => `${entry.counterpartyId}\u0000${entry.currency}`),
    ]);
    for (const balance of currentBalances) {
      if (
        !ledgerEvidence.has(`${balance.counterpartyId}\u0000${balance.currency}`) &&
        (Number(balance.customerDebt) !== 0 || Number(balance.supplierDebt) !== 0)
      ) {
        exceptions.push({
          sourceType: 'CounterpartyBalance',
          sourceId: `${balance.counterpartyId}:${balance.currency}`,
          reason: 'Non-zero currency projection has no settlement ledger or reconstructable source record',
        });
      }
    }

    const expectedProjection = this.buildProjection(existingEntries, plannedEntries);
    const beforeDifferences = this.findProjectionDifferences(expectedProjection, currentBalances);
    let entriesCreated = 0;
    let allocationsCreated = 0;
    let balanceRowsRebuilt = 0;
    let afterDifferences = beforeDifferences;

    if (apply && exceptions.length === 0) {
      for (const movement of plannedEntries) {
        const result = await this.settlementService.recordMovement(tx, movement);
        if (result.created) entriesCreated += 1;
      }
      for (const allocation of plannedAllocations) {
        const result = await tx.settlementAllocation.createMany({ data: [allocation], skipDuplicates: true });
        allocationsCreated += result.count;
      }
      const rebuilt = await this.settlementService.rebuildBalances(tx, tenantId);
      balanceRowsRebuilt = rebuilt.length;
      afterDifferences = this.findProjectionDifferences(expectedProjection, rebuilt);
    }

    return {
      tenantId,
      apply,
      entriesCreated,
      allocationsCreated,
      balanceRowsRebuilt,
      plannedEntries,
      plannedAllocations,
      exceptions,
      differences: { before: beforeDifferences, after: afterDifferences },
    };
  }

  private sideFromSource(
    sourceDocType: string | null,
    sourceDocId: string | null,
    serviceActs: Map<string, { type: string }>,
  ): CounterpartySettlementSide | null {
    switch (sourceDocType) {
      case 'SalesInvoice':
      case 'SalesOrder':
      case 'SalesReturn':
      case 'PAYMENT':
      case 'Payment':
        return CounterpartySettlementSide.CUSTOMER;
      case 'PurchaseReceipt':
      case 'PurchaseReturn':
      case 'AdditionalExpense':
        return CounterpartySettlementSide.SUPPLIER;
      case 'ServiceAct': {
        const act = sourceDocId ? serviceActs.get(sourceDocId) : undefined;
        if (!act) return null;
        return act.type === 'PROVIDED'
          ? CounterpartySettlementSide.CUSTOMER
          : CounterpartySettlementSide.SUPPLIER;
      }
      default:
        return null;
    }
  }

  private targetFromSource(sourceDocType: string | null, sourceDocId: string | null) {
    if (!sourceDocType || !sourceDocId) return undefined;
    const targetType = {
      SalesInvoice: SettlementAllocationTarget.SALES_INVOICE,
      SalesOrder: SettlementAllocationTarget.SALES_ORDER,
      SalesReturn: SettlementAllocationTarget.SALES_RETURN,
      PurchaseReceipt: SettlementAllocationTarget.PURCHASE_RECEIPT,
      PurchaseReturn: SettlementAllocationTarget.PURCHASE_RETURN,
      AdditionalExpense: SettlementAllocationTarget.ADDITIONAL_EXPENSE,
      ServiceAct: SettlementAllocationTarget.SERVICE_ACT,
    }[sourceDocType];
    return targetType ? { targetType, targetId: sourceDocId } : undefined;
  }

  private directionFromSource(
    sourceDocType: string | null,
    sourceDocId: string | null,
    serviceActs: Map<string, { type: string }>,
  ): FinanceDirection | null {
    switch (sourceDocType) {
      case 'SalesInvoice':
      case 'SalesOrder':
      case 'PAYMENT':
      case 'Payment':
      case 'PurchaseReturn':
        return TransactionDirection.INCOME;
      case 'SalesReturn':
      case 'PurchaseReceipt':
      case 'AdditionalExpense':
        return TransactionDirection.EXPENSE;
      case 'ServiceAct': {
        const act = sourceDocId ? serviceActs.get(sourceDocId) : undefined;
        if (!act) return null;
        return act.type === 'PROVIDED'
          ? TransactionDirection.INCOME
          : TransactionDirection.EXPENSE;
      }
      default:
        return null;
    }
  }

  private movementAmount(
    direction: FinanceDirection,
    side: CounterpartySettlementSide,
    amount: number,
  ) {
    const reducesObligation =
      (direction === TransactionDirection.INCOME && side === CounterpartySettlementSide.CUSTOMER) ||
      (direction === TransactionDirection.EXPENSE && side === CounterpartySettlementSide.SUPPLIER);
    return reducesObligation ? -amount : amount;
  }

  private sumExistingAllocations(allocations: Array<{
    targetType: SettlementAllocationTarget;
    targetId: string;
    amount: Prisma.Decimal;
  }>) {
    const grouped = new Map<string, number>();
    for (const allocation of allocations) {
      const key = `${allocation.targetType}:${allocation.targetId}`;
      grouped.set(key, (grouped.get(key) ?? 0) + Number(allocation.amount));
    }
    return grouped;
  }

  private allocationCandidates(
    settlement: FinanceSettlement,
    targets: Map<string, ReconciliationTarget>,
    invoices: Array<{ id: string; salesOrderId: string | null; invoiceDate: Date }>,
    orders: Map<string, { status: string }>,
  ) {
    const candidates = Array.from(targets.values()).filter((target) =>
      target.counterpartyId === settlement.counterpartyId &&
      target.currency === settlement.currency &&
      target.side === settlement.side &&
      target.allocationGoal - target.allocated > EPSILON,
    );
    if (settlement.directTarget) {
      const direct = targets.get(`${settlement.directTarget.targetType}:${settlement.directTarget.targetId}`);
      if (direct) return [direct];
      return [];
    }
    if (settlement.sourceDocType === 'PAYMENT' || settlement.sourceDocType === 'Payment') {
      const matchingInvoiceIds = invoices
        .filter((invoice) => invoice.salesOrderId === settlement.paymentOrderId)
        .map((invoice) => invoice.id);
      if (matchingInvoiceIds.length > 0) {
        return candidates
          .filter((target) => target.targetType === SettlementAllocationTarget.SALES_INVOICE && matchingInvoiceIds.includes(target.id))
          .sort((left, right) => left.effectiveAt.getTime() - right.effectiveAt.getTime());
      }
      if (settlement.paymentOrderId) {
        const orderTarget = targets.get(`${SettlementAllocationTarget.SALES_ORDER}:${settlement.paymentOrderId}`);
        return orderTarget ? [orderTarget] : [];
      }
    }
    return candidates
      .filter((target) =>
        target.targetType !== SettlementAllocationTarget.SALES_ORDER ||
        orders.get(target.id)?.status !== 'CANCELLED',
      )
      .filter((target) =>
        target.targetType !== SettlementAllocationTarget.SALES_RETURN &&
        target.targetType !== SettlementAllocationTarget.PURCHASE_RETURN,
      )
      .sort((left, right) => left.effectiveAt.getTime() - right.effectiveAt.getTime());
  }

  private buildProjection(
    entries: Array<{
      counterpartyId: string;
      currency: string;
      side: CounterpartySettlementSide;
      amount: Prisma.Decimal;
    }>,
    plannedEntries: RecordSettlementMovementInput[],
  ) {
    const projection = new Map<string, { counterpartyId: string; currency: string; customerDebt: number; supplierDebt: number }>();
    const add = (entry: {
      counterpartyId: string;
      currency: string;
      side: CounterpartySettlementSide;
      amount: number | Prisma.Decimal;
    }) => {
      const key = `${entry.counterpartyId}\u0000${entry.currency}`;
      const current = projection.get(key) ?? {
        counterpartyId: entry.counterpartyId,
        currency: entry.currency,
        customerDebt: 0,
        supplierDebt: 0,
      };
      if (entry.side === CounterpartySettlementSide.CUSTOMER) current.customerDebt += Number(entry.amount);
      else current.supplierDebt += Number(entry.amount);
      projection.set(key, current);
    };
    for (const entry of entries) add(entry);
    for (const entry of plannedEntries) add(entry);
    return projection;
  }

  private findProjectionDifferences(
    expected: Map<string, { counterpartyId: string; currency: string; customerDebt: number; supplierDebt: number }>,
    actualBalances: Array<{
      counterpartyId: string;
      currency: string;
      customerDebt: Prisma.Decimal | number;
      supplierDebt: Prisma.Decimal | number;
    }>,
  ): ProjectionDifference[] {
    const actual = new Map(actualBalances.map((balance) => [
      `${balance.counterpartyId}\u0000${balance.currency}`,
      balance,
    ]));
    const keys = new Set([...expected.keys(), ...actual.keys()]);
    const differences: ProjectionDifference[] = [];
    for (const key of keys) {
      const expectedBalance = expected.get(key);
      const actualBalance = actual.get(key);
      const customerId = expectedBalance?.counterpartyId ?? actualBalance!.counterpartyId;
      const currency = expectedBalance?.currency ?? actualBalance!.currency;
      const expectedCustomer = expectedBalance?.customerDebt ?? 0;
      const expectedSupplier = expectedBalance?.supplierDebt ?? 0;
      const actualCustomer = Number(actualBalance?.customerDebt ?? 0);
      const actualSupplier = Number(actualBalance?.supplierDebt ?? 0);
      if (
        Math.abs(expectedCustomer - actualCustomer) > EPSILON ||
        Math.abs(expectedSupplier - actualSupplier) > EPSILON
      ) {
        differences.push({
          counterpartyId: customerId,
          currency,
          expected: { customerDebt: expectedCustomer, supplierDebt: expectedSupplier },
          actual: { customerDebt: actualCustomer, supplierDebt: actualSupplier },
        });
      }
    }
    return differences;
  }
}
