import { ManufacturingStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../common/prisma';
import { ProductionService } from './production.service';
import { JournalService } from '../accounting/journal/journal.service';

jest.mock('../../common/sequences/document-sequence');
jest.mock('../../common/accounting-period/period-lock');

/**
 * Unit rules of the production service (TZ "Ishlab chiqarish"); the full
 * stock / FIFO / storno flows run against a real database in
 * production.int-spec.ts.
 */
describe('ProductionService', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';
  const productionId = 'production-1';
  const rawMaterialId = 'raw-material-1';
  const warehouseId = 'warehouse-1';

  let prisma: Record<string, any>;
  let tx: Record<string, any>;
  let auditService: { logAction: jest.Mock };
  let service: ProductionService;

  beforeEach(() => {
    tx = {
      productionDocument: {
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      productionRecipe: {
        create: jest.fn().mockResolvedValue({ id: 'recipe-1' }),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      productionRecipeItem: { deleteMany: jest.fn() },
      stockLevel: { findUnique: jest.fn() },
      product: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      company: { findUnique: jest.fn().mockResolvedValue({ settings: {} }) },
    };
    prisma = {
      $transaction: jest.fn(
        (callback: (client: Prisma.TransactionClient) => unknown) =>
          callback(tx as unknown as Prisma.TransactionClient),
      ),
      productionDocument: { findFirst: jest.fn() },
      productionRecipe: { findFirst: jest.fn() },
    };
    auditService = { logAction: jest.fn().mockResolvedValue(undefined) };
    service = new ProductionService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
      {
        createJournalEntry: jest.fn(),
        deleteEntriesForSource: jest.fn(),
      } as unknown as JournalService,
    );
  });

  describe('recipe validation', () => {
    const dto = {
      productId: 'finished-1',
      outputQuantity: 10,
      materials: [{ productId: rawMaterialId, quantity: 250, unit: 'g' }],
    };
    const material = {
      id: rawMaterialId,
      name: { uz: 'Un', ru: 'Мука' },
      type: 'RAW_MATERIAL',
      isSemiFinished: false,
      unitOfMeasure: 'kg',
      units: [],
    };

    beforeEach(() => {
      tx.product.findFirst.mockResolvedValue({
        id: 'finished-1',
        type: 'FINISHED_PRODUCT',
      });
      tx.product.findMany.mockResolvedValue([material]);
    });

    it('stores the entry unit and its factor to the base unit', async () => {
      jest.spyOn(service, 'findRecipe').mockResolvedValue({} as never);
      await service.createRecipe(tenantId, userId, dto);
      expect(tx.productionRecipe.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            items: {
              create: [
                {
                  productId: rawMaterialId,
                  quantity: 250,
                  unit: 'g',
                  unitFactor: 0.001,
                  lossPercent: 0,
                },
              ],
            },
          }),
        }),
      );
    });

    it('a recipe is only for a «Tayyor mahsulot» (TZ 3, 9.1)', async () => {
      tx.product.findFirst.mockResolvedValue({
        id: 'finished-1',
        type: 'PRODUCT',
      });
      await expect(service.createRecipe(tenantId, userId, dto)).rejects.toThrow(
        /Tayyor mahsulot/,
      );
      expect(tx.productionRecipe.create).not.toHaveBeenCalled();
    });

    it('materials are raw materials or semi-finished products', async () => {
      tx.product.findMany.mockResolvedValue([{ ...material, type: 'PRODUCT' }]);
      await expect(service.createRecipe(tenantId, userId, dto)).rejects.toThrow(
        /yarim tayyor/,
      );
      tx.product.findMany.mockResolvedValue([
        { ...material, type: 'FINISHED_PRODUCT', isSemiFinished: true },
      ]);
      jest.spyOn(service, 'findRecipe').mockResolvedValue({} as never);
      await expect(
        service.createRecipe(tenantId, userId, dto),
      ).resolves.toBeDefined();
    });

    it('an unknown unit is refused', async () => {
      await expect(
        service.createRecipe(tenantId, userId, {
          ...dto,
          materials: [{ productId: rawMaterialId, quantity: 1, unit: 'qop' }],
        }),
      ).rejects.toThrow(/o‘lchov birligi/);
    });

    it('a duplicated material is refused', async () => {
      await expect(
        service.createRecipe(tenantId, userId, {
          ...dto,
          materials: [dto.materials[0], dto.materials[0]],
        }),
      ).rejects.toThrow(/takrorlanmasligi/);
    });

    it('M: a cycle is refused with the chain of names', async () => {
      tx.product.findFirst.mockResolvedValue({
        id: 'xamir',
        type: 'FINISHED_PRODUCT',
      });
      tx.product.findMany
        .mockResolvedValueOnce([
          {
            ...material,
            id: 'non',
            type: 'FINISHED_PRODUCT',
            isSemiFinished: true,
          },
        ])
        .mockResolvedValueOnce([
          { id: 'xamir', name: { uz: 'Xamir' } },
          { id: 'non', name: { uz: 'Non' } },
        ]);
      tx.productionRecipe.findMany.mockResolvedValue([
        { productId: 'non', items: [{ productId: 'xamir' }] },
      ]);
      await expect(
        service.createRecipe(tenantId, userId, {
          productId: 'xamir',
          outputQuantity: 1,
          materials: [{ productId: 'non', quantity: 1 }],
        }),
      ).rejects.toThrow(
        'Retseptura o‘ziga qaytib bog‘lanyapti: Xamir → Non → Xamir',
      );
    });

    it('answers in Russian when asked', async () => {
      tx.product.findFirst.mockResolvedValue({
        id: 'finished-1',
        type: 'PRODUCT',
      });
      await expect(
        service.createRecipe(tenantId, userId, dto, 'ru'),
      ).rejects.toThrow(/Готовый продукт/);
    });

    it('an archived recipe cannot be edited', async () => {
      prisma.productionRecipe.findFirst.mockResolvedValue({
        id: 'recipe-0',
        isArchived: true,
        items: [],
      });
      await expect(
        service.updateRecipe(tenantId, userId, 'recipe-0', dto),
      ).rejects.toThrow(/Arxivdagi/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('document lifecycle rules', () => {
    it('H: a shortage stops the start, lists the material and keeps the status', async () => {
      tx.productionDocument.findFirst.mockResolvedValue({
        id: productionId,
        tenantId,
        warehouseId,
        status: ManufacturingStatus.DRAFT,
        docDate: new Date(),
        materials: [
          {
            id: 'line-1',
            productId: rawMaterialId,
            unitOfMeasure: 'kg',
            plannedQuantity: new Prisma.Decimal(15),
            product: { name: { uz: 'Un' }, unitOfMeasure: 'kg' },
          },
        ],
      });
      tx.stockLevel.findUnique.mockResolvedValue({
        id: 'stock-1',
        quantity: new Prisma.Decimal(10),
        reservedQuantity: new Prisma.Decimal(0),
      });

      await expect(
        service.start(tenantId, userId, productionId),
      ).rejects.toThrow('Un: kerak 15 kg, mavjud 10 kg, yetishmaydi 5 kg');
      expect(tx.productionDocument.updateMany).not.toHaveBeenCalled();
    });

    it('a produced quantity of 0 gives a clear message, never a division by zero', async () => {
      await expect(
        service.complete(tenantId, userId, productionId, {
          producedQuantity: 0,
        }),
      ).rejects.toThrow(/0 dan katta/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('cancelling needs a reason', async () => {
      await expect(
        service.cancel(tenantId, userId, productionId, { reason: '  ' }),
      ).rejects.toThrow(/sababini/);
    });

    it('a completed document cannot be edited, only cancelled', async () => {
      prisma.productionDocument.findFirst.mockResolvedValue({
        id: productionId,
        status: ManufacturingStatus.COMPLETED,
        extraCosts: [],
      });
      await expect(
        service.updateDocument(tenantId, userId, productionId, { note: 'x' }),
      ).rejects.toThrow(/faqat bekor qilish/);
    });

    it('the end date cannot be before the start date', async () => {
      prisma.productionDocument.findFirst.mockResolvedValue({
        id: productionId,
        status: ManufacturingStatus.DRAFT,
        recipeId: 'recipe-1',
        plannedQuantity: new Prisma.Decimal(1),
        warehouseId,
        outputWarehouseId: null,
        docDate: new Date('2026-11-20'),
        plannedStartDate: null,
        plannedEndDate: null,
        extraCost: new Prisma.Decimal(0),
        extraCosts: [],
      });
      await expect(
        service.updateDocument(tenantId, userId, productionId, {
          plannedStartDate: '2026-11-20',
          plannedEndDate: '2026-11-19',
        }),
      ).rejects.toThrow(/Tugash sanasi/);
    });
  });
});
