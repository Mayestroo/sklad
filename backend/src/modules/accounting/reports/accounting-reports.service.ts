import { BadRequestException, Injectable } from '@nestjs/common';
import { AccountType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma';
import { asJson } from '../../../common/utils/json-column';
import { AccountsService, presentAccount } from '../accounts/accounts.service';
import {
  dayAfter,
  JOURNAL_ENTRY_INCLUDE,
  parseDay,
} from '../journal/journal.service';
import {
  ACCOUNTING_CARD_KEYS,
  DEFAULT_CARD_ACCOUNTS,
  LEDGER_CURRENCY,
  type AccountingCardKey,
  type AccountingHealth,
  type AccountingIssue,
  type AccountingReportType,
  type ReportLine,
} from '../../../../../shared/types/accounting';

type Totals = { debit: number; credit: number };
type AccountRow = Prisma.AccountGetPayload<object>;

/** Money is compared to the tiyin; sums of Decimals as floats can differ in the last digits. */
const round2 = (value: number) => Math.round(value * 100) / 100;

/** Balance of an account in its natural sign: assets and expenses are debit-positive. */
export function signedBalance(
  type: AccountType,
  debit: number,
  credit: number,
) {
  return type === 'ASSET' || type === 'EXPENSE'
    ? round2(debit - credit)
    : round2(credit - debit);
}

/** YYYY-MM-DD of a date in UTC (entry dates are stored as UTC days). */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface Period {
  /** Inclusive first day, or null for "from the first entry". */
  from: string | null;
  /** Inclusive last day. */
  to: string;
}

/**
 * The requested period. With no dates it is "all time up to today"; a range
 * that ends before it starts is refused rather than silently swapped.
 */
export function resolvePeriod(
  from?: string,
  to?: string,
  today = new Date(),
): Period {
  const end = to ? isoDay(parseDay(to, 'to')) : isoDay(today);
  const start = from ? isoDay(parseDay(from, 'from')) : null;
  if (start && start > end) {
    throw new BadRequestException(
      'Davr boshi oxiridan keyin / Начало периода позже конца',
    );
  }
  return { from: start, to: end };
}

/** The period of equal length right before `period` (for "compared with" figures). */
export function previousPeriod(period: { from: string; to: string }): {
  from: string;
  to: string;
} {
  const start = parseDay(period.from, 'from');
  const end = parseDay(period.to, 'to');
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const prevEnd = new Date(start);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevStart.getUTCDate() - (days - 1));
  return { from: isoDay(prevStart), to: isoDay(prevEnd) };
}

/** Card → account codes from `Company.settings.accounting.cardAccounts`, defaults for the rest. */
export function cardAccountsFromSettings(
  settings: Prisma.JsonValue | null | undefined,
): Record<AccountingCardKey, string[]> {
  const result = { ...DEFAULT_CARD_ACCOUNTS };
  const accounting =
    settings && typeof settings === 'object' && !Array.isArray(settings)
      ? settings.accounting
      : null;
  const cards =
    accounting && typeof accounting === 'object' && !Array.isArray(accounting)
      ? accounting.cardAccounts
      : null;
  if (cards && typeof cards === 'object' && !Array.isArray(cards)) {
    for (const key of ACCOUNTING_CARD_KEYS) {
      const codes = cards[key];
      if (
        Array.isArray(codes) &&
        codes.every((code) => typeof code === 'string')
      ) {
        result[key] = codes;
      }
    }
  }
  return result;
}

