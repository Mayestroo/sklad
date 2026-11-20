import type { Prisma } from '@prisma/client';
import { catalogCostFromUzs } from '../inventory/products/catalog-cost';
import { readCompanySettings } from '../../common/utils/company-settings';
import {
  cardUnitCostUzs,
  computeRecipeCost,
  MAX_RECIPE_DEPTH,
} from '../../../../shared/production/costing';

/**
 * Catalog (estimated) costs — TZ "Ishlab chiqarish" 3.4, 4.3, 7, 8.3.
 *
 * - A purchased item's card cost follows its receipts: the last landed cost
 *   (ADR 0007, written by the receipt itself) or, when the company chose
 *   `production.estimatedCostMethod = 'AVERAGE'`, the quantity-weighted
 *   average landed cost of its remaining batches.
 * - A finished product's card cost is the "1 dona tannarxi" of its active
 *   recipe until it is produced (cost source RECIPE_ESTIMATE); after a
 *   completed production it is the actual FIFO unit cost (PRODUCTION_ACTUAL)
 *   and estimates no longer overwrite it.
 * - When a material's cost changes, the estimates of every recipe that uses it
 *   are recalculated, up through semi-finished products (3 levels).
 *
 * Every function takes the caller's client (a transaction when inside one).
 */
type Db = Pick<
  Prisma.TransactionClient,
  | 'product'
  | 'productionRecipe'
  | 'productBatch'
  | 'company'
  | 'productionDocument'
>;

export type EstimatedCostMethod = 'LAST' | 'AVERAGE';

export async function estimatedCostMethod(
  db: Pick<Prisma.TransactionClient, 'company'>,
  tenantId: string,
): Promise<EstimatedCostMethod> {
  const company = await db.company.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  return readCompanySettings(company?.settings).production
    ?.estimatedCostMethod === 'AVERAGE'
    ? 'AVERAGE'
    : 'LAST';
}

/** Weighted average landed cost (UZS per base unit) of the remaining batches. */
export async function averageBatchCostUzs(
  db: Pick<Prisma.TransactionClient, 'productBatch'>,
  tenantId: string,
  productId: string,
): Promise<number | null> {
  const batches = await db.productBatch.findMany({
    where: { tenantId, productId, remainingQty: { gt: 0 } },
    select: { remainingQty: true, landedCost: true },
  });
  let quantity = 0;
  let amount = 0;
  for (const batch of batches) {
    quantity += Number(batch.remainingQty);
    amount += Number(batch.remainingQty) * Number(batch.landedCost);
  }
  return quantity > 0 ? amount / quantity : null;
}

const recipeCostInclude = {
  items: {
    include: {
      product: {
        select: {
          costPrice: true,
          costPriceCurrency: true,
          costPriceExchangeRate: true,
        },
      },
    },
  },
} satisfies Prisma.ProductionRecipeInclude;

/** The estimate of a recipe: material cost of one norm and of one unit. */
export function recipeEstimate(recipe: {
  outputQuantity: Prisma.Decimal | number;
  items: Array<{
    quantity: Prisma.Decimal | number;
    unitFactor: Prisma.Decimal | number;
    lossPercent: Prisma.Decimal | number;
    product: {
      costPrice: Prisma.Decimal | number;
      costPriceCurrency: string | null;
      costPriceExchangeRate: Prisma.Decimal | number;
    } | null;
  }>;
}) {
  return computeRecipeCost(
    recipe.items.map((item) => {
      const card = cardUnitCostUzs(
        item.product
          ? {
              costPrice: Number(item.product.costPrice),
              costPriceCurrency: item.product.costPriceCurrency,
              costPriceExchangeRate: Number(item.product.costPriceExchangeRate),
            }
          : null,
      );
      return {
        quantity: Number(item.quantity),
        unitFactor: Number(item.unitFactor),
        lossPercent: Number(item.lossPercent),
        unitCost: card.unitCost,
        hasPrice: card.hasPrice,
      };
    }),
    Number(recipe.outputQuantity),
  );
}

/**
 * Writes the recipe estimate on a finished product's card (unless it already
 * carries an actual production cost). Returns whether the card changed.
 */
