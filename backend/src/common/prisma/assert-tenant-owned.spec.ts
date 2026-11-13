import { BadRequestException } from '@nestjs/common';
import { assertTenantOwned } from './assert-tenant-owned';

const client = (rows: Record<string, Array<{ id: string }>>) => {
  const db: Record<string, { findMany: jest.Mock }> = {};
  for (const [model, found] of Object.entries(rows)) {
    db[model] = { findMany: jest.fn().mockResolvedValue(found) };
  }
  return db;
};

describe('assertTenantOwned', () => {
  it('passes when every id is found within the tenant, and scopes the lookup', async () => {
    const db = client({ product: [{ id: 'p1' }, { id: 'p2' }] });

    await assertTenantOwned(db, 'A', { product: ['p1', 'p2', 'p1'] });

    expect(db.product.findMany).toHaveBeenCalledWith({
      where: { AND: [{ id: { in: ['p1', 'p2'] } }, { tenantId: 'A' }] },
      select: { id: true },
    });
  });

  it('rejects with the missing ids when any id is not the caller’s', async () => {
    const db = client({ warehouse: [{ id: 'wh-a' }] });

    await expect(
      assertTenantOwned(db, 'A', { warehouse: ['wh-a', 'wh-b'] }),
    ).rejects.toThrow(
      new BadRequestException(
        'Ombor topilmadi: wh-b / Склад не найден(а): wh-b',
      ),
    );
  });

  it('skips empty optional references without querying', async () => {
    const db = client({ counterparty: [], priceList: [] });

    await assertTenantOwned(db, 'A', {
      counterparty: undefined,
      priceList: null,
      product: [],
    });

    expect(db.counterparty.findMany).not.toHaveBeenCalled();
    expect(db.priceList.findMany).not.toHaveBeenCalled();
  });

  it('scopes child rows through their parent and allows shared system types', async () => {
    const db = client({
      purchaseReceiptItem: [{ id: 'item-1' }],
      transactionType: [{ id: 'tt-system' }],
    });

    await assertTenantOwned(db, 'A', {
      purchaseReceiptItem: 'item-1',
      transactionType: 'tt-system',
    });

    expect(db.purchaseReceiptItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [{ id: { in: ['item-1'] } }, { receipt: { tenantId: 'A' } }],
        },
      }),
    );
    expect(db.transactionType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { id: { in: ['tt-system'] } },
            { OR: [{ tenantId: 'A' }, { tenantId: null }] },
          ],
        },
      }),
    );
  });

  it('refuses to run without a tenant', async () => {
    await expect(
      assertTenantOwned(client({}), '', { product: 'p1' }),
    ).rejects.toThrow(BadRequestException);
  });
});
