/**
 * Integration test: runs against a REAL Postgres database (several
 * connections), via `npm run test:integration` with DATABASE_URL_TEST
 * pointing at a disposable database. Data is written under a fresh tenant.
 *
 * Two simultaneous postExpense calls on one draft, and two simultaneous
 * cancelExpense calls on the posted expense: exactly one of each applies,
 * and every figure ends at the expected total (nothing applied twice).
 */
import { useTestDatabase } from '../../../test/use-test-database';
useTestDatabase();

import { Test } from '@nestjs/testing';
import {
  ExpenseAllocationMethod,
  ExpenseType,
  Prisma,
  PurchaseDocStatus,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma';
import { AccountsService } from '../accounting/accounts/accounts.service';
import { JournalService } from '../accounting/journal/journal.service';
import { CounterpartySettlementService } from '../settlements/counterparty-settlement.service';
import { AdditionalExpensesService } from './additional-expenses.service';

jest.setTimeout(120000);

const RATE = 12500;
const D = Prisma.Decimal;

describe('Additional Expense post / cancel under concurrency', () => {
  let prisma: PrismaService;
  let service: AdditionalExpensesService;
  let tenantId: string;
  let userId: string;
  let carrierId: string;
  let receiptId: string;
  const lines: { id: string; productId: string; batchId: string }[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        AdditionalExpensesService,
        CounterpartySettlementService,
        AccountsService,
        JournalService,
      ],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(AdditionalExpensesService);

    const runId = Date.now().toString(36);
    tenantId = (
      await prisma.company.create({
        data: {
          name: { uz: 'Concurrency ' + runId, ru: 'Concurrency ' + runId },
          slug: 'concurrency-' + runId,
        },
      })
    ).id;
    await moduleRef.get(AccountsService).ensureDefaultAccounts(tenantId);
    userId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: `concurrency-${runId}@sklad.uz`,
          passwordHash: 'hashed',
          firstName: 'Test',
          lastName: 'User',
        },
      })
    ).id;
    const warehouseId = (
      await prisma.warehouse.create({
        data: { tenantId, name: { uz: 'Ombor', ru: 'Склад' } },
      })
    ).id;
    const supplierId = (
      await prisma.counterparty.create({
        data: { tenantId, name: 'USD supplier', type: 'SUPPLIER' },
      })
    ).id;
    carrierId = (
      await prisma.counterparty.create({
        data: { tenantId, name: 'Carrier', type: 'SUPPLIER' },
      })
    ).id;
    receiptId = (
      await prisma.purchaseReceipt.create({
        data: {
          tenantId,
          docNumber: `PR-CONC-${runId}`,
          counterpartyId: supplierId,
          warehouseId,
          currency: 'USD',
          exchangeRate: RATE,
          status: PurchaseDocStatus.POSTED,
        },
      })
    ).id;
    // 500 units at 100 USD and 7 units at 33.33 USD: per-unit deltas need
    // 4 decimals.
    for (const [qty, price] of [
      [500, 100],
      [7, 33.33],
    ] as const) {
      const product = await prisma.product.create({
        data: {
          tenantId,
          name: { uz: `p${qty}`, ru: `p${qty}` },
          sku: `p${qty}-${runId}`,
        },
      });
      const line = await prisma.purchaseReceiptItem.create({
        data: {
          receiptId,
          productId: product.id,
          quantity: qty,
          unitPrice: price,
          totalPrice: new D(qty).mul(price),
          landedCost: price,
        },
      });
      const batch = await prisma.productBatch.create({
        data: {
          tenantId,
          productId: product.id,
          warehouseId,
          receiptId,
          batchNumber: `B-${qty}-${runId}`,
          initialQty: qty,
          remainingQty: qty,
          purchasePrice: new D(price).mul(RATE),
          landedCost: new D(price).mul(RATE),
        },
      });
      lines.push({ id: line.id, productId: product.id, batchId: batch.id });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Every figure posting and cancelling touch, as exact strings. */
  async function state(expenseId: string) {
    const items = await prisma.purchaseReceiptItem.findMany({
      where: { receiptId },
      orderBy: { id: 'asc' },
    });
    const batches = await prisma.productBatch.findMany({
      where: { tenantId, receiptId },
      orderBy: { id: 'asc' },
    });
    const receipt = await prisma.purchaseReceipt.findUniqueOrThrow({
      where: { id: receiptId },
    });
    const settlement = await prisma.counterpartySettlementEntry.findMany({
      where: {
        tenantId,
        sourceDocType: 'AdditionalExpense',
        sourceDocId: expenseId,
      },
    });
    const journal = await prisma.journalEntry.count({
      where: {
        tenantId,
        sourceDocType: 'AdditionalExpense',
        sourceDocId: expenseId,
      },
    });
    return {
      lines: items.map((i) => i.landedCost.toFixed(4)),
      batches: batches.map((b) => b.landedCost.toFixed(4)),
      receiptTotal: receipt.additionalExpensesTotal.toFixed(2),
      settlementCount: settlement.length,
      settlementSum: settlement
        .reduce((s, e) => s.add(e.amount), new D(0))
        .toFixed(2),
      journal,
    };
  }

  for (let round = 1; round <= 3; round++) {
    it(`round ${round}: two posts apply once, two cancels apply once, totals exact`, async () => {
      const draft = await service.createDraft(tenantId, userId, {
        receiptId,
        counterpartyId: carrierId,
        expenseType: ExpenseType.TRANSPORT,
        amount: 1,
        currency: 'USD',
        exchangeRate: RATE,
        allocationMethod: ExpenseAllocationMethod.BY_QUANTITY,
        docDate: '2026-11-10',
      });
      const stored = await prisma.additionalExpenseItem.findMany({
        where: { expenseId: draft.id },
      });
      const before = await state(draft.id);

      // Expected after one post: each line + its receiptUnitDelta, each
      // batch + its baseUnitDelta, receipt total + the receipt shares.
      const expected = {
        lines: before.lines.map((v, i) => {
          const row = stored.find(
            (s) =>
              s.receiptItemId ===
              [...lines].sort((a, b) => a.id.localeCompare(b.id))[i].id,
          )!;
          return new D(v).add(row.receiptUnitDelta!).toFixed(4);
        }),
        batches: before.batches.map((v, i) => {
          const batch = [...lines].sort((a, b) =>
            a.batchId.localeCompare(b.batchId),
          )[i];
          const row = stored.find((s) => s.productId === batch.productId)!;
          return new D(v).add(row.baseUnitDelta!).toFixed(4);
        }),
        receiptTotal: new D(before.receiptTotal)
          .add(stored.reduce((s, r) => s.add(r.receiptAmount!), new D(0)))
          .toFixed(2),
        settlementCount: 1,
        settlementSum: '1.00',
        journal: 1,
      };

      const posts = await Promise.allSettled([
        service.postExpense(tenantId, userId, draft.id),
        service.postExpense(tenantId, userId, draft.id),
      ]);
      const postOk = posts.filter((p) => p.status === 'fulfilled').length;
      const postErr = posts
        .filter((p): p is PromiseRejectedResult => p.status === 'rejected')
        .map((p) => (p.reason as Error).message);
      const posted = await state(draft.id);

      const cancels = await Promise.allSettled([
        service.cancelExpense(tenantId, userId, draft.id),
        service.cancelExpense(tenantId, userId, draft.id),
      ]);
      const cancelOk = cancels.filter((p) => p.status === 'fulfilled').length;
      const cancelErr = cancels
        .filter((p): p is PromiseRejectedResult => p.status === 'rejected')
        .map((p) => (p.reason as Error).message);
      const cancelled = await state(draft.id);
      const status = (
        await prisma.additionalExpense.findUniqueOrThrow({
          where: { id: draft.id },
        })
      ).status;

      console.log(
        JSON.stringify(
          {
            round,
            deltas: stored.map((s) => [
              s.receiptUnitDelta?.toString(),
              s.baseUnitDelta?.toString(),
            ]),
            before,
            posted,
            cancelled,
            postErr,
            cancelErr,
          },
          null,
          1,
        ),
      );
      expect(postOk).toBe(1);
      expect(postErr).toHaveLength(1);
      expect(postErr[0]).toMatch(/qoralama/i);
      expect(posted).toEqual(expected);
      expect(cancelOk).toBe(1);
      expect(cancelErr).toHaveLength(1);
      expect(cancelled).toEqual({
        ...before,
        settlementCount: 2,
        settlementSum: '0.00',
        journal: 0,
      });
      expect(status).toBe(PurchaseDocStatus.CANCELLED);
    });
  }
});
