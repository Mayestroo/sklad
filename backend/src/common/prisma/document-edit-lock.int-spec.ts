/**
 * Integration test (real Postgres, DATABASE_URL_TEST). F9 step 5: the draft
 * edits of purchase receipts, additional expenses, service acts and opening
 * balances were already one transaction, but they checked the status before
 * it, without a lock. A post that commits between that check and the write
 * had its lines replaced. Each edit now locks the document row inside the
 * transaction and re-checks the status there (as the T4 draft-invoice edit).
 *
 * The race is reproduced by posting the document just before the edit's
 * transaction starts (after its status check has passed).
 */
import { useTestDatabase } from '../../../test/use-test-database';
useTestDatabase();

import { randomUUID } from 'crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  OpeningBalanceStatus,
  PurchaseDocStatus,
  ServiceActStatus,
} from '@prisma/client';
import { PrismaService } from './prisma.service';
import { AccountsService } from '../../modules/accounting/accounts/accounts.service';
import { JournalService } from '../../modules/accounting/journal/journal.service';
import { CounterpartySettlementService } from '../../modules/settlements/counterparty-settlement.service';
import { SettlementAllocationService } from '../../modules/settlements/settlement-allocation.service';
import { PurchasesService } from '../../modules/purchases/purchases.service';
import { AdditionalExpensesService } from '../../modules/purchases/additional-expenses.service';
import { ServicesService } from '../../modules/services/services.service';
import { OpeningBalancesService } from '../../modules/opening-balances/opening-balances.service';
import { lockDocumentStatus } from './lock-document';

