/**
 * Integration test: runs against a REAL Postgres database via
 * `npm run test:integration` with DATABASE_URL_TEST pointing at a disposable
 * database. Data is written under a fresh tenant.
 *
 * A sales return re-enters stock, and reverses 9110, at the cost recorded on
 * the sale's batch consumptions (ADR 0012). An Additional Expense posted
 * after the sale raises that sale's COGS (ADR 0008), so it must raise the
 * consumption cost by the same stored per-unit delta, and cancelling must
 * take exactly that back.
 *
 * Receipt: 7 units at 10,000 UZS. Sale: 3 units. Expense: 100 UZS by
 * quantity, so 14.2857 UZS per unit (4 decimals) and 42.86 UZS of COGS.
 */
import { useTestDatabase } from '../../../test/use-test-database';
useTestDatabase();

import { Test, TestingModule } from '@nestjs/testing';
import { ExpenseAllocationMethod, ExpenseType, Prisma } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../../common/prisma';
import { AccountsService } from '../accounting/accounts/accounts.service';
import { JournalService } from '../accounting/journal/journal.service';
import { SalesInvoicesService } from '../sales/invoices/sales-invoices.service';
import { CounterpartySettlementService } from '../settlements/counterparty-settlement.service';
import { SettlementAllocationService } from '../settlements/settlement-allocation.service';
import { AdditionalExpensesService } from './additional-expenses.service';
import { PurchasesService } from './purchases.service';

jest.setTimeout(120000);

const D = Prisma.Decimal;
const AUDIT_SQL = readFileSync(
  join(__dirname, '../../../scripts/sql/audit-stale-sale-consumption-cost.sql'),
  'utf8',
);

