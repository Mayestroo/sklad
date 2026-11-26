import { Injectable, BadRequestException, Optional } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../../common/prisma';
import { AccountsService } from '../accounts/accounts.service';
import {
  CreateJournalEntryDto,
  JournalLineDto,
  ManualJournalEntryDto,
} from '../dto';
import { ledgerAccountCodeForCashAccount } from '../../../../../shared/types/cash-account-policy';
import { CashAccountType, PaymentMethod, Prisma } from '@prisma/client';
import {
  convertAmountToUzs,
  requireExchangeRateForCurrency,
} from '../../../common/utils/transaction-exchange-rate';
import { nextDocumentNumber } from '../../../common/sequences/document-sequence';
import { assertTenantOwned } from '../../../common/prisma/assert-tenant-owned';
import {
  assertPeriodOpen,
  PeriodAction,
} from '../../../common/accounting-period/period-lock';
import {
  JOURNAL_SOURCE_GROUPS,
  LEDGER_CURRENCY,
  type JournalSourceGroup,
} from '../../../../../shared/types/accounting';

export interface JournalQuery {
  from?: string;
  to?: string;
  /** A JournalSourceGroup ('sales', 'purchases', ...) or one sourceDocType. */
  source?: string;
  sourceDocId?: string;
  accountCode?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

/** Lines with both accounts, and the storno link either way. */
export const JOURNAL_ENTRY_INCLUDE = {
  lines: { include: { debitAccount: true, creditAccount: true } },
  reversedOf: { select: { id: true, entryNumber: true } },
  reversal: { select: { id: true, entryNumber: true } },
} satisfies Prisma.JournalEntryInclude;

/**
 * Inclusive day range on a timestamp column: "2026-11-01".."2026-11-30" keeps
 * the whole of the 30th. Bad dates are refused, not ignored (ADR 0022).
 */
export function dateRangeFilter(
  from?: string,
  to?: string,
): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  const filter: Prisma.DateTimeFilter = {};
  if (from) filter.gte = parseDay(from, 'from');
  if (to) filter.lt = dayAfter(parseDay(to, 'to'));
  return filter;
}

export function dayAfter(date: Date): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

export function parseDay(value: string, field: string): Date {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00.000Z`)
    : null;
  if (!date || Number.isNaN(date.getTime())) {
    throw new BadRequestException(
      `Sana noto'g'ri (${field}: YYYY-MM-DD) / Неверная дата (${field}: YYYY-MM-DD)`,
    );
  }
  return date;
}

interface CashPaymentForJournal {
  id: string;
  paymentNumber: string;
  paymentDate: Date;
  method: PaymentMethod;
  amount: number | string | Prisma.Decimal;
  currency: string;
  exchangeRate: number;
  cashAccount: { accountType: CashAccountType; currency: string } | null;
  invoice?: {
    currency: string;
    exchangeRate: number | string | Prisma.Decimal;
  } | null;
  salesOrder?: {
    currency: string;
    exchangeRate: number | string | Prisma.Decimal;
  } | null;
}

type Numeric = number | string | Prisma.Decimal;

interface InboundDocForJournal {
  id: string;
  docNumber: string;
  docDate: Date;
  totalAmount: Numeric;
}

interface TransferForJournal {
  id: string;
  transferNumber: string;
  /** The transfer document's date: dates the shipment (Dt 2920 / Kt 2910). */
  transferDate: Date;
  /** Recorded when the target warehouse receives: dates Dt 2910 / Kt 2920. */
  receivedAt: Date | null;
}

interface ServiceActForJournal {
  id: string;
  actNumber: string;
  actDate: Date;
  type: string;
  currency: string;
  exchangeRate: Numeric | null;
  subtotal: Numeric;
  vatAmount: Numeric;
}

/**
 * Where journal entries are written. Callers that post as part of a business
 * document pass their Prisma transaction client so the entry commits or rolls
 * back together with the document (ADR 0006).
 */
export type JournalWriter = Pick<
  Prisma.TransactionClient,
  'journalEntry' | '$queryRaw' | '$executeRaw' | 'accountingPeriod'
>;

/**
 * A journal entry to post. `entryDate` is the business document's date; it
 * dates the entry and selects the yearly number series (JE-YYYY-NNNNN).
 * Required: an automatic posting is never dated "now" (F5).
 */
export type JournalEntryInput = CreateJournalEntryDto & { entryDate: Date };

/**
 * The document-currency side of a journal line (TZ 15: amount_orig, currency).
 * `amount` is always the UZS value (ADR 0006). A line posted without an
 * original currency was measured in UZS, so its original amount is that UZS
 * amount — that is the ledger's own currency, not a guessed one. A foreign
 * currency without its amount is refused (ADR 0022).
 */
export function lineOriginalAmount(line: {
  amount: number;
  currency?: string;
  amountOrig?: number;
}): { currency: string; amountOrig: number } {
  if (!line.currency || line.currency === LEDGER_CURRENCY) {
    return { currency: LEDGER_CURRENCY, amountOrig: line.amount };
  }
  if (line.amountOrig === undefined || !(Number(line.amountOrig) > 0)) {
    throw new BadRequestException(
      `Provodka satrida ${line.currency} summasi ko'rsatilmagan / В строке проводки не указана сумма в ${line.currency}`,
    );
  }
  return { currency: line.currency, amountOrig: Number(line.amountOrig) };
}

