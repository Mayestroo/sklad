import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ManufacturingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma';
import { AuditService } from '../audit/audit.service';
import { JournalService } from '../accounting/journal/journal.service';
import { nextDocumentNumber } from '../../common/sequences/document-sequence';
import type { AppLocale } from '../../common/decorators/current-locale.decorator';
import { formatQuantity } from '../../../../shared/format/money';
import { allocateFifoCost, FifoBatchInput } from './production-calculations';
import {
  cardUnitCostUzs,
  checkRecipeGraph,
  computeProductionCost,
  isValidLossPercent,
  plannedMaterialQuantity,
  resolveUnitFactor,
  roundMoney,
  roundQuantity,
  roundUnitCost,
} from '../../../../shared/production/costing';
import {
  CreateProductionRecipeDto,
  FilterProductionRecipesDto,
} from './dto/create-production-recipe.dto';
import {
  CancelProductionDocumentDto,
  CompleteProductionDocumentDto,
  CreateProductionDocumentDto,
  FilterProductionDocumentsDto,
  ProductionExtraCostDto,
  UpdateActualMaterialsDto,
  UpdateProductionDocumentDto,
} from './dto/create-production-document.dto';
import {
  consumeFifoBatches,
  createFifoBatch,
} from '../inventory/fifo/fifo-batches';
import { assertPeriodOpen } from '../../common/accounting-period/period-lock';
import {
  applyRecipeEstimate,
  recipeEstimate,
  refreshEstimatedCosts,
  restoreFinishedProductCost,
} from './estimated-cost';

const userSelect = { select: { id: true, firstName: true, lastName: true } };

const recipeInclude = {
  product: { include: { units: true } },
  createdBy: userSelect,
  items: {
    include: { product: { include: { units: true } } },
    orderBy: { id: 'asc' },
  },
  _count: { select: { documents: true } },
} satisfies Prisma.ProductionRecipeInclude;

