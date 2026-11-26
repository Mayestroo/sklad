'use client';

import { useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  AlertTriangle,
  ArrowLeftRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Download,
  Factory,
  FileText,
  Printer,
  RotateCcw,
  ShoppingCart,
  Truck,
  Wallet,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { formatCurrency, formatDate, formatDateTime, LEDGER_CURRENCY } from '@/lib/utils';
import { compactAmount, dayGroup, describeEntry, type EffectKey, type PlainEntry } from '@/lib/accounting-plain';
import { buildPrintHtml, buildXlsx, safeFileName, type ReportDoc } from '@/lib/accounting-export';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import type { AccountingCardKey, AccountingHealth, AccountingIssue, Account, JournalEntry } from '@shared/types';
import type { AccountingMode } from './AccountingShell';

/** Ledger amounts (always UZS, ADR 0006); zero is a quiet dash with "no movement" for screen readers and hover. */
export function useLedgerMoney() {
  const locale = useLocale();
  const t = useTranslations('acct');
  const full = (value: number) => formatCurrency(value, locale, LEDGER_CURRENCY);
  const compact = (value: number) => compactAmount(value, { thousand: t('units.thousand'), million: t('units.million'), billion: t('units.billion') });
  const cell = (value: number): ReactNode =>
    value === 0 ? (
      <span title={t('tb.zero')} aria-label={t('tb.zero')}>
        —
      </span>
    ) : (
      <span data-negative={value < 0 || undefined}>{full(value)}</span>
    );
  return { full, compact, cell };
}

/** Plain name of an account (alias), the official name otherwise. */
export function accountLabel(account: Pick<Account, 'name' | 'alias'> | undefined, locale: string): string {
  if (!account) return '—';
  const lang = locale === 'ru' ? 'ru' : 'uz';
  return account.alias?.[lang] || account.name?.[lang] || account.name?.uz || '';
}

export function officialLabel(account: Pick<Account, 'code' | 'name'> | undefined, locale: string): string {
  if (!account) return '—';
  const lang = locale === 'ru' ? 'ru' : 'uz';
  return `${account.code} · ${account.name?.[lang] || account.name?.uz || ''}`;
}

/** Where the document behind an entry opens, when it has its own page. */
export function documentHref(entry: Pick<JournalEntry, 'sourceDocType' | 'sourceDocId'>): string | undefined {
  const id = entry.sourceDocId;
  if (!id) return undefined;
  switch (entry.sourceDocType) {
    case 'SalesInvoice':
      return `/sales/${id}`;
    case 'SalesOrder':
      return `/sales/orders/${id}`;
    case 'PurchaseReceipt':
      return `/purchases/${id}`;
    case 'PurchaseReturn':
      return `/purchases/returns/${id}`;
    case 'AdditionalExpense':
      return `/purchases/expenses/${id}`;
    case 'FinanceTransaction':
      return '/finance';
    case 'ProductionDocument':
      return '/production';
    case 'OpeningBalanceDocument':
    case 'OpeningBalanceLine':
      return '/opening-balances';
    case 'ServiceAct':
      return '/services';
    case 'StockTransfer':
      return '/inventory/transfers';
    case 'InventoryDocument':
      return '/inventory/documents';
    default:
      return undefined;
  }
}

const ICONS: Record<string, typeof FileText> = {
  sale: ShoppingCart,
  saleReturn: RotateCcw,
  saleReturnCancel: RotateCcw,
  purchase: Truck,
  purchaseReturn: RotateCcw,
  purchaseExpense: Truck,
  customerPaid: Wallet,
  supplierPaid: Wallet,
  moneyIn: Wallet,
  moneyOut: Wallet,
  transfer: ArrowLeftRight,
  production: Factory,
  opening: BookOpen,
};

/** Positive deltas are good news except for our own debt. */
function effectTone(card: EffectKey, delta: number): 'positive' | 'negative' {
  const good = card === 'payables' ? delta < 0 : delta > 0;
  return good ? 'positive' : 'negative';
}

/**
 * The movements list (TZ 6): grouped by day, one plain sentence per entry with
 * "what changed" chips; a row opens who/when/which document/which accounts.
 * In the accountant mode the opened row shows the debit/credit lines.
 */
export function MovementList({
  entries,
  cardAccounts,
  mode,
}: {
  entries: JournalEntry[];
  cardAccounts: Record<AccountingCardKey, string[]>;
  mode: AccountingMode;
}) {
  const t = useTranslations('acct');
  const locale = useLocale();
  const money = useLedgerMoney();
  const [open, setOpen] = useState<string | null>(null);

  const days: Array<{ day: string; items: JournalEntry[] }> = [];
  for (const e of entries) {
    const day = (e.entryDate ?? e.createdAt ?? '').slice(0, 10);
    const last = days[days.length - 1];
    if (last && last.day === day) last.items.push(e);
    else days.push({ day, items: [e] });
  }

  const sentence = (plain: PlainEntry) => t(`plain.${plain.key}`, { amount: money.full(plain.amount) });

  return (
    <div aria-label={t('movements.aria')}>
      {days.map(({ day, items }) => {
        const group = dayGroup(day);
        return (
          <section key={day} aria-label={group === 'date' ? formatDate(day, locale) : t(`movements.${group}`)}>
            <h3 className="acct-mv-day">{group === 'date' ? formatDate(day, locale) : t(`movements.${group}`)}</h3>
            <ul className="acct-mv-list">
              {items.map((entry) => {
                const plain = describeEntry(entry, cardAccounts);
                const Icon = ICONS[plain.key] ?? FileText;
                const expanded = open === entry.id;
                const href = documentHref(entry);
                const detailId = `mv-${entry.id}`;
                return (
                  <li key={entry.id} className="acct-mv" data-cancelled={plain.isCancelled || undefined}>
                    <button type="button" className="acct-mv-row" aria-expanded={expanded} aria-controls={detailId} onClick={() => setOpen(expanded ? null : entry.id)}>
                      <span className="acct-mv-icon" aria-hidden>
                        <Icon size={18} />
                      </span>
                      <span className="acct-mv-main">
                        <span className="acct-mv-text">
                          {plain.isStorno && <Badge variant="warning">{t('movements.stornoOf')}</Badge>} {mode === 'accountant' ? entry.description : sentence(plain)}
                        </span>
                        <span className="acct-mv-chips">
                          {plain.isCancelled && <Badge variant="neutral">{t('movements.cancelled')}</Badge>}
                          {plain.effects.map((effect) => (
                            <span key={effect.card} className="acct-chip" data-tone={effectTone(effect.card, effect.delta)}>
                              {t(`effect.${effect.card}`)} {effect.delta > 0 ? '+' : '−'}
                              {money.compact(Math.abs(effect.delta))}
                            </span>
                          ))}
                        </span>
                      </span>
                      <span className="acct-mv-amount">
                        {money.full(plain.amount)}
                        <ChevronDown size={16} aria-hidden style={{ marginLeft: 6, verticalAlign: 'middle', transform: expanded ? 'rotate(180deg)' : undefined }} />
                      </span>
                    </button>
                    {expanded && (
                      <div id={detailId} className="acct-mv-detail">
                        <dl>
                          <dt>{t('movements.when')}</dt>
                          <dd>
                            {formatDate(entry.entryDate, locale)} <span className="rd-sub" style={{ display: 'inline', marginTop: 0 }}>({formatDateTime(entry.createdAt, locale)})</span>
                          </dd>
                          <dt>{t('movements.number')}</dt>
                          <dd className="tabular-nums">
                            {entry.entryNumber}
                            {entry.reversedOf ? ` ← ${entry.reversedOf.entryNumber}` : ''}
                            {entry.reversal ? ` → ${entry.reversal.entryNumber}` : ''}
                          </dd>
                          <dt>{t('movements.source')}</dt>
                          <dd>
                            {href ? (
                              <Link href={href} style={{ color: 'var(--color-primary-700)', textDecoration: 'underline' }}>
                                {t('movements.openDoc')}
                              </Link>
                            ) : entry.sourceDocType ? (
                              entry.description
                            ) : (
                              t('movements.noDocument')
                            )}
                          </dd>
                        </dl>
                        {mode === 'accountant' ? (
                          <div style={{ overflowX: 'auto' }}>
                            <table className="acct-lines">
                              <caption className="sr-only">{t('journal.lines')}</caption>
                              <thead>
                                <tr>
                                  <th scope="col">{t('journal.debit')}</th>
                                  <th scope="col">{t('journal.credit')}</th>
                                  <th scope="col" className="num">{t('journal.amount')}</th>
                                  <th scope="col" className="num">{t('journal.original')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(entry.lines ?? []).map((line) => (
                                  <tr key={line.id}>
                                    <td>{officialLabel(line.debitAccount, locale)}</td>
                                    <td>{officialLabel(line.creditAccount, locale)}</td>
                                    <td className="num">{money.full(Number(line.amount))}</td>
                                    <td className="num">{line.currency && line.currency !== LEDGER_CURRENCY ? formatCurrency(Number(line.amountOrig), locale, line.currency) : '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div>
                            <strong style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{t('movements.accounts')}</strong>
                            <ul style={{ margin: '4px 0 0', paddingLeft: 'var(--space-5)' }}>
                              {[...new Map((entry.lines ?? []).flatMap((l) => [l.debitAccount, l.creditAccount]).filter((a): a is Account => Boolean(a) && !a?.isTechnical).map((a) => [a.code, a])).values()].map((a) => (
                                <li key={a.code}>{accountLabel(a, locale)}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** One movement as a spreadsheet row of the simple mode: date, plain sentence, amount. */
export function describeForExport(entry: JournalEntry, cards: Record<AccountingCardKey, string[]>, t: ReturnType<typeof useTranslations>, locale: string): Array<string | number> {
  const plain = describeEntry(entry, cards);
  const text = t(`plain.${plain.key}`, { amount: formatCurrency(plain.amount, locale, LEDGER_CURRENCY) });
  const mark = plain.isCancelled ? ` (${t('movements.cancelled')})` : plain.isStorno ? ` (${t('movements.stornoOf')})` : '';
  return [formatDate(entry.entryDate, locale), text + mark, plain.amount];
}

/** One health issue in plain words (TZ 11). */
export function issueText(issue: AccountingIssue, t: ReturnType<typeof useTranslations>, money: (v: number) => string, locale: string): { title: string; fix: string } {
  const p = issue.params;
  switch (issue.code) {
    case 'DOCUMENT_WITHOUT_ENTRY':
      return { title: t(`issue.DOCUMENT_WITHOUT_ENTRY_${p.kind === 'purchase' ? 'purchase' : 'sale'}`, { number: String(p.number) }), fix: t('issue.DOCUMENT_WITHOUT_ENTRY_fix') };
    case 'INVENTORY_MISMATCH':
      return { title: t('issue.INVENTORY_MISMATCH', { amount: money(Math.abs(Number(p.difference))) }), fix: t('issue.INVENTORY_MISMATCH_fix') };
    case 'NEGATIVE_CASH':
      return { title: t('issue.NEGATIVE_CASH', { name: String(locale === 'ru' ? p.nameRu : p.nameUz), amount: money(Number(p.balance)) }), fix: t('issue.NEGATIVE_CASH_fix') };
    default:
      return { title: t('issue.ENTRY_WITHOUT_LINES', { entry: String(p.entry ?? '') }), fix: t('issue.ENTRY_WITHOUT_LINES_fix') };
  }
}

/** "Hisoblar to‘g‘ri" or "N ta narsani tekshirish kerak" with the list behind it (TZ 5.1, 11). */
export function StatusBanner({ health }: { health: AccountingHealth }) {
  const t = useTranslations('acct');
  const locale = useLocale();
  const money = useLedgerMoney();
  const [open, setOpen] = useState(false);
  if (health.ok) {
    return (
      <div className="acct-banner" data-tone="ok" role="status">
        <CheckCircle2 size={22} aria-hidden />
        <span className="acct-banner-text">
          <span className="acct-banner-title">{t('banner.ok')}</span>
          <span className="acct-banner-sub">{t('banner.okSub')}</span>
        </span>
      </div>
    );
  }
  const tone = health.issues.some((i) => i.severity === 'error') ? 'error' : 'warning';
  return (
    <>
      <button type="button" className="acct-banner" data-tone={tone} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <AlertTriangle size={22} aria-hidden />
        <span className="acct-banner-text" role="status">
          <span className="acct-banner-title">{t('banner.issues', { count: health.issues.length })}</span>
          <span className="acct-banner-sub">{t('banner.checkedAt', { time: formatDateTime(health.checkedAt, locale) })}</span>
        </span>
        <span style={{ fontWeight: 'var(--font-semibold)', textDecoration: 'underline' }}>{t('banner.view')}</span>
      </button>
      <Drawer isOpen={open} onClose={() => setOpen(false)} title={t('banner.panelTitle')} confirmDiscard={false} size="md">
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          {health.issues.map((issue, i) => {
            const text = issueText(issue, t, money.full, locale);
            return (
              <div key={i} className="acct-issue">
                <span className="acct-issue-title">
                  <Badge variant={issue.severity === 'error' ? 'error' : 'warning'}>{issue.severity === 'error' ? '!' : '?'}</Badge> {text.title}
                </span>
                <span className="acct-issue-fix">{text.fix}</span>
                {issue.href && (
                  <Link href={issue.href} onClick={() => setOpen(false)} style={{ color: 'var(--color-primary-700)', fontWeight: 'var(--font-semibold)' }}>
                    {t('banner.fix')} →
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </Drawer>
    </>
  );
}

/**
 * "Hisobotni yuklash" (TZ 7, 9): a real Excel file of the report, and a print
 * view that holds only the report (company, title, period, table) instead of
 * the whole page. Both come from the same ReportDoc the page builds.
 */
export function ExportButtons({ filename, build }: { filename: string; build: () => Omit<ReportDoc, 'company' | 'footer'> }) {
  const t = useTranslations('acct');
  const locale = useLocale();
  const { company } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const companyName = !company ? undefined : typeof company.name === 'string' ? company.name : company.name?.[locale === 'ru' ? 'ru' : 'uz'] || company.name?.uz;
  const fullDoc = (): ReportDoc => ({ ...build(), company: companyName, footer: t('export.generated', { time: formatDateTime(new Date(), locale) }) });

  const excel = async () => {
    setBusy(true);
    try {
      const data = await buildXlsx(fullDoc());
      const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeFileName(filename)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error(t('export.failed'));
    } finally {
      setBusy(false);
    }
  };

  const print = () => {
    // A hidden frame with its own document: the browser prints the report only.
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    frame.srcdoc = buildPrintHtml(fullDoc(), locale);
    frame.onload = () => {
      const win = frame.contentWindow;
      if (!win) return;
      win.onafterprint = () => setTimeout(() => frame.remove(), 0);
      win.focus();
      win.print();
      // Browsers without afterprint still get the frame removed.
      setTimeout(() => frame.isConnected && frame.remove(), 60_000);
    };
    document.body.appendChild(frame);
  };

  return (
    <div className="no-print" role="group" aria-label={t('export.button')} style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
      <Button variant="outline" size="sm" onClick={() => void excel()} loading={busy}>
        <Download size={14} aria-hidden /> {t('export.excel')}
      </Button>
      <Button variant="outline" size="sm" onClick={print}>
        <Printer size={14} aria-hidden /> {t('export.pdf')}
      </Button>
    </div>
  );
}
