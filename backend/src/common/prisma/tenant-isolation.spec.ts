import { ConflictException, NotFoundException } from '@nestjs/common';
import { CategoriesService } from '../../modules/inventory/categories/categories.service';
import { UsersService } from '../../modules/users/users.service';
import { CounterpartySettlementService } from '../../modules/settlements/counterparty-settlement.service';
import { SalesInvoicesService } from '../../modules/sales/invoices/sales-invoices.service';

/**
 * One test per query pattern fixed in the tenant-isolation sweep. Each runs a
 * real service as tenant A against an in-memory store that also holds tenant
 * B's rows, and checks B's rows are neither returned nor changed.
 */

type Row = Record<string, any>;
type Store = Record<string, Row[]>;

/** Relation filters: model → relation field → [parent model, foreign key]. */
const RELATIONS: Record<string, Record<string, [string, string]>> = {
  userRole: { user: ['user', 'userId'], role: ['role', 'roleId'] },
  productPrice: {
    priceList: ['priceList', 'priceListId'],
    product: ['product', 'productId'],
  },
};

function matches(store: Store, model: string, row: Row, where: Row): boolean {
  return Object.entries(where ?? {}).every(([key, cond]) => {
    if (key === 'AND') {
      return (Array.isArray(cond) ? cond : [cond]).every((c) =>
        matches(store, model, row, c),
      );
    }
    if (key === 'OR') {
      return (cond as Row[]).some((c) => matches(store, model, row, c));
    }
    const relation = RELATIONS[model]?.[key];
    if (relation) {
      const [parentModel, fk] = relation;
      const parent = store[parentModel].find((p) => p.id === row[fk]);
      return !!parent && matches(store, parentModel, parent, cond);
    }
    if (key.includes('_') && !(key in row) && typeof cond === 'object') {
      return matches(store, model, row, cond); // compound unique key
    }
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('in' in cond) return cond.in.includes(row[key]);
      if ('not' in cond) return row[key] !== cond.not;
      return matches(store, model, row[key] ?? {}, cond);
    }
    return row[key] === cond;
  });
}

function applyData(row: Row, data: Row) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && 'increment' in value) {
      row[key] = Number(row[key] ?? 0) + Number(value.increment);
    } else if (value !== undefined) {
      row[key] = value;
    }
  }
}

