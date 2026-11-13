/**
 * Integration test (real Postgres, DATABASE_URL_TEST). Plan Task 4: a draft
 * sales invoice is edited in one transaction under a row lock, and a posted
 * one is refused, with the lock query running against the real table.
 */
import { useTestDatabase } from '../../../../test/use-test-database';
useTestDatabase();

import { randomUUID } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SalesDocStatus } from '@prisma/client';
import { PrismaService } from '../../../common/prisma';
import { AccountsService } from '../../accounting/accounts/accounts.service';
import { JournalService } from '../../accounting/journal/journal.service';
import { CounterpartySettlementService } from '../../settlements/counterparty-settlement.service';
import { SalesInvoicesService } from './sales-invoices.service';

describe('Sales invoice draft edit (integration)', () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let invoices: SalesInvoicesService;
  let tenantId: string;
  let counterpartyId: string;
  let warehouseId: string;
  let productId: string;
  let userId: string;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        PrismaService,
        AccountsService,
        JournalService,
        SalesInvoicesService,
        CounterpartySettlementService,
      ],
    }).compile();
    prisma = module.get(PrismaService);
    invoices = module.get(SalesInvoicesService);

    const runId = randomUUID().slice(0, 8);
    tenantId = (
      await prisma.company.create({
        data: {
          name: { uz: 'Draft ' + runId, ru: 'Draft ' + runId },
          slug: 'draft-edit-' + runId,
        },
      })
    ).id;
    warehouseId = (
      await prisma.warehouse.create({
        data: { tenantId, name: { uz: 'Ombor', ru: 'Склад' } },
      })
    ).id;
    counterpartyId = (
      await prisma.counterparty.create({
        data: { tenantId, name: 'Mijoz', type: 'CUSTOMER' },
      })
    ).id;
    productId = (
      await prisma.product.create({
        data: {
          tenantId,
          name: { uz: 'Tovar', ru: 'Товар' },
          sku: 'DE-' + runId,
        },
      })
    ).id;
    userId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: 'draft-edit-' + runId + '@sklad.test',
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
    await module.close();
  });

  const createDraft = () =>
    invoices.createInvoice(tenantId, userId, {
      counterpartyId,
      warehouseId,
      currency: 'UZS',
      items: [{ productId, quantity: 1, unitPrice: 100 }],
    });
  const edit = (id: string) =>
    invoices.updateInvoice(tenantId, userId, id, {
      counterpartyId,
      warehouseId,
      currency: 'UZS',
      items: [
        { productId, quantity: 2, unitPrice: 100, discount: 10, vatRate: 12 },
      ],
    });

  it('replaces the lines and totals of a draft, keeping its number', async () => {
    const draft = await createDraft();

    const edited = await edit(draft.id);

    expect(edited.invoiceNumber).toBe(draft.invoiceNumber);
    expect(Number(edited.totalAmount)).toBe(201.6);
    const lines = await prisma.salesInvoiceItem.findMany({
      where: { invoiceId: draft.id },
    });
    expect(lines).toHaveLength(1);
    expect(Number(lines[0].vatAmount)).toBe(21.6);
    expect(await prisma.journalEntry.count({ where: { tenantId } })).toBe(0);
  });

  it('refuses to edit a posted invoice and leaves its lines alone', async () => {
    const draft = await createDraft();
    await prisma.salesInvoice.update({
      where: { id: draft.id },
      data: { status: SalesDocStatus.POSTED },
    });

    await expect(edit(draft.id)).rejects.toThrow(BadRequestException);

    const lines = await prisma.salesInvoiceItem.findMany({
      where: { invoiceId: draft.id },
    });
    expect(lines.map((l) => Number(l.quantity))).toEqual([1]);
  });
});
