/**
 * Integration test: runs against a REAL Postgres database via
 * `npm run test:integration` with DATABASE_URL_TEST pointing at a disposable
 * database. Data is written under a fresh tenant.
 *
 * TZ "Ishlab chiqarish" v1.3, section 12: scenarios A–N end to end —
 * purchase → recipe estimate → production (FIFO, loss, extra costs) →
 * finished goods batch → cancel (storno), plus semi-finished products and
 * the purchase / sales boundaries.
 */
import { useTestDatabase } from '../../../test/use-test-database';
useTestDatabase();

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ManufacturingStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma';
import { AccountsService } from '../accounting/accounts/accounts.service';
import { JournalService } from '../accounting/journal/journal.service';
import { CounterpartySettlementService } from '../settlements/counterparty-settlement.service';
import { SettlementAllocationService } from '../settlements/settlement-allocation.service';
import { PurchasesService } from '../purchases/purchases.service';
import { SalesInvoicesService } from '../sales/invoices/sales-invoices.service';
import { AuditService } from '../audit/audit.service';
import { ProductsService } from '../inventory/products/products.service';
import { ProductionService } from './production.service';

jest.setTimeout(180000);

describe('Production module (integration, TZ scenarios A–N)', () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let purchases: PurchasesService;
  let sales: SalesInvoicesService;
  let products: ProductsService;
  let production: ProductionService;
  let tenantId: string;
  let userId: string;
  let warehouseId: string;
  let supplierId: string;
  let customerId: string;
  let seq = 0;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        PrismaService,
        AccountsService,
        JournalService,
        CounterpartySettlementService,
        SettlementAllocationService,
        PurchasesService,
        SalesInvoicesService,
        AuditService,
        ProductsService,
        ProductionService,
      ],
    }).compile();
    prisma = module.get(PrismaService);
    purchases = module.get(PurchasesService);
    sales = module.get(SalesInvoicesService);
    products = module.get(ProductsService);
    production = module.get(ProductionService);

    const runId = Date.now().toString(36);
    tenantId = (
      await prisma.company.create({
        data: {
          name: { uz: 'Production ' + runId, ru: 'Production ' + runId },
          slug: 'production-' + runId,
        },
      })
    ).id;
    await module.get(AccountsService).ensureDefaultAccounts(tenantId);
    userId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: `production-${runId}@sklad.test`,
          passwordHash: 'hashed',
          firstName: 'Test',
          lastName: 'User',
        },
      })
    ).id;
    warehouseId = (
      await prisma.warehouse.create({
        data: { tenantId, name: { uz: 'Ombor', ru: 'Склад' } },
      })
    ).id;
    supplierId = (
      await prisma.counterparty.create({
        data: { tenantId, name: 'Supplier', type: 'SUPPLIER' },
      })
    ).id;
    customerId = (
      await prisma.counterparty.create({
        data: { tenantId, name: 'Customer', type: 'CUSTOMER' },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await module.close();
  });

  const name = (uz: string) => ({ uz, ru: uz });

  async function material(
    uz: string,
    unitOfMeasure: 'kg' | 'piece' | 'box' = 'kg',
    units?: Array<{ name: string; factor: number }>,
  ) {
    seq += 1;
    return products.create(tenantId, {
      name: name(uz),
      sku: `M-${seq}-${Date.now()}`,
      type: 'RAW_MATERIAL',
      unitOfMeasure,
      units,
    });
  }

  async function finished(
    uz: string,
    isSemiFinished = false,
    unitOfMeasure: 'kg' | 'piece' = 'piece',
  ) {
    seq += 1;
    return products.create(tenantId, {
      name: name(uz),
      sku: `F-${seq}-${Date.now()}`,
      type: 'FINISHED_PRODUCT',
      unitOfMeasure,
      isSemiFinished,
    });
  }

  async function buy(productId: string, quantity: number, unitPrice: number) {
    const receipt = await purchases.createReceipt(tenantId, userId, {
      counterpartyId: supplierId,
      warehouseId,
      currency: 'UZS',
      docDate: new Date().toISOString(),
      items: [{ productId, quantity, unitPrice, discount: 0, vatRate: 0 }],
    });
    await purchases.postReceipt(tenantId, userId, receipt.id);
    return receipt.id;
  }

  const stock = async (productId: string) =>
    Number(
      (
        await prisma.stockLevel.findFirst({
          where: { tenantId, warehouseId, productId },
        })
      )?.quantity ?? 0,
    );
  /** Journal lines of a production document as "Dt/Kt amount". */
  const journal = async (documentId: string) =>
    (
      await prisma.journalLine.findMany({
        where: {
          entry: {
            tenantId,
            sourceDocType: 'ProductionDocument',
            sourceDocId: documentId,
          },
        },
        include: { debitAccount: true, creditAccount: true },
      })
    )
      .map(
        (l) =>
          `${l.debitAccount.code}/${l.creditAccount.code} ${Number(l.amount)}`,
      )
      .sort();
  const card = (productId: string) =>
    prisma.product.findFirstOrThrow({ where: { tenantId, id: productId } });

  async function runDocument(
    recipeId: string,
    plannedQuantity: number,
    producedQuantity: number,
    extraCosts: Array<{
      costType: 'SALARY' | 'ENERGY' | 'DEPRECIATION' | 'OTHER';
      amount: number;
    }> = [],
  ) {
    const doc = await production.createDocument(tenantId, userId, {
      recipeId,
      plannedQuantity,
      warehouseId,
      extraCosts,
    });
    await production.start(tenantId, userId, doc.id);
    return production.complete(tenantId, userId, doc.id, { producedQuantity });
  }

  it('A + K: unit and price come from the card; the estimate becomes the actual FIFO cost', async () => {
    const un = await material('Un A');
    await buy(un.id, 100, 12_000);
    const non = await finished('Non A');

    const materials = await production.findMaterials(tenantId);
    const row = materials.find((m) => m.id === un.id)!;
    expect(row).toEqual(
      expect.objectContaining({
        unit_name: 'kg',
        unit_cost: 12_000,
        stock_qty: 100,
      }),
    );

    const recipe = await production.createRecipe(tenantId, userId, {
      productId: non.id,
      outputQuantity: 1,
      materials: [{ productId: un.id, quantity: 500, unit: 'g' }],
    });
    expect(recipe.estimate.lines[0].total).toBe(6000);
    expect(recipe.estimate.perUnit).toBe(6000);
    // K: the card shows the estimate first…
    expect(Number((await card(non.id)).costPrice)).toBe(6000);
    expect((await card(non.id)).costSource).toBe('RECIPE_ESTIMATE');

    // …and the actual FIFO cost after completion.
    const done = await runDocument(recipe.id, 4, 4);
    expect(done.status).toBe(ManufacturingStatus.COMPLETED);
    expect(Number(done.totalCost)).toBe(24_000);
    expect(Number(done.unitCost)).toBe(6000);
    const after = await card(non.id);
    expect(after.costSource).toBe('PRODUCTION_ACTUAL');
    expect(Number(after.costPrice)).toBe(6000);
    expect(await stock(un.id)).toBe(98);
    expect(await stock(non.id)).toBe(4);
  });

  it('B: FIFO takes the oldest batch first (50×12 000 + 10×14 000 = 740 000)', async () => {
    const un = await material('Un B');
    await buy(un.id, 50, 12_000);
    await buy(un.id, 50, 14_000);
    const product = await finished('Mahsulot B');
    const recipe = await production.createRecipe(tenantId, userId, {
      productId: product.id,
      outputQuantity: 1,
      materials: [{ productId: un.id, quantity: 60 }],
    });
    const done = await runDocument(recipe.id, 1, 1);
    expect(Number(done.actualMaterialCost)).toBe(740_000);
    expect(Number(done.unitCost)).toBe(740_000);
  });

  it('E: a 5% loss raises the consumption (200 g → 0.2105 kg, 2 105.26 UZS)', async () => {
    const shakar = await material('Shakar E');
    await buy(shakar.id, 10, 10_000);
    const product = await finished('Mahsulot E');
    const recipe = await production.createRecipe(tenantId, userId, {
      productId: product.id,
      outputQuantity: 1,
      materials: [
        { productId: shakar.id, quantity: 200, unit: 'g', lossPercent: 5 },
      ],
    });
    expect(recipe.estimate.lines[0].total).toBe(2105.26);
    const preview = await production.preview(
      tenantId,
      recipe.id,
      10,
      warehouseId,
    );
    expect(preview.materials[0].plannedQuantity).toBe(2.105);
  });

  it('F: a product unit converts to the base unit (3 dona of a 12-dona box = 36 000)', async () => {
    const yog = await material('Yog F', 'box', [
      { name: 'dona', factor: 1 / 12 },
    ]);
    await buy(yog.id, 2, 144_000);
    const product = await finished('Mahsulot F');
    const recipe = await production.createRecipe(tenantId, userId, {
      productId: product.id,
      outputQuantity: 1,
      materials: [{ productId: yog.id, quantity: 3, unit: 'dona' }],
    });
    expect(recipe.estimate.normTotal).toBe(36_000);
  });

  it('D: a material without a receipt can be saved; the cost is 0 and flagged', async () => {
    const yangi = await material('Narxsiz D');
    const product = await finished('Mahsulot D');
    const recipe = await production.createRecipe(tenantId, userId, {
      productId: product.id,
      outputQuantity: 1,
      materials: [{ productId: yangi.id, quantity: 1 }],
    });
    expect(recipe.estimate.normTotal).toBe(0);
    expect(recipe.estimate.missingPrice).toBe(true);
    const uncosted = await production.findRecipes(tenantId, {
      uncosted: 'true',
    });
    expect(uncosted.map((r) => r.id)).toContain(recipe.id);
  });

  it('G + N: extra costs are added and divided by the produced quantity', async () => {
    const un = await material('Un N');
    await buy(un.id, 10, 10_000);
    const product = await finished('Mahsulot N');
    const recipe = await production.createRecipe(tenantId, userId, {
      productId: product.id,
      outputQuantity: 10,
      materials: [{ productId: un.id, quantity: 10 }],
    });
    const done = await runDocument(recipe.id, 10, 10, [
      { costType: 'SALARY', amount: 50_000 },
      { costType: 'ENERGY', amount: 20_000 },
    ]);
    expect(Number(done.actualMaterialCost)).toBe(100_000);
    expect(Number(done.extraCost)).toBe(70_000);
    expect(Number(done.totalCost)).toBe(170_000);
    expect(Number(done.unitCost)).toBe(17_000);
    expect(Number(done.outputBatch!.landedCost)).toBe(17_000);
    // ADR 0026: Dt 2910 / Kt 1010 materials, Dt 2910 / Kt 6990 each extra cost.
    expect(await journal(done.id)).toEqual([
      '2910/1010 100000',
      '2910/6990 20000',
      '2910/6990 50000',
    ]);
  });

  it('H: a shortage blocks the start and keeps the draft untouched', async () => {
    const un = await material('Un H');
    await buy(un.id, 10, 1000);
    const product = await finished('Mahsulot H');
    const recipe = await production.createRecipe(tenantId, userId, {
      productId: product.id,
      outputQuantity: 1,
      materials: [{ productId: un.id, quantity: 15 }],
    });
    const doc = await production.createDocument(tenantId, userId, {
      recipeId: recipe.id,
      plannedQuantity: 1,
      warehouseId,
    });
    expect(doc.stockWarnings).toHaveLength(1);
    await expect(production.start(tenantId, userId, doc.id)).rejects.toThrow(
      /yetishmaydi 5 kg/,
    );
    const reloaded = await production.findDocument(tenantId, doc.id);
    expect(reloaded.status).toBe(ManufacturingStatus.DRAFT);
    expect(await stock(un.id)).toBe(10);
  });

  it('I + J: cancelling returns everything; a used receipt cannot be unposted', async () => {
    const un = await material('Un I');
    const receiptId = await buy(un.id, 20, 5000);
    const product = await finished('Mahsulot I');
    const recipe = await production.createRecipe(tenantId, userId, {
      productId: product.id,
      outputQuantity: 1,
      materials: [{ productId: un.id, quantity: 2 }],
    });
    const done = await runDocument(recipe.id, 3, 3);
    expect(await stock(un.id)).toBe(14);
    expect(await stock(product.id)).toBe(3);

    // J: the raw material from this receipt was used.
    await expect(
      purchases.unpostReceipt(tenantId, userId, receiptId),
    ).rejects.toThrow(/allaqachon ishlatilgan/);

    // A completed document cannot be edited, only cancelled.
    await expect(
      production.updateDocument(tenantId, userId, done.id, { note: 'x' }),
    ).rejects.toThrow(BadRequestException);

    const cancelled = await production.cancel(tenantId, userId, done.id, {
      reason: 'Xato kiritilgan',
    });
    expect(cancelled.status).toBe(ManufacturingStatus.CANCELLED);
    expect(cancelled.cancelReason).toBe('Xato kiritilgan');
    expect(cancelled.outputBatch).toBeNull();
    expect(await journal(done.id)).toEqual([]);
    expect(await stock(un.id)).toBe(20);
    expect(await stock(product.id)).toBe(0);
    const batch = await prisma.productBatch.findFirstOrThrow({
      where: { tenantId, receiptId },
    });
    expect(Number(batch.remainingQty)).toBe(20);
    // The card falls back to the recipe estimate.
    expect((await card(product.id)).costSource).toBe('RECIPE_ESTIMATE');
  });

  it('cancelling is refused once the finished goods were sold; they sell at the batch cost', async () => {
    const un = await material('Un S');
    await buy(un.id, 10, 3000);
    const product = await finished('Mahsulot S');
    const recipe = await production.createRecipe(tenantId, userId, {
      productId: product.id,
      outputQuantity: 1,
      materials: [{ productId: un.id, quantity: 1 }],
    });
    const done = await runDocument(recipe.id, 2, 2);
    const invoice = await sales.createInvoice(tenantId, userId, {
      counterpartyId: customerId,
      warehouseId,
      currency: 'UZS',
      items: [{ productId: product.id, quantity: 1, unitPrice: 9000 }],
    });
    await sales.postInvoice(tenantId, userId, invoice.id);
    const consumption = await prisma.batchConsumption.findFirstOrThrow({
      where: { batchId: done.outputBatch!.id },
    });
    expect(Number(consumption.unitCost)).toBe(3000);
    await expect(
      production.cancel(tenantId, userId, done.id, { reason: 'test' }),
    ).rejects.toThrow(/sotilgan yoki ishlatilgan/);
  });

  it('a finished product cannot be purchased (TZ 7)', async () => {
    const product = await finished('Mahsulot P');
    await expect(
      purchases.createReceipt(tenantId, userId, {
        counterpartyId: supplierId,
        warehouseId,
        currency: 'UZS',
        docDate: new Date().toISOString(),
        items: [
          {
            productId: product.id,
            quantity: 1,
            unitPrice: 1,
            discount: 0,
            vatRate: 0,
          },
        ],
      }),
    ).rejects.toThrow(/Tayyor mahsulot/);
  });

  it('L: a semi-finished product is made first, then consumed FIFO at its own cost', async () => {
    const un = await material('Un L');
    await buy(un.id, 100, 10_000);
    const xamir = await finished('Xamir L', true, 'kg');
    const non = await finished('Non L');
    const xamirRecipe = await production.createRecipe(tenantId, userId, {
      productId: xamir.id,
      outputQuantity: 1,
      materials: [{ productId: un.id, quantity: 0.5 }],
    });
    await runDocument(xamirRecipe.id, 20, 20); // 20 kg of xamir at 5 000 UZS/kg

    const options = await production.findMaterials(tenantId);
    expect(options.find((m) => m.id === xamir.id)?.isSemiFinished).toBe(true);

    const nonRecipe = await production.createRecipe(tenantId, userId, {
      productId: non.id,
      outputQuantity: 1,
      materials: [{ productId: xamir.id, quantity: 1 }],
    });
    expect(nonRecipe.estimate.perUnit).toBe(5000);
    const done = await runDocument(nonRecipe.id, 1, 1);
    expect(Number(done.unitCost)).toBe(5000);
    expect(await stock(xamir.id)).toBe(19);
    // The semi-finished value stays inside 2910: no entry for this document.
    expect(await journal(done.id)).toEqual([]);

    // M: Xamir → Non → Xamir is refused.
    await expect(
      production.updateRecipe(tenantId, userId, xamirRecipe.id, {
        productId: xamir.id,
        outputQuantity: 1,
        materials: [
          { productId: un.id, quantity: 0.5 },
          { productId: non.id, quantity: 1 },
        ],
      }),
    ).rejects.toThrow(/yarim tayyor|qaytib bog/);
  });

  it('M: the cycle message names the chain', async () => {
    const xamir = await finished('Xamir M', true);
    const non = await finished('Non M', true);
    const un = await material('Un M');
    const xamirRecipe = await production.createRecipe(tenantId, userId, {
      productId: xamir.id,
      outputQuantity: 1,
      materials: [{ productId: un.id, quantity: 1 }],
    });
    await production.createRecipe(tenantId, userId, {
      productId: non.id,
      outputQuantity: 1,
      materials: [{ productId: xamir.id, quantity: 1 }],
    });
    await expect(
      production.updateRecipe(tenantId, userId, xamirRecipe.id, {
        productId: xamir.id,
        outputQuantity: 1,
        materials: [{ productId: non.id, quantity: 1 }],
      }),
    ).rejects.toThrow(
      'Retseptura o‘ziga qaytib bog‘lanyapti: Xamir M → Non M → Xamir M',
    );
  });

  it('a new receipt price updates the card and the recipe estimate (TZ 7)', async () => {
    const un = await material('Un R');
    await buy(un.id, 10, 10_000);
    const product = await finished('Mahsulot R');
    await production.createRecipe(tenantId, userId, {
      productId: product.id,
      outputQuantity: 1,
      materials: [{ productId: un.id, quantity: 2 }],
    });
    expect(Number((await card(product.id)).costPrice)).toBe(20_000);
    await buy(un.id, 10, 11_000);
    expect(Number((await card(un.id)).costPrice)).toBe(11_000);
    expect(Number((await card(product.id)).costPrice)).toBe(22_000);

    // The average method (company setting) gives 10 500.
    await prisma.company.update({
      where: { id: tenantId },
      data: { settings: { production: { estimatedCostMethod: 'AVERAGE' } } },
    });
    await buy(un.id, 20, 10_500);
    expect(Number((await card(un.id)).costPrice)).toBe(10_500);
    expect(Number((await card(product.id)).costPrice)).toBe(21_000);
    await prisma.company.update({
      where: { id: tenantId },
      data: { settings: {} },
    });
  });

  it('a recipe used by a document is archived, never deleted; filters and stats work together', async () => {
    const un = await material('Un Z');
    await buy(un.id, 10, 1000);
    const product = await finished('Mahsulot Z');
    const recipe = await production.createRecipe(tenantId, userId, {
      productId: product.id,
      outputQuantity: 1,
      materials: [{ productId: un.id, quantity: 1 }],
    });
    const draft = await production.createDocument(tenantId, userId, {
      recipeId: recipe.id,
      plannedQuantity: 1,
      warehouseId,
    });
    await expect(
      production.deleteRecipe(tenantId, userId, recipe.id),
    ).rejects.toThrow(/arxivga/);
    const archived = await production.archiveRecipe(
      tenantId,
      userId,
      recipe.id,
    );
    expect(archived.isArchived).toBe(true);

    const list = await production.findDocuments(tenantId, {
      productId: product.id,
      status: 'DRAFT',
      warehouseId,
    });
    expect(list.items.map((d) => d.id)).toEqual([draft.id]);
    expect(list.total).toBe(1);
    expect(list.stats.draft).toBe(1);

    const sorted = await production.findDocuments(tenantId, {
      sortBy: 'product',
      sortDir: 'asc',
      pageSize: 2,
      page: 1,
    });
    expect(sorted.items).toHaveLength(2);
    expect(sorted.total).toBeGreaterThan(2);
  });

  it('old documents keep the unit they were created with', async () => {
    const un = await material('Un U');
    await buy(un.id, 10, 1000);
    const product = await finished('Mahsulot U');
    const recipe = await production.createRecipe(tenantId, userId, {
      productId: product.id,
      outputQuantity: 1,
      materials: [{ productId: un.id, quantity: 1 }],
    });
    const doc = await production.createDocument(tenantId, userId, {
      recipeId: recipe.id,
      plannedQuantity: 1,
      warehouseId,
    });
    await products.update(tenantId, un.id, { unitOfMeasure: 'piece' });
    const reloaded = await production.findDocument(tenantId, doc.id);
    expect(reloaded.materials[0].unitOfMeasure).toBe('kg');
    expect(reloaded.productUnit).toBe('piece');
  });
});