describe('Draft document edits lock the row and re-check the status (F9)', () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let purchases: PurchasesService;
  let expenses: AdditionalExpensesService;
  let services: ServicesService;
  let openingBalances: OpeningBalancesService;
  let tenantId: string;
  let otherTenantId: string;
  let userId: string;
  let warehouseId: string;
  let supplierId: string;
  let productId: string;
  let runId: string;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        PrismaService,
        AccountsService,
        JournalService,
        CounterpartySettlementService,
        SettlementAllocationService,
        PurchasesService,
        AdditionalExpensesService,
        ServicesService,
        OpeningBalancesService,
      ],
    }).compile();
    prisma = module.get(PrismaService);
    purchases = module.get(PurchasesService);
    expenses = module.get(AdditionalExpensesService);
    services = module.get(ServicesService);
    openingBalances = module.get(OpeningBalancesService);

    runId = randomUUID().slice(0, 8);
    const company = (slug: string) =>
      prisma.company.create({
        data: { name: { uz: slug, ru: slug }, slug: `${slug}-${runId}` },
      });
    tenantId = (await company('edit-lock')).id;
    otherTenantId = (await company('edit-lock-other')).id;
    await module.get(AccountsService).ensureDefaultAccounts(tenantId);
    userId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: `edit-lock-${runId}@sklad.test`,
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
    productId = (
      await prisma.product.create({
        data: {
          tenantId,
          name: { uz: 'Tovar', ru: 'Товар' },
          sku: 'EL-' + runId,
        },
      })
    ).id;
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await prisma.company.delete({ where: { id: tenantId } });
    await prisma.company.delete({ where: { id: otherTenantId } });
    await prisma.$disconnect();
    await module.close();
  });

  /** Commits `post` right before the next interactive transaction starts. */
  function postJustBeforeTheTransaction(post: () => Promise<unknown>) {
    const original = prisma.$transaction.bind(prisma) as (
      ...args: unknown[]
    ) => Promise<unknown>;
    jest
      .spyOn(prisma, '$transaction')
      .mockImplementationOnce(async (...args: unknown[]) => {
        await post();
        return original(...args);
      });
  }

  const draftReceipt = () =>
    purchases.createReceipt(tenantId, userId, {
      counterpartyId: supplierId,
      warehouseId,
      docDate: '2026-11-01',
      currency: 'UZS',
      items: [{ productId, quantity: 1, unitPrice: 100 }],
    });

  it('purchase receipt: a receipt posted meanwhile keeps its lines', async () => {
    const receipt = await draftReceipt();
    postJustBeforeTheTransaction(() =>
      prisma.purchaseReceipt.update({
        where: { id: receipt.id },
        data: { status: PurchaseDocStatus.POSTED },
      }),
    );

    await expect(
      purchases.updateReceipt(tenantId, receipt.id, {
        counterpartyId: supplierId,
        warehouseId,
        docDate: '2026-11-01',
        currency: 'UZS',
        items: [{ productId, quantity: 9, unitPrice: 100 }],
      }),
    ).rejects.toThrow(BadRequestException);

    const lines = await prisma.purchaseReceiptItem.findMany({
      where: { receiptId: receipt.id },
    });
    expect(lines.map((line) => Number(line.quantity))).toEqual([1]);
  });

  it('additional expense: an expense posted meanwhile is not changed', async () => {
    const receipt = await draftReceipt();
    const expense = await prisma.additionalExpense.create({
      data: {
        tenantId,
        docNumber: 'AE-' + runId,
        expenseType: 'TRANSPORT',
        counterpartyId: supplierId,
        receiptId: receipt.id,
        amount: 50,
        currency: 'UZS',
        comment: 'before',
      },
    });
    postJustBeforeTheTransaction(() =>
      prisma.additionalExpense.update({
        where: { id: expense.id },
        data: { status: PurchaseDocStatus.POSTED },
      }),
    );

    await expect(
      expenses.updateDraft(tenantId, userId, expense.id, {
        comment: 'after',
      }),
    ).rejects.toThrow(BadRequestException);

    const after = await prisma.additionalExpense.findUniqueOrThrow({
      where: { id: expense.id },
    });
    expect(after.comment).toBe('before');
  });

  it('service act: an act posted meanwhile is not changed', async () => {
    const act = await prisma.serviceAct.create({
      data: {
        tenantId,
        actNumber: 'SA-' + runId,
        type: 'PROVIDED',
        counterpartyId: supplierId,
        currency: 'UZS',
        notes: 'before',
      },
    });
    postJustBeforeTheTransaction(() =>
      prisma.serviceAct.update({
        where: { id: act.id },
        data: { status: ServiceActStatus.POSTED },
      }),
    );

    await expect(
      services.update(tenantId, act.id, { notes: 'after' }),
    ).rejects.toThrow(BadRequestException);

    const after = await prisma.serviceAct.findUniqueOrThrow({
      where: { id: act.id },
    });
    expect(after.notes).toBe('before');
  });

  it('opening balance: a document posted meanwhile keeps its lines', async () => {
    const doc = await prisma.openingBalanceDocument.create({
      data: {
        tenantId,
        docNumber: 'OB-' + runId,
        openingDate: new Date('2026-01-01'),
        lines: {
          create: [
            {
              tenantId,
              category: 'EQUITY',
              amount: 10,
              currency: 'UZS',
              exchangeRate: 1,
            },
          ],
        },
      },
    });
    postJustBeforeTheTransaction(() =>
      prisma.openingBalanceDocument.update({
        where: { id: doc.id },
        data: { status: OpeningBalanceStatus.POSTED },
      }),
    );

    await expect(
      openingBalances.updateLines(tenantId, doc.id, { lines: [] }),
    ).rejects.toThrow(BadRequestException);

    expect(
      await prisma.openingBalanceLine.count({ where: { documentId: doc.id } }),
    ).toBe(1);
  });

  describe('lockDocumentStatus', () => {
    it("returns the status, and null for another tenant's document", async () => {
      const receipt = await draftReceipt();
      await prisma.$transaction(async (tx) => {
        expect(
          await lockDocumentStatus(tx, 'purchaseReceipt', receipt.id, tenantId),
        ).toBe(PurchaseDocStatus.DRAFT);
        expect(
          await lockDocumentStatus(
            tx,
            'purchaseReceipt',
            receipt.id,
            otherTenantId,
          ),
        ).toBeNull();
      });
    });

    it('makes a second locker wait until the first transaction ends', async () => {
      const receipt = await draftReceipt();
      const events: string[] = [];
      let releaseFirst!: () => void;
      const firstHolds = new Promise<void>(
        (resolve) => (releaseFirst = resolve),
      );
      let firstLocked!: () => void;
      const lockedOnce = new Promise<void>(
        (resolve) => (firstLocked = resolve),
      );

      const first = prisma.$transaction(async (tx) => {
        await lockDocumentStatus(tx, 'purchaseReceipt', receipt.id, tenantId);
        events.push('first locked');
        firstLocked();
        await firstHolds;
        events.push('first done');
      });
      await lockedOnce;
      const second = prisma.$transaction(async (tx) => {
        await lockDocumentStatus(tx, 'purchaseReceipt', receipt.id, tenantId);
        events.push('second locked');
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      events.push('released');
      releaseFirst();
      await Promise.all([first, second]);

      expect(events).toEqual([
        'first locked',
        'released',
        'first done',
        'second locked',
      ]);
    });
  });

  it('an unknown document is still a 404 under the lock', async () => {
    await expect(
      purchases.updateReceipt(tenantId, randomUUID(), {
        counterpartyId: supplierId,
        warehouseId,
        docDate: '2026-11-01',
        currency: 'UZS',
        items: [{ productId, quantity: 1, unitPrice: 100 }],
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
