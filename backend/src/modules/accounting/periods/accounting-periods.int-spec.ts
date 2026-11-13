/**
 * Integration test (real Postgres, `npm run test:integration` with
 * DATABASE_URL_TEST). D4 accounting period closing, and A1: cancelling a
 * posted sales return dated in a closed period is rejected.
 */
import { useTestDatabase } from '../../../../test/use-test-database';
useTestDatabase();

import { randomUUID } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../common/prisma';
import { AccountsService } from '../accounts/accounts.service';
import { JournalService } from '../journal/journal.service';
import { AccountingPeriodsService } from './accounting-periods.service';
import { AuditService } from '../../audit/audit.service';
import { InventoryDocumentsService } from '../../inventory/documents/inventory-documents.service';
import { SalesInvoicesService } from '../../sales/invoices/sales-invoices.service';
import { CounterpartySettlementService } from '../../settlements/counterparty-settlement.service';
import { SalesReturnDocStatus } from '@prisma/client';

describe('Accounting period closing (integration)', () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let journal: JournalService;
  let periods: AccountingPeriodsService;
  let tenantId: string;
  let userId: string;
  let debitAccountId: string;
  let creditAccountId: string;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        PrismaService,
        AccountsService,
        JournalService,
        AccountingPeriodsService,
        AuditService,
        InventoryDocumentsService,
        SalesInvoicesService,
        CounterpartySettlementService,
      ],
    }).compile();
    prisma = module.get(PrismaService);
    journal = module.get(JournalService);
    periods = module.get(AccountingPeriodsService);

    const runId = randomUUID().slice(0, 8);
    tenantId = (
      await prisma.company.create({
        data: {
          name: { uz: 'Period ' + runId, ru: 'Period ' + runId },
          slug: 'period-test-' + runId,
        },
      })
    ).id;
    const accounts = module.get(AccountsService);
    await accounts.ensureDefaultAccounts(tenantId);
    debitAccountId = (await accounts.findByCode(tenantId, '5010'))!.id;
    creditAccountId = (await accounts.findByCode(tenantId, '9010'))!.id;
    userId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: `period-${runId}@sklad.test`,
          passwordHash: 'hashed',
          firstName: 'Test',
          lastName: 'User',
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.company.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  const manualEntry = (date: string, sourceDocId: string) =>
    journal.createManualEntry(tenantId, {
      description: 'period test ' + sourceDocId,
      sourceDocType: 'PeriodTest',
      sourceDocId,
      entryDate: new Date(date),
      lines: [{ debitAccountId, creditAccountId, amount: 1000 }],
    });

  const deleteEntries = (sourceDocId: string) =>
    prisma.$transaction((tx) =>
      journal.deleteEntriesForSource(
        tx,
        tenantId,
        'PeriodTest',
        sourceDocId,
        'unpost',
      ),
    );

  it('post, close, post again rejected, reopen, post works', async () => {
    await expect(manualEntry('2025-03-10', 'a')).resolves.toBeDefined();

    await periods.close(tenantId, userId, { year: 2025, month: 3 });

    // creating an entry dated in the closed month is rejected
    const error = await manualEntry('2025-03-20', 'b').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toContain('2025-03');
    // so is removing one (the unpost path)
    await expect(deleteEntries('a')).rejects.toThrow('2025-03');
    // the neighbouring months are unaffected
    await expect(manualEntry('2025-04-01', 'c')).resolves.toBeDefined();
    await expect(manualEntry('2025-02-28', 'd')).resolves.toBeDefined();

    expect(
      await prisma.journalEntry.count({
        where: { tenantId, sourceDocType: 'PeriodTest', sourceDocId: 'b' },
      }),
    ).toBe(0);

    await periods.reopen(tenantId, userId, { year: 2025, month: 3 });

    await expect(manualEntry('2025-03-20', 'b')).resolves.toBeDefined();
    await expect(deleteEntries('a')).resolves.toBeUndefined();

    const audit = await prisma.auditLog.findMany({
      where: { tenantId, entityType: 'AccountingPeriod' },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.map((a) => (a.newValue as { event: string }).event)).toEqual([
      'PERIOD_CLOSED',
      'PERIOD_REOPENED',
    ]);
    expect(audit.every((a) => a.userId === userId)).toBe(true);
  });

  it('lists the twelve months with their status', async () => {
    await periods.close(tenantId, userId, { year: 2024, month: 6 });
    const list = await periods.list(tenantId, 2024);
    expect(list).toHaveLength(12);
    expect(
      list.filter((p) => p.status === 'CLOSED').map((p) => p.month),
    ).toEqual([6]);
  });

  it('refuses to close an unfinished month, to close twice, or to reopen an open month', async () => {
    const now = new Date();
    await expect(
      periods.close(tenantId, userId, {
        year: now.getUTCFullYear(),
        month: now.getUTCMonth() + 1,
      }),
    ).rejects.toThrow(BadRequestException);

    await periods.close(tenantId, userId, { year: 2024, month: 1 });
    await expect(
      periods.close(tenantId, userId, { year: 2024, month: 1 }),
    ).rejects.toThrow('allaqachon yopilgan');
    await expect(
      periods.reopen(tenantId, userId, { year: 2024, month: 2 }),
    ).rejects.toThrow('yopilmagan');
  });

  it('a closed period of one tenant does not affect another tenant', async () => {
    const other = await prisma.company.create({
      data: {
        name: { uz: 'Other', ru: 'Other' },
        slug: 'period-other-' + randomUUID().slice(0, 8),
      },
    });
    try {
      await periods.close(other.id, userId, { year: 2025, month: 5 });
      await expect(manualEntry('2025-05-10', 'e')).resolves.toBeDefined();
    } finally {
      await prisma.company.delete({ where: { id: other.id } });
    }
  });

  it('A1: cancelling a posted sales return dated in a closed period is rejected', async () => {
    const sales = module.get(SalesInvoicesService);
    const warehouseId = (
      await prisma.warehouse.create({
        data: { tenantId, name: { uz: 'Ombor', ru: 'Склад' } },
      })
    ).id;
    const counterpartyId = (
      await prisma.counterparty.create({
        data: { tenantId, name: 'Mijoz', type: 'CUSTOMER' },
      })
    ).id;
    const productId = (
      await prisma.product.create({
        data: {
          tenantId,
          name: { uz: 'Tovar', ru: 'Товар' },
          sku: 'A1-' + randomUUID().slice(0, 8),
        },
      })
    ).id;
    await module.get(InventoryDocumentsService).createAndPostDocument(
      tenantId,
      {
        warehouseId,
        docType: 'INBOUND',
        items: [{ productId, quantity: 10, unitPrice: 5000 }],
      },
      userId,
    );

    const invoice = await sales.createInvoice(tenantId, userId, {
      counterpartyId,
      warehouseId,
      invoiceDate: '2025-08-10',
      currency: 'UZS',
      items: [{ productId, quantity: 4, unitPrice: 8000 }],
    });
    await sales.postInvoice(tenantId, userId, invoice.id);

    const salesReturn = await sales.createReturn(tenantId, userId, {
      invoiceId: invoice.id,
      counterpartyId,
      warehouseId,
      returnDate: '2025-08-20',
      currency: 'UZS',
      items: [{ productId, quantity: 1, unitPrice: 8000 }],
    });
    // createReturn posts unless asked for a draft
    if (salesReturn.status === SalesReturnDocStatus.DRAFT) {
      await sales.confirmReturn(tenantId, userId, salesReturn.id);
    }
    expect(
      (
        await prisma.salesReturn.findFirst({
          where: { tenantId, id: salesReturn.id },
        })
      )?.status,
    ).toBe(SalesReturnDocStatus.POSTED);

    const stockBefore = await prisma.stockLevel.findFirst({
      where: { tenantId, warehouseId, productId },
    });

    await periods.close(tenantId, userId, { year: 2025, month: 8 });

    await expect(
      sales.cancelReturn(tenantId, userId, salesReturn.id),
    ).rejects.toThrow('2025-08');

    // nothing changed: still posted, same stock, the journal untouched
    const after = await prisma.salesReturn.findFirst({
      where: { tenantId, id: salesReturn.id },
    });
    expect(after?.status).toBe(SalesReturnDocStatus.POSTED);
    const stockAfter = await prisma.stockLevel.findFirst({
      where: { tenantId, warehouseId, productId },
    });
    expect(Number(stockAfter?.quantity)).toBe(Number(stockBefore?.quantity));

    // unposting the invoice of the closed month is rejected too
    await expect(
      sales.unpostInvoice(tenantId, userId, invoice.id),
    ).rejects.toThrow(BadRequestException);

    await periods.reopen(tenantId, userId, { year: 2025, month: 8 });
    await sales.cancelReturn(tenantId, userId, salesReturn.id);
    const cancelled = await prisma.salesReturn.findFirst({
      where: { tenantId, id: salesReturn.id },
    });
    expect(cancelled?.status).toBe(SalesReturnDocStatus.CANCELLED);
  });
});
