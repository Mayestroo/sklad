/**
 * Integration test: runs against a REAL Postgres database, so it only runs via
 * `npm run test:integration` with DATABASE_URL_TEST pointing at a disposable
 * test database. Data is written under a fresh tenant per run.
 *
 * USD receipt lines whose landed cost an old Additional Expense posting
 * overwrote with a UZS figure: the posting guard, the shared looks_uzs rule
 * (SQL and TypeScript) and the repair (dry run, apply, apply again).
 */
import { useTestDatabase } from '../../../test/use-test-database';
useTestDatabase();

import { Test, TestingModule } from '@nestjs/testing';
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
import {
  LANDED_COST_LOOKS_UZS_SQL,
  landedCostLooksUzs,
  usdReceiptLandedCostAudit,
} from './usd-receipt-landed-cost';
import { repairUsdReceiptLandedCost } from './usd-receipt-landed-cost-repair';

jest.setTimeout(60000);

const RATE = 12500;

describe('USD receipt lines holding a UZS landed cost', () => {
  let prisma: PrismaService;
  let service: AdditionalExpensesService;
  let tenantId: string;
  let userId: string;
  let carrierId: string;
  let receiptId: string;
  /** Overwritten; its only expense was cancelled: derivable (112.00). */
  let lineVat: string;
  /** Normal USD landed cost. */
  let lineOk: string;
  /** Overwritten; a legacy posted expense has no receipt_unit_delta. */
  let lineLegacy: string;

  const landed = async (id: string) =>
    (
      await prisma.purchaseReceiptItem.findUniqueOrThrow({ where: { id } })
    ).landedCost.toFixed(4);
  const allLanded = async () =>
    (
      await prisma.purchaseReceiptItem.findMany({
        where: { receipt: { tenantId } },
        orderBy: { id: 'asc' },
      })
    ).map((i) => `${i.id}=${i.landedCost.toFixed(4)}`);

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
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
    const company = await prisma.company.create({
      data: {
        name: { uz: 'USD landed ' + runId, ru: 'USD landed ' + runId },
        slug: 'usd-landed-' + runId,
      },
    });
    tenantId = company.id;
    await moduleRef.get(AccountsService).ensureDefaultAccounts(tenantId);
    userId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: `usd-landed-${runId}@sklad.uz`,
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

    const receipt = await prisma.purchaseReceipt.create({
      data: {
        tenantId,
        docNumber: `PR-USD-${runId}`,
        counterpartyId: supplierId,
        warehouseId,
        currency: 'USD',
        exchangeRate: RATE,
        status: PurchaseDocStatus.POSTED,
      },
    });
    receiptId = receipt.id;

    // [quantity, unit price, VAT %, stored landed cost, batch landed cost UZS]
    const specs = {
      vat: [10, 100, 12, 1_400_000, 1_400_000], // 112 USD × 12,500 = 1,400,000
      ok: [4, 50, 0, 50, 625_000],
      legacy: [2, 80, 0, 1_010_000, 1_010_000],
    } as const;
    const ids: Record<string, { line: string; product: string }> = {};
    for (const [
      key,
      [qty, price, vat, landedCost, batchLanded],
    ] of Object.entries(specs)) {
      const product = await prisma.product.create({
        data: { tenantId, name: { uz: key, ru: key }, sku: `${key}-${runId}` },
      });
      const net = qty * price;
      const vatAmount = (net * vat) / 100;
      const line = await prisma.purchaseReceiptItem.create({
        data: {
          receiptId,
          productId: product.id,
          quantity: qty,
          unitPrice: price,
          vatRate: vat,
          vatAmount,
          totalPrice: net + vatAmount,
          landedCost,
        },
      });
      await prisma.productBatch.create({
        data: {
          tenantId,
          productId: product.id,
          warehouseId,
          receiptId,
          batchNumber: `B-${key}-${runId}`,
          initialQty: qty,
          remainingQty: qty,
          purchasePrice: price * RATE,
          landedCost: batchLanded,
        },
      });
      ids[key] = { line: line.id, product: product.id };
    }
    lineVat = ids.vat.line;
    lineOk = ids.ok.line;
    lineLegacy = ids.legacy.line;

    // Old documents: a cancelled expense on `vat` and `ok` (no snapshot), and
    // a posted one on `legacy` (snapshot backfilled, receipt_unit_delta NULL).
    await prisma.additionalExpense.create({
      data: {
        tenantId,
        docNumber: `EXP-OLD-1-${runId}`,
        status: PurchaseDocStatus.CANCELLED,
        expenseType: ExpenseType.TRANSPORT,
        counterpartyId: carrierId,
        receiptId,
        amount: 100,
        currency: 'USD',
        exchangeRate: RATE,
        items: {
          create: [ids.vat, ids.ok].map((x) => ({
            receiptItemId: x.line,
            productId: x.product,
            allocatedAmount: 50,
          })),
        },
      },
    });
    await prisma.additionalExpense.create({
      data: {
        tenantId,
        docNumber: `EXP-OLD-2-${runId}`,
        status: PurchaseDocStatus.POSTED,
        expenseType: ExpenseType.TRANSPORT,
        counterpartyId: carrierId,
        receiptId,
        amount: 10,
        currency: 'USD',
        exchangeRate: RATE,
        items: {
          create: {
            receiptItemId: ids.legacy.line,
            productId: ids.legacy.product,
            allocatedAmount: 10,
            originalCurrency: 'USD',
            expenseRate: RATE,
            receiptRate: RATE,
            rateDate: new Date('2026-01-10'),
            rateSource: 'SAME_CURRENCY',
            receiptAmount: 10,
            baseAmount: 125_000,
            baseUnitDelta: 62_500,
          },
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const draftOn = (lineId: string) =>
    service.createDraft(tenantId, userId, {
      receiptId,
      counterpartyId: carrierId,
      expenseType: ExpenseType.TRANSPORT,
      amount: 20,
      currency: 'USD',
      exchangeRate: RATE,
      allocationMethod: ExpenseAllocationMethod.BY_QUANTITY,
      selectedItemIds: [lineId],
      docDate: '2026-11-10',
    });

  it('the SQL rule and the TypeScript rule agree, edge cases included', async () => {
    // [landed, price, rate, batch UZS]
    const cases: [number, number, number | null, number | null][] = [
      [100, 100, RATE, 1_250_000], // USD: no
      [1_250_000, 100, RATE, 1_250_000], // equals batch: yes
      [625_000, 100, RATE, null], // exactly half of price in UZS: yes
      [624_999.99, 100, RATE, null], // just under: no
      [0, 100, RATE, 0], // zero landed cost: no
      [0, 0, RATE, 0], // free goods: no
      [5, 0, RATE, 62_500], // free goods with a USD expense: no
      [62_500, 0, RATE, 62_500], // free goods, equals batch: yes
      [1_000_000, 100, null, null], // no rate: no
    ];
    const values = Prisma.join(
      cases.map(
        ([l, p, r, b]) =>
          Prisma.sql`(${l}::numeric, ${p}::numeric, ${r}::numeric, ${b}::numeric)`,
      ),
    );
    const rows = await prisma.$queryRaw<{ looks_uzs: boolean }[]>`
      SELECT ${Prisma.raw(LANDED_COST_LOOKS_UZS_SQL)} AS looks_uzs, l.ord
      FROM (
        SELECT v.*, row_number() OVER () AS ord
        FROM (VALUES ${values}) AS v("landed_cost", "unit_price", "receipt_rate", "batch_landed_cost_uzs")
      ) l
      ORDER BY l.ord`;
    const fromTs = cases.map(([l, p, r, b]) =>
      landedCostLooksUzs({
        landedCost: l,
        unitPrice: p,
        receiptRate: r,
        batchLandedCostUzs: b,
      }),
    );
    expect(rows.map((r) => r.looks_uzs)).toEqual(fromTs);
    expect(fromTs).toEqual([
      false,
      true,
      true,
      false,
      false,
      false,
      false,
      true,
      false,
    ]);

    const audit = await usdReceiptLandedCostAudit(prisma, tenantId);
    expect(audit.map((r) => [r.receipt_item_id, r.looks_uzs]).sort()).toEqual(
      [
        [lineVat, true],
        [lineOk, false],
        [lineLegacy, true],
      ].sort(),
    );
  });

  it('refuses to post on a flagged line, listing the receipt and line, and changes nothing', async () => {
    const draft = await draftOn(lineVat);
    const before = await allLanded();
    const error = await service
      .postExpense(tenantId, userId, draft.id)
      .catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(receiptId);
    expect((error as Error).message).toContain(lineVat);
    expect((error as Error).message).toMatch(/xaridni tuzatish kerak/);
    expect((error as Error).message).toMatch(/приход нужно исправить/);
    expect(await allLanded()).toEqual(before);
    expect(
      (
        await prisma.additionalExpense.findUniqueOrThrow({
          where: { id: draft.id },
        })
      ).status,
    ).toBe(PurchaseDocStatus.DRAFT);
  });

  it('posts normally on an unflagged line of the same receipt', async () => {
    const draft = await draftOn(lineOk);
    await service.postExpense(tenantId, userId, draft.id);
    // 20 USD over 4 units: +5.00 USD per unit on the receipt line.
    expect(await landed(lineOk)).toBe('55.0000');
    const batch = await prisma.productBatch.findFirstOrThrow({
      where: { tenantId, receiptId, productId: draft.items[0].productId },
    });
    expect(batch.landedCost.toFixed(4)).toBe('687500.0000'); // 625,000 + 62,500
  });

  it('dry run lists before/after and writes nothing', async () => {
    const before = await allLanded();
    const report = await repairUsdReceiptLandedCost(prisma, tenantId, {
      apply: false,
    });
    expect(await allLanded()).toEqual(before);
    expect(report.written).toBe(0);
    const byLine = Object.fromEntries(
      report.lines.map((l) => [l.receiptItemId, l]),
    );
    expect(Object.keys(byLine).sort()).toEqual([lineVat, lineLegacy].sort());
    expect(byLine[lineVat]).toMatchObject({
      status: 'repair',
      before: '1400000.0000',
      after: '112.0000',
    });
    expect(byLine[lineLegacy]).toMatchObject({
      status: 'manual_review',
      before: '1010000.0000',
      after: null,
    });
    expect(byLine[lineLegacy].reason).toMatch(/no stored receipt_unit_delta/);
  });

  it('--apply fixes the flagged line exactly, leaves the others, and a second run changes nothing', async () => {
    const okBefore = await landed(lineOk);
    const first = await repairUsdReceiptLandedCost(prisma, tenantId, {
      apply: true,
    });
    expect(first.written).toBe(1);
    expect(await landed(lineVat)).toBe('112.0000');
    expect(await landed(lineLegacy)).toBe('1010000.0000'); // manual review
    expect(await landed(lineOk)).toBe(okBefore);

    const afterFirst = await allLanded();
    const second = await repairUsdReceiptLandedCost(prisma, tenantId, {
      apply: true,
    });
    expect(second.written).toBe(0);
    expect(second.lines.map((l) => [l.receiptItemId, l.status])).toEqual([
      [lineLegacy, 'manual_review'],
    ]);
    expect(await allLanded()).toEqual(afterFirst);
  });

  it('after the repair, an expense on the repaired line posts in USD', async () => {
    const draft = await draftOn(lineVat);
    await service.postExpense(tenantId, userId, draft.id);
    // 20 USD over 10 units: +2.00 USD per unit on 112.00.
    expect(await landed(lineVat)).toBe('114.0000');
  });
});
