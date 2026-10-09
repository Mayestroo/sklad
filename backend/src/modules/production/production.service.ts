import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ManufacturingStatus, Prisma, ProductType } from '@prisma/client';
import { PrismaService } from '../../common/prisma';
import { AuditService } from '../audit/audit.service';
import { generateDocumentSequence } from '../../common/utils/document-sequence.util';
import {
  allocateFifoCost,
  FifoBatchInput,
  scaleRecipeMaterials,
} from './production-calculations';
import { CreateProductionRecipeDto } from './dto/create-production-recipe.dto';
import {
  CompleteProductionDocumentDto,
  CreateProductionDocumentDto,
  FilterProductionDocumentsDto,
  UpdateActualMaterialsDto,
} from './dto/create-production-document.dto';

const recipeInclude = {
  product: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  items: { include: { product: true } },
} satisfies Prisma.ProductionRecipeInclude;

const documentInclude = {
  product: true,
  recipe: true,
  warehouse: true,
  responsible: { select: { id: true, firstName: true, lastName: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  materials: {
    include: {
      product: true,
      batchConsumptions: {
        include: { batch: true },
        orderBy: { createdAt: 'asc' },
      },
      movements: {
        include: {
          batch: true,
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { id: 'asc' },
  },
  outputBatch: true,
} satisfies Prisma.ProductionDocumentInclude;

type ProductionTransaction = Prisma.TransactionClient;

@Injectable()
export class ProductionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findRecipes(tenantId: string, includeInactive = false) {
    return this.prisma.productionRecipe.findMany({
      where: { tenantId, ...(includeInactive ? {} : { isActive: true }) },
      include: recipeInclude,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createRecipe(
    tenantId: string,
    userId: string,
    dto: CreateProductionRecipeDto,
  ) {
    const productIds = dto.materials.map((material) => material.productId);
    if (new Set(productIds).size !== productIds.length) {
      throw new BadRequestException(
        'Retsepturada bir xil xomashyo takrorlanmasligi kerak',
      );
    }

    const [product, materials] = await Promise.all([
      this.prisma.product.findFirst({ where: { id: dto.productId, tenantId } }),
      this.prisma.product.findMany({
        where: { tenantId, id: { in: productIds } },
        select: { id: true, type: true },
      }),
    ]);
    if (!product) throw new NotFoundException('Tayyor mahsulot topilmadi');
    if (product.type !== ProductType.PRODUCT) {
      throw new BadRequestException(
        'Retseptura tayyor mahsulot uchun yaratilishi kerak',
      );
    }
    if (
      materials.length !== productIds.length ||
      materials.some((item) => item.type !== ProductType.RAW_MATERIAL)
    ) {
      throw new BadRequestException(
        'Retseptura tarkibida faqat shu korxonaga tegishli xomashyolar bo‘lishi mumkin',
      );
    }

    const recipe = await this.prisma.productionRecipe.create({
      data: {
        tenantId,
        productId: dto.productId,
        outputQuantity: dto.outputQuantity,
        note: dto.note || null,
        createdById: userId,
        items: {
          create: dto.materials.map(({ productId, quantity }) => ({
            productId,
            quantity,
          })),
        },
      },
      include: recipeInclude,
    });

    await this.auditService.logAction({
      tenantId,
      userId,
      entityType: 'ProductionRecipe',
      entityId: recipe.id,
      action: 'CREATE',
      newValue: {
        productId: recipe.productId,
        outputQuantity: Number(recipe.outputQuantity),
        materials: dto.materials,
      },
    });
    return recipe;
  }

  async updateRecipe(
    tenantId: string,
    userId: string,
    recipeId: string,
    dto: CreateProductionRecipeDto,
  ) {
    const current = await this.prisma.productionRecipe.findFirst({
      where: { id: recipeId, tenantId },
      include: recipeInclude,
    });
    if (!current) throw new NotFoundException('Retseptura topilmadi');

    const replacement = await this.createRecipe(tenantId, userId, dto);
    await this.prisma.productionRecipe.update({
      where: { id: current.id },
      data: { isActive: false },
    });
    await this.auditService.logAction({
      tenantId,
      userId,
      entityType: 'ProductionRecipe',
      entityId: current.id,
      action: 'UPDATE',
      oldValue: { isActive: current.isActive },
      newValue: { isActive: false, replacedById: replacement.id },
    });
    return replacement;
  }

  async preview(
    tenantId: string,
    recipeId: string,
    outputQuantity: number,
    warehouseId: string,
  ) {
    const recipe = await this.prisma.productionRecipe.findFirst({
      where: { id: recipeId, tenantId, isActive: true },
      include: { items: { include: { product: true } }, product: true },
    });
    if (!recipe) throw new NotFoundException('Faol retseptura topilmadi');
    await this.requireWarehouse(tenantId, warehouseId);
    const required = scaleRecipeMaterials(
      outputQuantity,
      Number(recipe.outputQuantity),
      recipe.items.map((item) => ({
        productId: item.productId,
        quantity: Number(item.quantity),
      })),
    );

    const materials = await Promise.all(
      required.map(async (item) => {
        const stock = await this.prisma.stockLevel.findUnique({
          where: {
            tenantId_warehouseId_productId: {
              tenantId,
              warehouseId,
              productId: item.productId,
            },
          },
        });
        const batches = await this.prisma.productBatch.findMany({
          where: {
            tenantId,
            warehouseId,
            productId: item.productId,
            remainingQty: { gt: 0 },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
        const physicalQuantity = Number(stock?.quantity ?? 0);
        const reservedQuantity = Number(stock?.reservedQuantity ?? 0);
        const freeQuantity = Math.max(0, physicalQuantity - reservedQuantity);
        const batchQuantity = batches.reduce(
          (sum, batch) => sum + Number(batch.remainingQty),
          0,
        );
        const costableQuantity = Math.min(item.plannedQuantity, batchQuantity);
        const cost =
          costableQuantity > 0
            ? allocateFifoCost(costableQuantity, toFifoBatchInputs(batches))
            : { totalCost: 0, unitCost: 0 };
        const product = recipe.items.find(
          (line) => line.productId === item.productId,
        )?.product;
        return {
          ...item,
          product,
          physicalQuantity,
          freeQuantity,
          shortage: Math.max(0, item.plannedQuantity - freeQuantity),
          estimatedUnitCost: cost.unitCost,
          estimatedTotalCost: cost.totalCost,
        };
      }),
    );

    return {
      recipe,
      outputQuantity,
      plannedMaterialCost: roundMoney(
        materials.reduce((sum, line) => sum + line.estimatedTotalCost, 0),
      ),
      materials,
    };
  }

  async createDocument(
    tenantId: string,
    userId: string,
    dto: CreateProductionDocumentDto,
  ) {
    const preview = await this.preview(
      tenantId,
      dto.recipeId,
      dto.plannedQuantity,
      dto.warehouseId,
    );
    if (dto.responsibleId)
      await this.requireTenantUser(tenantId, dto.responsibleId);
    const docNumber = await generateDocumentSequence('PRD', (prefix) =>
      this.prisma.productionDocument.count({
        where: { tenantId, docNumber: { startsWith: prefix } },
      }),
    );

    const document = await this.prisma.productionDocument.create({
      data: {
        tenantId,
        docNumber,
        docDate: dto.docDate ? new Date(dto.docDate) : new Date(),
        productId: preview.recipe.productId,
        recipeId: dto.recipeId,
        warehouseId: dto.warehouseId,
        responsibleId: dto.responsibleId || null,
        plannedQuantity: dto.plannedQuantity,
        plannedMaterialCost: preview.plannedMaterialCost,
        note: dto.note || null,
        createdById: userId,
        materials: {
          create: preview.materials.map((material) => ({
            productId: material.productId,
            plannedQuantity: material.plannedQuantity,
          })),
        },
      },
      include: documentInclude,
    });

    await this.auditService.logAction({
      tenantId,
      userId,
      entityType: 'ProductionDocument',
      entityId: document.id,
      action: 'CREATE',
      newValue: {
        docNumber,
        plannedQuantity: dto.plannedQuantity,
        productId: document.productId,
        warehouseId: dto.warehouseId,
      },
    });

    return {
      ...document,
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

  async findDocuments(tenantId: string, filters: FilterProductionDocumentsDto) {
    const where: Prisma.ProductionDocumentWhereInput = { tenantId };
    if (filters.productId) where.productId = filters.productId;
    if (filters.warehouseId) where.warehouseId = filters.warehouseId;
    if (filters.responsibleId) where.responsibleId = filters.responsibleId;
    if (filters.status) {
      if (
        !Object.values(ManufacturingStatus).includes(
          filters.status as ManufacturingStatus,
        )
      ) {
        throw new BadRequestException('Ishlab chiqarish holati noto‘g‘ri');
      }
      where.status = filters.status as ManufacturingStatus;
    }
    if (filters.search) {
      where.OR = [
        { docNumber: { contains: filters.search, mode: 'insensitive' } },
        { note: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    if (filters.dateFrom || filters.dateTo) {
      const dateTo = filters.dateTo ? new Date(filters.dateTo) : undefined;
      dateTo?.setHours(23, 59, 59, 999);
      where.docDate = {
        ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
        ...(dateTo ? { lte: dateTo } : {}),
      };
    }
    return this.prisma.productionDocument.findMany({
      where,
      include: documentInclude,
      orderBy: [{ docDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findDocument(tenantId: string, id: string) {
    const document = await this.prisma.productionDocument.findFirst({
      where: { id, tenantId },
      include: documentInclude,
    });
    if (!document)
      throw new NotFoundException('Ishlab chiqarish hujjati topilmadi');
    return document;
  }

  async plan(tenantId: string, userId: string, id: string) {
    const changed = await this.prisma.productionDocument.updateMany({
      where: { id, tenantId, status: ManufacturingStatus.DRAFT },
      data: { status: ManufacturingStatus.PLANNED },
    });
    if (changed.count !== 1) {
      const document = await this.findDocument(tenantId, id);
      this.requireStatus(document.status, ManufacturingStatus.DRAFT);
    }
    const updated = await this.findDocument(tenantId, id);
    await this.logStatusChange(
      tenantId,
      userId,
      id,
      ManufacturingStatus.DRAFT,
      ManufacturingStatus.PLANNED,
    );
    return updated;
  }

  async start(tenantId: string, userId: string, id: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const document = await tx.productionDocument.findFirst({
        where: { id, tenantId },
        include: {
          materials: {
            include: {
              batchConsumptions: {
                orderBy: [{ batch: { createdAt: 'asc' } }, { batchId: 'asc' }],
              },
            },
          },
        },
      });
      if (!document)
        throw new NotFoundException('Ishlab chiqarish hujjati topilmadi');
      this.requireStatus(document.status, ManufacturingStatus.PLANNED);

      const claimed = await tx.productionDocument.updateMany({
        where: { id, tenantId, status: ManufacturingStatus.PLANNED },
        data: {
          status: ManufacturingStatus.IN_PROGRESS,
          startedAt: new Date(),
        },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException(
          'Ishlab chiqarish hujjati allaqachon boshlangan',
        );
      }

      for (const line of document.materials) {
        await this.consumeMaterial(
          tx,
          tenantId,
          document.warehouseId,
          line,
          Number(line.plannedQuantity),
          userId,
        );
      }

      return tx.productionDocument.findFirst({
        where: { id, tenantId },
        include: documentInclude,
      });
    });
    await this.logStatusChange(
      tenantId,
      userId,
      id,
      ManufacturingStatus.PLANNED,
      ManufacturingStatus.IN_PROGRESS,
    );
    return result;
  }

  async updateActualMaterials(
    tenantId: string,
    userId: string,
    id: string,
    dto: UpdateActualMaterialsDto,
  ) {
    if (!Array.isArray(dto.materials) || dto.materials.length === 0) {
      throw new BadRequestException(
        'Haqiqiy sarflangan xomashyolarni kiriting',
      );
    }
    const ids = dto.materials.map((item) => item.productId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(
        'Haqiqiy sarfda bir xil xomashyo takrorlanmasligi kerak',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const document = await tx.productionDocument.findFirst({
        where: { id, tenantId },
        include: {
          materials: {
            include: {
              batchConsumptions: {
                orderBy: [{ batch: { createdAt: 'asc' } }, { batchId: 'asc' }],
              },
            },
          },
        },
      });
      if (!document)
        throw new NotFoundException('Ishlab chiqarish hujjati topilmadi');
      this.requireStatus(document.status, ManufacturingStatus.IN_PROGRESS);
      if (
        dto.materials.length !== document.materials.length ||
        document.materials.some((line) => !ids.includes(line.productId))
      ) {
        throw new BadRequestException(
          'Hujjatdagi barcha xomashyolar uchun haqiqiy sarfni kiriting',
        );
      }

      const changeLog: Array<{
        productId: string;
        oldQuantity: number | null;
        newQuantity: number;
      }> = [];
      for (const input of dto.materials) {
        const line = document.materials.find(
          (item) => item.productId === input.productId,
        )!;
        const oldQuantity =
          line.actualQuantity == null ? null : Number(line.actualQuantity);
        const currentQuantity = line.batchConsumptions.reduce(
          (sum, item) => sum + Number(item.quantity),
          0,
        );
        const desiredQuantity = Number(input.actualQuantity);
        if (!Number.isFinite(desiredQuantity) || desiredQuantity < 0) {
          throw new BadRequestException(
            'Haqiqiy sarf miqdori manfiy bo‘lishi mumkin emas',
          );
        }

        if (desiredQuantity < currentQuantity) {
          await this.restoreMaterialQuantity(
            tx,
            document.tenantId,
            document.warehouseId,
            document.id,
            line.id,
            line.productId,
            line.batchConsumptions,
            currentQuantity - desiredQuantity,
            userId,
          );
        } else if (desiredQuantity > currentQuantity) {
          await this.consumeMaterial(
            tx,
            document.tenantId,
            document.warehouseId,
            line,
            desiredQuantity - currentQuantity,
            userId,
          );
        }

        const allocations = await tx.productionMaterialBatch.findMany({
          where: { lineId: line.id },
        });
        const quantity = allocations.reduce(
          (sum, allocation) => sum + Number(allocation.quantity),
          0,
        );
        const totalCost = roundMoney(
          allocations.reduce(
            (sum, allocation) =>
              sum + Number(allocation.quantity) * Number(allocation.unitCost),
            0,
          ),
        );
        await tx.productionMaterialLine.update({
          where: { id: line.id },
          data: {
            actualQuantity: desiredQuantity,
            unitCost: quantity > 0 ? roundMoney(totalCost / quantity) : 0,
            totalCost,
          },
        });
        changeLog.push({
          productId: input.productId,
          oldQuantity,
          newQuantity: desiredQuantity,
        });
      }

      const updatedLines = await tx.productionMaterialLine.findMany({
        where: { productionDocumentId: id },
      });
      const actualMaterialCost = roundMoney(
        updatedLines.reduce((sum, line) => sum + Number(line.totalCost), 0),
      );
      const updatedDocument = await tx.productionDocument.update({
        where: { id },
        data: { actualMaterialCost },
        include: documentInclude,
      });
      return { document: updatedDocument, changeLog };
    });

    for (const change of result.changeLog) {
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
    return result.document;
  }

  async markReady(tenantId: string, userId: string, id: string) {
    const document = await this.findDocument(tenantId, id);
    this.requireStatus(document.status, ManufacturingStatus.IN_PROGRESS);
    if (document.materials.some((line) => line.actualQuantity == null)) {
      throw new BadRequestException(
        'Ishlab chiqarishni tayyor deb belgilashdan oldin haqiqiy sarfni kiriting',
      );
    }
    const result = await this.prisma.productionDocument.update({
      where: { id },
      data: { status: ManufacturingStatus.READY },
      include: documentInclude,
    });
    await this.logStatusChange(
      tenantId,
      userId,
      id,
      ManufacturingStatus.IN_PROGRESS,
      ManufacturingStatus.READY,
    );
    return result;
  }

  async complete(
    tenantId: string,
    userId: string,
    id: string,
    dto: CompleteProductionDocumentDto,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const document = await tx.productionDocument.findFirst({
        where: { id, tenantId },
        include: { materials: true },
      });
      if (!document)
        throw new NotFoundException('Ishlab chiqarish hujjati topilmadi');
      this.requireStatus(document.status, ManufacturingStatus.READY);
      if (document.materials.some((line) => line.actualQuantity == null)) {
        throw new BadRequestException(
          'Haqiqiy sarf kiritilmagan xomashyo mavjud',
        );
      }
      const producedQuantity = Number(dto.producedQuantity);
      if (!Number.isFinite(producedQuantity) || producedQuantity <= 0) {
        throw new BadRequestException(
          'Ishlab chiqarilgan miqdor noldan katta bo‘lishi shart',
        );
      }
      const actualMaterialCost = roundMoney(
        document.materials.reduce(
          (sum, line) => sum + Number(line.totalCost),
          0,
        ),
      );
      const unitCost = roundMoney(actualMaterialCost / producedQuantity);

      await tx.stockLevel.upsert({
        where: {
          tenantId_warehouseId_productId: {
            tenantId,
            warehouseId: document.warehouseId,
            productId: document.productId,
          },
        },
        update: { quantity: { increment: producedQuantity } },
        create: {
          tenantId,
          warehouseId: document.warehouseId,
          productId: document.productId,
          quantity: producedQuantity,
        },
      });
      await tx.productBatch.create({
        data: {
          tenantId,
          productId: document.productId,
          warehouseId: document.warehouseId,
          productionDocumentId: document.id,
          batchNumber: document.docNumber,
          initialQty: producedQuantity,
          remainingQty: producedQuantity,
          purchasePrice: unitCost,
          landedCost: unitCost,
        },
      });
      await tx.product.update({
        where: { id: document.productId },
        data: {
          costPrice: unitCost,
          costPriceCurrency: 'UZS',
          costPriceExchangeRate: 1,
        },
      });
      return tx.productionDocument.update({
        where: { id },
        data: {
          producedQuantity,
          actualMaterialCost,
          unitCost,
          status: ManufacturingStatus.COMPLETED,
          completedAt: new Date(),
        },
        include: documentInclude,
      });
    });
    await this.logStatusChange(
      tenantId,
      userId,
      id,
      ManufacturingStatus.READY,
      ManufacturingStatus.COMPLETED,
    );
    return result;
  }

  async cancel(tenantId: string, userId: string, id: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const document = await tx.productionDocument.findFirst({
        where: { id, tenantId },
        include: {
          materials: {
            include: {
              batchConsumptions: {
                orderBy: [{ batch: { createdAt: 'asc' } }, { batchId: 'asc' }],
              },
            },
          },
        },
      });
      if (!document)
        throw new NotFoundException('Ishlab chiqarish hujjati topilmadi');
      if (
        document.status === ManufacturingStatus.COMPLETED ||
        document.status === ManufacturingStatus.CANCELLED
      ) {
        throw new BadRequestException(
          'Yakunlangan yoki bekor qilingan hujjatni bekor qilib bo‘lmaydi',
        );
      }
      const previousStatus = document.status;
      const claimed = await tx.productionDocument.updateMany({
        where: { id, tenantId, status: previousStatus },
        data: { status: ManufacturingStatus.CANCELLED },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException(
          'Hujjat holati o‘zgardi. Qayta yuklab tekshiring',
        );
      }
      for (const line of document.materials) {
        if (line.batchConsumptions.length) {
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
          );
        }
      }
      const updated = await tx.productionDocument.findFirst({
        where: { id, tenantId },
        include: documentInclude,
      });
      return { document: updated, previousStatus };
    });
    await this.logStatusChange(
      tenantId,
      userId,
      id,
      result.previousStatus,
      ManufacturingStatus.CANCELLED,
    );
    return result.document;
  }

  private async consumeMaterial(
    tx: ProductionTransaction,
    tenantId: string,
    warehouseId: string,
    line: { id: string; productionDocumentId: string; productId: string },
    quantity: number,
    userId: string,
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
        `Xomashyo yetarli emas. Mavjud: ${available}, kerak: ${quantity}, yetishmaydi: ${Math.max(0, quantity - available)}`,
      );
    }

    const batches = await tx.productBatch.findMany({
      where: {
        tenantId,
        warehouseId,
        productId: line.productId,
        remainingQty: { gt: 0 },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    let allocation;
    try {
      allocation = allocateFifoCost(quantity, toFifoBatchInputs(batches));
    } catch {
      throw new BadRequestException(
        'Xomashyo partiyalaridagi qoldiq ombor qoldig‘iga mos emas yoki tannarx ma’lumoti yo‘q',
      );
    }

    for (const item of allocation.batches) {
      const changed = await tx.productBatch.updateMany({
        where: { id: item.batchId, remainingQty: { gte: item.quantity } },
        data: { remainingQty: { decrement: item.quantity } },
      });
      if (changed.count !== 1) {
        throw new BadRequestException(
          'Xomashyo partiyasi qoldig‘i o‘zgardi. Hujjatni qayta yuklab tekshiring',
        );
      }
      await tx.productionMaterialBatch.upsert({
        where: { lineId_batchId: { lineId: line.id, batchId: item.batchId } },
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

    const changedStock = await tx.stockLevel.updateMany({
      where: { id: stock.id, quantity: { gte: quantity } },
      data: { quantity: { decrement: quantity } },
    });
    if (changedStock.count !== 1) {
      throw new BadRequestException(
        'Ombor qoldig‘i o‘zgardi. Hujjatni qayta yuklab tekshiring',
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
  ) {
    let remaining = quantityToRestore;
    for (const allocation of [...allocations].reverse()) {
      if (remaining <= 0.0005) break;
      const allocatedQuantity = Number(allocation.quantity);
      const restoreQuantity = Math.min(allocatedQuantity, remaining);
      await tx.productBatch.update({
        where: { id: allocation.batchId },
        data: { remainingQty: { increment: restoreQuantity } },
      });
      await tx.stockLevel.update({
        where: {
          tenantId_warehouseId_productId: {
            tenantId,
            warehouseId,
            productId,
          },
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
          where: { id: allocation.id },
        });
      } else {
        await tx.productionMaterialBatch.update({
          where: { id: allocation.id },
          data: { quantity: { decrement: restoreQuantity } },
        });
      }
      remaining = roundQuantity(remaining - restoreQuantity);
    }
    if (remaining > 0.0005)
      throw new BadRequestException(
        'Ishlab chiqarish sarfini qaytarishda nomuvofiqlik aniqlandi',
      );
  }

  private async requireWarehouse(tenantId: string, warehouseId: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, tenantId },
    });
    if (!warehouse) throw new NotFoundException('Ombor topilmadi');
    return warehouse;
  }

  private async requireTenantUser(tenantId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Mas’ul xodim topilmadi');
  }

  private requireStatus(
    actual: ManufacturingStatus,
    expected: ManufacturingStatus,
  ) {
    if (actual !== expected) {
      throw new BadRequestException(`Hujjat holati ${expected} bo‘lishi kerak`);
    }
  }

  private async logStatusChange(
    tenantId: string,
    userId: string,
    id: string,
    oldStatus: ManufacturingStatus,
    newStatus: ManufacturingStatus,
  ) {
    await this.auditService.logAction({
      tenantId,
      userId,
      entityType: 'ProductionDocument',
      entityId: id,
      action: 'UPDATE',
      oldValue: { status: oldStatus },
      newValue: { status: newStatus },
    });
  }
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
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
