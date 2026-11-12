/**
 * Integration test: runs against a REAL Postgres database, so it only runs via
 * `npm run test:integration` with DATABASE_URL_TEST pointing at a disposable
 * test database. Data is written under a fresh tenant per run.
 *
 * Purchase returns (ADR 0009): goods leave 2910 at landed cost in UZS, the
 * supplier payable falls by the base price in the document currency, and a
 * receipt-linked return reverses at the receipt's exchange rate.
 */
import { useTestDatabase } from '../../../test/use-test-database';
useTestDatabase();

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { AccountsService } from '../accounting/accounts/accounts.service';
import { PrismaService } from '../../common/prisma';
import { CounterpartySettlementService } from '../settlements/counterparty-settlement.service';
import { SettlementAllocationService } from '../settlements/settlement-allocation.service';
import { JournalService } from '../accounting/journal/journal.service';

describe('Purchase return posting (integration)', () => {
  let purchases: PurchasesService;
  let prisma: PrismaService;
  let tenantId: string;
  let userId: string;
  let warehouseId: string;
  let supplierId: string;

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
    const company = await prisma.company.create({
      data: {
        name: { uz: 'Return Test ' + runId, ru: 'Return Test ' + runId },
        slug: 'purchase-return-test-' + runId,
      },
    });
    tenantId = company.id;
    await module.get(AccountsService).ensureDefaultAccounts(tenantId);

    userId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: `return-${runId}@sklad.test`,
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
        data: { tenantId, name: 'Return Supplier', type: 'SUPPLIER' },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const newProduct = async (sku: string) =>
    (
      await prisma.product.create({
        data: {
          tenantId,
          name: { uz: sku, ru: sku },
          sku: `${sku}-${Date.now()}`,
          // Deliberately unlike the receipt price: costs must come from batches.
          costPrice: 1,
          salePrice: 1,
        },
      })
    ).id;

  const supplierDebt = async (currency: string) =>
    Number(
      (
        await prisma.counterpartyBalance.findUnique({
          where: {
            counterpartyId_currency: { counterpartyId: supplierId, currency },
          },
        })
      )?.supplierDebt ?? 0,
    );

  const stockOf = async (productId: string) =>
    Number(
      (
        await prisma.stockLevel.findUnique({
          where: {
            tenantId_warehouseId_productId: {
              tenantId,
              warehouseId,
              productId,
            },
          },
        })
      )?.quantity ?? 0,
    );

  const returnJournal = async (returnId: string) => {
    const entry = await prisma.journalEntry.findFirst({
      where: {
        tenantId,
        sourceDocType: 'PurchaseReturn',
        sourceDocId: returnId,
      },
      include: {
        lines: { include: { debitAccount: true, creditAccount: true } },
      },
    });
    expect(entry).not.toBeNull();
    return entry!.lines.map((l) => ({
      dt: l.debitAccount.code,
      kt: l.creditAccount.code,
      amount: Number(l.amount),
    }));
  };

  const postedReceipt = async (
    productId: string,
    currency: 'UZS' | 'USD',
    unitPrice: number,
    exchangeRate?: number,
  ) => {
    const receipt = await purchases.createReceipt(tenantId, userId, {
      counterpartyId: supplierId,
      warehouseId,
      currency,
      ...(exchangeRate ? { exchangeRate } : {}),
      docDate: new Date().toISOString(),
      items: [{ productId, quantity: 10, unitPrice, discount: 0, vatRate: 0 }],
    });
    await purchases.postReceipt(tenantId, userId, receipt.id);
    return receipt;
  };

  it('UZS: takes goods out at landed cost and reduces the UZS payable', async () => {
    const productId = await newProduct('RET-UZS');
    const receipt = await postedReceipt(productId, 'UZS', 100000);
    const debtBefore = await supplierDebt('UZS');

    const pReturn = await purchases.createReturn(tenantId, userId, {
      receiptId: receipt.id,
      counterpartyId: supplierId,
      warehouseId,
      currency: 'UZS',
      items: [{ productId, quantity: 4, unitPrice: 100000 }],
    });

    expect(Number(pReturn.exchangeRate)).toBe(1);
    expect(await stockOf(productId)).toBe(6);
    const batch = await prisma.productBatch.findFirst({
      where: { tenantId, receiptId: receipt.id },
    });
    expect(Number(batch?.remainingQty)).toBe(6);
    expect(await supplierDebt('UZS')).toBe(debtBefore - 400000);
    expect(await returnJournal(pReturn.id)).toEqual([
      { dt: '6010', kt: '2910', amount: 400000 },
    ]);
  });

  it("USD: reverses at the receipt's rate, payable in USD, journal in UZS", async () => {
    const productId = await newProduct('RET-USD');
    const receipt = await postedReceipt(productId, 'USD', 10, 12600);
    const usdDebtBefore = await supplierDebt('USD');
    const uzsDebtBefore = await supplierDebt('UZS');

    // A rate other than the receipt's is refused for a linked return.
    await expect(
      purchases.createReturn(tenantId, userId, {
        receiptId: receipt.id,
        counterpartyId: supplierId,
        warehouseId,
        currency: 'USD',
        exchangeRate: 13000,
        items: [{ productId, quantity: 2, unitPrice: 10 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // Without a rate it takes the receipt's.
    const pReturn = await purchases.createReturn(tenantId, userId, {
      receiptId: receipt.id,
      counterpartyId: supplierId,
      warehouseId,
      currency: 'USD',
      items: [{ productId, quantity: 2, unitPrice: 10 }],
    });

    expect(Number(pReturn.exchangeRate)).toBe(12600);
    const stored = await prisma.purchaseReturn.findFirst({
      where: { id: pReturn.id, tenantId },
    });
    expect(Number(stored?.exchangeRate)).toBe(12600);
    expect(await stockOf(productId)).toBe(8);
    // Payable falls by 2 x 10 USD in USD; the UZS balance is untouched.
    expect(await supplierDebt('USD')).toBe(usdDebtBefore - 20);
    expect(await supplierDebt('UZS')).toBe(uzsDebtBefore);
    // 2 units x 10 USD x 12,600 = 252,000 UZS, not 20 "sum".
    expect(await returnJournal(pReturn.id)).toEqual([
      { dt: '6010', kt: '2910', amount: 252000 },
    ]);
  });
});