@Injectable()
export class JournalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
    // Optional so scripts and specs can build the service without it.
    @Optional() private readonly audit?: AuditService,
  ) {}

  /**
   * Post a balanced double-entry Journal Entry (Provodka).
   * The only writer of journal entries: business documents pass their
   * transaction client so the entry commits or rolls back with the document.
   */
  /**
   * A journal entry typed in by a user (POST /api/accounting/journal). The
   * account ids come from the request, so they must be the caller's.
   * Automatic postings resolve accounts by code within the tenant and call
   * createJournalEntry directly.
   */
  async createManualEntry(
    tenantId: string,
    dto: ManualJournalEntryDto,
    userId?: string,
  ) {
    const lines = dto.lines ?? [];
    if (lines.length === 0) {
      throw new BadRequestException(
        "Provodkada kamida bitta satr bo'lishi kerak / В проводке должна быть хотя бы одна строка",
      );
    }
    if (lines.some((line) => line.debitAccountId === line.creditAccountId)) {
      throw new BadRequestException(
        "Debet va kredit hisobi bir xil bo'lmasligi kerak / Дебет и кредит не могут быть одним счётом",
      );
    }
    await assertTenantOwned(this.prisma, tenantId, {
      account: lines.flatMap((line) => [
        line.debitAccountId,
        line.creditAccountId,
      ]),
    });
    const entryDate = parseDay(dto.date, 'date');
    // In a transaction so the period lock taken by createJournalEntry is
    // held until the entry commits (a concurrent close waits for it).
    // A manual entry has no source document.
    const entry = await this.prisma.$transaction((tx) =>
      this.createJournalEntry(
        tenantId,
        { description: dto.description, lines, entryDate },
        tx,
      ),
    );
    await this.audit?.logAction({
      tenantId,
      userId,
      entityType: 'JournalEntry',
      entityId: entry.id,
      action: 'CREATE',
      newValue: {
        entryNumber: entry.entryNumber,
        date: dto.date,
        description: dto.description,
        lines,
      },
    });
    return entry;
  }

  async createJournalEntry(
    tenantId: string,
    dto: JournalEntryInput,
    db: JournalWriter = this.prisma,
  ) {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException(
        'Journal entry must contain at least one line',
      );
    }

    const entryDate = dto.entryDate;
    if (!(entryDate instanceof Date) || Number.isNaN(entryDate.getTime())) {
      throw new BadRequestException(
        "Provodka sanasi ko'rsatilmagan (manba hujjat sanasi kerak)",
      );
    }
    // D4: no entry may be dated in a closed accounting period.
    await assertPeriodOpen(db, tenantId, entryDate, 'post');
    const entryNumber = await nextDocumentNumber(
      db,
      tenantId,
      'JOURNAL_ENTRY',
      entryDate,
    );

    return db.journalEntry.create({
      data: {
        tenantId,
        entryNumber,
        entryDate,
        description: dto.description,
        sourceDocType: dto.sourceDocType || null,
        sourceDocId: dto.sourceDocId || null,
        lines: {
          create: dto.lines.map((line) => {
            const original = lineOriginalAmount(line);
            return {
              debitAccountId: line.debitAccountId,
              creditAccountId: line.creditAccountId,
              amount: line.amount,
              currency: original.currency,
              amountOrig: original.amountOrig,
              description: line.description || null,
            };
          }),
        },
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
  }

  /**
   * Cancels the journal entries of one source document (unposting,
   * cancelling or deleting it) with storno entries: nothing is deleted
   * (Buxgalteriya TZ 10.2). Each still-active original is marked REVERSED and
   * gets a storno entry with the same lines, debit and credit swapped, dated
   * like the original so every period's balances net out exactly as before.
   * The closed-period rule (D4) is checked for the originals' dates.
   */
  async reverseEntriesForSource(
    db: JournalWriter,
    tenantId: string,
    sourceDocType: string,
    sourceDocId: string,
    action: PeriodAction,
  ): Promise<void> {
    const entries = await db.journalEntry.findMany({
      where: {
        tenantId,
        sourceDocType,
        sourceDocId,
        status: 'POSTED',
        reversedOfId: null,
      },
      include: { lines: true },
      orderBy: { entryNumber: 'asc' },
    });
    if (entries.length === 0) return;
    await assertPeriodOpen(
      db,
      tenantId,
      entries.map((entry) => entry.entryDate),
      action,
    );
    for (const entry of entries) {
      await this.writeStorno(db, tenantId, entry);
    }
  }

  /**
   * Cancels one journal entry with a storno entry, for sources that share a
   * key across several entries (legacy purchase payments were keyed by their
   * receipt). Same closed-period rule (D4) as reverseEntriesForSource.
   */
  async reverseEntry(
    db: JournalWriter,
    tenantId: string,
    entryId: string,
    action: PeriodAction,
  ): Promise<void> {
    const entry = await db.journalEntry.findFirst({
      where: { id: entryId, tenantId, status: 'POSTED', reversedOfId: null },
      include: { lines: true },
    });
    if (!entry) return;
    await assertPeriodOpen(db, tenantId, [entry.entryDate], action);
    await this.writeStorno(db, tenantId, entry);
  }

  private async writeStorno(
    db: JournalWriter,
    tenantId: string,
    entry: Prisma.JournalEntryGetPayload<{ include: { lines: true } }>,
  ): Promise<void> {
    // Claim the original first: a concurrent cancel of the same document
    // finds it already REVERSED and writes no second storno.
    const claimed = await db.journalEntry.updateMany({
      where: { id: entry.id, tenantId, status: 'POSTED' },
      data: { status: 'REVERSED' },
    });
    if (claimed.count === 0) return;
    const entryNumber = await nextDocumentNumber(
      db,
      tenantId,
      'JOURNAL_ENTRY',
      entry.entryDate,
    );
    await db.journalEntry.create({
      data: {
        tenantId,
        entryNumber,
        entryDate: entry.entryDate,
        description: `Storno (${entry.entryNumber}): ${entry.description}`,
        sourceDocType: entry.sourceDocType,
        sourceDocId: entry.sourceDocId,
        reversedOfId: entry.id,
        lines: {
          create: entry.lines.map((line) => ({
            debitAccountId: line.creditAccountId,
            creditAccountId: line.debitAccountId,
            amount: line.amount,
            currency: line.currency,
            amountOrig: line.amountOrig,
            description: line.description,
          })),
        },
      },
    });
  }

  /**
   * Auto-post Journal Entries when a Payment is received
   * Dt 5110 (Bank) or Dt 5010 (Cash) / Kt 4010 (Customer)
   */
  async autoPostPayment(
    tenantId: string,
    payment: CashPaymentForJournal,
    db: JournalWriter & Pick<Prisma.TransactionClient, 'account'> = this.prisma,
  ) {
    // Accounts are read with the caller's transaction client: a lookup on
    // another connection while the payment transaction holds one could wait
    // for a free connection until the transaction times out. The caller seeds
    // the default chart (AccountsService.ensureDefaultAccounts) beforehand.
    const ledger = async (code: string) => {
      const account = await db.account.findFirst({ where: { tenantId, code } });
      if (!account) {
        throw new BadRequestException(
          `Buxgalteriya hisobi ${code} sozlanmagan / Счёт ${code} не настроен`,
        );
      }
      return account;
    };
    const exchangeRate = requireExchangeRateForCurrency(
      payment.currency,
      payment.exchangeRate,
    );

    const cashLedgerAccountCode = payment.cashAccount
      ? ledgerAccountCodeForCashAccount(payment.cashAccount)
      : null;
    if (!cashLedgerAccountCode) {
      throw new BadRequestException(
        'Payment must reference a valid, currency-specific cash or bank account',
      );
    }
    const accBank = await ledger(cashLedgerAccountCode);
    const acc4010 = await ledger('4010');

    const linkedDocument = payment.invoice ?? payment.salesOrder;
    if (!linkedDocument || linkedDocument.currency !== payment.currency) {
      throw new BadRequestException(
        'Payment must link to a sales document in the same currency',
      );
    }
    const documentExchangeRate = requireExchangeRateForCurrency(
      linkedDocument.currency,
      Number(linkedDocument.exchangeRate),
    );
    const cashAmountInUzs = convertAmountToUzs(
      Number(payment.amount),
      payment.currency,
      exchangeRate,
    );
    const receivableReductionInUzs = convertAmountToUzs(
      Number(payment.amount),
      linkedDocument.currency,
      documentExchangeRate,
    );
    const exchangeDifference =
      Math.round((cashAmountInUzs - receivableReductionInUzs) * 100) / 100;
    const exchangeNote =
      payment.currency === 'USD'
        ? ` (to'lov kursi: 1 USD = ${exchangeRate} UZS, hujjat kursi: 1 USD = ${documentExchangeRate} UZS)`
        : '';
    const journalLines: JournalLineDto[] = [
      {
        debitAccountId: accBank.id,
        creditAccountId: acc4010.id,
        amount: Math.min(cashAmountInUzs, receivableReductionInUzs),
        currency: payment.currency,
        amountOrig: Number(payment.amount),
        description: `Mijozdan to'lov (${payment.method})`,
      },
    ];

    if (exchangeDifference > 0) {
      const exchangeGainAccount = await ledger('9540');
      journalLines.push({
        debitAccountId: accBank.id,
        creditAccountId: exchangeGainAccount.id,
        amount: exchangeDifference,
        description: `To'lov bo'yicha valyuta kursi daromadi${exchangeNote}`,
      });
    } else if (exchangeDifference < 0) {
      const exchangeLossAccount = await ledger('9620');
      journalLines.push({
        debitAccountId: exchangeLossAccount.id,
        creditAccountId: acc4010.id,
        amount: Math.abs(exchangeDifference),
        description: `To'lov bo'yicha valyuta kursi zarari${exchangeNote}`,
      });
    }

    await this.createJournalEntry(
      tenantId,
      {
        entryDate: payment.paymentDate,
        description: `Avtomatik provodka: To'lov kelib tushishi № ${payment.paymentNumber}${exchangeNote}`,
        sourceDocType: 'Payment',
        sourceDocId: payment.id,
        lines: journalLines,
      },
      db,
    );
  }

  /**
   * Auto-post Journal Entries when goods are received from supplier (Inbound Receiving)
   * Dt 2910 (Warehouse Goods) / Kt 6010 (Accounts Payable)
   */
  async autoPostInboundDoc(
    tenantId: string,
    doc: InboundDocForJournal,
    db: JournalWriter = this.prisma,
  ) {
    await this.accountsService.ensureDefaultAccounts(tenantId);

    const acc2910 = await this.accountsService.findByCode(tenantId, '2910');
    const acc6010 = await this.accountsService.findByCode(tenantId, '6010');

    if (!acc2910 || !acc6010) return;

    const total = Number(doc.totalAmount);
    if (total > 0) {
      await this.createJournalEntry(
        tenantId,
        {
          entryDate: doc.docDate,
          description: `Avtomatik provodka: Omborga tovar kirim qilish № ${doc.docNumber}`,
          sourceDocType: 'InventoryDocument',
          sourceDocId: doc.id,
          lines: [
            {
              debitAccountId: acc2910.id,
              creditAccountId: acc6010.id,
              amount: total,
              description: `Omborga tovar kelib tushishi (Kirim № ${doc.docNumber})`,
            },
          ],
        },
        db,
      );
    }
  }

  /**
   * Step 1: Auto-post Journal Entry when Stock Transfer is Shipped (Jo'natildi)
   * Dt 2920 (Yo'ldagi tovarlar / In-Transit) / Kt 2910 (Chiquvchi Ombor)
   */
  async autoPostShipTransfer(
    tenantId: string,
    transfer: TransferForJournal,
    totalCostValue: number,

    db: JournalWriter = this.prisma,
  ) {
    await this.accountsService.ensureDefaultAccounts(tenantId);

    const acc2920 = await this.accountsService.findByCode(tenantId, '2920');
    const acc2910 = await this.accountsService.findByCode(tenantId, '2910');

    if (!acc2920 || !acc2910 || totalCostValue <= 0) return;

    await this.createJournalEntry(
      tenantId,
      {
        entryDate: transfer.transferDate,
        description: `Avtomatik provodka: Omborlararo tovar jo'natish № ${transfer.transferNumber}`,
        sourceDocType: 'StockTransfer',
        sourceDocId: transfer.id,
        lines: [
          {
            debitAccountId: acc2920.id,
            creditAccountId: acc2910.id,
            amount: totalCostValue,
            description: `Yo'ldagi tovarlar bo'yicha kirim (Transfer № ${transfer.transferNumber})`,
          },
        ],
      },
      db,
    );
  }

  /**
   * Step 2: Auto-post Journal Entry when Stock Transfer is Received at Target Warehouse (Qabul qilindi)
   * Dt 2910 (Kiruvchi Ombor) / Kt 2920 (Yo'ldagi tovarlar / In-Transit)
   */
  async autoPostReceiveTransfer(
    tenantId: string,
    transfer: TransferForJournal,
    totalCostValue: number,

    db: JournalWriter = this.prisma,
  ) {
    await this.accountsService.ensureDefaultAccounts(tenantId);

    const acc2910 = await this.accountsService.findByCode(tenantId, '2910');
    const acc2920 = await this.accountsService.findByCode(tenantId, '2920');

    if (!acc2910 || !acc2920 || totalCostValue <= 0) return;
    if (!transfer.receivedAt) {
      throw new BadRequestException(
        "Transfer qabul qilingan sana ko'rsatilmagan",
      );
    }

    await this.createJournalEntry(
      tenantId,
      {
        entryDate: transfer.receivedAt,
        description: `Avtomatik provodka: Omborlararo tovar qabul qilish № ${transfer.transferNumber}`,
        sourceDocType: 'StockTransfer',
        sourceDocId: transfer.id,
        lines: [
          {
            debitAccountId: acc2910.id,
            creditAccountId: acc2920.id,
            amount: totalCostValue,
            description: `Mo'ljallangan omborga tovar yetib kelishi (Transfer № ${transfer.transferNumber})`,
          },
        ],
      },
      db,
    );
  }

  /**
   * The journal for one tenant, newest first, filtered and paged
   * (GET /api/accounting/journal). `accountCode` keeps entries that touch
   * that account; `q` matches the entry number, description, an account
   * code or an amount.
   */
  async findEntries(tenantId: string, query: JournalQuery = {}) {
    const page = Math.max(1, Math.floor(query.page ?? 1));
    const pageSize = Math.min(
      200,
      Math.max(1, Math.floor(query.pageSize ?? 50)),
    );
    const and: Prisma.JournalEntryWhereInput[] = [{ tenantId }];
    const range = dateRangeFilter(query.from, query.to);
    if (range) and.push({ entryDate: range });
    if (query.source) {
      if (query.source === 'other') {
        const known = Object.values(JOURNAL_SOURCE_GROUPS).flat();
        and.push({
          OR: [{ sourceDocType: null }, { sourceDocType: { notIn: known } }],
        });
      } else if (query.source in JOURNAL_SOURCE_GROUPS) {
        const group = query.source as Exclude<JournalSourceGroup, 'other'>;
        and.push({ sourceDocType: { in: JOURNAL_SOURCE_GROUPS[group] } });
      } else {
        and.push({ sourceDocType: query.source });
      }
    }
    if (query.sourceDocId) and.push({ sourceDocId: query.sourceDocId });
    // One code or several, comma-separated (a card's accounts).
    const codes = (query.accountCode ?? '')
      .split(',')
      .map((code) => code.trim())
      .filter(Boolean);
    if (codes.length > 0) {
      and.push({
        lines: {
          some: {
            OR: [
              { debitAccount: { code: { in: codes } } },
              { creditAccount: { code: { in: codes } } },
            ],
          },
        },
      });
    }
    const q = query.q?.trim();
    if (q) {
      const or: Prisma.JournalEntryWhereInput[] = [
        { entryNumber: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        {
          lines: {
            some: {
              OR: [
                { debitAccount: { code: q } },
                { creditAccount: { code: q } },
                { description: { contains: q, mode: 'insensitive' } },
              ],
            },
          },
        },
      ];
      const amount = Number(q.replace(/[\s\u00a0]/g, '').replace(',', '.'));
      if (Number.isFinite(amount) && amount > 0) {
        or.push({ lines: { some: { amount } } });
      }
      and.push({ OR: or });
    }
    const where: Prisma.JournalEntryWhereInput = { AND: and };
    const [items, total] = await Promise.all([
      this.prisma.journalEntry.findMany({
        where,
        include: JOURNAL_ENTRY_INCLUDE,
        orderBy: [{ entryDate: 'desc' }, { entryNumber: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.journalEntry.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  /**
   * Auto-post Journal Entries when a Service Act is posted
   * PROVIDED:
   * 1. Dt 4010 (Customer Receivables) / Kt 9030 (Service Revenue) — Subtotal
   * 2. Dt 4010 (Customer Receivables) / Kt 6410 (VAT Payable) — VAT Amount (if > 0)
   * RECEIVED:
   * 1. Dt 9420 (Admin Expenses) / Kt 6010 (Supplier Payables) — Subtotal
   * 2. Dt 4410 (Input VAT) / Kt 6010 (Supplier Payables) — VAT Amount (if > 0)
   */
  async autoPostServiceAct(
    tenantId: string,
    act: ServiceActForJournal,
    db: JournalWriter = this.prisma,
  ) {
    await this.accountsService.ensureDefaultAccounts(tenantId);

    const lines: JournalLineDto[] = [];
    const exchangeRate = requireExchangeRateForCurrency(
      act.currency,
      Number(act.exchangeRate),
    );
    const subtotal = convertAmountToUzs(
      Number(act.subtotal),
      act.currency,
      exchangeRate,
    );
    const vat = convertAmountToUzs(
      Number(act.vatAmount),
      act.currency,
      exchangeRate,
    );

    if (act.type === 'PROVIDED') {
      const acc4010 = await this.accountsService.findByCode(tenantId, '4010');
      let acc9030 = await this.accountsService.findByCode(tenantId, '9030');
      if (!acc9030)
        acc9030 = await this.accountsService.findByCode(tenantId, '9010');
      const acc6410 = await this.accountsService.findByCode(tenantId, '6410');

      if (!acc4010 || !acc9030) return;

      if (subtotal > 0) {
        lines.push({
          debitAccountId: acc4010.id,
          creditAccountId: acc9030.id,
          amount: subtotal,
          description: `Ko'rsatilgan xizmatdan daromad (Akt № ${act.actNumber})`,
        });
      }

      if (vat > 0 && acc6410) {
        lines.push({
          debitAccountId: acc4010.id,
          creditAccountId: acc6410.id,
          amount: vat,
          description: `Ko'rsatilgan xizmat bo'yicha QQS (Akt № ${act.actNumber})`,
        });
      }
    } else if (act.type === 'RECEIVED') {
      const acc6010 = await this.accountsService.findByCode(tenantId, '6010');
      const acc9420 = await this.accountsService.findByCode(tenantId, '9420');
      const acc4410 = await this.accountsService.findByCode(tenantId, '4410');

      if (!acc6010 || !acc9420) return;

      if (subtotal > 0) {
        lines.push({
          debitAccountId: acc9420.id,
          creditAccountId: acc6010.id,
          amount: subtotal,
          description: `Olingan xizmat xarajati (Akt № ${act.actNumber})`,
        });
      }

      if (vat > 0 && acc4410) {
        lines.push({
          debitAccountId: acc4410.id,
          creditAccountId: acc6010.id,
          amount: vat,
          description: `Olingan xizmat bo'yicha kiruvchi QQS (Akt № ${act.actNumber})`,
        });
      }
    }

    if (lines.length > 0) {
      await this.createJournalEntry(
        tenantId,
        {
          entryDate: act.actDate,
          description: `Avtomatik provodka: Xizmatlar dalolatnomasi № ${act.actNumber}`,
          sourceDocType: 'ServiceAct',
          sourceDocId: act.id,
          lines,
        },
        db,
      );
    }
  }
}
