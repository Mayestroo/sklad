/**
 * Traces one Additional Expense through the real service methods
 * (preview -> draft -> post -> cancel) on a small in-memory Prisma fake that
 * stores Decimal columns at their schema scale, and checks the numbers at
 * every step: what the preview showed is what the draft stored, posting
 * applies exactly the stored snapshot, and cancelling removes exactly it.
 */
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import {
  ExpenseAllocationMethod,
  ExpenseType,
  Prisma,
  PurchaseDocStatus,
} from '@prisma/client';
import { AdditionalExpensesService } from './additional-expenses.service';
import { PrismaService } from '../../common/prisma';
import { CounterpartySettlementService } from '../settlements/counterparty-settlement.service';
import { AccountsService } from '../accounting/accounts/accounts.service';
import { JournalService } from '../accounting/journal/journal.service';
import { convertAndAllocate } from './expense-allocation.engine';

jest.mock('../../common/sequences/document-sequence');
jest.mock('../../common/prisma/assert-tenant-owned');
jest.mock('../../common/accounting-period/period-lock');

const D = Prisma.Decimal;
type Row = Record<string, unknown> & { id: string };

// ─── In-memory Prisma fake ──────────────────────────────────────────────────

const RATE_FIELDS = new Set([
  'exchangeRate',
  'expenseRate',
  'receiptRate',
  'costPriceExchangeRate',
]);
const QTY_FIELDS = new Set([
  'quantity',
  'soldQuantity',
  'remainingQuantity',
  'remainingQty',
  'initialQty',
  'returnedQuantity',
  'weight',
]);
/** Per-unit cost columns: DECIMAL(17,4) (migration 20261120110000). */
const UNIT_COST_FIELDS = new Set([
  'landedCost',
  'purchasePrice',
  'unitCogs',
  'unitCost',
  'receiptUnitDelta',
  'baseUnitDelta',
  'initialLandedCost',
  'newLandedCost',
]);
/** Columns that are not Decimal although they hold numbers. */
const NON_DECIMAL = new Set(['vatRate']);

function scaleOf(field: string): number {
  if (RATE_FIELDS.has(field)) return 4;
  if (UNIT_COST_FIELDS.has(field)) return 4;
  if (QTY_FIELDS.has(field)) return 3;
  return 2;
}

/** Stores a value the way Postgres would: Decimal columns at their scale. */
function store(field: string, value: unknown): unknown {
  if (NON_DECIMAL.has(field)) return value;
  if (typeof value === 'number' || value instanceof D) {
    return new D(value).toDecimalPlaces(scaleOf(field), D.ROUND_HALF_UP);
  }
  return value;
}

let seq = 0;
const newId = (prefix: string) => `${prefix}-${++seq}`;

function matches(row: Row, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (expected === undefined) return true;
    if (expected && typeof expected === 'object' && !(expected instanceof D)) {
      const filter = expected as Record<string, unknown>;
      if ('in' in filter) return (filter.in as unknown[]).includes(row[key]);
      if ('not' in filter) return row[key] !== filter.not;
      return true; // relation filters (tenant scoping) are not modelled
    }
    return row[key] === expected;
  });
}

function applyData(row: Row, data: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(data)) {
    if (key === 'items') continue;
    if (
      value &&
      typeof value === 'object' &&
      !(value instanceof D) &&
      !(value instanceof Date)
    ) {
      const op = value as { increment?: unknown; decrement?: unknown };
      const current = new D((row[key] as Prisma.Decimal | number) ?? 0);
      if (op.increment !== undefined) {
        row[key] = store(key, current.add(new D(op.increment as number)));
        continue;
      }
      if (op.decrement !== undefined) {
        row[key] = store(key, current.sub(new D(op.decrement as number)));
        continue;
      }
    }
    row[key] = store(key, value);
  }
}

class FakeDb {
  tables: Record<string, Row[]> = {
    purchaseReceipt: [],
    purchaseReceiptItem: [],
    product: [],
    productBatch: [],
    batchConsumption: [],
    salesInvoice: [],
    salesInvoiceItem: [],
    additionalExpense: [],
    additionalExpenseItem: [],
    cashAccount: [],
  };

  insert(table: string, data: Record<string, unknown>): Row {
    const row: Row = { id: (data.id as string) ?? newId(table) };
    applyData(row, data);
    this.tables[table].push(row);
    return row;
  }