export async function applyRecipeEstimate(
  db: Db,
  tenantId: string,
  productId: string,
): Promise<boolean> {
  const product = await db.product.findFirst({
    where: { id: productId, tenantId },
    select: {
      id: true,
      type: true,
      costPrice: true,
      costPriceCurrency: true,
      costSource: true,
    },
  });
  if (!product || product.type !== 'FINISHED_PRODUCT') return false;
  if (product.costSource === 'PRODUCTION_ACTUAL') return false;

  // TZ 3.4: with several recipes, the active one (the latest active edit).
  const recipe = await db.productionRecipe.findFirst({
    where: { tenantId, productId, isActive: true, isArchived: false },
    include: recipeCostInclude,
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
  });
  const costPrice = recipe ? (recipeEstimate(recipe).perUnit ?? 0) : 0;
  const costSource = recipe ? 'RECIPE_ESTIMATE' : 'MANUAL';
  if (
    Math.abs(Number(product.costPrice) - costPrice) < 0.005 &&
    product.costPriceCurrency === 'UZS' &&
    product.costSource === costSource
  ) {
    return false;
  }
  await db.product.update({
    where: { tenantId, id: productId },
    data: {
      costPrice,
      costPriceCurrency: 'UZS',
      costPriceExchangeRate: 1,
      costSource,
    },
  });
  return true;
}

/**
 * After the cost of `changedProductIds` changed: apply the average method to
 * purchased items (when chosen) and recalculate the estimates of the recipes
 * that use them, level by level (semi-finished products feed other recipes).
 */
export async function refreshEstimatedCosts(
  db: Db,
  tenantId: string,
  changedProductIds: string[],
  options: { applyAverage?: boolean } = {},
): Promise<void> {
  // Unit-test doubles of the transaction client may not model production.
  if (!db.productionRecipe?.findMany || !db.product?.findFirst) return;
  const ids = [...new Set(changedProductIds)].filter(Boolean);
  if (ids.length === 0) return;

  if (
    options.applyAverage &&
    (await estimatedCostMethod(db, tenantId)) === 'AVERAGE'
  ) {
    for (const productId of ids) {
      const card = await db.product.findFirst({
        where: { id: productId, tenantId },
        select: {
          type: true,
          costPriceCurrency: true,
          costPriceExchangeRate: true,
        },
      });
      if (!card || card.type === 'FINISHED_PRODUCT' || card.type === 'SERVICE')
        continue;
      const average = await averageBatchCostUzs(db, tenantId, productId);
      if (average === null) continue;
      await db.product.update({
        where: { tenantId, id: productId },
        data: catalogCostFromUzs(average, card),
      });
    }
  }

  let frontier = ids;
  const seen = new Set<string>();
  for (
    let level = 0;
    level <= MAX_RECIPE_DEPTH && frontier.length > 0;
    level++
  ) {
    const recipes = await db.productionRecipe.findMany({
      where: {
        tenantId,
        isActive: true,
        isArchived: false,
        items: { some: { productId: { in: frontier } } },
      },
      select: { productId: true },
    });
    const next: string[] = [];
    for (const productId of new Set(recipes.map((r) => r.productId))) {
      if (seen.has(productId)) continue;
      seen.add(productId);
      if (await applyRecipeEstimate(db, tenantId, productId))
        next.push(productId);
    }
    frontier = next;
  }
}

/**
 * The card cost of a finished product after its production changed
 * (completed or cancelled): the unit cost of its latest completed document,
 * or the recipe estimate when none is left.
 */
export async function restoreFinishedProductCost(
  db: Db,
  tenantId: string,
  productId: string,
): Promise<void> {
  const latest = await db.productionDocument.findFirst({
    where: { tenantId, productId, status: 'COMPLETED' },
    orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
    select: { unitCost: true },
  });
  if (latest) {
    await db.product.update({
      where: { tenantId, id: productId },
      data: {
        costPrice: Number(latest.unitCost),
        costPriceCurrency: 'UZS',
        costPriceExchangeRate: 1,
        costSource: 'PRODUCTION_ACTUAL',
      },
    });
  } else {
    await db.product.update({
      where: { tenantId, id: productId },
      data: { costSource: 'MANUAL' },
    });
    await applyRecipeEstimate(db, tenantId, productId);
  }
  await refreshEstimatedCosts(db, tenantId, [productId]);
}
