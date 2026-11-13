/**
 * Integration test (real Postgres, `npm run test:integration` with
 * DATABASE_URL_TEST). muammolar.pdf B7: editing a draft USD purchase
 * receipt answered "Ichki server xatosi" (500).
 */
import { useTestDatabase } from '../../../test/use-test-database';
useTestDatabase();

import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PurchasesService } from './purchases.service';
import { AccountsService } from '../accounting/accounts/accounts.service';
import { PrismaService } from '../../common/prisma';
import { CounterpartySettlementService } from '../settlements/counterparty-settlement.service';
import { SettlementAllocationService } from '../settlements/settlement-allocation.service';
import { JournalService } from '../accounting/journal/journal.service';
import { CreatePurchaseReceiptDto } from './dto/create-purchase-receipt.dto';

describe('Editing a draft purchase receipt (integration)', () => {
  let purchases: PurchasesService;
  let prisma: PrismaService;
  let tenantId: string;
  let userId: string;
  let warehouseId: string;
  let supplierId: string;
  let productId: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JournalService,
        PrismaService,
        PurchasesService,
        CounterpartySettlementService,
        SettlementAllocationService,
        AccountsService,
      ],
    }).compile();
    purchases = module.get(PurchasesService);
    prisma = module.get(PrismaService);

    const runId = Date.now().toString(36);
    tenantId = (
      await prisma.company.create({
        data: {
          name: { uz: 'Edit ' + runId, ru: 'Edit ' + runId },
          slug: 'receipt-edit-test-' + runId,
        },
      })
    ).id;
    await module.get(AccountsService).ensureDefaultAccounts(tenantId);
    userId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: `edit-${runId}@sklad.test`,
          passwordHash: 'hashed',
          firstName: 'Test',
          lastName: 'User',
        },
      })
    ).id;
    warehouseId = (
      await prisma.warehouse.create({
        data: { tenantId, name: { uz: 'asosiy ombor', ru: 'Основной склад' } },
      })
    ).id;
    supplierId = (
      await prisma.counterparty.create({
        data: { tenantId, name: 'Javox-BRO LLC', type: 'SUPPLIER' },
      })
    ).id;
    productId = (
      await prisma.product.create({
        data: {
          tenantId,
          name: { uz: 'iPhone 15 Pro', ru: 'iPhone 15 Pro' },
          sku: `15-Pro-${runId}`,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** The body PurchaseDocumentForm sends, run through the global ValidationPipe rules. */
  const formBody = async (overrides: Record<string, unknown> = {}) => {
    const dto = plainToInstance(CreatePurchaseReceiptDto, {
      counterpartyId: supplierId,
      warehouseId,
      docDate: '2026-10-13',
      currency: 'USD',
      exchangeRate: 11900,
      contractNumber: '1',
      contractDate: '2026-10-12',
      items: [
        { productId, quantity: 1, unitPrice: 550, discount: 0, vatRate: 0 },
      ],
      ...overrides,
    });
    expect(await validate(dto, { whitelist: true })).toEqual([]);
    return dto;
  };

  it('saves changes to a draft USD receipt instead of failing with 500', async () => {
    const draft = await purchases.createReceipt(
      tenantId,
      userId,
      await formBody(),
    );

    const updated = await purchases.updateReceipt(
      tenantId,
      draft.id,
      await formBody({
        items: [
          { productId, quantity: 2, unitPrice: 550, discount: 0, vatRate: 0 },
        ],
      }),
    );

    expect(updated.status).toBe('DRAFT');
    expect(Number(updated.totalAmount)).toBe(1100);
    expect(updated.items).toHaveLength(1);
  });

  it('can post a draft after it was edited', async () => {
    const draft = await purchases.createReceipt(
      tenantId,
      userId,
      await formBody(),
    );
    await purchases.updateReceipt(tenantId, draft.id, await formBody());

    const posted = await purchases.postReceipt(tenantId, userId, draft.id);
    expect(posted.status).toBe('POSTED');
  });
});