  receiptWithIncludes(receipt: Row) {
    return {
      ...receipt,
      items: this.tables.purchaseReceiptItem
        .filter((i) => i.receiptId === receipt.id)
        .map((i) => ({
          ...i,
          product: this.tables.product.find((p) => p.id === i.productId),
        })),
      batches: this.tables.productBatch.filter(
        (b) => b.receiptId === receipt.id,
      ),
    };
  }

  expenseWithIncludes(expense: Row) {
    return {
      ...expense,
      receipt: this.tables.purchaseReceipt.find(
        (r) => r.id === expense.receiptId,
      ),
      counterparty: { id: expense.counterpartyId, name: 'Carrier' },
      items: this.tables.additionalExpenseItem
        .filter((i) => i.expenseId === expense.id)
        .map((i) => ({
          ...i,
          product: this.tables.product.find((p) => p.id === i.productId),
        })),
    };
  }

  createExpenseItems(expenseId: string, data: Record<string, unknown>) {
    const items = data.items as
      { create?: Record<string, unknown>[] } | undefined;
    for (const item of items?.create ?? []) {
      this.insert('additionalExpenseItem', { ...item, expenseId });
    }
  }

  client(): any {
    return makeClient(this);
  }
}

function makeClient(db: FakeDb): any {
  {
    const simple = (table: string) => ({
      findFirst: jest.fn(async ({ where }: any = {}) => {
        const row = db.tables[table].find((r) => matches(r, where));
        return row ? { ...row } : null;
      }),
      findUnique: jest.fn(async ({ where }: any = {}) => {
        const row = db.tables[table].find((r) => matches(r, where));
        return row ? { ...row } : null;
      }),
      findMany: jest.fn(async ({ where }: any = {}) =>
        db.tables[table]
          .filter((r) => matches(r, where))
          .map((r) => ({ ...r })),
      ),
      update: jest.fn(async ({ where, data }: any) => {
        const row = db.tables[table].find((r) => matches(r, where));
        if (!row) throw new Error(`${table} not found`);
        applyData(row, data);
        return { ...row };
      }),
    });

    const client: any = {
      purchaseReceipt: {
        ...simple('purchaseReceipt'),
        findFirst: jest.fn(async ({ where }: any) => {
          const r = db.tables.purchaseReceipt.find((x) => matches(x, where));
          return r ? db.receiptWithIncludes(r) : null;
        }),
      },
      purchaseReceiptItem: simple('purchaseReceiptItem'),
      product: simple('product'),
      productBatch: {
        ...simple('productBatch'),
        findFirst: jest.fn(async ({ where }: any) => {
          const b = db.tables.productBatch.find((x) => matches(x, where));
          if (!b) return null;
          return {
            ...b,
            consumptions: db.tables.batchConsumption
              .filter((c) => c.batchId === b.id)
              .map((c) => ({
                ...c,
                salesInvoiceItem: c.salesInvoiceItemId
                  ? {
                      ...db.tables.salesInvoiceItem.find(
                        (s) => s.id === c.salesInvoiceItemId,
                      ),
                    }
                  : null,
              })),
          };
        }),
      },
      batchConsumption: {
        ...simple('batchConsumption'),
        updateMany: jest.fn(async ({ where, data }: any) => {
          const rows = db.tables.batchConsumption.filter((r) =>
            matches(r, where),
          );
          rows.forEach((r) => applyData(r, data));
          return { count: rows.length };
        }),
      },
      salesInvoice: simple('salesInvoice'),
      salesInvoiceItem: simple('salesInvoiceItem'),
      cashAccount: simple('cashAccount'),
      additionalExpense: {
        findFirst: jest.fn(async ({ where }: any) => {
          const e = db.tables.additionalExpense.find((x) => matches(x, where));
          return e ? db.expenseWithIncludes(e) : null;
        }),
        create: jest.fn(async ({ data }: any) => {
          const row = db.insert('additionalExpense', {
            ...data,
            items: undefined,
          });
          db.createExpenseItems(row.id, data);
          return db.expenseWithIncludes(row);
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const row = db.tables.additionalExpense.find((x) =>
            matches(x, where),
          );
          if (!row) throw new Error('expense not found');
          applyData(row, data);
          db.createExpenseItems(row.id, data);
          return db.expenseWithIncludes(row);
        }),
        delete: jest.fn(),
      },
      additionalExpenseItem: {
        ...simple('additionalExpenseItem'),
        deleteMany: jest.fn(async ({ where }: any) => {
          const before = db.tables.additionalExpenseItem.length;
          db.tables.additionalExpenseItem =
            db.tables.additionalExpenseItem.filter((r) => !matches(r, where));
          return { count: before - db.tables.additionalExpenseItem.length };
        }),
      },
      financeTransaction: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      settlementAllocation: { findMany: jest.fn().mockResolvedValue([]) },
      account: {
        findFirst: jest.fn(async ({ where }: any) => ({
          id: `acc-${where.code}`,
        })),
      },
      auditLog: { create: jest.fn() },
      $queryRaw: jest.fn(async (sql: Prisma.Sql) => {
        const [id] = sql.values as string[];
        const row = db.tables.additionalExpense.find((e) => e.id === id);
        return row ? [{ status: row.status }] : [];
      }),
    };
    client.$transaction = jest.fn(async (fn: (tx: unknown) => unknown) =>
      fn(client),
    );
    return client;
  }
}