@Injectable()
export class AccountingReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
  ) {}

  // ── building blocks ────────────────────────────────────────────────────────

  private async accounts(tenantId: string): Promise<AccountRow[]> {
    await this.accountsService.ensureDefaultAccounts(tenantId);
    return this.prisma.account.findMany({
      where: { tenantId },
      orderBy: { code: 'asc' },
    });
  }

  /** Debit and credit sums per account for entries dated in [gte, lt). */
  private async totalsByAccount(
    tenantId: string,
    range: { gte?: Date; lt?: Date },
  ): Promise<Map<string, Totals>> {
    const where: Prisma.JournalLineWhereInput = {
      entry: {
        tenantId,
        ...(range.gte || range.lt ? { entryDate: range } : {}),
      },
    };
    const [debits, credits] = await Promise.all([
      this.prisma.journalLine.groupBy({
        by: ['debitAccountId'],
        where,
        _sum: { amount: true },
      }),
      this.prisma.journalLine.groupBy({
        by: ['creditAccountId'],
        where,
        _sum: { amount: true },
      }),
    ]);
    const totals = new Map<string, Totals>();
    const get = (id: string) => {
      let row = totals.get(id);
      if (!row) {
        row = { debit: 0, credit: 0 };
        totals.set(id, row);
      }
      return row;
    };
    for (const row of debits)
      get(row.debitAccountId).debit += Number(row._sum.amount ?? 0);
    for (const row of credits)
      get(row.creditAccountId).credit += Number(row._sum.amount ?? 0);
    return totals;
  }

  /** Signed balance per account id of everything dated before `before` (exclusive). */
  private async balancesBefore(
    tenantId: string,
    accounts: AccountRow[],
    before: Date,
  ) {
    const totals = await this.totalsByAccount(tenantId, { lt: before });
    const balances = new Map<string, number>();
    for (const account of accounts) {
      const row = totals.get(account.id);
      balances.set(
        account.id,
        row ? signedBalance(account.type, row.debit, row.credit) : 0,
      );
    }
    return balances;
  }

  private async cardAccounts(tenantId: string) {
    const company = await this.prisma.company.findFirst({
      where: { id: tenantId },
      select: { settings: true },
    });
    return cardAccountsFromSettings(company?.settings);
  }

  // ── trial balance (aylanma-saldo) ──────────────────────────────────────────

  /**
   * Trial balance for a period (TZ 9): balance at the start, debit and credit
   * turnover within it, balance at the end. Storno entries count like any
   * other, so a cancelled document nets to zero.
   */
  async getTrialBalance(tenantId: string, from?: string, to?: string) {
    const period = resolvePeriod(from, to);
    const accounts = await this.accounts(tenantId);
    const start = period.from ? parseDay(period.from, 'from') : undefined;
    const end = dayAfter(parseDay(period.to, 'to'));
    const [opening, turnover] = await Promise.all([
      start
        ? this.totalsByAccount(tenantId, { lt: start })
        : Promise.resolve(new Map<string, Totals>()),
      this.totalsByAccount(tenantId, { gte: start, lt: end }),
    ]);

    let totalDebitTurnover = 0;
    let totalCreditTurnover = 0;
    const items = accounts.map((account) => {
      const before = opening.get(account.id) ?? { debit: 0, credit: 0 };
      const within = turnover.get(account.id) ?? { debit: 0, credit: 0 };
      const openingBalance = signedBalance(
        account.type,
        before.debit,
        before.credit,
      );
      const debitTurnover = round2(within.debit);
      const creditTurnover = round2(within.credit);
      totalDebitTurnover += debitTurnover;
      totalCreditTurnover += creditTurnover;
      const presented = presentAccount(account);
      return {
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name as { uz: string; ru: string },
        accountAlias: presented.alias,
        accountType: account.type,
        isTechnical: account.isTechnical,
        openingBalance,
        debitTurnover,
        creditTurnover,
        closingBalance: round2(
          openingBalance +
            signedBalance(account.type, within.debit, within.credit),
        ),
      };
    });

    return {
      periodStart: period.from,
      periodEnd: period.to,
      currency: LEDGER_CURRENCY,
      items,
      totalDebitTurnover: round2(totalDebitTurnover),
      totalCreditTurnover: round2(totalCreditTurnover),
    };
  }

  /**
   * Balance sheet (form 1) at the end of the period and the result (form 2)
   * for the period. Equity is the equity accounts plus the result not yet
   * closed to retained earnings, so assets = liabilities + equity.
   */
  async getFinancialStatements(tenantId: string, from?: string, to?: string) {
    const [balance, pnl] = await Promise.all([
      this.balanceReport(tenantId, to),
      this.profitLossReport(tenantId, from, to),
    ]);
    return {
      currency: LEDGER_CURRENCY,
      periodStart: pnl.periodStart,
      periodEnd: pnl.periodEnd,
      balanceSheet: {
        totalAssets: balance.totalAssets,
        totalLiabilities: balance.totalLiabilities,
        totalEquity: balance.totalEquity,
        isBalanced: balance.isBalanced,
      },
      profitLoss: {
        totalRevenue: pnl.totalRevenue,
        totalCogs: pnl.totalExpenses,
        grossProfit: pnl.netProfit,
        netProfit: pnl.netProfit,
      },
    };
  }

  // ── reports (TZ 7) ─────────────────────────────────────────────────────────

  async getReport(tenantId: string, type: string, from?: string, to?: string) {
    switch (type as AccountingReportType) {
      case 'profit-loss':
        return this.profitLossReport(tenantId, from, to);
      case 'balance':
        return this.balanceReport(tenantId, to);
      case 'cash-flow':
        return this.cashFlowReport(tenantId, from, to);
      default:
        throw new BadRequestException(
          `Noma'lum hisobot: ${type} / Неизвестный отчёт: ${type}`,
        );
    }
  }

  private line(account: AccountRow, amount: number): ReportLine {
    const presented = presentAccount(account);
    return {
      code: account.code,
      name: presented.alias ?? (account.name as { uz: string; ru: string }),
      amount,
    };
  }

  async profitLossReport(tenantId: string, from?: string, to?: string) {
    const tb = await this.getTrialBalance(tenantId, from, to);
    const accounts = await this.accounts(tenantId);
    const byId = new Map(accounts.map((account) => [account.id, account]));
    const revenue: ReportLine[] = [];
    const expenses: ReportLine[] = [];
    for (const item of tb.items) {
      const account = byId.get(item.accountId);
      if (!account) continue;
      const net = signedBalance(
        item.accountType,
        item.debitTurnover,
        item.creditTurnover,
      );
      if (net === 0) continue;
      if (item.accountType === 'REVENUE') revenue.push(this.line(account, net));
      if (item.accountType === 'EXPENSE')
        expenses.push(this.line(account, net));
    }
    const totalRevenue = round2(
      revenue.reduce((sum, row) => sum + row.amount, 0),
    );
    const totalExpenses = round2(
      expenses.reduce((sum, row) => sum + row.amount, 0),
    );
    return {
      type: 'profit-loss' as const,
      currency: LEDGER_CURRENCY,
      periodStart: tb.periodStart,
      periodEnd: tb.periodEnd,
      revenue,
      expenses,
      totalRevenue,
      totalExpenses,
      netProfit: round2(totalRevenue - totalExpenses),
    };
  }

  async balanceReport(tenantId: string, to?: string) {
    const tb = await this.getTrialBalance(tenantId, undefined, to);
    const accounts = await this.accounts(tenantId);
    const byId = new Map(accounts.map((account) => [account.id, account]));
    const assets: ReportLine[] = [];
    const liabilities: ReportLine[] = [];
    const equity: ReportLine[] = [];
    let result = 0;
    for (const item of tb.items) {
      const account = byId.get(item.accountId);
      if (!account) continue;
      if (item.accountType === 'REVENUE') result += item.closingBalance;
      else if (item.accountType === 'EXPENSE') result -= item.closingBalance;
      else if (item.closingBalance !== 0 && !item.isTechnical) {
        const row = this.line(account, item.closingBalance);
        if (item.accountType === 'ASSET') assets.push(row);
        else if (item.accountType === 'LIABILITY') liabilities.push(row);
        else equity.push(row);
      } else if (item.isTechnical && item.closingBalance !== 0) {
        // A technical account should net to zero; if it does not, show it so
        // the sheet still adds up and the difference is visible.
        equity.push(this.line(account, item.closingBalance));
      }
    }
    result = round2(result);
    if (result !== 0) {
      equity.push({
        name: {
          uz: 'Joriy natija (yopilmagan foyda)',
          ru: 'Текущий результат (незакрытая прибыль)',
        },
        amount: result,
      });
    }
    const sum = (rows: ReportLine[]) =>
      round2(rows.reduce((acc, row) => acc + row.amount, 0));
    const totalAssets = sum(assets);
    const totalLiabilities = sum(liabilities);
    const totalEquity = sum(equity);
    return {
      type: 'balance' as const,
      currency: LEDGER_CURRENCY,
      periodEnd: tb.periodEnd,
      assets,
      liabilities,
      equity,
      totalAssets,
      totalLiabilities,
      totalEquity,
      isBalanced:
        Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
    };
  }

  /**
   * Money in and out of the "Pul" card accounts in the period, by the account
   * on the other side. Moves between two money accounts are neither in nor out.
   */
  async cashFlowReport(tenantId: string, from?: string, to?: string) {
    const period = resolvePeriod(from, to);
    const [accounts, cards] = await Promise.all([
      this.accounts(tenantId),
      this.cardAccounts(tenantId),
    ]);
    const cash = new Set(
      accounts.filter((a) => cards.money.includes(a.code)).map((a) => a.id),
    );
    const byId = new Map(accounts.map((account) => [account.id, account]));
    const start = period.from ? parseDay(period.from, 'from') : undefined;
    const end = dayAfter(parseDay(period.to, 'to'));
    const [pairs, openingBalances] = await Promise.all([
      this.prisma.journalLine.groupBy({
        by: ['debitAccountId', 'creditAccountId'],
        where: { entry: { tenantId, entryDate: { gte: start, lt: end } } },
        _sum: { amount: true },
      }),
      start
        ? this.balancesBefore(tenantId, accounts, start)
        : Promise.resolve(new Map<string, number>()),
    ]);
    const inflowBy = new Map<string, number>();
    const outflowBy = new Map<string, number>();
    for (const pair of pairs) {
      const amount = Number(pair._sum.amount ?? 0);
      const debitCash = cash.has(pair.debitAccountId);
      const creditCash = cash.has(pair.creditAccountId);
      if (debitCash && !creditCash) {
        inflowBy.set(
          pair.creditAccountId,
          (inflowBy.get(pair.creditAccountId) ?? 0) + amount,
        );
      } else if (creditCash && !debitCash) {
        outflowBy.set(
          pair.debitAccountId,
          (outflowBy.get(pair.debitAccountId) ?? 0) + amount,
        );
      }
    }
    const lines = (map: Map<string, number>) =>
      [...map.entries()]
        .map(([id, amount]) => {
          const account = byId.get(id);
          return account ? this.line(account, round2(amount)) : null;
        })
        .filter((row): row is ReportLine => row !== null)
        .sort((a, b) => b.amount - a.amount);
    const opening = round2(
      [...cash].reduce((sum, id) => sum + (openingBalances.get(id) ?? 0), 0),
    );
    const inflow = round2([...inflowBy.values()].reduce((a, b) => a + b, 0));
    const outflow = round2([...outflowBy.values()].reduce((a, b) => a + b, 0));
    return {
      type: 'cash-flow' as const,
      currency: LEDGER_CURRENCY,
      periodStart: period.from,
      periodEnd: period.to,
      opening,
      inflow,
      outflow,
      closing: round2(opening + inflow - outflow),
      inflowBy: lines(inflowBy),
      outflowBy: lines(outflowBy),
    };
  }

  // ── simple-mode summary (TZ 5) ─────────────────────────────────────────────

  /**
   * The six cards, the health banner and the last five movements. Balance
   * cards are today's balances (compared with the start of the period); the
   * profit card is the period's result (compared with the previous period of
   * the same length). Technical accounts are left out of every figure.
   */
  async getSummary(
    tenantId: string,
    from?: string,
    to?: string,
    today = new Date(),
  ) {
    const todayIso = isoDay(today);
    const end = to ? isoDay(parseDay(to, 'to')) : todayIso;
    const start = from
      ? isoDay(parseDay(from, 'from'))
      : `${end.slice(0, 7)}-01`;
    if (start > end) {
      throw new BadRequestException(
        'Davr boshi oxiridan keyin / Начало периода позже конца',
      );
    }
    const prev = previousPeriod({ from: start, to: end });
    const [accounts, cards] = await Promise.all([
      this.accounts(tenantId),
      this.cardAccounts(tenantId),
    ]);
    const visible = accounts.filter((account) => !account.isTechnical);
    const [now, atStart, periodPnl, prevPnl, health, recent, entryCount] =
      await Promise.all([
        this.balancesBefore(
          tenantId,
          visible,
          dayAfter(parseDay(todayIso, 'today')),
        ),
        this.balancesBefore(tenantId, visible, parseDay(start, 'from')),
        this.totalsByAccount(tenantId, {
          gte: parseDay(start, 'from'),
          lt: dayAfter(parseDay(end, 'to')),
        }),
        this.totalsByAccount(tenantId, {
          gte: parseDay(prev.from, 'from'),
          lt: dayAfter(parseDay(prev.to, 'to')),
        }),
        this.getHealth(tenantId),
        this.prisma.journalEntry.findMany({
          where: { tenantId },
          include: JOURNAL_ENTRY_INCLUDE,
          orderBy: [{ entryDate: 'desc' }, { entryNumber: 'desc' }],
          take: 5,
        }),
        this.prisma.journalEntry.count({ where: { tenantId } }),
      ]);

    const balanceCard = (codes: string[], sign = 1) => {
      const members = visible.filter((account) => codes.includes(account.code));
      const parts = members.map((account) => {
        const presented = presentAccount(account);
        return {
          accountId: account.id,
          code: account.code,
          name: account.name as { uz: string; ru: string },
          alias: presented.alias,
          balance: round2(sign * (now.get(account.id) ?? 0)),
        };
      });
      return {
        value: round2(parts.reduce((sum, part) => sum + part.balance, 0)),
        previous: round2(
          members.reduce(
            (sum, account) => sum + sign * (atStart.get(account.id) ?? 0),
            0,
          ),
        ),
        parts: parts.filter((part) => part.balance !== 0),
      };
    };

    const pnl = (totals: Map<string, Totals>) => {
      let revenue = 0;
      let expenses = 0;
      for (const account of visible) {
        const row = totals.get(account.id);
        if (!row) continue;
        if (account.type === 'REVENUE') revenue += row.credit - row.debit;
        if (account.type === 'EXPENSE') expenses += row.debit - row.credit;
      }
      return { revenue: round2(revenue), expenses: round2(expenses) };
    };
    const current = pnl(periodPnl);
    const previous = pnl(prevPnl);
    const profitParts = visible
      .filter(
        (account) => account.type === 'REVENUE' || account.type === 'EXPENSE',
      )
      .map((account) => {
        const row = periodPnl.get(account.id);
        const presented = presentAccount(account);
        return {
          accountId: account.id,
          code: account.code,
          name: account.name as { uz: string; ru: string },
          alias: presented.alias,
          balance: row ? signedBalance(account.type, row.debit, row.credit) : 0,
        };
      })
      .filter((part) => part.balance !== 0);

    const worth = (balances: Map<string, number>) =>
      round2(
        visible.reduce((sum, account) => {
          if (account.type === 'ASSET')
            return sum + (balances.get(account.id) ?? 0);
          if (account.type === 'LIABILITY')
            return sum - (balances.get(account.id) ?? 0);
          return sum;
        }, 0),
      );
    const netWorthParts = visible
      .filter(
        (account) => account.type === 'ASSET' || account.type === 'LIABILITY',
      )
      .map((account) => {
        const presented = presentAccount(account);
        const balance = now.get(account.id) ?? 0;
        return {
          accountId: account.id,
          code: account.code,
          name: account.name as { uz: string; ru: string },
          alias: presented.alias,
          balance: round2(account.type === 'ASSET' ? balance : -balance),
        };
      })
      .filter((part) => part.balance !== 0);

    return {
      currency: LEDGER_CURRENCY,
      periodStart: start,
      periodEnd: end,
      hasData: entryCount > 0,
      cards: {
        money: balanceCard(cards.money),
        receivables: balanceCard(cards.receivables),
        payables: balanceCard(cards.payables),
        inventory: balanceCard(cards.inventory),
        profit: {
          value: round2(current.revenue - current.expenses),
          previous: round2(previous.revenue - previous.expenses),
          revenue: current.revenue,
          expenses: current.expenses,
          parts: profitParts,
        },
        netWorth: {
          value: worth(now),
          previous: worth(atStart),
          parts: netWorthParts,
        },
      },
      cardAccounts: cards,
      health,
      recent,
    };
  }

  async updateCardAccounts(
    tenantId: string,
    cards: Partial<Record<AccountingCardKey, string[]>>,
  ) {
    const company = await this.prisma.company.findFirst({
      where: { id: tenantId },
      select: { settings: true },
    });
    const accounts = await this.accounts(tenantId);
    const known = new Set(accounts.map((account) => account.code));
    for (const key of ACCOUNTING_CARD_KEYS) {
      const unknown = (cards[key] ?? []).filter((code) => !known.has(code));
      if (unknown.length > 0) {
        throw new BadRequestException(
          `Hisob topilmadi: ${unknown.join(', ')} / Счёт не найден: ${unknown.join(', ')}`,
        );
      }
    }
    const settings =
      company?.settings &&
      typeof company.settings === 'object' &&
      !Array.isArray(company.settings)
        ? (company.settings as Record<string, unknown>)
        : {};
    const accounting =
      settings.accounting &&
      typeof settings.accounting === 'object' &&
      !Array.isArray(settings.accounting)
        ? (settings.accounting as Record<string, unknown>)
        : {};
    const next = {
      ...cardAccountsFromSettings(company?.settings),
      ...Object.fromEntries(
        ACCOUNTING_CARD_KEYS.filter((key) => cards[key]).map((key) => [
          key,
          cards[key],
        ]),
      ),
    };
    await this.prisma.company.update({
      where: { id: tenantId },
      data: {
        settings: asJson({
          ...settings,
          accounting: { ...accounting, cardAccounts: next },
        }),
      },
    });
    return next;
  }

  // ── health checks (TZ 11) ──────────────────────────────────────────────────

  async getHealth(tenantId: string): Promise<AccountingHealth> {
    const issues: AccountingIssue[] = [];

    // 1. An entry with no lines was half saved.
    const empty = await this.prisma.journalEntry.findMany({
      where: { tenantId, lines: { none: {} } },
      select: { id: true, entryNumber: true },
      take: 10,
    });
    for (const entry of empty) {
      issues.push({
        code: 'ENTRY_WITHOUT_LINES',
        severity: 'error',
        params: { entry: entry.entryNumber },
      });
    }

    // 2. A posted sale or purchase that has no active journal entry.
    const [sales, receipts] = await Promise.all([
      this.prisma.$queryRaw<Array<{ id: string; number: string }>>`
        SELECT d.id, d.invoice_number AS number FROM sales_invoices d
        WHERE d.tenant_id = ${tenantId} AND d.status = 'POSTED' AND d.total_amount > 0
          AND NOT EXISTS (
            SELECT 1 FROM journal_entries e
            WHERE e.tenant_id = d.tenant_id AND e.source_doc_type = 'SalesInvoice'
              AND e.source_doc_id = d.id AND e.status = 'POSTED' AND e.reversed_of_id IS NULL)
        ORDER BY d.invoice_number LIMIT 10`,
      this.prisma.$queryRaw<Array<{ id: string; number: string }>>`
        SELECT d.id, d.doc_number AS number FROM purchase_receipts d
        WHERE d.tenant_id = ${tenantId} AND d.status = 'POSTED' AND d.total_amount > 0
          AND NOT EXISTS (
            SELECT 1 FROM journal_entries e
            WHERE e.tenant_id = d.tenant_id AND e.source_doc_type = 'PurchaseReceipt'
              AND e.source_doc_id = d.id AND e.status = 'POSTED' AND e.reversed_of_id IS NULL)
        ORDER BY d.doc_number LIMIT 10`,
    ]);
    for (const doc of sales) {
      issues.push({
        code: 'DOCUMENT_WITHOUT_ENTRY',
        severity: 'warning',
        params: { kind: 'sale', number: doc.number },
        href: `/sales/${doc.id}`,
      });
    }
    for (const doc of receipts) {
      issues.push({
        code: 'DOCUMENT_WITHOUT_ENTRY',
        severity: 'warning',
        params: { kind: 'purchase', number: doc.number },
        href: `/purchases/${doc.id}`,
      });
    }

    // 3. Stock value by FIFO batches against the ledger's inventory accounts.
    const [accounts, cards] = await Promise.all([
      this.accounts(tenantId),
      this.cardAccounts(tenantId),
    ]);
    const balances = await this.balancesBefore(
      tenantId,
      accounts,
      dayAfter(parseDay(isoDay(new Date()), 'today')),
    );
    const ledgerOf = (codes: string[]) =>
      round2(
        accounts
          .filter((account) => codes.includes(account.code))
          .reduce((sum, account) => sum + (balances.get(account.id) ?? 0), 0),
      );
    const [batchValue] = await this.prisma.$queryRaw<
      Array<{ value: Prisma.Decimal | null }>
    >`
      SELECT SUM(remaining_qty * landed_cost) AS value FROM product_batches
      WHERE tenant_id = ${tenantId} AND remaining_qty > 0`;
    const stock = round2(Number(batchValue?.value ?? 0));
    const ledgerStock = ledgerOf(cards.inventory);
    const difference = round2(stock - ledgerStock);
    // Rounding of per-unit costs leaves a few so'm; flag only a real gap.
    if (Math.abs(difference) > Math.max(1000, Math.abs(ledgerStock) * 0.001)) {
      issues.push({
        code: 'INVENTORY_MISMATCH',
        severity: 'warning',
        params: { difference, stock, ledger: ledgerStock },
        href: '/inventory',
      });
    }

    // 4. A money account below zero.
    for (const account of accounts.filter((a) =>
      cards.money.includes(a.code),
    )) {
      const balance = balances.get(account.id) ?? 0;
      if (balance < 0) {
        const presented = presentAccount(account);
        issues.push({
          code: 'NEGATIVE_CASH',
          severity: 'error',
          params: {
            code: account.code,
            nameUz: presented.alias?.uz ?? (account.name as { uz: string }).uz,
            nameRu: presented.alias?.ru ?? (account.name as { ru: string }).ru,
            balance,
          },
          href: `/accounting/journal?account=${encodeURIComponent(account.code)}`,
        });
      }
    }

    return {
      ok: issues.length === 0,
      checkedAt: new Date().toISOString(),
      issues,
    };
  }
}
