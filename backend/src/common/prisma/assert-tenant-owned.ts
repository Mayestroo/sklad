import { BadRequestException } from '@nestjs/common';

/**
 * Foreign keys taken from a request (body, params, query, or ids nested in
 * line arrays) must point at rows of the caller's tenant. Postgres foreign
 * keys do not know about tenants, so without this check a request can attach
 * another tenant's product, warehouse or counterparty to its own document and
 * then read it back through the document's relations (or post stock and
 * money into it).
 *
 * Call `assertTenantOwned` before the create/update that writes the ids, with
 * the same client (pass the transaction client inside a transaction):
 *
 *   await assertTenantOwned(this.prisma, tenantId, {
 *     counterparty: dto.counterpartyId,
 *     warehouse: dto.warehouseId,
 *     product: dto.items.map((i) => i.productId),
 *   });
 *
 * `null`/`undefined`/empty ids are skipped (optional references); required
 * ones are still enforced by the DTO and the database. Duplicates are fine.
 * Unknown and foreign ids get the same answer, so the error does not reveal
 * whether an id exists in another tenant.
 */

type IdInput =
  string | null | undefined | ReadonlyArray<string | null | undefined>;

interface RefModel {
  /** Prisma client delegate. */
  delegate: string;
  /** Where clause restricting the rows to the tenant. */
  scope: (tenantId: string) => Record<string, unknown>;
  label: { uz: string; ru: string };
}

const own = (tenantId: string) => ({ tenantId });

export const TENANT_REF_MODELS = {
  account: {
    delegate: 'account',
    scope: own,
    label: { uz: 'Hisob', ru: 'Счёт' },
  },
  branch: {
    delegate: 'branch',
    scope: own,
    label: { uz: 'Filial', ru: 'Филиал' },
  },
  cashAccount: {
    delegate: 'cashAccount',
    scope: own,
    label: { uz: 'Kassa / hisob raqam', ru: 'Касса / счёт' },
  },
  category: {
    delegate: 'category',
    scope: own,
    label: { uz: 'Kategoriya', ru: 'Категория' },
  },
  counterparty: {
    delegate: 'counterparty',
    scope: own,
    label: { uz: 'Kontragent', ru: 'Контрагент' },
  },
  counterpartyFolder: {
    delegate: 'counterpartyFolder',
    scope: own,
    label: { uz: 'Kontragent papkasi', ru: 'Папка контрагентов' },
  },
  fixedAsset: {
    delegate: 'fixedAsset',
    scope: own,
    label: { uz: 'Asosiy vosita', ru: 'Основное средство' },
  },
  priceList: {
    delegate: 'priceList',
    scope: own,
    label: { uz: 'Narxlar ro‘yxati', ru: 'Прайс-лист' },
  },
  product: {
    delegate: 'product',
    scope: own,
    label: { uz: 'Tovar', ru: 'Товар' },
  },
  productionRecipe: {
    delegate: 'productionRecipe',
    scope: own,
    label: { uz: 'Ishlab chiqarish retsepti', ru: 'Рецептура' },
  },
  purchaseReceipt: {
    delegate: 'purchaseReceipt',
    scope: own,
    label: { uz: 'Xarid hujjati', ru: 'Документ закупки' },
  },
  purchaseReceiptItem: {
    delegate: 'purchaseReceiptItem',
    scope: (tenantId) => ({ receipt: { tenantId } }),
    label: { uz: 'Xarid qatori', ru: 'Строка закупки' },
  },
  salesInvoice: {
    delegate: 'salesInvoice',
    scope: own,
    label: { uz: 'Sotuv hujjati', ru: 'Документ продажи' },
  },
  salesOrder: {
    delegate: 'salesOrder',
    scope: own,
    label: { uz: 'Buyurtma', ru: 'Заказ' },
  },
  salesOrderItem: {
    delegate: 'salesOrderItem',
    scope: (tenantId) => ({ order: { tenantId } }),
    label: { uz: 'Buyurtma qatori', ru: 'Строка заказа' },
  },
  // System transaction types have no tenant and are shared by everyone.
  transactionType: {
    delegate: 'transactionType',
    scope: (tenantId) => ({ OR: [{ tenantId }, { tenantId: null }] }),
    label: { uz: 'Operatsiya turi', ru: 'Тип операции' },
  },
  user: {
    delegate: 'user',
    scope: own,
    label: { uz: 'Foydalanuvchi', ru: 'Пользователь' },
  },
  warehouse: {
    delegate: 'warehouse',
    scope: own,
    label: { uz: 'Ombor', ru: 'Склад' },
  },
} satisfies Record<string, RefModel>;

export type TenantRefModel = keyof typeof TENANT_REF_MODELS;
export type TenantOwnedRefs = Partial<Record<TenantRefModel, IdInput>>;

type FindManyClient = {
  findMany(args: {
    where: Record<string, unknown>;
    select: { id: true };
  }): Promise<Array<{ id: string }>>;
};

function collectIds(input: IdInput): string[] {
  const list = typeof input === 'string' || input == null ? [input] : input;
  return [
    ...new Set(
      list.filter(
        (id): id is string => typeof id === 'string' && id.length > 0,
      ),
    ),
  ];
}

export async function assertTenantOwned(
  db: object,
  tenantId: string,
  refs: TenantOwnedRefs,
): Promise<void> {
  if (!tenantId) {
    throw new BadRequestException('Tenant aniqlanmadi / Тенант не определён');
  }
  for (const [model, input] of Object.entries(refs) as Array<
    [TenantRefModel, IdInput]
  >) {
    const ids = collectIds(input);
    if (ids.length === 0) continue;
    const config: RefModel = TENANT_REF_MODELS[model];
    const delegate = (db as Record<string, FindManyClient | undefined>)[
      config.delegate
    ];
    if (!delegate) {
      throw new Error(
        `assertTenantOwned: client has no delegate "${config.delegate}"`,
      );
    }
    const found = await delegate.findMany({
      where: { AND: [{ id: { in: ids } }, config.scope(tenantId)] },
      select: { id: true },
    });
    const foundIds = new Set(found.map((row) => row.id));
    const missing = ids.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `${config.label.uz} topilmadi: ${missing.join(', ')} / ${config.label.ru} не найден(а): ${missing.join(', ')}`,
      );
    }
  }
}