// ─── Fixture: a posted USD receipt with three lines ─────────────────────────

const tenantId = 'tenant-1';
const userId = 'user-1';

function seedUsdReceipt(db: FakeDb, rate = 12500) {
  const receipt = db.insert('purchaseReceipt', {
    id: 'receipt-1',
    tenantId,
    status: PurchaseDocStatus.POSTED,
    currency: 'USD',
    exchangeRate: rate,
    additionalExpensesTotal: 0,
  });
  const lines = [
    { id: 'line-a', qty: 3, price: 100 },
    { id: 'line-b', qty: 3, price: 100 },
    { id: 'line-c', qty: 3, price: 100 },
  ];
  for (const l of lines) {
    const productId = `prod-${l.id}`;
    db.insert('product', {
      id: productId,
      tenantId,
      name: { uz: l.id },
      sku: l.id,
      unitOfMeasure: 'piece',
      costPriceCurrency: 'UZS',
    });
    db.insert('purchaseReceiptItem', {
      id: l.id,
      receiptId: receipt.id,
      productId,
      quantity: l.qty,
      unitPrice: l.price,
      totalPrice: l.qty * l.price,
      landedCost: l.price, // USD per unit
    });
    db.insert('productBatch', {
      id: `batch-${l.id}`,
      tenantId,
      receiptId: receipt.id,
      productId,
      initialQty: l.qty,
      remainingQty: l.qty,
      purchasePrice: l.price * rate,
      landedCost: l.price * rate, // UZS per unit
    });
  }
  return receipt;
}

async function makeService(db: FakeDb) {
  const journalService = {
    createJournalEntry: jest.fn().mockResolvedValue({ id: 'je-1' }),
    deleteEntriesForSource: jest.fn().mockResolvedValue(undefined),
  };
  const settlementService = {
    recordMovement: jest.fn().mockResolvedValue({ created: true }),
  };
  const moduleRef = await Test.createTestingModule({
    providers: [
      AdditionalExpensesService,
      { provide: PrismaService, useValue: db.client() },
      { provide: CounterpartySettlementService, useValue: settlementService },
      {
        provide: AccountsService,
        useValue: { ensureDefaultAccounts: jest.fn() },
      },
      { provide: JournalService, useValue: journalService },
    ],
  }).compile();
  return {
    service: moduleRef.get(AdditionalExpensesService),
    journalService,
    settlementService,
  };
}

const n = (v: unknown) => Number(v);
const sum = (values: unknown[]) =>
  values
    .reduce<Prisma.Decimal>((s, v) => s.add(new D(v as number)), new D(0))
    .toFixed(2);

const draftDto = {
  receiptId: 'receipt-1',
  counterpartyId: 'carrier-1',
  expenseType: ExpenseType.TRANSPORT,
  amount: 100000,
  currency: 'UZS',
  allocationMethod:
    ExpenseAllocationMethod.BY_AMOUNT as ExpenseAllocationMethod,
  docDate: '2026-11-10',
};

// ─── Preview and draft ──────────────────────────────────────────────────────