const documentInclude = {
  product: true,
  recipe: true,
  warehouse: true,
  outputWarehouse: true,
  responsible: userSelect,
  createdBy: userSelect,
  extraCosts: { orderBy: { id: 'asc' } },
  materials: {
    include: {
      product: true,
      batchConsumptions: {
        include: { batch: true },
        orderBy: { createdAt: 'asc' },
      },
      movements: {
        include: { batch: true, createdBy: userSelect },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { id: 'asc' },
  },
  outputBatch: true,
} satisfies Prisma.ProductionDocumentInclude;

/** Lighter include for the list. */
const documentListInclude = {
  product: true,
  warehouse: true,
  outputWarehouse: true,
  responsible: userSelect,
} satisfies Prisma.ProductionDocumentInclude;

type ProductionTransaction = Prisma.TransactionClient;
type RecipeWithItems = Prisma.ProductionRecipeGetPayload<{
  include: typeof recipeInclude;
}>;

const OPEN_STATUSES: ManufacturingStatus[] = [
  ManufacturingStatus.DRAFT,
  ManufacturingStatus.PLANNED,
];
const RUNNING_STATUSES: ManufacturingStatus[] = [
  ManufacturingStatus.IN_PROGRESS,
  ManufacturingStatus.READY,
];

const tr = (locale: AppLocale, uz: string, ru: string) =>
  locale === 'ru' ? ru : uz;

function localName(
  value: Prisma.JsonValue | null | undefined,
  locale: AppLocale,
) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const record = value as Record<string, unknown>;
  const text = [record[locale], record.uz, record.ru].find(
    (v): v is string => typeof v === 'string',
  );
  return text ?? '';
}

const UNIT_TEXT: Record<string, { uz: string; ru: string }> = {
  piece: { uz: 'dona', ru: 'шт' },
  kg: { uz: 'kg', ru: 'кг' },
  liter: { uz: 'litr', ru: 'л' },
  meter: { uz: 'metr', ru: 'м' },
  box: { uz: 'quti', ru: 'кор' },
  pack: { uz: "to'plam", ru: 'упак' },
};
const unitText = (unit: string | null | undefined, locale: AppLocale) =>
  (unit && UNIT_TEXT[unit]?.[locale]) ?? unit ?? '';

@Injectable()
export class ProductionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly journalService: JournalService,
  ) {}

  // ==========================================================================
  // Catalog lists for the recipe and document forms (TZ 9.1)
  // ==========================================================================

  /**
   * Materials a recipe may use: raw materials and semi-finished products,
   * with units, card cost (UZS per base unit) and stock.
   */
  async findMaterials(tenantId: string) {
    const products = await this.prisma.product.findMany({
      where: {
        tenantId,
        isActive: true,
        OR: [
          { type: 'RAW_MATERIAL' },
          { type: 'FINISHED_PRODUCT', isSemiFinished: true },
        ],
      },
      include: { units: true, stockLevels: true },
      orderBy: { createdAt: 'desc' },
    });
    return products.map((product) => {
      const card = cardUnitCostUzs({
        costPrice: Number(product.costPrice),
        costPriceCurrency: product.costPriceCurrency,
        costPriceExchangeRate: Number(product.costPriceExchangeRate),
      });
      return {
        product_id: product.id,
        id: product.id,
        name: product.name,
        sku: product.sku,
        type: product.type,
        isSemiFinished: product.isSemiFinished,
        unit_id: product.unitOfMeasure,
        unit_name: product.unitOfMeasure,
        unitOfMeasure: product.unitOfMeasure,
        conversion_factor: product.units.map((unit) => ({
          unit: unit.name,
          factor: Number(unit.factor),
        })),
        units: product.units.map((unit) => ({
          id: unit.id,
          name: unit.name,
          factor: Number(unit.factor),
        })),
        unit_cost: card.unitCost,
        unitCost: card.unitCost,
        hasPrice: card.hasPrice,
        costPrice: product.costPrice,
        costPriceCurrency: product.costPriceCurrency,
        costPriceExchangeRate: product.costPriceExchangeRate,
        costSource: product.costSource,
        stock_qty: product.stockLevels.reduce(
          (sum, level) => sum + Number(level.quantity),
          0,
        ),
      };
    });
  }

  /** Products a recipe can make: only type FINISHED_PRODUCT (TZ 9.1). */
  async findFinishedProducts(tenantId: string) {
    const products = await this.prisma.product.findMany({
      where: { tenantId, isActive: true, type: 'FINISHED_PRODUCT' },
      include: { units: true, stockLevels: true },
      orderBy: { createdAt: 'desc' },
    });
    return products.map((product) => ({
      ...product,
      totalStock: product.stockLevels.reduce(
        (sum, level) => sum + Number(level.quantity),
        0,
      ),
    }));
  }

  // ==========================================================================
  // Recipes (TZ 4)
  // ==========================================================================

  async findRecipes(
    tenantId: string,
    filters: FilterProductionRecipesDto = {},
    locale: AppLocale = 'uz',
  ) {
    const status = filters.status ?? 'all';
    const where: Prisma.ProductionRecipeWhereInput = { tenantId };
    if (status === 'archived') where.isArchived = true;
    else {
      where.isArchived = false;
      if (status === 'active') where.isActive = true;
      if (status === 'inactive') where.isActive = false;
    }
    if (filters.productId) where.productId = filters.productId;

    const recipes = await this.prisma.productionRecipe.findMany({
      where,
      include: recipeInclude,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
    const search = filters.search?.trim().toLowerCase();
    return recipes
      .map((recipe) => this.withEstimate(recipe))
      .filter((recipe) => {
        if (filters.uncosted === 'true' && !recipe.estimate.missingPrice) {
          return false;
        }
        if (!search) return true;
        const name = recipe.product.name as Record<string, string> | null;
        return [
          localName(recipe.product.name, locale),
          name?.uz ?? '',
          name?.ru ?? '',
          recipe.product.sku,
        ].some((value) => value.toLowerCase().includes(search));
      });
  }

  async findRecipe(tenantId: string, id: string, locale: AppLocale = 'uz') {
    const recipe = await this.prisma.productionRecipe.findFirst({
      where: { id, tenantId },
      include: recipeInclude,
    });
    if (!recipe) {
      throw new NotFoundException(
        tr(locale, 'Retseptura topilmadi', 'Рецептура не найдена'),
      );
    }
    return this.withEstimate(recipe);
  }

  private withEstimate(recipe: RecipeWithItems) {
    const estimate = recipeEstimate(recipe);
    return {
      ...recipe,
      usedInDocuments: recipe._count.documents,
      estimate: {
        normTotal: estimate.normTotal,
        perUnit: estimate.perUnit,
        missingPrice: estimate.missingPrice,
        lines: estimate.lines,
      },
    };
  }

  /**
   * Checks a recipe and returns its lines as stored (TZ 4.1, 4.2, 4.6):
   * a finished product, raw materials or semi-finished products only, a
   * known unit per line, loss 0–99.99 %, no duplicates, no cycle, ≤ 3 levels.
   */
  private async validateRecipe(
    db: ProductionTransaction | PrismaService,
    tenantId: string,
    dto: CreateProductionRecipeDto,
    locale: AppLocale,
    current?: { id: string; productId: string; itemProductIds: string[] },
  ) {
    const productIds = dto.materials.map((material) => material.productId);
    if (new Set(productIds).size !== productIds.length) {
      throw new BadRequestException(
        tr(
          locale,
          'Retsepturada bir xil xomashyo takrorlanmasligi kerak',
          'Одно и то же сырьё не должно повторяться в рецептуре',
        ),
      );
    }
    if (productIds.includes(dto.productId)) {
      throw new BadRequestException(
        tr(
          locale,
          'Mahsulot o‘z retsepturasida xomashyo bo‘la olmaydi',
          'Продукт не может быть сырьём своей же рецептуры',
        ),
      );
    }

    const [product, materials] = await Promise.all([
      db.product.findFirst({ where: { id: dto.productId, tenantId } }),
      db.product.findMany({
        where: { tenantId, id: { in: productIds } },
        include: { units: true },
      }),
    ]);
    if (!product) {
      throw new NotFoundException(
        tr(locale, 'Tayyor mahsulot topilmadi', 'Готовый продукт не найден'),
      );
    }
    // A Tovar that already had a recipe before "Tayyor mahsulot" existed
    // keeps working; new recipes need a finished product.
    const legacyProduct =
      product.type === 'PRODUCT' && current?.productId === product.id;
    if (product.type !== 'FINISHED_PRODUCT' && !legacyProduct) {
      throw new BadRequestException(
        tr(
          locale,
          'Retseptura faqat «Tayyor mahsulot» turidagi mahsulot uchun yaratiladi',
          'Рецептура создаётся только для номенклатуры типа «Готовый продукт»',
        ),
      );
    }
    if (materials.length !== productIds.length) {
      throw new BadRequestException(
        tr(
          locale,
          'Retseptura tarkibidagi xomashyo topilmadi',
          'Сырьё из рецептуры не найдено',
        ),
      );
    }

    const lines = dto.materials.map((input) => {
      const material = materials.find((item) => item.id === input.productId)!;
      const name = localName(material.name, locale);
      const allowed =
        material.type === 'RAW_MATERIAL' ||
        (material.type === 'FINISHED_PRODUCT' && material.isSemiFinished) ||
        current?.itemProductIds.includes(material.id);
      if (!allowed) {
        throw new BadRequestException(
          tr(
            locale,
            `«${name}» xomashyo yoki yarim tayyor mahsulot emas`,
            `«${name}» не является сырьём или полуфабрикатом`,
          ),
        );
      }
      if (!material.unitOfMeasure) {
        throw new BadRequestException(
          tr(
            locale,
            'Xomashyo uchun o‘lchov birligi ko‘rsatilmagan',
            'Для сырья не указана единица измерения',
          ),
        );
      }
      const unit =
        input.unit && input.unit !== material.unitOfMeasure ? input.unit : null;
      const factor = resolveUnitFactor(
        material.unitOfMeasure,
        unit,
        material.units.map((u) => ({ name: u.name, factor: Number(u.factor) })),
      );
      if (factor === null) {
        throw new BadRequestException(
          tr(
            locale,
            `«${name}» uchun «${input.unit}» o‘lchov birligi topilmadi`,
            `Для «${name}» не найдена единица измерения «${input.unit}»`,
          ),
        );
      }
      const lossPercent = Number(input.lossPercent ?? 0);
      if (!isValidLossPercent(lossPercent)) {
        throw new BadRequestException(
          tr(
            locale,
            'Yo‘qotish foizi 0 dan 99,99 gacha bo‘lishi kerak',
            'Процент потерь должен быть от 0 до 99,99',
          ),
        );
      }
      return {
        productId: material.id,
        quantity: input.quantity,
        unit,
        unitFactor: Number(factor.toFixed(12)),
        lossPercent,
      };
    });

    // TZ 4.6: no cycles, at most three nested levels.
    const others = await db.productionRecipe.findMany({
      where: {
        tenantId,
        isArchived: false,
        ...(current ? { id: { not: current.id } } : {}),
      },
      select: { productId: true, items: { select: { productId: true } } },
    });
    const problem = checkRecipeGraph(
      others.map((recipe) => ({
        productId: recipe.productId,
        materialIds: recipe.items.map((item) => item.productId),
      })),
      { productId: dto.productId, materialIds: productIds },
    );
    if (problem && 'cycle' in problem) {
      const names = await db.product.findMany({
        where: { tenantId, id: { in: problem.cycle } },
        select: { id: true, name: true },
      });
      const chain = problem.cycle
        .map((id) => localName(names.find((n) => n.id === id)?.name, locale))
        .join(' → ');
      throw new BadRequestException(
        tr(
          locale,
          `Retseptura o‘ziga qaytib bog‘lanyapti: ${chain}`,
          `Рецептура ссылается сама на себя: ${chain}`,
        ),
      );
    }
    if (problem && 'depth' in problem) {
      throw new BadRequestException(
        tr(
          locale,
          `Ichma-ich retseptura 3 darajadan oshmasligi kerak (hozir ${problem.depth})`,
          `Вложенность рецептур не должна превышать 3 уровня (сейчас ${problem.depth})`,
        ),
      );
    }
    return lines;
  }

  async createRecipe(
    tenantId: string,
    userId: string,
    dto: CreateProductionRecipeDto,
    locale: AppLocale = 'uz',
  ) {
    const recipe = await this.prisma.$transaction(async (tx) => {
      const lines = await this.validateRecipe(tx, tenantId, dto, locale);
      const created = await tx.productionRecipe.create({
        data: {
          tenantId,
          productId: dto.productId,
          outputQuantity: dto.outputQuantity,
          note: dto.note?.trim() || null,
          isActive: dto.isActive ?? true,
          createdById: userId,
          items: { create: lines },
        },
      });
      await applyRecipeEstimate(tx, tenantId, dto.productId);
      await refreshEstimatedCosts(tx, tenantId, [dto.productId]);
      return created;
    });
    await this.auditService.logAction({
      tenantId,
      userId,
      entityType: 'ProductionRecipe',
      entityId: recipe.id,
      action: 'CREATE',
      newValue: {
        productId: dto.productId,
        outputQuantity: dto.outputQuantity,
        materials: dto.materials,
      },
    });
    return this.findRecipe(tenantId, recipe.id, locale);
  }

  /**
   * Editing changes the recipe in place: documents keep their own copy of the
   * materials (made when they were created), so past documents never change.
   */
  async updateRecipe(
    tenantId: string,
    userId: string,
    recipeId: string,
    dto: CreateProductionRecipeDto,
    locale: AppLocale = 'uz',
  ) {
    const current = await this.prisma.productionRecipe.findFirst({
      where: { id: recipeId, tenantId },
      include: { items: true },
    });
    if (!current) {
      throw new NotFoundException(
        tr(locale, 'Retseptura topilmadi', 'Рецептура не найдена'),
      );
    }
    if (current.isArchived) {
      throw new BadRequestException(
        tr(
          locale,
          'Arxivdagi retsepturani tahrirlab bo‘lmaydi',
          'Архивную рецептуру редактировать нельзя',
        ),
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const lines = await this.validateRecipe(tx, tenantId, dto, locale, {
        id: current.id,
        productId: current.productId,
        itemProductIds: current.items.map((item) => item.productId),
      });
      await tx.productionRecipeItem.deleteMany({
        where: { recipe: { tenantId }, recipeId: current.id },
      });
      await tx.productionRecipe.update({
        where: { tenantId, id: current.id },
        data: {
          productId: dto.productId,
          outputQuantity: dto.outputQuantity,
          note: dto.note?.trim() || null,
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          items: { create: lines },
        },
      });
      for (const productId of new Set([current.productId, dto.productId])) {
        await applyRecipeEstimate(tx, tenantId, productId);
        await refreshEstimatedCosts(tx, tenantId, [productId]);
      }
    });

    await this.auditService.logAction({
      tenantId,
      userId,
      entityType: 'ProductionRecipe',
      entityId: current.id,
      action: 'UPDATE',
      oldValue: {
        productId: current.productId,
        outputQuantity: Number(current.outputQuantity),
        materials: current.items.map((item) => ({
          productId: item.productId,
          quantity: Number(item.quantity),
          unit: item.unit,
          lossPercent: Number(item.lossPercent),
        })),
      },
      newValue: {
        productId: dto.productId,
        outputQuantity: dto.outputQuantity,
        materials: dto.materials,
      },
    });
    return this.findRecipe(tenantId, current.id, locale);
  }

  /** "Nusxa olish": an inactive copy to edit (so it does not change the estimate yet). */
  async copyRecipe(
    tenantId: string,
    userId: string,
    recipeId: string,
    locale: AppLocale = 'uz',
  ) {
    const source = await this.prisma.productionRecipe.findFirst({
      where: { id: recipeId, tenantId },
      include: { items: true },
    });
    if (!source) {
      throw new NotFoundException(
        tr(locale, 'Retseptura topilmadi', 'Рецептура не найдена'),
      );
    }
    const copy = await this.prisma.productionRecipe.create({
      data: {
        tenantId,
        productId: source.productId,
        outputQuantity: source.outputQuantity,
        note: source.note,
        isActive: false,
        createdById: userId,
        items: {
          create: source.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unit: item.unit,
            unitFactor: item.unitFactor,
            lossPercent: item.lossPercent,
          })),
        },
      },
    });
    await this.auditService.logAction({
      tenantId,
      userId,
      entityType: 'ProductionRecipe',
      entityId: copy.id,
      action: 'CREATE',
      newValue: { copiedFrom: source.id },
    });
    return this.findRecipe(tenantId, copy.id, locale);
  }

  async setRecipeActive(
    tenantId: string,
    userId: string,
    recipeId: string,
    isActive: boolean,
    locale: AppLocale = 'uz',
  ) {
    const recipe = await this.prisma.productionRecipe.findFirst({
      where: { id: recipeId, tenantId },
    });
    if (!recipe) {
      throw new NotFoundException(
        tr(locale, 'Retseptura topilmadi', 'Рецептура не найдена'),
      );
    }
    if (recipe.isArchived) {
      throw new BadRequestException(
        tr(
          locale,
          'Arxivdagi retseptura holatini o‘zgartirib bo‘lmaydi',
          'Нельзя менять статус архивной рецептуры',
        ),
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.productionRecipe.update({
        where: { tenantId, id: recipeId },
        data: { isActive },
      });
      await applyRecipeEstimate(tx, tenantId, recipe.productId);
      await refreshEstimatedCosts(tx, tenantId, [recipe.productId]);
    });
    await this.auditService.logAction({
      tenantId,
      userId,
      entityType: 'ProductionRecipe',
      entityId: recipeId,
      action: 'UPDATE',
      oldValue: { isActive: recipe.isActive },
      newValue: { isActive },
    });
    return this.findRecipe(tenantId, recipeId, locale);
  }

  /** A recipe used by documents is never deleted, only archived (TZ 4.5). */
  async archiveRecipe(
    tenantId: string,
    userId: string,
    recipeId: string,
    locale: AppLocale = 'uz',
  ) {
    const recipe = await this.prisma.productionRecipe.findFirst({
      where: { id: recipeId, tenantId },
    });
    if (!recipe) {
      throw new NotFoundException(
        tr(locale, 'Retseptura topilmadi', 'Рецептура не найдена'),
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.productionRecipe.update({
        where: { tenantId, id: recipeId },
        data: { isArchived: true, isActive: false },
      });
      await applyRecipeEstimate(tx, tenantId, recipe.productId);
      await refreshEstimatedCosts(tx, tenantId, [recipe.productId]);
    });
    await this.auditService.logAction({
      tenantId,
      userId,
      entityType: 'ProductionRecipe',
      entityId: recipeId,
      action: 'UPDATE',
      oldValue: { isArchived: recipe.isArchived, isActive: recipe.isActive },
      newValue: { isArchived: true, isActive: false },
    });
    return this.findRecipe(tenantId, recipeId, locale);
  }

  async deleteRecipe(
    tenantId: string,
    userId: string,
    recipeId: string,
    locale: AppLocale = 'uz',
  ) {
    const recipe = await this.prisma.productionRecipe.findFirst({
      where: { id: recipeId, tenantId },
      include: { _count: { select: { documents: true } } },
    });
    if (!recipe) {
      throw new NotFoundException(
        tr(locale, 'Retseptura topilmadi', 'Рецептура не найдена'),
      );
    }
    if (recipe._count.documents > 0) {
      throw new BadRequestException(
        tr(
          locale,
          'Hujjatda ishlatilgan retseptura o‘chirilmaydi, uni faqat arxivga olish mumkin',
          'Рецептуру, использованную в документах, удалить нельзя — её можно только архивировать',
        ),
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.productionRecipe.delete({ where: { tenantId, id: recipeId } });
      await applyRecipeEstimate(tx, tenantId, recipe.productId);
      await refreshEstimatedCosts(tx, tenantId, [recipe.productId]);
    });
    await this.auditService.logAction({
      tenantId,
      userId,
      entityType: 'ProductionRecipe',
      entityId: recipeId,
      action: 'DELETE',
      oldValue: { productId: recipe.productId },
    });
    return { success: true };
  }

  // ==========================================================================
  // Production documents (TZ 5)
  // ==========================================================================

  async preview(
    tenantId: string,
    recipeId: string,
    outputQuantity: number,
    warehouseId: string,
    locale: AppLocale = 'uz',
    db: ProductionTransaction | PrismaService = this.prisma,
  ) {
    const recipe = await db.productionRecipe.findFirst({
      where: { id: recipeId, tenantId },
      include: { items: { include: { product: true } }, product: true },
    });
    if (!recipe) {
      throw new NotFoundException(
        tr(locale, 'Retseptura topilmadi', 'Рецептура не найдена'),
      );
    }
    if (!recipe.isActive || recipe.isArchived) {
      throw new BadRequestException(
        tr(
          locale,
          'Hujjat uchun faol retsepturani tanlang',
          'Выберите активную рецептуру для документа',
        ),
      );
    }
    await this.requireWarehouse(db, tenantId, warehouseId, locale);

    const materials = [];
    for (const item of recipe.items) {
      const plannedQuantity = plannedMaterialQuantity(
        {
          quantity: Number(item.quantity),
          unitFactor: Number(item.unitFactor),
          lossPercent: Number(item.lossPercent),
        },
        outputQuantity,
        Number(recipe.outputQuantity),
      );
      const [stock, batches] = await Promise.all([
        db.stockLevel.findUnique({
          where: {
            tenantId_warehouseId_productId: {
              tenantId,
              warehouseId,
              productId: item.productId,
            },
          },
        }),
        db.productBatch.findMany({
          where: {
            tenantId,
            warehouseId,
            productId: item.productId,
            remainingQty: { gt: 0 },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        }),
      ]);
      const physicalQuantity = Number(stock?.quantity ?? 0);
      const reservedQuantity = Number(stock?.reservedQuantity ?? 0);
      const freeQuantity = Math.max(0, physicalQuantity - reservedQuantity);
      const batchQuantity = batches.reduce(
        (sum, batch) => sum + Number(batch.remainingQty),
        0,
      );
      // FIFO estimate for what the batches cover; the card cost for the rest.
      const costable = Math.min(plannedQuantity, batchQuantity);
      const fifo =
        costable > 0
          ? allocateFifoCost(costable, toFifoBatchInputs(batches))
          : { totalCost: 0, unitCost: 0 };
      const card = cardUnitCostUzs({
        costPrice: Number(item.product.costPrice),
        costPriceCurrency: item.product.costPriceCurrency,
        costPriceExchangeRate: Number(item.product.costPriceExchangeRate),
      });
      const estimatedTotalCost = roundMoney(
        fifo.totalCost + (plannedQuantity - costable) * card.unitCost,
      );
      materials.push({
        productId: item.productId,
        product: item.product,
        plannedQuantity,
        recipeQuantity: Number(item.quantity),
        unit: item.unit,
        lossPercent: Number(item.lossPercent),
        physicalQuantity,
        freeQuantity,
        shortage: roundQuantity(Math.max(0, plannedQuantity - freeQuantity)),
        estimatedUnitCost:
          plannedQuantity > 0
            ? roundUnitCost(estimatedTotalCost / plannedQuantity)
            : 0,
        estimatedTotalCost,
        hasPrice: batchQuantity > 0 || card.hasPrice,
      });
    }

    return {
      recipe,
      outputQuantity,
      plannedMaterialCost: roundMoney(
        materials.reduce((sum, line) => sum + line.estimatedTotalCost, 0),
      ),
      materials,
    };
  }

  private assertDates(
    start: Date | null | undefined,
    end: Date | null | undefined,
    locale: AppLocale,
  ) {
    if (start && end && end.getTime() < start.getTime()) {
      throw new BadRequestException(
        tr(
          locale,
          'Tugash sanasi boshlanish sanasidan oldin bo‘lishi mumkin emas',
          'Дата окончания не может быть раньше даты начала',
        ),
      );
    }
  }

  private extraCostRows(costs: ProductionExtraCostDto[] | undefined) {
    return (costs ?? []).map((cost) => ({
      costType: cost.costType,
      amount: roundMoney(Number(cost.amount)),
      comment: cost.comment?.trim() || null,
    }));
  }

  async createDocument(
    tenantId: string,
    userId: string,
    dto: CreateProductionDocumentDto,
    locale: AppLocale = 'uz',
  ) {
    const preview = await this.preview(
      tenantId,
      dto.recipeId,
      dto.plannedQuantity,
      dto.warehouseId,
      locale,
    );
    if (dto.outputWarehouseId) {
      await this.requireWarehouse(
        this.prisma,
        tenantId,
        dto.outputWarehouseId,
        locale,
      );
    }
    if (dto.responsibleId) {
      await this.requireTenantUser(tenantId, dto.responsibleId, locale);
    }
    const plannedStartDate = dto.plannedStartDate
      ? new Date(dto.plannedStartDate)
      : null;
    const plannedEndDate = dto.plannedEndDate
      ? new Date(dto.plannedEndDate)
      : null;
    this.assertDates(plannedStartDate, plannedEndDate, locale);
    const extraCosts = this.extraCostRows(dto.extraCosts);
    const extraCost = roundMoney(
      extraCosts.reduce((sum, c) => sum + c.amount, 0),
    );

    const document = await this.prisma.$transaction(async (tx) => {
      const docNumber = await nextDocumentNumber(tx, tenantId, 'PRODUCTION');
      return tx.productionDocument.create({
        data: {
          tenantId,
          docNumber,
          docDate: dto.docDate ? new Date(dto.docDate) : new Date(),
          productId: preview.recipe.productId,
          productUnit: preview.recipe.product.unitOfMeasure,
          recipeId: dto.recipeId,
          warehouseId: dto.warehouseId,
          outputWarehouseId: dto.outputWarehouseId || null,
          responsibleId: dto.responsibleId || null,
          plannedQuantity: dto.plannedQuantity,
          plannedMaterialCost: preview.plannedMaterialCost,
          extraCost,
          totalCost: roundMoney(preview.plannedMaterialCost + extraCost),
          plannedStartDate,
          plannedEndDate,
          note: dto.note?.trim() || null,
          createdById: userId,
          materials: {
            create: preview.materials.map((material) => ({
              productId: material.productId,
              plannedQuantity: material.plannedQuantity,
              unitOfMeasure: material.product.unitOfMeasure,
              lossPercent: material.lossPercent,
            })),
          },
          extraCosts: { create: extraCosts },
        },
      });
    });

    await this.auditService.logAction({
      tenantId,
      userId,
      entityType: 'ProductionDocument',
      entityId: document.id,
      action: 'CREATE',
      newValue: {
        docNumber: document.docNumber,
        plannedQuantity: dto.plannedQuantity,
        productId: document.productId,
        warehouseId: dto.warehouseId,
        outputWarehouseId: dto.outputWarehouseId ?? null,
        extraCost,
      },
    });

    const full = await this.findDocument(tenantId, document.id, locale);
    return {
      ...full,
      stockWarnings: preview.materials
        .filter((material) => material.shortage > 0)
        .map((material) => ({
          productId: material.productId,
          product: material.product,
          requiredQuantity: material.plannedQuantity,
          availableQuantity: material.freeQuantity,
          shortage: material.shortage,
        })),
    };
  }

  async updateDocument(
    tenantId: string,
    userId: string,
    id: string,
    dto: UpdateProductionDocumentDto,
    locale: AppLocale = 'uz',
  ) {
    const document = await this.prisma.productionDocument.findFirst({
      where: { id, tenantId },
      include: { extraCosts: true },
    });
    if (!document) throw this.documentNotFound(locale);
    const isOpen = OPEN_STATUSES.includes(document.status);
    const isRunning = RUNNING_STATUSES.includes(document.status);
    if (!isOpen && !isRunning) {
      throw new BadRequestException(
        tr(
          locale,
          'Yakunlangan yoki bekor qilingan hujjatni tahrirlab bo‘lmaydi, faqat bekor qilish (storno) mumkin',
          'Завершённый или отменённый документ редактировать нельзя, возможна только отмена (сторно)',
        ),
      );
    }
    const changesPlan =
      (dto.recipeId !== undefined && dto.recipeId !== document.recipeId) ||
      (dto.plannedQuantity !== undefined &&
        Number(dto.plannedQuantity) !== Number(document.plannedQuantity)) ||
      (dto.warehouseId !== undefined &&
        dto.warehouseId !== document.warehouseId) ||
      (dto.docDate !== undefined &&
        new Date(dto.docDate).getTime() !== document.docDate.getTime()) ||
      (dto.outputWarehouseId !== undefined &&
        (dto.outputWarehouseId || null) !== document.outputWarehouseId);
    if (isRunning && changesPlan) {
      throw new BadRequestException(
        tr(
          locale,
          'Jarayondagi hujjatda retseptura, miqdor, sana va omborni o‘zgartirib bo‘lmaydi',
          'В документе в работе нельзя менять рецептуру, количество, дату и склады',
        ),
      );
    }

    const recipeId = dto.recipeId ?? document.recipeId;
    const plannedQuantity = Number(
      dto.plannedQuantity ?? document.plannedQuantity,
    );
    const warehouseId = dto.warehouseId ?? document.warehouseId;
    const outputWarehouseId =
      dto.outputWarehouseId === undefined
        ? document.outputWarehouseId
        : dto.outputWarehouseId || null;
    if (outputWarehouseId && outputWarehouseId !== document.outputWarehouseId) {
      await this.requireWarehouse(
        this.prisma,
        tenantId,
        outputWarehouseId,
        locale,
      );
    }
    if (dto.responsibleId) {
      await this.requireTenantUser(tenantId, dto.responsibleId, locale);
    }
    const plannedStartDate =
      dto.plannedStartDate === undefined
        ? document.plannedStartDate
        : dto.plannedStartDate
          ? new Date(dto.plannedStartDate)
          : null;
    const plannedEndDate =
      dto.plannedEndDate === undefined
        ? document.plannedEndDate
        : dto.plannedEndDate
          ? new Date(dto.plannedEndDate)
          : null;
    this.assertDates(plannedStartDate, plannedEndDate, locale);

    const extraCosts =
      dto.extraCosts === undefined ? null : this.extraCostRows(dto.extraCosts);
    const extraCost =
      extraCosts === null
        ? Number(document.extraCost)
        : roundMoney(extraCosts.reduce((sum, c) => sum + c.amount, 0));

    const preview = changesPlan
      ? await this.preview(
          tenantId,
          recipeId,
          plannedQuantity,
          warehouseId,
          locale,
        )
      : null;

    await this.prisma.$transaction(async (tx) => {
      // Guard against a concurrent start/complete.
      const claimed = await tx.productionDocument.updateMany({
        where: { id, tenantId, status: document.status },
        data: { updatedAt: new Date() },
      });
      if (claimed.count !== 1) throw this.statusChanged(locale);

      if (preview) {
        await tx.productionMaterialLine.deleteMany({
          where: { productionDocument: { tenantId }, productionDocumentId: id },
        });
        await tx.productionMaterialLine.createMany({
          data: preview.materials.map((material) => ({
            productionDocumentId: id,
            productId: material.productId,
            plannedQuantity: material.plannedQuantity,
            unitOfMeasure: material.product.unitOfMeasure,
            lossPercent: material.lossPercent,
          })),
        });
      }
      if (extraCosts !== null) {
        await tx.productionDocumentCost.deleteMany({
          where: { productionDocument: { tenantId }, productionDocumentId: id },
        });
        if (extraCosts.length) {
          await tx.productionDocumentCost.createMany({
            data: extraCosts.map((cost) => ({
              ...cost,
              productionDocumentId: id,
            })),
          });
        }
      }
      const plannedMaterialCost = preview
        ? preview.plannedMaterialCost
        : Number(document.plannedMaterialCost);
      const materialCost = isRunning
        ? Number(document.actualMaterialCost)
        : plannedMaterialCost;
      await tx.productionDocument.update({
        where: { tenantId, id },
        data: {
          ...(preview
            ? {
                recipeId,
                productId: preview.recipe.productId,
                productUnit: preview.recipe.product.unitOfMeasure,
                plannedQuantity,
                warehouseId,
                plannedMaterialCost,
              }
            : {}),
          outputWarehouseId,
          ...(dto.docDate !== undefined
            ? { docDate: new Date(dto.docDate) }
            : {}),
          ...(dto.responsibleId !== undefined
            ? { responsibleId: dto.responsibleId || null }
            : {}),
          ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),
          plannedStartDate,
          plannedEndDate,
          extraCost,
          totalCost: roundMoney(materialCost + extraCost),
        },
      });
    });

    await this.auditService.logAction({
      tenantId,
      userId,
      entityType: 'ProductionDocument',
      entityId: id,
      action: 'UPDATE',
      oldValue: {
        recipeId: document.recipeId,
        plannedQuantity: Number(document.plannedQuantity),
        warehouseId: document.warehouseId,
        extraCost: Number(document.extraCost),
      },
      newValue: {
        recipeId,
        plannedQuantity,
        warehouseId,
        extraCost,
      },
    });
    return this.findDocument(tenantId, id, locale);
  }

  async deleteDocument(
    tenantId: string,
    userId: string,
    id: string,
    locale: AppLocale = 'uz',
  ) {
    const document = await this.prisma.productionDocument.findFirst({
      where: { id, tenantId },
    });
    if (!document) throw this.documentNotFound(locale);
    if (!OPEN_STATUSES.includes(document.status)) {
      throw new BadRequestException(
        tr(
          locale,
          'Faqat qoralama hujjatni o‘chirish mumkin; boshqalarini bekor qiling',
          'Удалить можно только черновик; остальные документы отменяйте',
        ),
      );
    }
    const deleted = await this.prisma.productionDocument.deleteMany({
      where: { id, tenantId, status: { in: OPEN_STATUSES } },
    });
    if (deleted.count !== 1) throw this.statusChanged(locale);
    await this.auditService.logAction({
      tenantId,
      userId,
      entityType: 'ProductionDocument',
      entityId: id,
      action: 'DELETE',
      oldValue: { docNumber: document.docNumber, status: document.status },
    });
    return { success: true };
  }

  private documentWhere(
    tenantId: string,
    filters: FilterProductionDocumentsDto,
    locale: AppLocale,
    withStatus = true,
  ): Prisma.ProductionDocumentWhereInput {
    const where: Prisma.ProductionDocumentWhereInput = { tenantId };
    if (filters.productId) where.productId = filters.productId;
    if (filters.warehouseId) {
      where.AND = [
        {
          OR: [
            { warehouseId: filters.warehouseId },
            { outputWarehouseId: filters.warehouseId },
          ],
        },
      ];
    }
    if (filters.responsibleId) where.responsibleId = filters.responsibleId;
    if (withStatus && filters.status) {
      const statuses = filters.status.split(',');
      if (
        statuses.some(
          (status) =>
            !Object.values(ManufacturingStatus).includes(
              status as ManufacturingStatus,
            ),
        )
      ) {
        throw new BadRequestException(
          tr(
            locale,
            'Ishlab chiqarish holati noto‘g‘ri',
            'Неверный статус производства',
          ),
        );
      }
      where.status = { in: statuses as ManufacturingStatus[] };
    }
    if (filters.search?.trim()) {
      const search = filters.search.trim();
      where.OR = [
        { docNumber: { contains: search, mode: 'insensitive' } },
        { note: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (filters.dateFrom || filters.dateTo) {
      const dateTo = filters.dateTo ? new Date(filters.dateTo) : undefined;
      dateTo?.setUTCHours(23, 59, 59, 999);
      where.docDate = {
        ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
        ...(dateTo ? { lte: dateTo } : {}),
      };
    }
    return where;
  }

  /**
   * The list with paging and sorting, and the statistics for the same filters
   * (without the status filter, so the cards stay meaningful) — TZ 6.
   */
  async findDocuments(
    tenantId: string,
    filters: FilterProductionDocumentsDto,
    locale: AppLocale = 'uz',
  ) {
    const where = {
      ...this.documentWhere(tenantId, filters, locale),
      tenantId,
    };
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const sortBy = filters.sortBy ?? 'docDate';
    const sortDir = filters.sortDir ?? 'desc';

    let items: Prisma.ProductionDocumentGetPayload<{
      include: typeof documentListInclude;
    }>[];
    let total: number;
    if (['product', 'warehouse', 'responsible'].includes(sortBy)) {
      // Names are JSON / two fields: sort the filtered rows here.
      const all = await this.prisma.productionDocument.findMany({
        where,
        include: documentListInclude,
      });
      const key = (doc: (typeof all)[number]) =>
        sortBy === 'product'
          ? localName(doc.product.name, locale)
          : sortBy === 'warehouse'
            ? localName(doc.warehouse.name, locale)
            : doc.responsible
              ? `${doc.responsible.firstName} ${doc.responsible.lastName}`
              : '';
      all.sort(
        (a, b) =>
          key(a).localeCompare(key(b), locale) * (sortDir === 'asc' ? 1 : -1),
      );
      total = all.length;
      items = all.slice((page - 1) * pageSize, page * pageSize);
    } else {
      const orderBy: Prisma.ProductionDocumentOrderByWithRelationInput[] = [
        { [sortBy]: sortDir },
        { createdAt: 'desc' },
      ];
      [items, total] = await Promise.all([
        this.prisma.productionDocument.findMany({
          where,
          include: documentListInclude,
          orderBy,
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.productionDocument.count({ where }),
      ]);
    }

    const statsWhere = {
      ...this.documentWhere(tenantId, filters, locale, false),
      tenantId,
    };
    const [byStatus, completedCost] = await Promise.all([
      this.prisma.productionDocument.groupBy({
        by: ['status'],
        where: statsWhere,
        _count: { _all: true },
      }),
      this.prisma.productionDocument.aggregate({
        where: { ...statsWhere, status: ManufacturingStatus.COMPLETED },
        _sum: { totalCost: true },
      }),
    ]);
    const count = (statuses: ManufacturingStatus[]) =>
      byStatus
        .filter((row) => statuses.includes(row.status))
        .reduce((sum, row) => sum + row._count._all, 0);

    return {
      items: items.map((doc) => ({ ...doc, displayCost: displayCost(doc) })),
      total,
      page,
      pageSize,
      stats: {
        draft: count(OPEN_STATUSES),
        inProgress: count(RUNNING_STATUSES),
        completed: count([ManufacturingStatus.COMPLETED]),
        cancelled: count([ManufacturingStatus.CANCELLED]),
        completedCost: roundMoney(Number(completedCost._sum.totalCost ?? 0)),
      },
    };
  }

  async findDocument(tenantId: string, id: string, locale: AppLocale = 'uz') {
    const document = await this.prisma.productionDocument.findFirst({
      where: { id, tenantId },
      include: documentInclude,
    });
    if (!document) throw this.documentNotFound(locale);
    return { ...document, displayCost: displayCost(document) };
  }

  /**
   * Qoralama → Jarayonda: materials leave the raw-material warehouse FIFO from
   * the oldest batches. When any material is short nothing moves and the
   * status stays (TZ 5.2, test H).
   */
  async start(
    tenantId: string,
    userId: string,
    id: string,
    locale: AppLocale = 'uz',
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const document = await tx.productionDocument.findFirst({
        where: { id, tenantId },
        include: { materials: { include: { product: true } } },
      });
      if (!document) throw this.documentNotFound(locale);
      if (!OPEN_STATUSES.includes(document.status)) {
        throw new BadRequestException(
          tr(
            locale,
            'Faqat qoralama hujjatni ishlab chiqarishga o‘tkazish mumkin',
            'Запустить в производство можно только черновик',
          ),
        );
      }
      await assertPeriodOpen(tx, tenantId, document.docDate, 'post');

      // Check every material first, so the message lists all shortages.
      const shortages: string[] = [];
      for (const line of document.materials) {
        const stock = await tx.stockLevel.findUnique({
          where: {
            tenantId_warehouseId_productId: {
              tenantId,
              warehouseId: document.warehouseId,
              productId: line.productId,
            },
          },
        });
        const available = Math.max(
          0,
          Number(stock?.quantity ?? 0) - Number(stock?.reservedQuantity ?? 0),
        );
        const required = Number(line.plannedQuantity);
        if (available + 0.0005 < required) {
          const unit = unitText(
            line.unitOfMeasure ?? line.product.unitOfMeasure,
            locale,
          );
          shortages.push(
            tr(
              locale,
              `${localName(line.product.name, locale)}: kerak ${formatQuantity(required)} ${unit}, mavjud ${formatQuantity(available)} ${unit}, yetishmaydi ${formatQuantity(required - available)} ${unit}`,
              `${localName(line.product.name, locale)}: нужно ${formatQuantity(required)} ${unit}, есть ${formatQuantity(available)} ${unit}, не хватает ${formatQuantity(required - available)} ${unit}`,
            ),
          );
        }
      }
      if (shortages.length) {
        throw new BadRequestException(
          tr(
            locale,
            `Xomashyo yetarli emas, hujjat jarayonga o‘tkazilmadi. ${shortages.join('; ')}`,
            `Недостаточно сырья, документ не запущен. ${shortages.join('; ')}`,
          ),
        );
      }

      const claimed = await tx.productionDocument.updateMany({
        where: { id, tenantId, status: document.status },
        data: {
          status: ManufacturingStatus.IN_PROGRESS,
          startedAt: new Date(),
        },
      });
      if (claimed.count !== 1) throw this.statusChanged(locale);

      for (const line of document.materials) {
        await this.consumeMaterial(
          tx,
          tenantId,
          document.warehouseId,
          line,
          Number(line.plannedQuantity),
          userId,
          locale,
        );
        await this.recalculateLine(tx, tenantId, line.id);
      }
      await this.recalculateDocument(tx, tenantId, id);
      return { previousStatus: document.status };
    });
    await this.logStatusChange(
      tenantId,
      userId,
      id,
      result.previousStatus,
      ManufacturingStatus.IN_PROGRESS,
    );
    return this.findDocument(tenantId, id, locale);
  }

  /** Brings the issued quantity of a line to `desired` (issue more or return). */
  private async adjustLine(
    tx: ProductionTransaction,
    document: { id: string; tenantId: string; warehouseId: string },
    line: { id: string; productionDocumentId: string; productId: string },
    desired: number,
    userId: string,
    locale: AppLocale,
  ) {
    const allocations = await tx.productionMaterialBatch.findMany({
      where: { batch: { tenantId: document.tenantId }, lineId: line.id },
      orderBy: [{ batch: { createdAt: 'asc' } }, { batchId: 'asc' }],
    });
    const issued = allocations.reduce(
      (sum, item) => sum + Number(item.quantity),
      0,
    );
    if (desired < issued - 0.0005) {
      await this.restoreMaterialQuantity(
        tx,
        document.tenantId,
        document.warehouseId,
        document.id,
        line.id,
        line.productId,
        allocations,
        roundQuantity(issued - desired),
        userId,
        locale,
      );
    } else if (desired > issued + 0.0005) {
      await this.consumeMaterial(
        tx,
        document.tenantId,
        document.warehouseId,
        line,
        roundQuantity(desired - issued),
        userId,
        locale,
      );
    }
  }

  private async recalculateLine(
    tx: ProductionTransaction,
    tenantId: string,
    lineId: string,
    actualQuantity?: number,
  ) {
    const allocations = await tx.productionMaterialBatch.findMany({
      where: { batch: { tenantId }, lineId },
    });
    const quantity = allocations.reduce(
      (sum, a) => sum + Number(a.quantity),
      0,
    );
    const raw = allocations.reduce(
      (sum, a) => sum + Number(a.quantity) * Number(a.unitCost),
      0,
    );
    await tx.productionMaterialLine.update({
      where: { productionDocument: { tenantId }, id: lineId },
      data: {
        ...(actualQuantity !== undefined ? { actualQuantity } : {}),
        unitCost: quantity > 0 ? roundUnitCost(raw / quantity) : 0,
        totalCost: roundMoney(raw),
      },
    });
  }

  private async recalculateDocument(
    tx: ProductionTransaction,
    tenantId: string,
    id: string,
  ) {
    const [lines, costs] = await Promise.all([
      tx.productionMaterialLine.findMany({
        where: { productionDocument: { tenantId }, productionDocumentId: id },
      }),
      tx.productionDocumentCost.findMany({
        where: { productionDocument: { tenantId }, productionDocumentId: id },
      }),
    ]);
    const actualMaterialCost = roundMoney(
      lines.reduce((sum, line) => sum + Number(line.totalCost), 0),
    );
    const extraCost = roundMoney(
      costs.reduce((sum, c) => sum + Number(c.amount), 0),
    );
    await tx.productionDocument.update({
      where: { tenantId, id },
      data: {
        actualMaterialCost,
        extraCost,
        totalCost: roundMoney(actualMaterialCost + extraCost),
      },
    });
    return { actualMaterialCost, extraCost };
  }

  async updateActualMaterials(
    tenantId: string,
    userId: string,
    id: string,
    dto: UpdateActualMaterialsDto,
    locale: AppLocale = 'uz',
  ) {
    const ids = dto.materials.map((item) => item.productId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(
        tr(
          locale,
          'Haqiqiy sarfda bir xil xomashyo takrorlanmasligi kerak',
          'В фактическом расходе сырьё не должно повторяться',
        ),
      );
    }
    const changes = await this.prisma.$transaction(async (tx) => {
      const document = await tx.productionDocument.findFirst({
        where: { id, tenantId },
        include: { materials: true },
      });
      if (!document) throw this.documentNotFound(locale);
      if (!RUNNING_STATUSES.includes(document.status)) {
        throw new BadRequestException(
          tr(
            locale,
            'Haqiqiy sarf faqat jarayondagi hujjatda kiritiladi',
            'Фактический расход вводится только в документе в работе',
          ),
        );
      }
      return this.applyActualMaterials(
        tx,
        document,
        dto.materials,
        userId,
        locale,
      );
    });
    for (const change of changes) {
      await this.auditService.logAction({
        tenantId,
        userId,
        entityType: 'ProductionMaterialLine',
        entityId: id,
        action: 'UPDATE',
        oldValue: {
          productId: change.productId,
          actualQuantity: change.oldQuantity,
        },
        newValue: {
          productId: change.productId,
          actualQuantity: change.newQuantity,
        },
      });
    }
    return this.findDocument(tenantId, id, locale);
  }

  private async applyActualMaterials(
    tx: ProductionTransaction,
    document: {
      id: string;
      tenantId: string;
      warehouseId: string;
      materials: Array<{
        id: string;
        productionDocumentId: string;
        productId: string;
        actualQuantity: Prisma.Decimal | null;
      }>;
    },
    inputs: Array<{ productId: string; actualQuantity: number }>,
    userId: string,
    locale: AppLocale,
  ) {
    const changes: Array<{
      productId: string;
      oldQuantity: number | null;
      newQuantity: number;
    }> = [];
    for (const input of inputs) {
      const line = document.materials.find(
        (item) => item.productId === input.productId,
      );
      if (!line) {
        throw new BadRequestException(
          tr(
            locale,
            'Hujjatda bo‘lmagan xomashyo uchun sarf kiritildi',
            'Указан расход сырья, которого нет в документе',
          ),
        );
      }
      const desired = roundQuantity(Number(input.actualQuantity));
      if (!Number.isFinite(desired) || desired < 0) {
        throw new BadRequestException(
          tr(
            locale,
            'Haqiqiy sarf miqdori manfiy bo‘lishi mumkin emas',
            'Фактический расход не может быть отрицательным',
          ),
        );
      }
      await this.adjustLine(tx, document, line, desired, userId, locale);
      await this.recalculateLine(tx, document.tenantId, line.id, desired);
      changes.push({
        productId: input.productId,
        oldQuantity:
          line.actualQuantity == null ? null : Number(line.actualQuantity),
        newQuantity: desired,
      });
    }
    await this.recalculateDocument(tx, document.tenantId, document.id);
    return changes;
  }

  /**
   * Jarayonda → Yakunlangan: the actual consumption is settled, the finished
   * product enters the output warehouse as a new batch at
   * (FIFO materials + extra costs) ÷ produced quantity, and the product card
   * takes that actual cost. Later price changes never touch it (TZ 5.2, 8.3).
   */
  async complete(
    tenantId: string,
    userId: string,
    id: string,
    dto: CompleteProductionDocumentDto,
    locale: AppLocale = 'uz',
  ) {
    const producedQuantity = roundQuantity(Number(dto.producedQuantity));
    if (!Number.isFinite(producedQuantity) || producedQuantity <= 0) {
      throw new BadRequestException(
        tr(
          locale,
          'Chiqqan miqdor 0 dan katta bo‘lishi kerak: 0 ga bo‘lib tannarx hisoblab bo‘lmaydi',
          'Выпущенное количество должно быть больше 0: себестоимость нельзя делить на 0',
        ),
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const document = await tx.productionDocument.findFirst({
        where: { id, tenantId },
        include: { materials: true, product: true },
      });
      if (!document) throw this.documentNotFound(locale);
      if (!RUNNING_STATUSES.includes(document.status)) {
        throw new BadRequestException(
          tr(
            locale,
            'Faqat jarayondagi hujjatni yakunlash mumkin',
            'Завершить можно только документ в работе',
          ),
        );
      }
      await assertPeriodOpen(tx, tenantId, document.docDate, 'post');
      const claimed = await tx.productionDocument.updateMany({
        where: { id, tenantId, status: document.status },
        data: {
          status: ManufacturingStatus.COMPLETED,
          completedAt: new Date(),
        },
      });
      if (claimed.count !== 1) throw this.statusChanged(locale);

      // Lines without an entered actual keep what was issued at start.
      const entered = new Map(
        (dto.materials ?? []).map((m) => [
          m.productId,
          Number(m.actualQuantity),
        ]),
      );
      const inputs = [];
      for (const line of document.materials) {
        if (entered.has(line.productId)) {
          inputs.push({
            productId: line.productId,
            actualQuantity: entered.get(line.productId)!,
          });
        } else if (line.actualQuantity != null) {
          inputs.push({
            productId: line.productId,
            actualQuantity: Number(line.actualQuantity),
          });
        } else {
          const issued = await tx.productionMaterialBatch.aggregate({
            where: { batch: { tenantId }, lineId: line.id },
            _sum: { quantity: true },
          });
          inputs.push({
            productId: line.productId,
            actualQuantity: Number(issued._sum.quantity ?? 0),
          });
        }
      }
      if (
        entered.size &&
        [...entered.keys()].some(
          (key) => !document.materials.some((l) => l.productId === key),
        )
      ) {
        throw new BadRequestException(
          tr(
            locale,
            'Hujjatda bo‘lmagan xomashyo uchun sarf kiritildi',
            'Указан расход сырья, которого нет в документе',
          ),
        );
      }
      await this.applyActualMaterials(tx, document, inputs, userId, locale);

      if (dto.extraCosts !== undefined) {
        await tx.productionDocumentCost.deleteMany({
          where: { productionDocument: { tenantId }, productionDocumentId: id },
        });
        const rows = this.extraCostRows(dto.extraCosts);
        if (rows.length) {
          await tx.productionDocumentCost.createMany({
            data: rows.map((row) => ({ ...row, productionDocumentId: id })),
          });
        }
      }

      const [lines, costs] = await Promise.all([
        tx.productionMaterialLine.findMany({
          where: { productionDocument: { tenantId }, productionDocumentId: id },
          include: { product: { select: { type: true } } },
        }),
        tx.productionDocumentCost.findMany({
          where: { productionDocument: { tenantId }, productionDocumentId: id },
        }),
      ]);
      const cost = computeProductionCost(
        lines.reduce((sum, line) => sum + Number(line.totalCost), 0),
        costs.map((c) => Number(c.amount)),
        producedQuantity,
      )!;
      const outputWarehouseId =
        document.outputWarehouseId ?? document.warehouseId;

      await tx.stockLevel.upsert({
        where: {
          tenantId_warehouseId_productId: {
            tenantId,
            warehouseId: outputWarehouseId,
            productId: document.productId,
          },
        },
        update: { quantity: { increment: producedQuantity } },
        create: {
          tenantId,
          warehouseId: outputWarehouseId,
          productId: document.productId,
          quantity: producedQuantity,
        },
      });
      await createFifoBatch(tx, {
        tenantId,
        warehouseId: outputWarehouseId,
        productId: document.productId,
        quantity: producedQuantity,
        unitCost: cost.unitCost,
        batchNumber: document.docNumber,
        productionDocumentId: document.id,
      });
      await tx.productionDocument.update({
        where: { tenantId, id },
        data: {
          producedQuantity,
          actualMaterialCost: cost.materialCost,
          extraCost: cost.extraCost,
          totalCost: cost.totalCost,
          unitCost: cost.unitCost,
        },
      });
      // TZ 3.4: the card now carries the actual cost.
      await tx.product.update({
        where: { tenantId, id: document.productId },
        data: {
          costPrice: cost.unitCost,
          costPriceCurrency: 'UZS',
          costPriceExchangeRate: 1,
          ...(document.product.type === 'FINISHED_PRODUCT'
            ? { costSource: 'PRODUCTION_ACTUAL' as const }
            : {}),
        },
      });
      await refreshEstimatedCosts(tx, tenantId, [document.productId]);
      await this.postCompletionJournal(
        tx,
        tenantId,
        document,
        lines,
        costs,
        locale,
      );
      return { previousStatus: document.status, cost };
    });
    await this.logStatusChange(
      tenantId,
      userId,
      id,
      result.previousStatus,
      ManufacturingStatus.COMPLETED,
      { producedQuantity, ...result.cost },
    );
    return this.findDocument(tenantId, id, locale);
  }

  /**
   * Bekor qilish (storno): every movement is reversed in one transaction —
   * materials return to their batches; for a completed document the output
   * batch is removed first, which is refused once any of it was sold or used.
   */
  async cancel(
    tenantId: string,
    userId: string,
    id: string,
    dto: CancelProductionDocumentDto,
    locale: AppLocale = 'uz',
  ) {
    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException(
        tr(locale, 'Bekor qilish sababini kiriting', 'Укажите причину отмены'),
      );
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const document = await tx.productionDocument.findFirst({
        where: { id, tenantId },
        include: {
          outputBatch: true,
          product: true,
          materials: {
            include: {
              batchConsumptions: {
                orderBy: [{ batch: { createdAt: 'asc' } }, { batchId: 'asc' }],
              },
            },
          },
        },
      });
      if (!document) throw this.documentNotFound(locale);
      if (document.status === ManufacturingStatus.CANCELLED) {
        throw new BadRequestException(
          tr(
            locale,
            'Hujjat allaqachon bekor qilingan',
            'Документ уже отменён',
          ),
        );
      }
      const previousStatus = document.status;
      await assertPeriodOpen(tx, tenantId, document.docDate, 'cancel');

      const claimed = await tx.productionDocument.updateMany({
        where: { id, tenantId, status: previousStatus },
        data: {
          status: ManufacturingStatus.CANCELLED,
          cancelReason: reason,
          cancelledAt: new Date(),
        },
      });
      if (claimed.count !== 1) throw this.statusChanged(locale);

      if (previousStatus === ManufacturingStatus.COMPLETED) {
        const batch = document.outputBatch;
        if (batch) {
          if (Number(batch.remainingQty) + 0.0005 < Number(batch.initialQty)) {
            throw new BadRequestException(
              tr(
                locale,
                `Tayyor mahsulot partiyasidan ${formatQuantity(Number(batch.initialQty) - Number(batch.remainingQty))} birlik allaqachon sotilgan yoki ishlatilgan. Avval o‘sha hujjatlarni bekor qiling`,
                `Из партии готового продукта уже продано или использовано ${formatQuantity(Number(batch.initialQty) - Number(batch.remainingQty))} ед. Сначала отмените эти документы`,
              ),
            );
          }
          const quantity = Number(batch.initialQty);
          const stock = await tx.stockLevel.updateMany({
            where: {
              tenantId,
              warehouseId: batch.warehouseId,
              productId: batch.productId,
              quantity: { gte: quantity },
            },
            data: { quantity: { decrement: quantity } },
          });
          if (stock.count !== 1) {
            throw new BadRequestException(
              tr(
                locale,
                'Ombordagi tayyor mahsulot qoldig‘i yetarli emas, storno qilib bo‘lmaydi',
                'Недостаточно остатка готового продукта на складе для сторно',
              ),
            );
          }
          const removed = await tx.productBatch.deleteMany({
            where: { tenantId, id: batch.id, remainingQty: batch.initialQty },
          });
          if (removed.count !== 1) throw this.statusChanged(locale);
        }
      }

      for (const line of document.materials) {
        if (line.batchConsumptions.length === 0) continue;
        const quantity = line.batchConsumptions.reduce(
          (sum, item) => sum + Number(item.quantity),
          0,
        );
        await this.restoreMaterialQuantity(
          tx,
          tenantId,
          document.warehouseId,
          document.id,
          line.id,
          line.productId,
          line.batchConsumptions,
          quantity,
          userId,
          locale,
        );
      }

      // The completion's journal entry goes with it (ADR 0020 / 0026).
      if (previousStatus === ManufacturingStatus.COMPLETED) {
        await this.journalService.deleteEntriesForSource(
          tx,
          tenantId,
          'ProductionDocument',
          document.id,
          'cancel',
        );
      }
      if (
        previousStatus === ManufacturingStatus.COMPLETED &&
        document.product.type === 'FINISHED_PRODUCT'
      ) {
        await restoreFinishedProductCost(tx, tenantId, document.productId);
      }
      return { previousStatus };
    });
    await this.logStatusChange(
      tenantId,
      userId,
      id,
      result.previousStatus,
      ManufacturingStatus.CANCELLED,
      { reason },
    );
    return this.findDocument(tenantId, id, locale);
  }

  /**
   * ADR 0026: a completed document posts, dated with the document:
   *   Dt 2910 / Kt 1010 — raw materials consumed (FIFO cost);
   * Semi-finished (or other stock goods) consumed stay inside 2910: their
   * value moves from the material to the output, so no line is needed.
   *   Dt 2910 / Kt 6990 — each extra cost (owed elsewhere until Finance links it).
   * Finished goods are debited to 2910 because sales relieve COGS from 2910.
   */
  private async postCompletionJournal(
    tx: ProductionTransaction,
    tenantId: string,
    document: { id: string; docNumber: string; docDate: Date },
    lines: Array<{ totalCost: Prisma.Decimal; product: { type: string } }>,
    costs: Array<{
      costType: string;
      amount: Prisma.Decimal;
      comment: string | null;
    }>,
    locale: AppLocale,
  ) {
    const raw = roundMoney(
      lines
        .filter((line) => line.product.type === 'RAW_MATERIAL')
        .reduce((sum, line) => sum + Number(line.totalCost), 0),
    );
    const extras = costs.filter((c) => Number(c.amount) > 0);
    if (raw <= 0 && extras.length === 0) return;

    const codes = [
      '2910',
      ...(raw > 0 ? ['1010'] : []),
      ...(extras.length ? ['6990'] : []),
    ];
    const accounts = await tx.account.findMany({
      where: { tenantId, code: { in: codes } },
      select: { id: true, code: true },
    });
    const byCode = new Map(accounts.map((a) => [a.code, a.id]));
    const missing = codes.filter((code) => !byCode.has(code));
    if (missing.length) {
      throw new BadRequestException(
        tr(
          locale,
          `Hisoblar rejasida ${missing.join(', ')} hisobi yo‘q: ishlab chiqarish provodkasini yozib bo‘lmaydi`,
          `В плане счетов нет счёта ${missing.join(', ')}: проводку производства записать нельзя`,
        ),
      );
    }
    const goodsAcc = byCode.get('2910')!;
    const costLabel: Record<string, string> = {
      SALARY: tr(locale, 'Ish haqi', 'Зарплата'),
      ENERGY: tr(locale, 'Energiya', 'Энергия'),
      DEPRECIATION: tr(locale, 'Amortizatsiya', 'Амортизация'),
      OTHER: tr(locale, 'Boshqa xarajat', 'Прочие расходы'),
    };
    const entryLines = [
      ...(raw > 0
        ? [
            {
              debitAccountId: goodsAcc,
              creditAccountId: byCode.get('1010')!,
              amount: raw,
              description: tr(
                locale,
                `Xomashyo sarfi № ${document.docNumber}`,
                `Расход сырья № ${document.docNumber}`,
              ),
            },
          ]
        : []),
      ...extras.map((c) => ({
        debitAccountId: goodsAcc,
        creditAccountId: byCode.get('6990')!,
        amount: roundMoney(Number(c.amount)),
        description: `${costLabel[c.costType] ?? c.costType}${c.comment ? `: ${c.comment}` : ''} № ${document.docNumber}`,
      })),
    ];
    await this.journalService.createJournalEntry(
      tenantId,
      {
        entryDate: document.docDate,
        description: tr(
          locale,
          `Ishlab chiqarish № ${document.docNumber}`,
          `Производство № ${document.docNumber}`,
        ),
        sourceDocType: 'ProductionDocument',
        sourceDocId: document.id,
        lines: entryLines,
      },
      tx,
    );
  }

  private async consumeMaterial(
    tx: ProductionTransaction,
    tenantId: string,
    warehouseId: string,
    line: { id: string; productionDocumentId: string; productId: string },
    quantity: number,
    userId: string,
    locale: AppLocale,
  ) {
    const stock = await tx.stockLevel.findUnique({
      where: {
        tenantId_warehouseId_productId: {
          tenantId,
          warehouseId,
          productId: line.productId,
        },
      },
    });
    const physical = Number(stock?.quantity ?? 0);
    const reserved = Number(stock?.reservedQuantity ?? 0);
    const available = Math.max(0, physical - reserved);
    if (!stock || available + 0.0005 < quantity) {
      throw new BadRequestException(
        tr(
          locale,
          `Xomashyo yetarli emas. Mavjud: ${formatQuantity(available)}, kerak: ${formatQuantity(quantity)}, yetishmaydi: ${formatQuantity(Math.max(0, quantity - available))}`,
          `Недостаточно сырья. Есть: ${formatQuantity(available)}, нужно: ${formatQuantity(quantity)}, не хватает: ${formatQuantity(Math.max(0, quantity - available))}`,
        ),
      );
    }

    // Shared FIFO consumer: guarded decrements, all or nothing. Production keeps
    // its own per-batch records (material batches + movements) below.
    const allocation = await consumeFifoBatches(tx, {
      tenantId,
      warehouseId,
      productId: line.productId,
      quantity,
    });

    for (const item of allocation.batches) {
      await tx.productionMaterialBatch.upsert({
        where: {
          batch: { tenantId },
          lineId_batchId: { lineId: line.id, batchId: item.batchId },
        },
        update: { quantity: { increment: item.quantity } },
        create: {
          lineId: line.id,
          batchId: item.batchId,
          quantity: item.quantity,
          unitCost: item.unitCost,
        },
      });
      await tx.productionMaterialMovement.create({
        data: {
          tenantId,
          productionDocumentId: line.productionDocumentId,
          lineId: line.id,
          batchId: item.batchId,
          movementType: 'ISSUE',
          quantity: item.quantity,
          unitCost: item.unitCost,
          createdById: userId,
        },
      });
    }

    // Guarded: a concurrent document cannot take the same stock (TZ 9.3).
    const changedStock = await tx.stockLevel.updateMany({
      where: { tenantId, id: stock.id, quantity: { gte: quantity } },
      data: { quantity: { decrement: quantity } },
    });
    if (changedStock.count !== 1) {
      throw new BadRequestException(
        tr(
          locale,
          'Ombor qoldig‘i o‘zgardi. Hujjatni qayta yuklab tekshiring',
          'Остаток на складе изменился. Обновите документ и проверьте',
        ),
      );
    }
  }

  private async restoreMaterialQuantity(
    tx: ProductionTransaction,
    tenantId: string,
    warehouseId: string,
    productionDocumentId: string,
    lineId: string,
    productId: string,
    allocations: Array<{
      id: string;
      batchId: string;
      quantity: Prisma.Decimal;
      unitCost: Prisma.Decimal;
    }>,
    quantityToRestore: number,
    userId: string,
    locale: AppLocale,
  ) {
    let remaining = quantityToRestore;
    for (const allocation of [...allocations].reverse()) {
      if (remaining <= 0.0005) break;
      const allocatedQuantity = Number(allocation.quantity);
      const restoreQuantity = Math.min(allocatedQuantity, remaining);
      await tx.productBatch.update({
        where: { tenantId, id: allocation.batchId },
        data: { remainingQty: { increment: restoreQuantity } },
      });
      await tx.stockLevel.update({
        where: {
          tenantId_warehouseId_productId: { tenantId, warehouseId, productId },
        },
        data: { quantity: { increment: restoreQuantity } },
      });
      await tx.productionMaterialMovement.create({
        data: {
          tenantId,
          productionDocumentId,
          lineId,
          batchId: allocation.batchId,
          movementType: 'RETURN',
          quantity: restoreQuantity,
          unitCost: Number(allocation.unitCost),
          createdById: userId,
        },
      });
      if (restoreQuantity + 0.0005 >= allocatedQuantity) {
        await tx.productionMaterialBatch.delete({
          where: { batch: { tenantId }, id: allocation.id },
        });
      } else {
        await tx.productionMaterialBatch.update({
          where: { batch: { tenantId }, id: allocation.id },
          data: { quantity: { decrement: restoreQuantity } },
        });
      }
      remaining = roundQuantity(remaining - restoreQuantity);
    }
    if (remaining > 0.0005) {
      throw new BadRequestException(
        tr(
          locale,
          'Ishlab chiqarish sarfini qaytarishda nomuvofiqlik aniqlandi',
          'Обнаружено расхождение при возврате производственного расхода',
        ),
      );
    }
  }

  private async requireWarehouse(
    db: ProductionTransaction | PrismaService,
    tenantId: string,
    warehouseId: string,
    locale: AppLocale,
  ) {
    const warehouse = await db.warehouse.findFirst({
      where: { id: warehouseId, tenantId },
    });
    if (!warehouse) {
      throw new NotFoundException(
        tr(locale, 'Ombor topilmadi', 'Склад не найден'),
      );
    }
    return warehouse;
  }

  private async requireTenantUser(
    tenantId: string,
    userId: string,
    locale: AppLocale,
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException(
        tr(
          locale,
          'Mas’ul xodim topilmadi',
          'Ответственный сотрудник не найден',
        ),
      );
    }
  }

  private documentNotFound(locale: AppLocale) {
    return new NotFoundException(
      tr(
        locale,
        'Ishlab chiqarish hujjati topilmadi',
        'Производственный документ не найден',
      ),
    );
  }

  private statusChanged(locale: AppLocale) {
    return new BadRequestException(
      tr(
        locale,
        'Hujjat holati o‘zgardi. Qayta yuklab tekshiring',
        'Статус документа изменился. Обновите и проверьте',
      ),
    );
  }

  private async logStatusChange(
    tenantId: string,
    userId: string,
    id: string,
    oldStatus: ManufacturingStatus,
    newStatus: ManufacturingStatus,
    extra: Record<string, string | number> = {},
  ) {
    await this.auditService.logAction({
      tenantId,
      userId,
      entityType: 'ProductionDocument',
      entityId: id,
      action: 'UPDATE',
      oldValue: { status: oldStatus },
      newValue: { status: newStatus, ...extra },
    });
  }
}

/** The cost shown in the list: plan for drafts, actual so far, final when done. */
function displayCost(doc: {
  status: ManufacturingStatus;
  plannedMaterialCost: Prisma.Decimal;
  actualMaterialCost: Prisma.Decimal;
  extraCost: Prisma.Decimal;
  totalCost: Prisma.Decimal;
}): number {
  if (doc.status === ManufacturingStatus.COMPLETED)
    return Number(doc.totalCost);
  if (RUNNING_STATUSES.includes(doc.status)) {
    return roundMoney(Number(doc.actualMaterialCost) + Number(doc.extraCost));
  }
  return roundMoney(Number(doc.plannedMaterialCost) + Number(doc.extraCost));
}

function toFifoBatchInputs(
  batches: Array<{
    id: string;
    remainingQty: Prisma.Decimal;
    landedCost: Prisma.Decimal;
    purchasePrice: Prisma.Decimal;
    createdAt: Date;
  }>,
): FifoBatchInput[] {
  return batches.map((batch) => ({
    id: batch.id,
    remainingQty: Number(batch.remainingQty),
    landedCost: Number(batch.landedCost),
    purchasePrice: Number(batch.purchasePrice),
    createdAt: batch.createdAt,
  }));
}
