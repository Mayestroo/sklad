import { Test, TestingModule } from '@nestjs/testing';
import { PurchasesService } from './purchases.service';
import { AccountingReportsService } from '../accounting/reports/accounting-reports.service';
import { AccountsService } from '../accounting/accounts/accounts.service';
import { PrismaService } from '../../common/prisma';
import { PurchaseDocStatus, PurchasePaymentStatus } from '@prisma/client';

describe('Purchase Document End-to-End Invariant Test', () => {
  let purchasesService: PurchasesService;
  let reportsService: AccountingReportsService;
  let accountsService: AccountsService;
  let prisma: PrismaService;

  let tenantId: string;
  let userId: string;
  let warehouseId: string;
  let counterpartyId: string;
  let productId: string;
  let cashAccountId: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        PurchasesService,
        AccountingReportsService,
        AccountsService,
      ],
    }).compile();

    purchasesService = module.get<PurchasesService>(PurchasesService);
    reportsService = module.get<AccountingReportsService>(AccountingReportsService);
    accountsService = module.get<AccountsService>(AccountsService);
    prisma = module.get<PrismaService>(PrismaService);

    // 1. Get or create test tenant
    let company = await prisma.company.findFirst();
    if (!company) {
      company = await prisma.company.create({
        data: {
          name: 'Test Tenant Company',
          slug: 'test-tenant-company',
        },
      });
    }
    tenantId = company.id;

    // Ensure default COA accounts exist
    await accountsService.ensureDefaultAccounts(tenantId);

    // 2. Get or create test user
    let user = await prisma.user.findFirst({ where: { tenantId } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          tenantId,
          email: 'testuser@sklad.uz',
          passwordHash: 'hashed',
          firstName: 'Test',
          lastName: 'User',
        },
      });
    }
    userId = user.id;

    // 3. Get or create test warehouse
    let warehouse = await prisma.warehouse.findFirst({ where: { tenantId } });
    if (!warehouse) {
      warehouse = await prisma.warehouse.create({
        data: {
          tenantId,
          name: { uz: 'Test Ombor', ru: 'Тестовый склад' },
        },
      });
    }
    warehouseId = warehouse.id;

    // 4. Get or create test supplier counterparty
    let supplier = await prisma.counterparty.findFirst({
      where: { tenantId, type: 'SUPPLIER' },
    });
    if (!supplier) {
      supplier = await prisma.counterparty.create({
        data: {
          tenantId,
          name: 'Test Invariant Supplier',
          type: 'SUPPLIER',
          debtBalance: 0,
        },
      });
    }
    counterpartyId = supplier.id;

    // 5. Get or create test product
    let product = await prisma.product.findFirst({ where: { tenantId } });
    if (!product) {
      product = await prisma.product.create({
        data: {
          tenantId,
          name: { uz: 'iPhone 15 Pro', ru: 'iPhone 15 Pro' },
          sku: `IP15-${Date.now()}`,
          costPrice: 1000000,
          salePrice: 1300000,
        },
      });
    }
    productId = product.id;

    // 6. Get or create test cash account with sufficient funds
    let cashAccount = await prisma.cashAccount.findFirst({
      where: { tenantId, currency: 'UZS' },
    });
    if (!cashAccount) {
      cashAccount = await prisma.cashAccount.create({
        data: {
          tenantId,
          accountType: 'UZS_CASH',
          name: { uz: 'Naqd kassa UZS', ru: 'Наличная касса UZS' },
          currency: 'UZS',
          balance: 50000000,
        },
      });
    } else {
      // Top up balance if low
      if (Number(cashAccount.balance) < 20000000) {
        await prisma.cashAccount.update({
          where: { id: cashAccount.id },
          data: { balance: 50000000 },
        });
      }
    }
    cashAccountId = cashAccount.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should execute full purchase -> post -> pay -> report cycle with exact accounting invariants', async () => {
    // ─── INITIAL BASELINE SNAPSHOT ─────────────────────────────
    const initStock = await prisma.stockLevel.findUnique({
      where: {
        tenantId_warehouseId_productId: {
          tenantId,
          warehouseId,
          productId,
        },
      },
    });
    const initialQty = initStock ? Number(initStock.quantity) : 0;

    const initSupplier = await prisma.counterparty.findUnique({
      where: { id: counterpartyId },
    });
    const initialSupplierDebt = Number(initSupplier?.debtBalance || 0);

    const initCash = await prisma.cashAccount.findUnique({
      where: { id: cashAccountId },
    });
    const initialCashBalance = Number(initCash?.balance || 0);

    // ─── STEP 1: CREATE DRAFT PURCHASE RECEIPT ──────────────────
    // Product: iPhone, Qty: 10, Unit Price: 1,000,000, Subtotal: 10,000,000
    // VAT Rate: 12% -> VAT Amount: 1,200,000
    // Total Amount: 11,200,000
    const receipt = await purchasesService.createReceipt(tenantId, userId, {
      counterpartyId,
      warehouseId,
      currency: 'UZS',
      docDate: new Date().toISOString(),
      items: [
        {
          productId,
          quantity: 10,
          unitPrice: 1000000,
          discount: 0,
          vatRate: 12,
        },
      ],
    });

    expect(receipt).toBeDefined();
    expect(receipt.status).toBe(PurchaseDocStatus.DRAFT);
    expect(Number(receipt.subtotalAmount)).toBe(10000000);
    expect(Number(receipt.vatAmount)).toBe(1200000);
    expect(Number(receipt.totalAmount)).toBe(11200000);

    // ─── STEP 2: POST PURCHASE RECEIPT ─────────────────────────
    const postedReceipt = await purchasesService.postReceipt(
      tenantId,
      userId,
      receipt.id,
    );

    expect(postedReceipt.status).toBe(PurchaseDocStatus.POSTED);

    // INVARIANT CHECK 1: Stock Level +10
    const postedStock = await prisma.stockLevel.findUnique({
      where: {
        tenantId_warehouseId_productId: {
          tenantId,
          warehouseId,
          productId,
        },
      },
    });
    expect(Number(postedStock?.quantity)).toBe(initialQty + 10);

    // INVARIANT CHECK 2: Product Batch Created
    const batch = await prisma.productBatch.findFirst({
      where: { receiptId: receipt.id },
    });
    expect(batch).toBeDefined();
    expect(Number(batch?.remainingQty)).toBe(10);
    expect(Number(batch?.purchasePrice)).toBe(1000000);

    // INVARIANT CHECK 3: Supplier Debt Incremented by +11,200,000
    const postedSupplier = await prisma.counterparty.findUnique({
      where: { id: counterpartyId },
    });
    expect(Number(postedSupplier?.debtBalance)).toBe(
      initialSupplierDebt + 11200000,
    );

    // INVARIANT CHECK 4: Journal Entry & Lines Created (Dt 2910 = 10M, Dt 4410 = 1.2M, Kt 6010 = 11.2M)
    const postJe = await prisma.journalEntry.findFirst({
      where: {
        tenantId,
        sourceDocType: 'PurchaseReceipt',
        sourceDocId: receipt.id,
      },
      include: {
        lines: {
          include: {
            debitAccount: true,
            creditAccount: true,
          },
        },
      },
    });

    expect(postJe).toBeDefined();
    expect(postJe?.lines.length).toBeGreaterThanOrEqual(2);

    // Line 1: Dt 2910 (Inventory) / Kt 6010 = 10,000,000
    const line2910 = postJe?.lines.find(
      (l) => l.debitAccount.code === '2910' && l.creditAccount.code === '6010',
    );
    expect(line2910).toBeDefined();
    expect(Number(line2910?.amount)).toBe(10000000);

    // Line 2: Dt 4410 (Input VAT) / Kt 6010 = 1,200,000
    const line4410 = postJe?.lines.find(
      (l) => l.debitAccount.code === '4410' && l.creditAccount.code === '6010',
    );
    expect(line4410).toBeDefined();
    expect(Number(line4410?.amount)).toBe(1200000);

    // ─── STEP 3: PAY SUPPLIER (11,200,000 UZS) ──────────────────
    const paidReceipt = await purchasesService.payPurchaseReceipt(
      tenantId,
      userId,
      receipt.id,
      {
        amount: 11200000,
        cashAccountId,
        note: 'Full payment for iPhone purchase invariant test',
      },
    );

    expect(paidReceipt.paymentStatus).toBe(PurchasePaymentStatus.PAID);
    expect(Number(paidReceipt.paidAmount)).toBe(11200000);

    // INVARIANT CHECK 5: Cash Account Balance Decremented by -11,200,000
    const paidCash = await prisma.cashAccount.findUnique({
      where: { id: cashAccountId },
    });
    expect(Number(paidCash?.balance)).toBe(initialCashBalance - 11200000);

    // INVARIANT CHECK 6: Supplier Debt Returned to Initial Level (Net Debt 0 for this receipt)
    const paidSupplier = await prisma.counterparty.findUnique({
      where: { id: counterpartyId },
    });
    expect(Number(paidSupplier?.debtBalance)).toBe(initialSupplierDebt);

    // INVARIANT CHECK 7: Payment Journal Entry Created (Dt 6010 / Kt 5010 = 11,200,000)
    const payJe = await prisma.journalEntry.findFirst({
      where: {
        tenantId,
        sourceDocType: 'PurchasePayment',
        sourceDocId: receipt.id,
      },
      include: {
        lines: {
          include: {
            debitAccount: true,
            creditAccount: true,
          },
        },
      },
    });

    expect(payJe).toBeDefined();
    const line6010 = payJe?.lines.find(
      (l) => l.debitAccount.code === '6010' && l.creditAccount.code === '5010',
    );
    expect(line6010).toBeDefined();
    expect(Number(line6010?.amount)).toBe(11200000);

    // ─── STEP 4: TRIAL BALANCE & ACCOUNTING REPORT CONSISTENCY ─
    const trialBalance = await reportsService.getTrialBalance(tenantId);
    expect(trialBalance).toBeDefined();
    expect(trialBalance.totalDebitTurnover).toBe(
      trialBalance.totalCreditTurnover,
    );

    const finStatements = await reportsService.getFinancialStatements(
      tenantId,
    );
    expect(finStatements.balanceSheet.isBalanced).toBe(true);

    // Clean up test receipt records
    await prisma.financeTransaction.deleteMany({
      where: { sourceDocId: receipt.id },
    });
    await prisma.journalEntry.deleteMany({
      where: { sourceDocId: receipt.id },
    });
    await prisma.productBatch.deleteMany({
      where: { receiptId: receipt.id },
    });
    await prisma.purchaseReceiptItem.deleteMany({
      where: { receiptId: receipt.id },
    });
    await prisma.purchaseReceipt.delete({
      where: { id: receipt.id },
    });
  });
});