/** A Prisma-shaped client over `store` that honours `where` filters. */
function fakePrisma(store: Store, uniqueKeys: Record<string, string> = {}) {
  const delegate = (model: string) => {
    const rows = () => store[model];
    const find = (where: Row) =>
      rows().filter((r) => matches(store, model, r, where));
    const one = (where: Row) => {
      const [row] = find(where);
      if (!row) throw new Error(`P2025: ${model} record not found`);
      return row;
    };
    return {
      findFirst: jest.fn(async ({ where }: Row) => find(where)[0] ?? null),
      findUnique: jest.fn(async ({ where }: Row) => find(where)[0] ?? null),
      findMany: jest.fn(async ({ where }: Row = {}) => find(where)),
      count: jest.fn(async ({ where }: Row = {}) => find(where).length),
      create: jest.fn(async ({ data }: Row) => {
        const row = { id: `${model}-${rows().length + 1}`, ...data };
        rows().push(row);
        return row;
      }),
      createMany: jest.fn(async ({ data }: Row) => {
        let count = 0;
        for (const item of data as Row[]) {
          const key = uniqueKeys[model];
          // A globally unique column: the insert is skipped on a clash.
          if (key && rows().some((r) => r[key] === item[key])) continue;
          rows().push({ id: `${model}-${rows().length + 1}`, ...item });
          count++;
        }
        return { count };
      }),
      update: jest.fn(async ({ where, data }: Row) => {
        const row = one(where);
        applyData(row, data);
        return row;
      }),
      updateMany: jest.fn(async ({ where, data }: Row) => {
        const hit = find(where);
        hit.forEach((r) => applyData(r, data));
        return { count: hit.length };
      }),
      delete: jest.fn(async ({ where }: Row) => {
        const row = one(where);
        store[model] = rows().filter((r) => r !== row);
        return row;
      }),
      deleteMany: jest.fn(async ({ where }: Row = {}) => {
        const hit = find(where);
        store[model] = rows().filter((r) => !hit.includes(r));
        return { count: hit.length };
      }),
      upsert: jest.fn(async ({ where, create, update }: Row) => {
        const [row] = find(where);
        if (row) {
          applyData(row, update);
          return row;
        }
        const created = { id: `${model}-${rows().length + 1}`, ...create };
        rows().push(created);
        return created;
      }),
    };
  };
  const client: Row = {};
  for (const model of Object.keys(store)) client[model] = delegate(model);
  client.$transaction = jest.fn(async (fn: (tx: Row) => unknown) => fn(client));
  return client;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('tenant isolation', () => {
  it('update/delete by id: deleting a category never touches another tenant’s rows', async () => {
    const store: Store = {
      category: [
        { id: 'cat-a', tenantId: 'A', parentId: null },
        // Tenant B's rows that point at A's category (a cross-tenant link).
        { id: 'cat-b', tenantId: 'B', parentId: 'cat-a' },
      ],
      product: [
        { id: 'prod-a', tenantId: 'A', categoryId: 'cat-a' },
        { id: 'prod-b', tenantId: 'B', categoryId: 'cat-a' },
      ],
    };
    const service = new CategoriesService(fakePrisma(store) as never);

    await expect(
      service.update('A', 'cat-b', { name: { uz: 'x', ru: 'x' } }),
    ).rejects.toThrow(NotFoundException);
    await service.delete('A', 'cat-a');

    expect(store.product.find((p) => p.id === 'prod-a')!.categoryId).toBeNull();
    expect(store.product.find((p) => p.id === 'prod-b')!.categoryId).toBe(
      'cat-a',
    );
    expect(store.category).toEqual([
      { id: 'cat-b', tenantId: 'B', parentId: 'cat-a' },
    ]);
  });

  it('child rows through their parent: another tenant’s user roles are not deleted', async () => {
    const store: Store = {
      user: [
        { id: 'user-a', tenantId: 'A' },
        { id: 'user-b', tenantId: 'B' },
      ],
      role: [{ id: 'role-staff', tenantId: null, slug: 'staff' }],
      userRole: [
        { id: 'ur-a', userId: 'user-a', roleId: 'role-staff' },
        { id: 'ur-b', userId: 'user-b', roleId: 'role-staff' },
      ],
    };
    const prisma = fakePrisma(store);
    const service = new UsersService(
      prisma as never,
      { logAction: jest.fn() } as never,
    );

    await expect(service.deleteUser('A', 'user-b', 'admin-a')).rejects.toThrow(
      NotFoundException,
    );
    await service.deleteUser('A', 'user-a', 'admin-a');

    expect(store.userRole.map((r) => r.id)).toEqual(['ur-b']);
    expect(store.user.map((u) => u.id)).toEqual(['user-b']);
    expect(prisma.userRole.deleteMany).toHaveBeenCalledWith({
      where: { user: { tenantId: 'A' }, userId: 'user-a' },
    });
  });

  const movement = (overrides: Row = {}) => ({
    tenantId: 'A',
    counterpartyId: 'cp-a',
    currency: 'UZS',
    side: 'CUSTOMER' as const,
    amount: 100,
    entryType: 'DOCUMENT_POSTED',
    effectiveAt: new Date('2026-11-01T00:00:00.000Z'),
    sourceDocType: 'SalesInvoice',
    sourceDocId: 'inv-a',
    idempotencyKey: 'SalesInvoice:inv-a:POSTED',
    ...overrides,
  });
  const settlementStore = (): Store => ({
    counterparty: [
      { id: 'cp-a', tenantId: 'A' },
      { id: 'cp-b', tenantId: 'B' },
    ],
    counterpartySettlementEntry: [
      {
        id: 'entry-b',
        tenantId: 'B',
        counterpartyId: 'cp-b',
        currency: 'UZS',
        side: 'CUSTOMER',
        amount: 900,
        idempotencyKey: 'SalesInvoice:inv-b:POSTED',
      },
    ],
    counterpartyBalance: [
      {
        id: 'bal-b',
        tenantId: 'B',
        counterpartyId: 'cp-b',
        currency: 'UZS',
        customerDebt: 900,
        supplierDebt: 0,
      },
    ],
  });

  it('compound unique key: a settlement movement cannot reach another tenant’s balance', async () => {
    const store = settlementStore();
    const before = clone(store.counterpartyBalance);
    const tx = fakePrisma(store, {
      counterpartySettlementEntry: 'idempotencyKey',
    });
    const service = new CounterpartySettlementService();

    await expect(
      service.recordMovement(tx as never, movement({ counterpartyId: 'cp-b' })),
    ).rejects.toThrow(NotFoundException);
    await service.recordMovement(tx as never, movement());

    expect(store.counterpartyBalance.filter((b) => b.tenantId === 'B')).toEqual(
      before,
    );
    expect(tx.counterpartyBalance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'A' }),
      }),
    );
  });

  it('globally unique business key: another tenant’s idempotency key is never read back', async () => {
    const store = settlementStore();
    const before = clone(store);
    const tx = fakePrisma(store, {
      counterpartySettlementEntry: 'idempotencyKey',
    });
    const service = new CounterpartySettlementService();

    // Same key as tenant B's entry: the insert is skipped, and the lookup
    // must not hand back B's entry as if it were A's.
    await expect(
      service.recordMovement(
        tx as never,
        movement({ idempotencyKey: 'SalesInvoice:inv-b:POSTED' }),
      ),
    ).rejects.toThrow(ConflictException);
    expect(tx.counterpartySettlementEntry.findUnique).toHaveBeenCalledWith({
      where: { tenantId: 'A', idempotencyKey: 'SalesInvoice:inv-b:POSTED' },
    });
    expect(store).toEqual(before);
  });

  it('foreign key from the request: a price list cannot be linked to another tenant’s product', async () => {
    const store: Store = {
      priceList: [{ id: 'pl-a', tenantId: 'A', isActive: true }],
      product: [
        { id: 'prod-a', tenantId: 'A', name: 'Own product' },
        { id: 'prod-b', tenantId: 'B', name: 'Secret', costPrice: 70000 },
      ],
      productPrice: [],
    };
    const prisma = fakePrisma(store);
    const service = new SalesInvoicesService(
      prisma as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.upsertProductPrice('A', 'pl-a', 'prod-b', 1000),
    ).rejects.toThrow(NotFoundException);
    await expect(
      service.bulkSetPrices('A', 'pl-a', [
        { productId: 'prod-a', price: 1000 },
        { productId: 'prod-b', price: 1000 },
      ]),
    ).rejects.toThrow(NotFoundException);
    expect(store.productPrice).toEqual([]);

    await service.bulkSetPrices('A', 'pl-a', [
      { productId: 'prod-a', price: 1000 },
    ]);
    expect(store.productPrice).toEqual([
      expect.objectContaining({ priceListId: 'pl-a', productId: 'prod-a' }),
    ]);
  });
});