describe('Additional Expense currency trace: preview and draft', () => {
  it('preview labels every column with its currency and never mixes them', async () => {
    const db = new FakeDb();
    seedUsdReceipt(db);
    const { service } = await makeService(db);

    const preview = await service.calculateAllocationPreview(tenantId, {
      receiptId: 'receipt-1',
      amount: 100000,
      currency: 'UZS',
      allocationMethod: ExpenseAllocationMethod.BY_AMOUNT,
    });

    expect(preview.currency).toBe('UZS');
    expect(preview.receiptCurrency).toBe('USD');
    expect(preview.receiptTotal).toBe(8);
    expect(preview.baseTotal).toBe(100000);
    expect(sum(preview.items.map((i) => i.receiptAmount))).toBe('8.00');
    // Receipt-currency landed cost: USD 100 + about 0.89 a unit, not
    // 100 + 11111.11. Line a took the rounding leftover (2.66 USD / 3 units
    // = 0.8867 at 4 decimals; it showed 0.89 when per-unit was 2 decimals).
    expect(preview.items.map((i) => i.newLandedCost)).toEqual([
      100.8867, 100.89, 100.89,
    ]);
  });

  it('preview refuses a USD expense without a rate', async () => {
    const db = new FakeDb();
    seedUsdReceipt(db);
    const { service } = await makeService(db);

    await expect(
      service.calculateAllocationPreview(tenantId, {
        receiptId: 'receipt-1',
        amount: 10,
        currency: 'USD',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('the draft stores exactly what the preview showed, with its rates', async () => {
    const db = new FakeDb();
    seedUsdReceipt(db);
    const { service } = await makeService(db);

    const preview = await service.calculateAllocationPreview(tenantId, {
      receiptId: 'receipt-1',
      amount: 100000,
      currency: 'UZS',
      docDate: '2026-11-10',
    });
    await service.createDraft(tenantId, userId, draftDto);

    const rows = db.tables.additionalExpenseItem;
    expect(rows).toHaveLength(3);
    for (const line of preview.items) {
      const row = rows.find((r) => r.receiptItemId === line.receiptItemId)!;
      expect(n(row.allocatedAmount)).toBe(line.allocatedAmount);
      expect(n(row.receiptAmount)).toBe(line.receiptAmount);
      expect(n(row.baseAmount)).toBe(line.baseAmount);
      expect(n(row.receiptUnitDelta)).toBe(line.receiptUnitDelta);
      expect(n(row.baseUnitDelta)).toBe(line.baseUnitDelta);
      expect(n(row.newLandedCost)).toBe(line.newLandedCost);
      expect(row.originalCurrency).toBe('UZS');
      expect(n(row.expenseRate)).toBe(1);
      expect(n(row.receiptRate)).toBe(12500);
      expect(row.rateSource).toBe('DOCUMENT');
      expect(row.rateDate).toEqual(new Date('2026-11-10'));
    }
    expect(sum(rows.map((r) => r.receiptAmount))).toBe('8.00');
    expect(sum(rows.map((r) => r.baseAmount))).toBe('100000.00');
  });

  it('saving a draft again keeps its own lines and re-converts at the new rate', async () => {
    const db = new FakeDb();
    seedUsdReceipt(db);
    const { service } = await makeService(db);

    const draft = await service.createDraft(tenantId, userId, {
      ...draftDto,
      selectedItemIds: ['line-a', 'line-b'],
    });
    await service.updateDraft(tenantId, userId, draft.id, {
      currency: 'USD',
      exchangeRate: 12600,
      amount: 10,
    });

    const rows = db.tables.additionalExpenseItem;
    expect(rows.map((r) => r.receiptItemId).sort()).toEqual([
      'line-a',
      'line-b',
    ]);
    expect(rows.map((r) => r.originalCurrency)).toEqual(['USD', 'USD']);
    expect(sum(rows.map((r) => r.allocatedAmount))).toBe('10.00');
    expect(sum(rows.map((r) => r.receiptAmount))).toBe('10.00');
    expect(sum(rows.map((r) => r.baseAmount))).toBe('126000.00');
    expect(rows.map((r) => r.rateSource)).toEqual([
      'SAME_CURRENCY',
      'SAME_CURRENCY',
    ]);
  });

  it('a draft whose selected line is not on the receipt is refused', async () => {
    const db = new FakeDb();
    seedUsdReceipt(db);
    const { service } = await makeService(db);

    await expect(
      service.createDraft(tenantId, userId, {
        ...draftDto,
        selectedItemIds: ['line-a', 'line-from-another-receipt'],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('the preview is convertAndAllocate itself (one function, no second copy)', async () => {
    const db = new FakeDb();
    seedUsdReceipt(db);
    const { service } = await makeService(db);
    const preview = await service.calculateAllocationPreview(tenantId, {
      receiptId: 'receipt-1',
      amount: 777.77,
      currency: 'USD',
      exchangeRate: 12345.6789,
      allocationMethod: ExpenseAllocationMethod.BY_QUANTITY,
      docDate: '2026-11-10',
    });
    const receipt = await db
      .client()
      .purchaseReceipt.findFirst({ where: { id: 'receipt-1' } });
    expect(preview).toEqual(
      convertAndAllocate({
        items: receipt.items,
        amount: 777.77,
        allocationMethod: ExpenseAllocationMethod.BY_QUANTITY,
        expense: { currency: 'USD', exchangeRate: 12345.6789 },
        receipt,
        rateDate: new Date('2026-11-10'),
        batches: receipt.batches,
      }),
    );
  });
});

// ─── Posting ────────────────────────────────────────────────────────────────

/** Two of line-b's three units were sold for USD 150 each at 12,500. */
function seedSale(db: FakeDb) {
  db.insert('salesInvoice', {
    id: 'inv-1',
    tenantId,
    currency: 'USD',
    exchangeRate: 12500,
    totalAmount: 300,
    vatAmount: 0,
    totalCogs: 2500000,
    grossProfit: 1250000,
  });
  db.insert('salesInvoiceItem', {
    id: 'inv-item-1',
    invoiceId: 'inv-1',
    totalPrice: 300,
    vatAmount: 0,
    unitCogs: 1250000,
    lineCogs: 2500000,
    lineGrossProfit: 1250000,
  });
  db.insert('batchConsumption', {
    id: 'cons-1',
    tenantId,
    batchId: 'batch-line-b',
    salesInvoiceItemId: 'inv-item-1',
    quantity: 2,
    unitCost: new D(1250000),
  });
  const batch = db.tables.productBatch.find((b) => b.id === 'batch-line-b')!;
  batch.remainingQty = new D(1);
}

const row = (db: FakeDb, table: string, id: string) =>
  db.tables[table].find((r) => r.id === id)!;

describe('Additional Expense currency trace: posting', () => {
  it('applies exactly the stored snapshot: UZS to batches and COGS, USD to the receipt', async () => {
    const db = new FakeDb();
    seedUsdReceipt(db);
    seedSale(db);
    const { service, journalService } = await makeService(db);

    const draft = await service.createDraft(tenantId, userId, draftDto);
    const stored = db.tables.additionalExpenseItem.map((r) => ({ ...r }));
    await service.postExpense(tenantId, userId, draft.id);

    // Batches: UZS landed cost + the stored baseUnitDelta.
    for (const item of stored) {
      const batch = row(
        db,
        'productBatch',
        `batch-${String(item.receiptItemId)}`,
      );
      expect(n(batch.landedCost)).toBe(1250000 + n(item.baseUnitDelta));
      // Receipt line: USD landed cost + the stored receiptUnitDelta (it used
      // to receive the UZS batch cost).
      const line = row(db, 'purchaseReceiptItem', String(item.receiptItemId));
      expect(n(line.landedCost)).toBe(100 + n(item.receiptUnitDelta));
    }
    // Receipt total in USD: exactly the stored receipt-currency shares.
    expect(
      n(row(db, 'purchaseReceipt', 'receipt-1').additionalExpensesTotal),
    ).toBe(8);

    // Sold units: 2 × line-b's baseUnitDelta on the sale's COGS.
    const lineB = stored.find((r) => r.receiptItemId === 'line-b')!;
    const cogsDelta = 2 * n(lineB.baseUnitDelta);
    expect(n(row(db, 'salesInvoiceItem', 'inv-item-1').lineCogs)).toBe(
      2500000 + cogsDelta,
    );
    expect(n(row(db, 'salesInvoice', 'inv-1').totalCogs)).toBe(
      2500000 + cogsDelta,
    );
    const postedB = db.tables.additionalExpenseItem.find(
      (r) => r.receiptItemId === 'line-b',
    )!;
    expect(n(postedB.soldQuantity)).toBe(2);
    expect(n(postedB.cogsAdjustment)).toBe(cogsDelta);

    // Journal in UZS: stock + COGS = the stored UZS total.
    const lines = journalService.createJournalEntry.mock.calls[0][1].lines;
    const debit = (code: string) =>
      lines.find((l: any) => l.debitAccountId === `acc-${code}`)?.amount ?? 0;
    expect(debit('2910') + debit('9110')).toBe(100000);
    expect(debit('9110')).toBe(cogsDelta);
    expect(row(db, 'additionalExpense', draft.id).status).toBe(
      PurchaseDocStatus.POSTED,
    );
  });

  it('refuses to post when the receipt rate changed after the draft was saved, and changes nothing', async () => {
    const db = new FakeDb();
    seedUsdReceipt(db);
    const { service } = await makeService(db);

    const draft = await service.createDraft(tenantId, userId, draftDto);
    row(db, 'purchaseReceipt', 'receipt-1').exchangeRate = new D(12600);

    await expect(
      service.postExpense(tenantId, userId, draft.id),
    ).rejects.toThrow(/qoralamani qayta saqlang.*receiptRate/);
    expect(row(db, 'additionalExpense', draft.id).status).toBe(
      PurchaseDocStatus.DRAFT,
    );
    expect(n(row(db, 'productBatch', 'batch-line-a').landedCost)).toBe(1250000);
    expect(
      n(row(db, 'purchaseReceipt', 'receipt-1').additionalExpensesTotal),
    ).toBe(0);

    // Saving the draft again takes the new rate; then it posts.
    await service.updateDraft(tenantId, userId, draft.id, {});
    await service.postExpense(tenantId, userId, draft.id);
    // 100,000 / 12,600 = 7.94 USD
    expect(
      n(row(db, 'purchaseReceipt', 'receipt-1').additionalExpensesTotal),
    ).toBe(7.94);
  });

  it('refuses a draft saved before the snapshot existed', async () => {
    const db = new FakeDb();
    seedUsdReceipt(db);
    const { service } = await makeService(db);

    const draft = await service.createDraft(tenantId, userId, draftDto);
    for (const item of db.tables.additionalExpenseItem) {
      for (const field of [
        'originalCurrency',
        'expenseRate',
        'receiptRate',
        'rateDate',
        'rateSource',
        'receiptAmount',
        'baseAmount',
        'receiptUnitDelta',
        'baseUnitDelta',
      ]) {
        item[field] = null;
      }
    }

    await expect(
      service.postExpense(tenantId, userId, draft.id),
    ).rejects.toThrow(/has no saved conversion/);
    expect(row(db, 'additionalExpense', draft.id).status).toBe(
      PurchaseDocStatus.DRAFT,
    );
  });
});

// ─── Cancelling ─────────────────────────────────────────────────────────────

/** Every figure posting changes, as strings so Decimal scale is compared too. */
function ledgerState(db: FakeDb) {
  const pick = (table: string, fields: string[]) =>
    db.tables[table]
      .map((r) => [r.id, ...fields.map((f) => String(r[f]))].join('|'))
      .sort();
  return {
    batches: pick('productBatch', ['landedCost']),
    receiptLines: pick('purchaseReceiptItem', ['landedCost']),
    receipt: pick('purchaseReceipt', ['additionalExpensesTotal']),
    saleLines: pick('salesInvoiceItem', [
      'unitCogs',
      'lineCogs',
      'lineGrossProfit',
    ]),
    sales: pick('salesInvoice', ['totalCogs', 'grossProfit']),
    consumptions: pick('batchConsumption', ['unitCost']),
  };
}

describe('Additional Expense currency trace: cancelling', () => {
  async function postThenCancel(
    db: FakeDb,
    dto: Partial<typeof draftDto> & { exchangeRate?: number },
    beforeCancel?: () => void,
  ) {
    const { service } = await makeService(db);
    const before = ledgerState(db);
    const draft = await service.createDraft(tenantId, userId, {
      ...draftDto,
      ...dto,
    });
    await service.postExpense(tenantId, userId, draft.id);
    const posted = ledgerState(db);
    beforeCancel?.();
    await service.cancelExpense(tenantId, userId, draft.id);
    return { before, posted, after: ledgerState(db), draft };
  }

  it('restores every figure exactly, with rates that force rounding', async () => {
    const db = new FakeDb();
    seedUsdReceipt(db, 12345.6789);
    seedSale(db);
    const { before, posted, after } = await postThenCancel(db, {
      amount: 777.77,
      currency: 'USD',
      exchangeRate: 12777.7777,
      allocationMethod: ExpenseAllocationMethod.BY_QUANTITY,
    });
    expect(posted).not.toEqual(before);
    expect(after).toEqual(before);
  });

  it('restores a UZS receipt after a USD expense', async () => {
    const db = new FakeDb();
    seedUsdReceipt(db);
    const receipt = row(db, 'purchaseReceipt', 'receipt-1');
    receipt.currency = 'UZS';
    receipt.exchangeRate = new D(1);
    const { before, after } = await postThenCancel(db, {
      amount: 10,
      currency: 'USD',
      exchangeRate: 12500,
    });
    expect(after).toEqual(before);
  });

  it('cancel after a rate change reverses the stored values, not the new rates', async () => {
    const db = new FakeDb();
    seedUsdReceipt(db);
    seedSale(db);
    let draftId = '';
    const { before, after } = await postThenCancel(
      db,
      { amount: 1000, currency: 'USD', exchangeRate: 12500 },
      () => {
        // Both documents' rates are edited after posting.
        const expense = db.tables.additionalExpense[0];
        draftId = expense.id;
        expense.exchangeRate = new D(13000);
        row(db, 'purchaseReceipt', 'receipt-1').exchangeRate = new D(11000);
      },
    );
    expect(after).toEqual(before);
    expect(row(db, 'additionalExpense', draftId).status).toBe(
      PurchaseDocStatus.CANCELLED,
    );
  });

  it('a tiny USD expense over many units keeps 4 decimals per unit and cancels exactly', async () => {
    // 1.00 USD over 500 units of one line of a USD receipt at 12,500.
    const db = new FakeDb();
    seedUsdReceipt(db);
    const line = row(db, 'purchaseReceiptItem', 'line-a');
    line.quantity = new D(500);
    line.totalPrice = new D(50000);
    const batch = row(db, 'productBatch', 'batch-line-a');
    batch.initialQty = new D(500);
    batch.remainingQty = new D(500);
    const fixed4 = (table: string, id: string, field: string) =>
      new D(row(db, table, id)[field] as Prisma.Decimal).toFixed(4);

    const { service } = await makeService(db);
    const before = ledgerState(db);
    const lineBefore = fixed4('purchaseReceiptItem', 'line-a', 'landedCost');
    const batchBefore = fixed4('productBatch', 'batch-line-a', 'landedCost');
    const draft = await service.createDraft(tenantId, userId, {
      ...draftDto,
      amount: 1,
      currency: 'USD',
      exchangeRate: 12500,
      allocationMethod: ExpenseAllocationMethod.BY_QUANTITY,
      selectedItemIds: ['line-a'],
    });
    await service.postExpense(tenantId, userId, draft.id);
    const item = db.tables.additionalExpenseItem[0];
    const linePosted = fixed4('purchaseReceiptItem', 'line-a', 'landedCost');
    const batchPosted = fixed4('productBatch', 'batch-line-a', 'landedCost');
    const receiptPosted = new D(
      row(db, 'purchaseReceipt', 'receipt-1')
        .additionalExpensesTotal as Prisma.Decimal,
    ).toFixed(2);
    await service.cancelExpense(tenantId, userId, draft.id);

    // Receipt currency: 1.00 / 500 = 0.0020 USD per unit (was 0.00).
    expect(new D(item.receiptUnitDelta as Prisma.Decimal).toFixed(4)).toBe(
      '0.0020',
    );
    expect([lineBefore, linePosted]).toEqual(['100.0000', '100.0020']);
    expect(fixed4('purchaseReceiptItem', 'line-a', 'landedCost')).toBe(
      lineBefore,
    );
    // UZS: 12,500 / 500 = 25.0000 per unit on the batch.
    expect(new D(item.baseUnitDelta as Prisma.Decimal).toFixed(4)).toBe(
      '25.0000',
    );
    expect([batchBefore, batchPosted]).toEqual([
      '1250000.0000',
      '1250025.0000',
    ]);
    expect(receiptPosted).toBe('1.00');
    // Cancel restores every figure exactly.
    expect(ledgerState(db)).toEqual(before);
  });

  it('a small expense over many units on a UZS receipt, with sold units, cancels exactly', async () => {
    // 100 UZS over 700 units (2 sold) of a UZS receipt: 0.142857… per unit.
    const db = new FakeDb();
    seedUsdReceipt(db);
    seedSale(db);
    const receipt = row(db, 'purchaseReceipt', 'receipt-1');
    receipt.currency = 'UZS';
    receipt.exchangeRate = new D(1);
    const line = row(db, 'purchaseReceiptItem', 'line-b');
    Object.assign(line, {
      quantity: new D(700),
      unitPrice: new D(10000),
      totalPrice: new D(7000000),
      landedCost: new D(10000),
    });
    Object.assign(row(db, 'productBatch', 'batch-line-b'), {
      initialQty: new D(700),
      remainingQty: new D(698),
      purchasePrice: new D(10000),
      landedCost: new D(10000),
    });
    Object.assign(row(db, 'salesInvoiceItem', 'inv-item-1'), {
      unitCogs: new D(10000),
      lineCogs: new D(20000),
      lineGrossProfit: new D(3730000), // 300 USD × 12,500 − 20,000
    });
    Object.assign(row(db, 'salesInvoice', 'inv-1'), {
      totalCogs: new D(20000),
      grossProfit: new D(3730000),
    });
    row(db, 'batchConsumption', 'cons-1').unitCost = new D(10000);
    const fixed = (table: string, id: string, field: string, dp: number) =>
      new D(row(db, table, id)[field] as Prisma.Decimal).toFixed(dp);

    const { service } = await makeService(db);
    const before = ledgerState(db);
    const draft = await service.createDraft(tenantId, userId, {
      ...draftDto,
      amount: 100,
      currency: 'UZS',
      allocationMethod: ExpenseAllocationMethod.BY_QUANTITY,
      selectedItemIds: ['line-b'],
    });
    await service.postExpense(tenantId, userId, draft.id);
    const item = db.tables.additionalExpenseItem[0];
    const posted = {
      receiptUnitDelta: new D(item.receiptUnitDelta as Prisma.Decimal).toFixed(
        4,
      ),
      baseUnitDelta: new D(item.baseUnitDelta as Prisma.Decimal).toFixed(4),
      line: fixed('purchaseReceiptItem', 'line-b', 'landedCost', 4),
      batch: fixed('productBatch', 'batch-line-b', 'landedCost', 4),
      unitCogs: fixed('salesInvoiceItem', 'inv-item-1', 'unitCogs', 4),
      lineCogs: fixed('salesInvoiceItem', 'inv-item-1', 'lineCogs', 2),
      consumption: fixed('batchConsumption', 'cons-1', 'unitCost', 4),
      cogsAdjustment: new D(item.cogsAdjustment as Prisma.Decimal).toFixed(2),
    };
    await service.cancelExpense(tenantId, userId, draft.id);

    expect(posted).toEqual({
      receiptUnitDelta: '0.1429', // was 0.14
      baseUnitDelta: '0.1429',
      line: '10000.1429',
      batch: '10000.1429',
      unitCogs: '10000.1429',
      lineCogs: '20000.29', // 2 × 0.1429 = 0.2858 → money 0.29
      // a sales return re-enters stock at this cost
      consumption: '10000.1429',
      cogsAdjustment: '0.29',
    });
    expect(ledgerState(db)).toEqual(before);
    expect(fixed('batchConsumption', 'cons-1', 'unitCost', 4)).toBe(
      '10000.0000',
    );
    expect(fixed('purchaseReceiptItem', 'line-b', 'landedCost', 4)).toBe(
      '10000.0000',
    );
    expect(fixed('salesInvoiceItem', 'inv-item-1', 'unitCogs', 4)).toBe(
      '10000.0000',
    );
  });

  it('an expense posted before consumptions were revalued cancels without touching them', async () => {
    const db = new FakeDb();
    seedUsdReceipt(db, 12500);
    seedSale(db);
    const { service } = await makeService(db);
    const draft = await service.createDraft(tenantId, userId, {
      ...draftDto,
      amount: 1000,
      currency: 'UZS',
      selectedItemIds: ['line-b'],
    });
    await service.postExpense(tenantId, userId, draft.id);
    // What the old code left behind: the consumption kept the sale-time
    // cost and the expense carries no flag.
    row(db, 'batchConsumption', 'cons-1').unitCost = new D(1250000);
    row(db, 'additionalExpense', draft.id).consumptionCostRevalued = false;

    await service.cancelExpense(tenantId, userId, draft.id);

    expect(
      new D(
        row(db, 'batchConsumption', 'cons-1').unitCost as Prisma.Decimal,
      ).toFixed(4),
    ).toBe('1250000.0000');
  });

  it('a mixed-currency expense posted and cancelled twice leaves no drift', async () => {
    const db = new FakeDb();
    seedUsdReceipt(db, 12345.6789);
    seedSale(db);
    const { service } = await makeService(db);
    const before = ledgerState(db);
    for (const amount of [33333.33, 98765.43]) {
      const draft = await service.createDraft(tenantId, userId, {
        ...draftDto,
        amount,
      });
      await service.postExpense(tenantId, userId, draft.id);
      await service.cancelExpense(tenantId, userId, draft.id);
    }
    expect(ledgerState(db)).toEqual(before);
  });
});
