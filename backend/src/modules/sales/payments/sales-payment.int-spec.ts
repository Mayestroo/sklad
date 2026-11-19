/**
 * Integration test (real Postgres, DATABASE_URL_TEST): a payment on a posted
 * USD sales invoice into the USD cash till, with the database triggers that
 * guard payments and finance transactions. Reproduces the "Ichki server
 * xatosi" seen when paying INV-2026-0001 (58.24 USD at 12,000).
 */
import { useTestDatabase } from '../../../../test/use-test-database';
useTestDatabase();

import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../common/prisma';
import { AccountsService } from '../../accounting/accounts/accounts.service';
import { JournalService } from '../../accounting/journal/journal.service';
import { CounterpartySettlementService } from '../../settlements/counterparty-settlement.service';
import { SettlementAllocationService } from '../../settlements/settlement-allocation.service';
import { AuditService } from '../../audit/audit.service';
import { SalesOrdersService } from '../orders/sales-orders.service';
import { SalesInvoicesService } from '../invoices/sales-invoices.service';
import { PaymentsService } from './payments.service';
import { createFifoBatch } from '../../inventory/fifo/fifo-batches';

jest.setTimeout(60000);

describe('Sales invoice payment (integration)', () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let invoices: SalesInvoicesService;
  let payments: PaymentsService;
  let tenantId: string;
  let counterpartyId: string;
  let warehouseId: string;
  let productId: string;
  let userId: string;
  let usdCashId: string;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        PrismaService,
        AccountsService,
        JournalService,
        SalesInvoicesService,
        CounterpartySettlementService,
        SettlementAllocationService,
        PaymentsService,
        { provide: AuditService, useValue: { logAction: jest.fn() } },
        { provide: SalesOrdersService, useValue: {} },
      ],
    }).compile();
    prisma = module.get(PrismaService);
    invoices = module.get(SalesInvoicesService);
    payments = module.get(PaymentsService);

    const runId = randomUUID().slice(0, 8);
    tenantId = (
      await prisma.company.create({
        data: {
          name: { uz: 'Pay ' + runId, ru: 'Pay ' + runId },
          slug: 'pay-' + runId,
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
        data: { tenantId, name: 'jones', type: 'CUSTOMER' },
      })
    ).id;
    productId = (
      await prisma.product.create({
        data: {
          tenantId,
          name: { uz: 'Macbook', ru: 'Macbook' },
          sku: 'PAY-' + runId,
        },
      })
    ).id;
    userId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: 'pay-' + runId + '@sklad.test',
          passwordHash: 'hashed',
          firstName: 'Test',
          lastName: 'User',
        },
      })
    ).id;
    usdCashId = (
      await prisma.cashAccount.create({
        data: {
          tenantId,
          name: { uz: 'Dollar kassa (USD)', ru: 'Долларовая касса (USD)' },
          accountType: 'USD_CASH',
          currency: 'USD',
          balance: 9910,
        },
      })
    ).id;
    await prisma.stockLevel.create({
      data: { tenantId, warehouseId, productId, quantity: 5 },
    });
    await createFifoBatch(prisma, {
      tenantId,
      warehouseId,
      productId,
      quantity: 5,
      unitCost: 300000,
      batchNumber: 'B-' + runId,
    });
  });

  afterAll(async () => {
    await prisma.company.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
    await module.close();
  });

  it('accepts the full payment of a posted USD invoice into the USD till', async () => {
    const draft = await invoices.createInvoice(tenantId, userId, {
      counterpartyId,
      warehouseId,
      currency: 'USD',
      exchangeRate: 12000,
      items: [{ productId, quantity: 1, unitPrice: 52, vatRate: 12 }],
    });
    await invoices.postInvoice(tenantId, userId, draft.id);
    const posted = await prisma.salesInvoice.findFirstOrThrow({
      where: { id: draft.id },
    });
    expect(Number(posted.totalAmount)).toBe(58.24);

    const payment = await payments.registerPayment(
      tenantId,
      {
        counterpartyId,
        invoiceId: draft.id,
        currency: 'USD',
        exchangeRate: 12000,
        cashAccountId: usdCashId,
        method: 'CASH',
        amount: 58.24,
      },
      userId,
    );

    expect(payment.paymentNumber).toBeTruthy();
    const paid = await prisma.salesInvoice.findFirstOrThrow({
      where: { id: draft.id },
    });
    expect(paid.paymentStatus).toBe('PAID');
    const till = await prisma.cashAccount.findFirstOrThrow({
      where: { id: usdCashId },
    });
    expect(Number(till.balance)).toBe(9968.24);
  });
});
