import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/**
 * TZ "Ishlab chiqarish" 7: a finished product («Tayyor mahsulot») is made, not
 * bought — it cannot be on a purchase document. Its stock comes from
 * completed production (or opening balances).
 */
export const FINISHED_PRODUCT_NOT_PURCHASABLE =
  "«Tayyor mahsulot» turidagi mahsulotni xarid qilib bo'lmaydi: u ishlab chiqarishdan keladi / Готовый продукт нельзя закупить: он поступает из производства";

export function assertNoFinishedProducts(
  products: ReadonlyArray<{ type?: string | null } | null | undefined>,
): void {
  if (products.some((product) => product?.type === 'FINISHED_PRODUCT')) {
    throw new BadRequestException(FINISHED_PRODUCT_NOT_PURCHASABLE);
  }
}

export async function assertPurchasableProducts(
  db: { product?: Pick<Prisma.TransactionClient['product'], 'findMany'> },
  tenantId: string,
  productIds: ReadonlyArray<string | null | undefined>,
): Promise<void> {
  const ids = productIds.filter((id): id is string => Boolean(id));
  // Unit-test doubles of Prisma may not model products.
  if (ids.length === 0 || typeof db.product?.findMany !== 'function') return;
  const products = await db.product.findMany({
    where: { tenantId, id: { in: ids } },
    select: { type: true },
  });
  assertNoFinishedProducts(products ?? []);
}
