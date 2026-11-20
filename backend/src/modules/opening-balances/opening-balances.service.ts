import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { nextDocumentNumber } from '../../common/sequences/document-sequence';
import {
  OpeningBalanceStatus,
  OpeningBalanceCategory,
  OpeningBalanceLine,
  TransactionDirection,
  TransactionStatus,
  CounterpartySettlementSide,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { lockDocumentStatus } from '../../common/prisma/lock-document';
import { CreateOpeningBalanceDto } from './dto/create-opening-balance.dto';
import { UpdateOpeningBalanceLinesDto } from './dto/update-opening-balance.dto';
import { UnpostOpeningBalanceDto } from './dto/unpost-opening-balance.dto';
import { OpeningBalanceLineDto } from './dto/opening-balance-line.dto';
import { CounterpartySettlementService } from '../settlements/counterparty-settlement.service';
import { SUPPORTED_CURRENCIES } from '../../common/validators/currency.validator';
import { AccountsService } from '../accounting/accounts/accounts.service';
import {
  isCashAccountCurrencyValid,
  ledgerAccountCodeForCashAccount,
} from '../../../../shared/types/cash-account-policy';
import {
  computeOpeningBalanceTotals,
  openingLineAmount,
  roundMoney,
  OPENING_AUXILIARY_ACCOUNT,
  OPENING_BALANCE_LEDGER_ACCOUNT,
  OPENING_DEPRECIATION_ACCOUNT,
  OPENING_RETAINED_EARNINGS_ACCOUNT,
} from '../../../../shared/types/opening-balance-posting';
import { JournalService } from '../accounting/journal/journal.service';
import { JournalLineDto } from '../accounting/dto';
import { assertTenantOwned } from '../../common/prisma/assert-tenant-owned';
import { assertPeriodOpen } from '../../common/accounting-period/period-lock';
import { createFifoBatch } from '../inventory/fifo/fifo-batches';

const COUNTERPARTY_CATEGORIES: OpeningBalanceCategory[] = [
  OpeningBalanceCategory.CUSTOMER_DEBT,
  OpeningBalanceCategory.SUPPLIER_DEBT,
  OpeningBalanceCategory.CUSTOMER_ADVANCE,
  OpeningBalanceCategory.SUPPLIER_ADVANCE,
];

const isCashCategory = (category: OpeningBalanceCategory) =>
  category === OpeningBalanceCategory.CASH ||
  category === OpeningBalanceCategory.BANK;

type ValueLine = {
  category: OpeningBalanceCategory;
  amount?: Prisma.Decimal | number | null;
  quantity?: Prisma.Decimal | number | null;
  unitCost?: Prisma.Decimal | number | null;
  accumulatedDepreciation?: Prisma.Decimal | number | null;
  currency: string;
  exchangeRate?: Prisma.Decimal | number | string | null;
};

const plain = (v: Prisma.Decimal | number | string | null | undefined) =>
  v === null || v === undefined ? v : Number(v);

@Injectable()
export class OpeningBalancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settlementService: CounterpartySettlementService,
    private readonly accountsService: AccountsService,
    private readonly journalService: JournalService,
  ) {}

  private getCounterpartyOpeningMovement(
    category: OpeningBalanceCategory,
    amount: number,
  ): { side: CounterpartySettlementSide; amount: number } | null {
    switch (category) {
      case OpeningBalanceCategory.CUSTOMER_DEBT:
        return { side: CounterpartySettlementSide.CUSTOMER, amount };
      case OpeningBalanceCategory.CUSTOMER_ADVANCE:
        return { side: CounterpartySettlementSide.CUSTOMER, amount: -amount };
      case OpeningBalanceCategory.SUPPLIER_DEBT:
        return { side: CounterpartySettlementSide.SUPPLIER, amount };
      case OpeningBalanceCategory.SUPPLIER_ADVANCE:
        return { side: CounterpartySettlementSide.SUPPLIER, amount: -amount };
      default:
        return null;
    }
  }

  // ─── Calculation Helpers ─────────────────────────────────────────

  private exchangeRateToUzs(currency: string, exchangeRate: number) {
    if (
      !SUPPORTED_CURRENCIES.includes(
        currency as (typeof SUPPORTED_CURRENCIES)[number],
      )
    ) {
      throw new BadRequestException(
        'Boshlang‘ich qoldiq valyutasi USD yoki UZS bo‘lishi kerak',
      );
    }
    if (currency === 'UZS') return 1;
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
      throw new BadRequestException(
        'USD qoldiqlari uchun UZS kursi 0 dan katta bo‘lishi shart',
      );
    }
    return exchangeRate;
  }

  /** Every id a line points at must be the caller's (ADR: tenant isolation). */
  private assertLineReferences(
    tenantId: string,
    lines: Array<{
      accountId?: string | null;
      productId?: string | null;
      warehouseId?: string | null;
      counterpartyId?: string | null;
      fixedAssetId?: string | null;
    }>,
  ) {
    return assertTenantOwned(this.prisma, tenantId, {
      // A cash/bank line's accountId is a kassa (CashAccount).
      cashAccount: lines.map((l) => l.accountId),
      product: lines.map((l) => l.productId),
      warehouse: lines.map((l) => l.warehouseId),
      counterparty: lines.map((l) => l.counterpartyId),
      fixedAsset: lines.map((l) => l.fixedAssetId),
    });
  }

  /**
   * B6: an opening-balance fixed asset carries its cost and the
   * accumulated depreciation typed by the user; the system does not
   * compute depreciation (owner decision D6). Depreciation above cost is
   * rejected instead of being clamped to a net value of 0.
   */
  private validateFixedAssetLine(line: {
    category: OpeningBalanceCategory;
    amount?: number;
    accumulatedDepreciation?: number;
  }) {
    if (line.category !== OpeningBalanceCategory.FIXED_ASSET) return;
    const cost = Number(line.amount ?? 0);
    const depreciation = Number(line.accumulatedDepreciation ?? 0);
    if (depreciation > cost) {
      throw new BadRequestException(
        `Asosiy vosita: jamg'arilgan eskirish (${depreciation}) boshlang'ich qiymatdan (${cost}) katta bo'lishi mumkin emas. / ` +
          `Основное средство: накопленная амортизация (${depreciation}) не может превышать первоначальную стоимость (${cost}).`,
      );
    }
  }

  /**
   * D6 (owner, option 2): an opening fixed-asset line opens an asset that
   * already exists in the fixed-asset register. The register is the one
   * source of truth for the asset's cost and accumulated depreciation, so
   * the line must carry the same values (in UZS, the register's currency);
   * nothing is depreciated here. An asset is opened once: not twice in one
   * document and not by another posted opening-balance document.
   */
  private async assertFixedAssetLinks(
    tenantId: string,
    documentId: string,
    lines: Array<{
      category: OpeningBalanceCategory;
      fixedAssetId: string | null;
      amount: Prisma.Decimal | number;
      accumulatedDepreciation: Prisma.Decimal | number | null;
      currency: string;
    }>,
  ) {
    const assetLines = lines.filter(
      (l) => l.category === OpeningBalanceCategory.FIXED_ASSET,
    );
    if (assetLines.length === 0) return;

    for (const line of assetLines) {
      if (!line.fixedAssetId) {
        throw new BadRequestException(
          "Asosiy vosita qatorini asosiy vositalar reyestridagi vositaga bog'lang (avval vositani reyestrga qo'shing). / " +
            'Привяжите строку основного средства к средству из реестра основных средств (сначала добавьте его в реестр).',
        );
      }
      if (line.currency !== 'UZS') {
        throw new BadRequestException(
          "Asosiy vosita qoldig'i UZS da kiritiladi (reyestr UZS da yuritiladi). / " +
            'Остаток основного средства вводится в UZS (реестр ведётся в UZS).',
        );
      }
    }

    const ids = assetLines.map((l) => l.fixedAssetId as string);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(
        "Har bir asosiy vosita hujjatda faqat bir marta bo'lishi mumkin. / " +
          'Каждое основное средство может быть в документе только один раз.',
      );
    }

    const assets = await this.prisma.fixedAsset.findMany({
      where: { tenantId, id: { in: ids } },
    });
    const byId = new Map(assets.map((a) => [a.id, a]));
    const cents = (v: Prisma.Decimal | number | null | undefined) =>
      Math.round(Number(v ?? 0) * 100);
    for (const line of assetLines) {
      const asset = byId.get(line.fixedAssetId as string);
      if (!asset) throw new NotFoundException('Asosiy vosita topilmadi');
      if (
        cents(line.amount) !== cents(asset.initialCost) ||
        cents(line.accumulatedDepreciation) !==
          cents(asset.accumulatedDepreciation)
      ) {
        throw new BadRequestException(
          `"${asset.name}": qator qiymati reyestrdagidan farq qiladi (boshlang'ich qiymat ${Number(asset.initialCost)}, eskirish ${Number(asset.accumulatedDepreciation)}). / ` +
            `"${asset.name}": значения строки отличаются от реестра (первоначальная стоимость ${Number(asset.initialCost)}, амортизация ${Number(asset.accumulatedDepreciation)}).`,
        );
      }
    }

    const opened = await this.prisma.openingBalanceLine.findFirst({
      where: {
        tenantId,
        fixedAssetId: { in: ids },
        documentId: { not: documentId },
        document: { status: OpeningBalanceStatus.POSTED },
      },
      include: { document: { select: { docNumber: true } } },
    });
    if (opened) {
      throw new BadRequestException(
        `Bu asosiy vosita ${opened.document.docNumber} hujjatida allaqachon ochilgan. / ` +
          `Это основное средство уже введено документом ${opened.document.docNumber}.`,
      );
    }
  }

  /**
   * Every line must say what it opens, otherwise it would count in the
   * balance and the journal but reach no kassa, warehouse or counterparty.
   * Rows are numbered within their tab, as the page shows them.
   */
  private assertPostableLines(lines: OpeningBalanceLine[]) {
    const problems: string[] = [];
    const seen = { cash: 0, goods: 0, debts: 0 };
    lines.forEach((line) => {
      let row = '';
      if (isCashCategory(line.category)) row = `Pul / Деньги ${++seen.cash}`;
      else if (line.category === OpeningBalanceCategory.INVENTORY)
        row = `Tovarlar / Товары ${++seen.goods}`;
      else if (COUNTERPARTY_CATEGORIES.includes(line.category))
        row = `Qarzlar / Долги ${++seen.debts}`;
      if (isCashCategory(line.category)) {
        if (Number(line.amount) > 0 && !line.accountId)
          problems.push(`${row}: kassa/bank tanlanmagan / не выбрана касса`);
      } else if (line.category === OpeningBalanceCategory.INVENTORY) {
        if (!line.productId || !line.warehouseId)
          problems.push(
            `${row}: tovar yoki ombor tanlanmagan / не выбран товар или склад`,
          );
        if (!(Number(line.quantity) > 0))
          problems.push(
            `${row}: miqdor 0 dan katta bo‘lishi kerak / количество должно быть больше 0`,
          );
        if (line.unitCost === null || Number(line.unitCost) < 0)
          problems.push(
            `${row}: tannarx kiritilmagan / не указана себестоимость`,
          );
      } else if (COUNTERPARTY_CATEGORIES.includes(line.category)) {
        if (!line.counterpartyId)
          problems.push(
            `${row}: kontragent tanlanmagan / не выбран контрагент`,
          );
      }
    });
    if (problems.length > 0) {
      throw new BadRequestException(
        `Qatorlar to‘liq emas / Строки не заполнены — ${problems.join('; ')}`,
      );
    }
  }

  private validateLineCurrency(line: {
    currency?: string;
    exchangeRate?: number | string | Prisma.Decimal;
  }) {
    if (!line.currency)
      throw new BadRequestException(
        'Har bir qoldiq qatori uchun valyutani tanlang',
      );
    this.exchangeRateToUzs(line.currency, Number(line.exchangeRate));
  }

  /** UZS totals; equity is balanced automatically (see opening-balance-posting). */
  private calculateMetrics(lines: ValueLine[]) {
    const totals = computeOpeningBalanceTotals(
      lines.map((l) => ({
        category: l.category,
        amount: plain(l.amount),
        quantity: plain(l.quantity),
        unitCost: plain(l.unitCost),
        accumulatedDepreciation: plain(l.accumulatedDepreciation),
        currency: l.currency,
        exchangeRate: plain(l.exchangeRate),
      })),
    );
    return {
      ...totals,
      // Stored on the document: assets − liabilities − entered capital, i.e.
      // the part of equity the system posts to 8710.
      balanceDifference: totals.retainedEarnings,
      currency: 'UZS',
    };
  }

  /** The row stored for a line; an inventory amount is quantity × cost. */
  private lineData(tenantId: string, l: OpeningBalanceLineDto) {
    this.validateLineCurrency(l);
    this.validateFixedAssetLine(l);
    const quantity =
      l.quantity !== undefined && l.quantity !== null
        ? Number(l.quantity)
        : null;
    const unitCost =
      l.unitCost !== undefined && l.unitCost !== null
        ? Number(l.unitCost)
        : null;
    const amount = openingLineAmount({
      category: l.category,
      amount: l.amount,
      quantity,
      unitCost,
    });
    const accDep = Number(l.accumulatedDepreciation || 0);
    return {
      tenantId,
      category: l.category,
      accountId: l.accountId || null,
      productId: l.productId || null,
      warehouseId: l.warehouseId || null,
      counterpartyId: l.counterpartyId || null,
      fixedAssetId: l.fixedAssetId || null,
      quantity,
      unitCost,
      amount,
      accumulatedDepreciation: accDep,
      netAmount:
        l.category === OpeningBalanceCategory.FIXED_ASSET
          ? roundMoney(amount - accDep)
          : amount,
      currency: l.currency,
      exchangeRate: this.exchangeRateToUzs(l.currency, Number(l.exchangeRate)),
      batchNumber: l.batchNumber || null,
      contractNumber: l.contractNumber || null,
      notes: l.notes || null,
    };
  }

  private documentTotals(metrics: {
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    balanceDifference: number;
  }) {
    return {
      totalAssets: metrics.totalAssets,
      totalLiabilities: metrics.totalLiabilities,
      totalEquity: metrics.totalEquity,
      balanceDifference: metrics.balanceDifference,
    };
  }

  // ─── Query Methods ───────────────────────────────────────────────

  async findAll(tenantId: string) {
    return this.prisma.openingBalanceDocument.findMany({
      where: { tenantId },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        approvedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        _count: {
          select: { lines: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const doc = await this.prisma.openingBalanceDocument.findFirst({
      where: { id, tenantId },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        approvedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        lines: {
          include: {
            account: {
              select: {
                id: true,
                accountType: true,
                name: true,
                currency: true,
                balance: true,
              },
            },
            product: {
              select: { id: true, sku: true, name: true, unitOfMeasure: true },
            },
            warehouse: {
              select: { id: true, name: true },
            },
            counterparty: {
              select: {
                id: true,
                name: true,
                type: true,
                inn: true,
                phone: true,
              },
            },
            fixedAsset: {
              select: {
                id: true,
                name: true,
                inventoryNumber: true,
                assetType: true,
                netBookValue: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!doc)
      throw new NotFoundException('Boshlang‘ich qoldiq hujjati topilmadi');

    return {
      ...doc,
      metrics: this.calculateMetrics(doc.lines || []),
    };
  }

  // ─── Document Creation ───────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateOpeningBalanceDto) {
    let docNumber = dto.docNumber;
    if (!docNumber) {
      docNumber = await nextDocumentNumber(
        this.prisma,
        tenantId,
        'OPENING_BALANCE',
        new Date(dto.openingDate),
      );
    }

    const existing = await this.prisma.openingBalanceDocument.findFirst({
      where: { tenantId, docNumber },
    });
    if (existing) {
      throw new ConflictException(
        `Hujjat raqami ${docNumber} allaqachon mavjud`,
      );
    }

    const lines = dto.lines || [];
    await this.assertLineReferences(tenantId, lines);
    const lineRows = lines.map((l) => this.lineData(tenantId, l));
    const metrics = this.calculateMetrics(lineRows);

    return this.prisma.openingBalanceDocument.create({
      data: {
        tenantId,
        docNumber,
        openingDate: new Date(dto.openingDate),
        status: OpeningBalanceStatus.DRAFT,
        notes: dto.notes || null,
        createdById: userId,
        ...this.documentTotals(metrics),
        lines: { create: lineRows },
      },
      include: {
        lines: true,
      },
    });
  }

  // ─── Update Lines ────────────────────────────────────────────────

  async updateLines(
    tenantId: string,
    documentId: string,
    dto: UpdateOpeningBalanceLinesDto,
  ) {
    const doc = await this.prisma.openingBalanceDocument.findFirst({
      where: { id: documentId, tenantId },
    });
    if (!doc) throw new NotFoundException('Hujjat topilmadi');

    if (doc.status === OpeningBalanceStatus.POSTED) {
      throw new BadRequestException(
        'Tasdiqlangan boshlang‘ich qoldiq hujjatini to‘g‘ridan-to‘g‘ri o‘zgartirib bo‘lmaydi. Avval qayta oching (Unpost)',
      );
    }

    const lines = dto.lines || [];
    await this.assertLineReferences(tenantId, lines);
    const lineRows = lines.map((l) => this.lineData(tenantId, l));
    const metrics = this.calculateMetrics(lineRows);

    return this.prisma.$transaction(async (tx) => {
      // F9: lock the row and re-check the status inside the transaction; a
      // post committed after the check above must not have its lines replaced.
      const lockedStatus = await lockDocumentStatus(
        tx,
        'openingBalanceDocument',
        documentId,
        tenantId,
      );
      if (lockedStatus === null) {
        throw new NotFoundException('Hujjat topilmadi');
      }
      if (lockedStatus === OpeningBalanceStatus.POSTED) {
        throw new BadRequestException(
          'Tasdiqlangan boshlang‘ich qoldiq hujjatini to‘g‘ridan-to‘g‘ri o‘zgartirib bo‘lmaydi. Avval qayta oching (Unpost)',
        );
      }
      await tx.openingBalanceLine.deleteMany({
        where: { documentId, tenantId },
      });

      if (lineRows.length > 0) {
        await tx.openingBalanceLine.createMany({
          data: lineRows.map((row) => ({ ...row, documentId })),
        });
      }

      const updateData: Prisma.OpeningBalanceDocumentUpdateInput = {
        ...this.documentTotals(metrics),
        notes: dto.notes !== undefined ? dto.notes : doc.notes,
        updatedAt: new Date(),
      };
      if (dto.openingDate) {
        updateData.openingDate = new Date(dto.openingDate);
      }

      return tx.openingBalanceDocument.update({
        where: { tenantId, id: documentId },
        data: updateData,
        include: { lines: true },
      });
    });
  }

  // ─── Document Posting ─────────────────────────────────────────────

  /**
   * Posting opens every line in the module that owns it:
   *  - CASH/BANK      → kassa balance + a POSTED Finance income (5010/5020/5110/5210)
   *  - INVENTORY      → stock level + a FIFO batch dated the opening date (2910)
   *  - debts/advances → counterparty settlement in the line currency (4010/6010)
   *  - FIXED_ASSET    → register asset made ACTIVE (0100, depreciation 0200)
   *  - OTHER_*        → ledger only (4890 / 6990)
   *  - EQUITY         → ustav kapitali (8330)
   * and one journal entry through 00, closed by the computed retained
   * earnings (8710), so the balance never has to be balanced by hand.
   */
  async post(tenantId: string, userId: string, documentId: string) {
    const doc = await this.prisma.openingBalanceDocument.findFirst({
      where: { id: documentId, tenantId },
      include: { lines: true },
    });
    if (!doc) throw new NotFoundException('Hujjat topilmadi');

    if (
      doc.status !== OpeningBalanceStatus.DRAFT &&
      doc.status !== OpeningBalanceStatus.PENDING_REVIEW
    ) {
      throw new BadRequestException(
        'Faqat qoralama boshlang‘ich qoldiq hujjatini tasdiqlash mumkin',
      );
    }
    if (doc.lines.length === 0) {
      throw new BadRequestException(
        'Hujjatda qoldiq qatorlari yo‘q / В документе нет строк остатков',
      );
    }

    doc.lines.forEach((line) => this.validateLineCurrency(line));
    this.assertPostableLines(doc.lines);
    await this.assertFixedAssetLinks(tenantId, doc.id, doc.lines);
    const metrics = this.calculateMetrics(doc.lines);

    await this.accountsService.ensureDefaultAccounts(tenantId);

    return this.prisma.$transaction(async (tx) => {
      // D4: nothing dated in a closed accounting period may change.
      await assertPeriodOpen(tx, tenantId, doc.openingDate, 'post');

      const rateOf = (line: OpeningBalanceLine) =>
        this.exchangeRateToUzs(line.currency, Number(line.exchangeRate));
      const journal = new OpeningJournal(tx, tenantId);

      // 1. Cash & bank: the kassa balance and a Finance income row.
      for (const line of doc.lines) {
        if (!isCashCategory(line.category)) continue;
        const amount = Number(line.amount);
        if (amount <= 0) continue;
        const account = await tx.cashAccount.findFirst({
          where: { id: line.accountId as string, tenantId, isActive: true },
        });
        if (!account)
          throw new NotFoundException(
            'Tanlangan kassa yoki bank hisobi topilmadi',
          );
        if (
          !isCashAccountCurrencyValid(account) ||
          account.currency !== line.currency
        ) {
          throw new BadRequestException(
            `Tanlangan hisob turi/valyutasi qoldiq valyutasiga (${line.currency}) mos kelmaydi`,
          );
        }
        if (
          (line.category === OpeningBalanceCategory.BANK) !==
          (account.accountType === 'BANK')
        ) {
          throw new BadRequestException(
            'Tanlangan hisob turi qoldiq qatori turiga mos kelmaydi',
          );
        }
        const ledgerCode = ledgerAccountCodeForCashAccount(account);
        if (!ledgerCode)
          throw new BadRequestException(
            'Kassa/bank uchun buxgalteriya hisobi topilmadi',
          );

        await tx.cashAccount.update({
          where: { tenantId, id: account.id },
          data: { balance: { increment: amount } },
        });
        await tx.financeTransaction.create({
          data: {
            tenantId,
            accountId: account.id,
            direction: TransactionDirection.INCOME,
            status: TransactionStatus.POSTED,
            amount,
            currency: line.currency,
            exchangeRate: rateOf(line),
            comment: line.notes || `Boshlang‘ich qoldiq: ${doc.docNumber}`,
            sourceDocType: 'OpeningBalanceDocument',
            sourceDocId: doc.id,
            responsibleUserId: userId,
            createdById: userId,
          },
        });
        journal.debit(
          ledgerCode,
          amount * rateOf(line),
          `${account.accountType} (${account.currency}) boshlang‘ich qoldig‘i`,
        );
      }

      // 2. Inventory: stock and one FIFO batch per line, oldest layer first.
      let itemIndex = 0;
      for (const line of doc.lines) {
        if (line.category !== OpeningBalanceCategory.INVENTORY) continue;
        itemIndex++;
        const qty = Number(line.quantity);
        // Per-unit UZS cost: 4 decimals (DECIMAL(17,4) batch cost).
        const unitCostUzs =
          Math.round(Number(line.unitCost) * rateOf(line) * 10000) / 10000;

        await tx.stockLevel.upsert({
          where: {
            tenantId_warehouseId_productId: {
              tenantId,
              warehouseId: line.warehouseId as string,
              productId: line.productId as string,
            },
          },
          create: {
            tenantId,
            warehouseId: line.warehouseId as string,
            productId: line.productId as string,
            quantity: qty,
          },
          update: { quantity: { increment: qty } },
        });
        await createFifoBatch(tx, {
          tenantId,
          warehouseId: line.warehouseId as string,
          productId: line.productId as string,
          quantity: qty,
          unitCost: unitCostUzs,
          batchNumber: line.batchNumber || `INIT-${doc.docNumber}-${itemIndex}`,
          createdAt: doc.openingDate,
          openingBalanceLineId: line.id,
        });
        // ADR 0007: a product without a catalog cost takes its opening cost,
        // so sales margins and suggestions do not start from 0.
        await tx.product.updateMany({
          where: { tenantId, id: line.productId as string, costPrice: 0 },
          data: {
            costPrice: unitCostUzs,
            costPriceCurrency: 'UZS',
            costPriceExchangeRate: 1,
          },
        });
        journal.debit(
          OPENING_BALANCE_LEDGER_ACCOUNT.INVENTORY,
          qty * Number(line.unitCost) * rateOf(line),
          'Tovar-moddiy zaxiralar boshlang‘ich qoldig‘i',
        );
      }

      // 3. Receivables, payables and advances, in the line currency.
      for (const line of doc.lines) {
        const settlement = this.getCounterpartyOpeningMovement(
          line.category,
          Number(line.amount),
        );
        if (!settlement) continue;

        await this.settlementService.recordMovement(tx, {
          tenantId,
          counterpartyId: line.counterpartyId as string,
          currency: line.currency,
          side: settlement.side,
          amount: settlement.amount,
          entryType: 'OPENING_BALANCE_POSTED',
          effectiveAt: doc.openingDate,
          sourceDocType: 'OpeningBalanceLine',
          sourceDocId: line.id,
          idempotencyKey: `OpeningBalanceLine:${line.id}:POSTED:${doc.updatedAt.toISOString()}`,
        });
      }

      // 4. Fixed assets, other items and capital: ledger (and the register).
      for (const line of doc.lines) {
        const uzs = Number(line.amount) * rateOf(line);
        switch (line.category) {
          case OpeningBalanceCategory.FIXED_ASSET:
            await tx.fixedAsset.update({
              where: { tenantId, id: line.fixedAssetId as string },
              data: { status: 'ACTIVE' },
            });
            journal.debit(
              OPENING_BALANCE_LEDGER_ACCOUNT.FIXED_ASSET,
              uzs,
              'Asosiy vositalar boshlang‘ich qiymati',
            );
            journal.credit(
              OPENING_DEPRECIATION_ACCOUNT,
              Number(line.accumulatedDepreciation || 0) * rateOf(line),
              'Asosiy vositalar jamg‘arilgan eskirishi',
            );
            break;
          case OpeningBalanceCategory.CUSTOMER_DEBT:
            journal.debit('4010', uzs, 'Xaridorlar qarzdorligi (debitorlik)');
            break;
          case OpeningBalanceCategory.SUPPLIER_ADVANCE:
            journal.debit('6010', uzs, 'Yetkazib beruvchilarga berilgan avans');
            break;
          case OpeningBalanceCategory.OTHER_ASSET:
            journal.debit(
              OPENING_BALANCE_LEDGER_ACCOUNT.OTHER_ASSET,
              uzs,
              'Boshqa aktivlar',
            );
            break;
          case OpeningBalanceCategory.SUPPLIER_DEBT:
            journal.credit(
              '6010',
              uzs,
              'Yetkazib beruvchilarga qarzdorlik (kreditorlik)',
            );
            break;
          case OpeningBalanceCategory.CUSTOMER_ADVANCE:
            journal.credit('4010', uzs, 'Mijozlardan olingan avans');
            break;
          case OpeningBalanceCategory.OTHER_LIABILITY:
            journal.credit(
              OPENING_BALANCE_LEDGER_ACCOUNT.OTHER_LIABILITY,
              uzs,
              'Boshqa majburiyatlar',
            );
            break;
          case OpeningBalanceCategory.EQUITY:
            journal.credit(
              OPENING_BALANCE_LEDGER_ACCOUNT.EQUITY,
              uzs,
              'Ustav kapitali',
            );
            break;
          default:
            break;
        }
      }

      // 5. One journal entry; retained earnings close account 00.
      const journalLines = await journal.lines();
      if (journalLines.length > 0) {
        await this.journalService.createJournalEntry(
          tenantId,
          {
            entryDate: doc.openingDate,
            description: `Boshlang‘ich qoldiqlar o‘tkazmasi (${doc.docNumber})`,
            sourceDocType: 'OpeningBalanceDocument',
            sourceDocId: doc.id,
            lines: journalLines,
          },
          tx,
        );
      }

      return tx.openingBalanceDocument.update({
        where: { tenantId, id: documentId },
        data: {
          status: OpeningBalanceStatus.POSTED,
          approvedById: userId,
          approvedAt: new Date(),
          ...this.documentTotals(metrics),
        },
        include: { lines: true },
      });
    });
  }

  // ─── Document Reopening / Unposting (The Rollback Invariant) ─────

  async unpost(
    tenantId: string,
    userId: string,
    documentId: string,
    dto?: UnpostOpeningBalanceDto,
  ) {
    const doc = await this.prisma.openingBalanceDocument.findFirst({
      where: { id: documentId, tenantId },
      include: { lines: true },
    });
    if (!doc) throw new NotFoundException('Hujjat topilmadi');

    if (doc.status !== OpeningBalanceStatus.POSTED) {
      throw new BadRequestException(
        'Faqat tasdiqlangan hujjatni qayta ochish mumkin',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // D4: nothing dated in a closed accounting period may change.
      await assertPeriodOpen(tx, tenantId, doc.openingDate, 'unpost');

      // ─── Rollback invariant: nothing opened here may have been used ───

      // 1. The batch of each inventory line must be untouched.
      const inventoryLines = doc.lines.filter(
        (l) => l.category === OpeningBalanceCategory.INVENTORY,
      );
      const batchIds: string[] = [];
      let itemIndex = 0;
      for (const line of inventoryLines) {
        if (!line.productId || !line.warehouseId) continue;
        itemIndex++;
        if (!(Number(line.quantity) > 0)) continue;
        let batches = await tx.productBatch.findMany({
          where: { tenantId, openingBalanceLineId: line.id },
        });
        if (batches.length === 0) {
          // Documents posted before batches were linked to their line.
          batches = await tx.productBatch.findMany({
            where: {
              tenantId,
              warehouseId: line.warehouseId,
              productId: line.productId,
              batchNumber:
                line.batchNumber || `INIT-${doc.docNumber}-${itemIndex}`,
              receiptId: null,
              productionDocumentId: null,
              openingBalanceLineId: null,
            },
          });
        }
        if (batches.length === 0) {
          throw new BadRequestException(
            `Hujjatni qayta ochib bo‘lmaydi: ${itemIndex}-tovar qatorining partiyasi topilmadi. / ` +
              `Нельзя переоткрыть: не найдена партия ${itemIndex}-й товарной строки.`,
          );
        }
        for (const batch of batches) {
          const initial = Number(batch.initialQty);
          const remaining = Number(batch.remainingQty);
          if (remaining < initial) {
            throw new BadRequestException(
              `Hujjatni qayta ochib bo‘lmaydi! Boshlang‘ich partiyadagi tovarlar allaqachon sotilgan yoki boshqa omborga ko‘chirilgan. (Partiya: ${batch.batchNumber}, Boshlang‘ich: ${initial}, Qoldiq: ${remaining})`,
            );
          }
          batchIds.push(batch.id);
        }
      }

      // 2. Each kassa must still hold everything this document put in it.
      const cashByAccount = new Map<string, number>();
      for (const line of doc.lines) {
        if (!isCashCategory(line.category) || !line.accountId) continue;
        if (Number(line.amount) <= 0) continue;
        cashByAccount.set(
          line.accountId,
          (cashByAccount.get(line.accountId) ?? 0) + Number(line.amount),
        );
      }
      for (const [accountId, opened] of cashByAccount) {
        const account = await tx.cashAccount.findFirst({
          where: { tenantId, id: accountId },
        });
        const currentBalance = Number(account?.balance || 0);
        if (currentBalance < opened) {
          throw new BadRequestException(
            `Hujjatni qayta ochib bo‘lmaydi! Kassadagi mablag‘ boshlang‘ich kiritilgan summadan kamayib ketgan. Kassa: ${account?.currency}, Hozirgi qoldiq: ${currentBalance}, Boshlang‘ich summa: ${opened}`,
          );
        }
      }

      // ─── Reversal ───

      for (const [accountId, opened] of cashByAccount) {
        await tx.cashAccount.update({
          where: { tenantId, id: accountId },
          data: { balance: { decrement: opened } },
        });
      }
      await tx.financeTransaction.deleteMany({
        where: {
          tenantId,
          sourceDocType: 'OpeningBalanceDocument',
          sourceDocId: doc.id,
        },
      });

      for (const line of inventoryLines) {
        if (!line.productId || !line.warehouseId) continue;
        if (!(Number(line.quantity) > 0)) continue;
        await tx.stockLevel.update({
          where: {
            tenantId_warehouseId_productId: {
              tenantId,
              warehouseId: line.warehouseId,
              productId: line.productId,
            },
          },
          data: { quantity: { decrement: Number(line.quantity) } },
        });
      }
      if (batchIds.length > 0) {
        await tx.productBatch.deleteMany({
          where: { tenantId, id: { in: batchIds } },
        });
      }

      for (const line of doc.lines) {
        if (!line.counterpartyId) continue;
        const settlement = this.getCounterpartyOpeningMovement(
          line.category,
          Number(line.amount),
        );
        if (!settlement) continue;

        await this.settlementService.recordMovement(tx, {
          tenantId,
          counterpartyId: line.counterpartyId,
          currency: line.currency,
          side: settlement.side,
          amount: -settlement.amount,
          entryType: 'OPENING_BALANCE_UNPOSTED',
          effectiveAt: doc.openingDate,
          sourceDocType: 'OpeningBalanceLine',
          sourceDocId: line.id,
          idempotencyKey: `OpeningBalanceLine:${line.id}:UNPOSTED:${doc.updatedAt.toISOString()}`,
        });
      }

      await this.journalService.deleteEntriesForSource(
        tx,
        tenantId,
        'OpeningBalanceDocument',
        doc.id,
        'unpost',
      );

      return tx.openingBalanceDocument.update({
        where: { tenantId, id: documentId },
        data: {
          status: OpeningBalanceStatus.DRAFT,
          approvedById: null,
          approvedAt: null,
          notes: dto?.reason
            ? `${doc.notes || ''}\n[Qayta ochildi]: ${dto.reason}`.trim()
            : doc.notes,
        },
        include: { lines: true },
      });
    });
  }

  // ─── Delete Draft ────────────────────────────────────────────────

  async delete(tenantId: string, id: string) {
    const doc = await this.prisma.openingBalanceDocument.findFirst({
      where: { id, tenantId },
    });
    if (!doc) throw new NotFoundException('Hujjat topilmadi');
    if (doc.status === OpeningBalanceStatus.POSTED) {
      throw new BadRequestException(
        'Tasdiqlangan hujjatni o‘chirib bo‘lmaydi. Avval qayta oching',
      );
    }

    return this.prisma.openingBalanceDocument.delete({
      where: { tenantId, id },
    });
  }

  // ─── Cutoff Date Gate Helper ─────────────────────────────────────

  async checkCutoffDate(tenantId: string, transactionDate: Date) {
    const postedDoc = await this.prisma.openingBalanceDocument.findFirst({
      where: { tenantId, status: OpeningBalanceStatus.POSTED },
      orderBy: { openingDate: 'asc' },
    });

    if (
      postedDoc &&
      new Date(transactionDate) < new Date(postedDoc.openingDate)
    ) {
      throw new BadRequestException(
        `Hujjat sanasi korxonaning boshlang‘ich qoldiq sanasidan (${postedDoc.openingDate.toISOString().slice(0, 10)}) oldin bo‘lishi mumkin emas`,
      );
    }
    return true;
  }
}

/**
 * Collects the opening entry: each amount is booked against account 00 and
 * summed per ledger account; the rest of 00 goes to retained earnings (8710),
 * so 00 always closes at zero. A required account that is missing is an
 * error, never a skipped line.
 */
class OpeningJournal {
  private readonly debits = new Map<string, { amount: number; text: string }>();
  private readonly credits = new Map<
    string,
    { amount: number; text: string }
  >();

  constructor(
    private readonly tx: Prisma.TransactionClient,
    private readonly tenantId: string,
  ) {}

  debit(code: string, amountUzs: number, text: string) {
    this.add(this.debits, code, amountUzs, text);
  }

  credit(code: string, amountUzs: number, text: string) {
    this.add(this.credits, code, amountUzs, text);
  }

  private add(
    side: Map<string, { amount: number; text: string }>,
    code: string,
    amountUzs: number,
    text: string,
  ) {
    const amount = roundMoney(amountUzs);
    if (amount <= 0) return;
    const current = side.get(code);
    side.set(code, {
      amount: roundMoney((current?.amount ?? 0) + amount),
      text: current?.text ?? text,
    });
  }

  private async accountId(code: string) {
    const account = await this.tx.account.findFirst({
      where: { tenantId: this.tenantId, code },
    });
    if (!account) {
      throw new BadRequestException(
        `Buxgalteriya hisobi ${code} sozlanmagan / Счёт ${code} не настроен`,
      );
    }
    return account.id;
  }

  async lines(): Promise<JournalLineDto[]> {
    const sum = (side: Map<string, { amount: number }>) =>
      [...side.values()].reduce((total, v) => total + v.amount, 0);
    const toRetained = roundMoney(sum(this.debits) - sum(this.credits));
    if (toRetained > 0) {
      this.credit(
        OPENING_RETAINED_EARNINGS_ACCOUNT,
        toRetained,
        'Taqsimlanmagan foyda (balanslovchi kapital)',
      );
    } else if (toRetained < 0) {
      this.debit(
        OPENING_RETAINED_EARNINGS_ACCOUNT,
        -toRetained,
        'Qoplanmagan zarar (balanslovchi kapital)',
      );
    }

    const aux = await this.accountId(OPENING_AUXILIARY_ACCOUNT);
    const result: JournalLineDto[] = [];
    for (const [code, { amount, text }] of this.debits) {
      result.push({
        debitAccountId: await this.accountId(code),
        creditAccountId: aux,
        amount,
        description: text,
      });
    }
    for (const [code, { amount, text }] of this.credits) {
      result.push({
        debitAccountId: aux,
        creditAccountId: await this.accountId(code),
        amount,
        description: text,
      });
    }
    return result;
  }
}