describe('Additional Expense then sales return (integration)', () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let purchases: PurchasesService;
  let sales: SalesInvoicesService;
  let expenses: AdditionalExpensesService;
  let tenantId: string;
  let userId: string;
  let warehouseId: string;
  let supplierId: string;
  let carrierId: string;
  let customerId: string;
  let run = 0;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        PrismaService,
        AccountsService,
        JournalService,
        CounterpartySettlementService,
        SettlementAllocationService,
        PurchasesService,
        SalesInvoicesService,
        AdditionalExpensesService,
      ],
    }).compile();
    prisma = module.get(PrismaService);
    purchases = module.get(PurchasesService);
    sales = module.get(SalesInvoicesService);
    expenses = module.get(AdditionalExpensesService);

    const runId = Date.now().toString(36);
    tenantId = (
      await prisma.company.create({
        data: {
          name: {
            uz: 'Expense return ' + runId,
            ru: 'Expense return ' + runId,
          },
          slug: 'expense-return-' + runId,
        },
      })
    ).id;
    await module.get(AccountsService).ensureDefaultAccounts(tenantId);
    userId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: `expense-return-${runId}@sklad.test`,
          passwordHash: 'hashed',
          firstName: 'Test',
          lastName: 'User',
        },
      })
    ).id;
    warehouseId = (
      await prisma.warehouse.create({
        data: { tenantId, name: { uz: 'Ombor', ru: 'Склад' } },
      })
    ).id;
    supplierId = (
      await prisma.counterparty.create({
        data: { tenantId, name: 'Supplier', type: 'SUPPLIER' },
      })
    ).id;
    carrierId = (
      await prisma.counterparty.create({
        data: { tenantId, name: 'Carrier', type: 'SUPPLIER' },
      })
    ).id;
    customerId = (
      await prisma.counterparty.create({
        data: { tenantId, name: 'Customer', type: 'CUSTOMER' },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await module.close();
  });

  /** Posted receipt (7 × 10,000 UZS) and a posted sale of 3 from it. */
  async function receiptAndSale() {
    run += 1;
    const productId = (
      await prisma.product.create({
        data: {
          tenantId,
          name: { uz: `t${run}`, ru: `t${run}` },
          sku: `ER-${run}-${Date.now()}`,
          // Unlike the batch cost on purpose: costs must come from batches.
          costPrice: 1,
          salePrice: 1,
        },
      })
    ).id;
    const receipt = await purchases.createReceipt(tenantId, userId, {
      counterpartyId: supplierId,
      warehouseId,
      currency: 'UZS',
      docDate: new Date().toISOString(),
      items: [
        { productId, quantity: 7, unitPrice: 10000, discount: 0, vatRate: 0 },
      ],
    });
    await purchases.postReceipt(tenantId, userId, receipt.id);
    const invoice = await sales.createInvoice(tenantId, userId, {
      counterpartyId: customerId,
      warehouseId,
      currency: 'UZS',
      items: [{ productId, quantity: 3, unitPrice: 15000 }],
    });
    await sales.postInvoice(tenantId, userId, invoice.id);
    const batch = await prisma.productBatch.findFirstOrThrow({
      where: { tenantId, receiptId: receipt.id, productId },
    });
    const saleLine = await prisma.salesInvoiceItem.findFirstOrThrow({
      where: { invoiceId: invoice.id },
    });
    return {
      productId,
      receiptId: receipt.id,
      invoiceId: invoice.id,
      batchId: batch.id,
      saleLineId: saleLine.id,
    };
  }

  async function postExpense(receiptId: string) {
    const draft = await expenses.createDraft(tenantId, userId, {
      receiptId,
      counterpartyId: carrierId,
      expenseType: ExpenseType.TRANSPORT,
      amount: 100,
      currency: 'UZS',
      exchangeRate: 1,
      allocationMethod: ExpenseAllocationMethod.BY_QUANTITY,
      docDate: new Date().toISOString(),
    });
    await expenses.postExpense(tenantId, userId, draft.id);
    return draft.id;
  }

  const returnAll = (f: Awaited<ReturnType<typeof receiptAndSale>>) =>
    sales.createReturn(tenantId, userId, {
      invoiceId: f.invoiceId,
      counterpartyId: customerId,
      warehouseId,
      currency: 'UZS',
      items: [{ productId: f.productId, quantity: 3, unitPrice: 15000 }],
    });

  /** Every figure the expense touches, as exact strings. */
  async function state(f: Awaited<ReturnType<typeof receiptAndSale>>) {
    const batch = await prisma.productBatch.findUniqueOrThrow({
      where: { id: f.batchId },
    });
    const consumptions = await prisma.batchConsumption.findMany({
      where: { tenantId, salesInvoiceItemId: f.saleLineId },
    });
    const line = await prisma.salesInvoiceItem.findUniqueOrThrow({
      where: { id: f.saleLineId },
    });
    const invoice = await prisma.salesInvoice.findUniqueOrThrow({
      where: { id: f.invoiceId },
    });
    const receiptLine = await prisma.purchaseReceiptItem.findFirstOrThrow({
      where: { receiptId: f.receiptId },
    });
    const receipt = await prisma.purchaseReceipt.findUniqueOrThrow({
      where: { id: f.receiptId },
    });
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: f.productId },
    });
    return {
      batchLandedCost: batch.landedCost.toFixed(4),
      batchRemaining: batch.remainingQty.toFixed(3),
      consumptionCosts: consumptions.map((c) => c.unitCost.toFixed(4)),
      unitCogs: line.unitCogs.toFixed(4),
      lineCogs: line.lineCogs.toFixed(2),
      lineGrossProfit: line.lineGrossProfit.toFixed(2),
      invoiceCogs: invoice.totalCogs.toFixed(2),
      invoiceGrossProfit: invoice.grossProfit.toFixed(2),
      receiptLineLandedCost: receiptLine.landedCost.toFixed(4),
      receiptExpensesTotal: receipt.additionalExpensesTotal.toFixed(2),
      catalogCost: product.costPrice.toFixed(2),
    };
  }

  /** Net debit of a ledger account over this tenant's journal (UZS). */
  async function netDebit(code: string) {
    const account = await prisma.account.findFirstOrThrow({
      where: { tenantId, code },
    });
    const [dr, cr] = await Promise.all([
      prisma.journalLine.aggregate({
        where: { debitAccountId: account.id, entry: { tenantId } },
        _sum: { amount: true },
      }),
      prisma.journalLine.aggregate({
        where: { creditAccountId: account.id, entry: { tenantId } },
        _sum: { amount: true },
      }),
    ]);
    return new D(dr._sum.amount ?? 0).sub(cr._sum.amount ?? 0).toFixed(2);
  }

  async function returnBatch(returnNumber: string) {
    return prisma.productBatch.findFirstOrThrow({
      where: { tenantId, batchNumber: { startsWith: `RET-${returnNumber}` } },
    });
  }

  it('a full return after the expense reverses the sale line COGS and restocks at the new cost; cancelling the expense restores its figures exactly', async () => {
    const base = new D(await netDebit('9110'));
    const cogsSince = async () =>
      new D(await netDebit('9110')).sub(base).toFixed(2);
    const f = await receiptAndSale();
    expect(await cogsSince()).toBe('30000.00');
    const beforeExpense = await state(f);
    expect(beforeExpense).toMatchObject({
      batchLandedCost: '10000.0000',
      consumptionCosts: ['10000.0000'],
      unitCogs: '10000.0000',
      lineCogs: '30000.00',
    });

    const expenseId = await postExpense(f.receiptId);
    const item = await prisma.additionalExpenseItem.findFirstOrThrow({
      where: { expenseId },
    });
    expect(item.baseUnitDelta!.toFixed(4)).toBe('14.2857');
    const posted = await state(f);
    expect(posted).toMatchObject({
      batchLandedCost: '10014.2857',
      // the consumption moves with the batch and the sale line
      consumptionCosts: ['10014.2857'],
      unitCogs: '10014.2857',
      lineCogs: '30042.86', // 3 × 14.2857 = 42.8571 → 42.86
      receiptLineLandedCost: '10014.2857',
      receiptExpensesTotal: '100.00',
    });
    expect(
      (
        await prisma.additionalExpense.findUniqueOrThrow({
          where: { id: expenseId },
        })
      ).consumptionCostRevalued,
    ).toBe(true);
    // Nothing for the audit query to list: this posting kept them in step.
    const auditRows =
      await prisma.$queryRawUnsafe<{ tenant_id: string }[]>(AUDIT_SQL);
    expect(auditRows.filter((r) => r.tenant_id === tenantId)).toEqual([]);

    const ret = await returnAll(f);

    // COGS reversed = the sale line COGS after the expense.
    expect(new D(ret.totalCogs).toFixed(2)).toBe(posted.lineCogs);
    const retLine = await prisma.salesReturnItem.findFirstOrThrow({
      where: { returnId: ret.id },
    });
    expect(retLine.unitCogs.toFixed(4)).toBe('10014.2857');
    expect(retLine.lineCogs.toFixed(2)).toBe('30042.86');
    // Goods come back at the post-expense cost.
    const back = await returnBatch(ret.returnNumber);
    expect(back.landedCost.toFixed(4)).toBe('10014.2857');
    expect(back.remainingQty.toFixed(3)).toBe('3.000');
    // 9110: sale 30,000.00 + expense 42.86 − return 30,042.86 = 0.
    expect(await cogsSince()).toBe('0.00');

    // Cancel the expense: every figure it changed is back exactly.
    await expenses.cancelExpense(tenantId, userId, expenseId);
    const cancelled = await state(f);
    expect(cancelled).toEqual(beforeExpense);
    expect(
      await prisma.journalEntry.count({
        where: {
          tenantId,
          sourceDocType: 'AdditionalExpense',
          sourceDocId: expenseId,
        },
      }),
    ).toBe(0);
    const settlement = await prisma.counterpartySettlementEntry.findMany({
      where: {
        tenantId,
        sourceDocType: 'AdditionalExpense',
        sourceDocId: expenseId,
      },
    });
    expect(
      settlement.reduce((s, e) => s.add(e.amount), new D(0)).toFixed(2),
    ).toBe('0.00');

    // Known gap (follow-up, not changed here): the return is a separate
    // posted document, so its stock layer keeps the post-expense cost and
    // its 9110 credit stays, leaving 9110 at −42.86 once the expense is
    // cancelled.
    expect((await returnBatch(ret.returnNumber)).landedCost.toFixed(4)).toBe(
      '10014.2857',
    );
    expect(await cogsSince()).toBe('-42.86');
  });

  it('expense posted then cancelled before the return: the return uses the original cost', async () => {
    const f = await receiptAndSale();
    const beforeExpense = await state(f);
    const expenseId = await postExpense(f.receiptId);
    await expenses.cancelExpense(tenantId, userId, expenseId);
    expect(await state(f)).toEqual(beforeExpense);

    const ret = await returnAll(f);
    expect(new D(ret.totalCogs).toFixed(2)).toBe('30000.00');
    expect((await returnBatch(ret.returnNumber)).landedCost.toFixed(4)).toBe(
      '10000.0000',
    );
  });

  it('the audit query lists a consumption an old posting left behind, and changes nothing', async () => {
    const f = await receiptAndSale();
    const expenseId = await postExpense(f.receiptId);
    // What the code before this fix left: the consumption kept the sale-time
    // cost and the expense carries no flag.
    await prisma.batchConsumption.updateMany({
      where: { tenantId, salesInvoiceItemId: f.saleLineId },
      data: { unitCost: 10000 },
    });
    await prisma.additionalExpense.update({
      where: { id: expenseId },
      data: { consumptionCostRevalued: false },
    });
    const snapshot = await state(f);

    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      return tx.$queryRawUnsafe<
        {
          tenant_id: string;
          sales_invoice_item_id: string;
          unit_cost: Prisma.Decimal;
          unit_cogs: Prisma.Decimal;
          cost_gap: Prisma.Decimal;
          legacy_expenses: bigint;
          legacy_unit_delta: Prisma.Decimal;
        }[]
      >(AUDIT_SQL);
    });
    const mine = rows.filter((r) => r.tenant_id === tenantId);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ sales_invoice_item_id: f.saleLineId });
    expect(new D(mine[0].unit_cost).toFixed(4)).toBe('10000.0000');
    expect(new D(mine[0].unit_cogs).toFixed(4)).toBe('10014.2857');
    expect(new D(mine[0].cost_gap).toFixed(4)).toBe('14.2857');
    expect(Number(mine[0].legacy_expenses)).toBe(1);
    expect(new D(mine[0].legacy_unit_delta).toFixed(4)).toBe('14.2857');
    expect(await state(f)).toEqual(snapshot);

    // Cancelling that old posting leaves the consumption as it found it.
    await expenses.cancelExpense(tenantId, userId, expenseId);
    expect((await state(f)).consumptionCosts).toEqual(['10000.0000']);
  });
});
