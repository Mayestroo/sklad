'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BookOpen, CheckCircle2, HelpCircle, Scale, XCircle } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { usePersistentState } from '@/lib/usePersistentState';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadError } from '@/components/ui/LoadError';
import { Skeleton, SkeletonRows } from '@/components/ui/Skeleton';
import { matchesSearch } from '@/components/ui/SearchField';
import { FilterBar, useFilterState, type FilterDef } from '@/components/ui/filters';
import { DataTable, type Column, type SortState } from '@/components/ui/list/DataTable';
import { AccountingShell, useAccountingView } from '@/components/accounting/AccountingShell';
import { ExportButtons, MovementList, StatusBanner, accountLabel, useLedgerMoney } from '@/components/accounting/AccountingParts';
import type { AccountType, AccountingSummary, JournalEntryPage, SummaryCard, TrialBalanceItem, TrialBalanceReport } from '@shared/types';

type CardKey = keyof AccountingSummary['cards'];
const CARD_ORDER: CardKey[] = ['money', 'receivables', 'payables', 'inventory', 'profit', 'netWorth'];

export default function AccountingPage() {
  return (
    <AccountingShell>
      <Overview />
    </AccountingShell>
  );
}

function Overview() {
  const { mode } = useAccountingView();
  return mode === 'accountant' ? <TrialBalanceView /> : <SimpleOverview />;
}

// ── Simple mode: banner, six cards, last five movements (TZ 5) ───────────────

function SimpleOverview() {
  const t = useTranslations('acct');
  const tUx = useTranslations('ux');
  const { periodQuery } = useAccountingView();
  const q = useApiQuery<AccountingSummary>(`/accounting/summary?${periodQuery}`, { keepPrevious: true });
  const [openCard, setOpenCard] = useState<CardKey | null>(null);
  const summary = q.data;

  if (q.isError) return <Card><LoadError error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} /></Card>;
  if (q.isPending || !summary) {
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">{tUx('loading')}</span>
        <Skeleton height={64} style={{ marginBottom: 'var(--space-4)' }} />
        <div className="acct-cards">
          {CARD_ORDER.map((k) => (
            <Skeleton key={k} height={120} />
          ))}
        </div>
      </div>
    );
  }
  if (!summary.hasData) {
    return (
      <Card>
        <EmptyState
          icon={Scale}
          title={t('empty.title')}
          description={t('empty.description')}
          action={
            <Link href="/opening-balances" className="ux-link" style={{ color: 'var(--color-primary-700)', fontWeight: 'var(--font-semibold)' }}>
              {t('empty.opening')}
            </Link>
          }
        />
      </Card>
    );
  }

  return (
    <>
      <StatusBanner health={summary.health} />
      <section className="acct-cards" aria-label={t('cards.aria')}>
        {CARD_ORDER.map((key) => (
          <SummaryCardView key={key} cardKey={key} summary={summary} onOpen={() => setOpenCard(key)} />
        ))}
      </section>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)' }}>{t('recent.title')}</h2>
          <Link href="/accounting/journal" style={{ color: 'var(--color-primary-700)', fontWeight: 'var(--font-medium)' }}>
            {t('recent.all')} →
          </Link>
        </div>
        <MovementList entries={summary.recent} cardAccounts={summary.cardAccounts} mode="simple" />
      </Card>
      {openCard && <CardDetail cardKey={openCard} summary={summary} onClose={() => setOpenCard(null)} />}
    </>
  );
}

function SummaryCardView({ cardKey, summary, onOpen }: { cardKey: CardKey; summary: AccountingSummary; onOpen: () => void }) {
  const t = useTranslations('acct');
  const money = useLedgerMoney();
  const [tip, setTip] = useState(false);
  const card = summary.cards[cardKey] as SummaryCard;
  const isProfit = cardKey === 'profit';
  const label = isProfit && card.value < 0 ? t('cards.loss') : t(`cards.${cardKey}`);
  const diff = Math.round((card.value - card.previous) * 100) / 100;
  // Our own debt growing is bad news; for every other card growth is good.
  const goodWhenUp = cardKey !== 'payables';
  const tone = diff === 0 ? undefined : (diff > 0) === goodWhenUp ? 'positive' : 'negative';
  const change =
    diff === 0
      ? isProfit
        ? null
        : t('cards.changeFlat')
      : t(isProfit ? (diff > 0 ? 'cards.profitUp' : 'cards.profitDown') : diff > 0 ? 'cards.changeUp' : 'cards.changeDown', { amount: money.compact(Math.abs(diff)) });
  const tipId = `acct-tip-${cardKey}`;
  return (
    <article className="acct-card">
      <button type="button" className="acct-card-open" onClick={onOpen} aria-label={`${label}: ${money.full(card.value)}. ${t('cards.open')}`} />
      <div className="acct-card-top">
        <span className="acct-card-label">{label}</span>
        <button
          type="button"
          className="acct-card-help"
          aria-label={t('cards.helpAria', { name: label })}
          aria-describedby={tip ? tipId : undefined}
          aria-expanded={tip}
          onClick={() => setTip(!tip)}
          onBlur={() => setTip(false)}
          onMouseEnter={() => setTip(true)}
          onMouseLeave={() => setTip(false)}
        >
          <HelpCircle size={16} aria-hidden />
        </button>
      </div>
      {tip && (
        <span id={tipId} role="tooltip" className="acct-tip">
          <strong>{t(`cards.${cardKey}_q`)}</strong>
          <br />
          {t(`cards.${cardKey}_help`)}
        </span>
      )}
      <span className="acct-card-value" data-negative={card.value < 0 || undefined} title={money.full(card.value)}>
        {money.compact(card.value)}
      </span>
      {isProfit && 'revenue' in card && (
        <span className="acct-card-sub">{t('cards.profitSub', { revenue: money.compact(summary.cards.profit.revenue), expenses: money.compact(summary.cards.profit.expenses) })}</span>
      )}
      {change && (
        <span className="acct-card-sub acct-card-change" data-tone={tone}>
          {change}
        </span>
      )}
      <span className="acct-card-scope">{isProfit ? t('cards.period') : t('cards.today')}</span>
    </article>
  );
}

/** The card's composition and its last movements, in a side panel (TZ 5.2). */
function CardDetail({ cardKey, summary, onClose }: { cardKey: CardKey; summary: AccountingSummary; onClose: () => void }) {
  const t = useTranslations('acct');
  const locale = useLocale();
  const money = useLedgerMoney();
  const card = summary.cards[cardKey] as SummaryCard;
  const codes = card.parts.map((p) => p.code).join(',');
  const entries = useApiQuery<JournalEntryPage>(codes ? `/accounting/journal?accountCode=${encodeURIComponent(codes)}&pageSize=5` : null);
  return (
    <Drawer isOpen onClose={onClose} title={t(`cards.${cardKey}`)} description={t(`cards.${cardKey}_help`)} confirmDiscard={false} size="md">
      <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-2)' }}>{t('cards.composition')}</h3>
      {card.parts.length === 0 ? (
        <p className="rd-sub">{t('cards.compositionEmpty')}</p>
      ) : (
        <div className="acct-rows">
          {card.parts.map((part) => (
            <div key={part.accountId} className="acct-rows-row">
              <span>
                {accountLabel(part, locale)}
                <span className="acct-official">{part.code}</span>
              </span>
              <span className="num" data-negative={part.balance < 0 || undefined}>{money.full(part.balance)}</span>
            </div>
          ))}
          <div className="acct-rows-row" data-strong>
            <span>{t('reports.total')}</span>
            <span className="num">{money.full(card.value)}</span>
          </div>
        </div>
      )}
      {cardKey === 'money' && <p className="rd-sub">{t('cards.uzsEquivalent')}</p>}
      {codes && (
        <>
          <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', margin: 'var(--space-5) 0 var(--space-2)' }}>{t('cards.recentFor')}</h3>
          {entries.isPending ? (
            <SkeletonRows rows={3} columns={2} />
          ) : entries.isError ? (
            <LoadError error={entries.error} onRetry={() => void entries.refetch()} retrying={entries.isFetching} />
          ) : (
            <MovementList entries={entries.data?.items ?? []} cardAccounts={summary.cardAccounts} mode="simple" />
          )}
        </>
      )}
    </Drawer>
  );
}

// ── Accountant mode: trial balance for the period (TZ 9) ─────────────────────

const TYPES: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];
const FILTER_DEFAULTS = { type: '', showZero: '' };

function TrialBalanceView() {
  const t = useTranslations('acct');
  const locale = useLocale() as 'uz' | 'ru';
  const money = useLedgerMoney();
  const { periodQuery, from, to } = useAccountingView();
  const q = useApiQuery<TrialBalanceReport>(`/accounting/trial-balance?${periodQuery}`, { keepPrevious: true });
  const tb = q.data;
  const lf = useFilterState('accounting.tb', FILTER_DEFAULTS);
  const [sort, setSort] = usePersistentState<SortState | null>('accounting.tb.sort', null);
  const [selected, setSelected] = useState<TrialBalanceItem | null>(null);
  const showZero = lf.values.showZero === '1';

  const moved = (i: TrialBalanceItem) => Boolean(i.openingBalance || i.debitTurnover || i.creditTurnover || i.closingBalance);
  const rows = useMemo(
    () =>
      (tb?.items ?? []).filter(
        (i) => (showZero || moved(i)) && (!lf.values.type || i.accountType === lf.values.type) && matchesSearch(lf.search, i.accountCode, i.accountName.uz, i.accountName.ru, i.accountAlias?.uz, i.accountAlias?.ru),
      ),
    [tb, showZero, lf.values.type, lf.search],
  );
  const count = (type: AccountType) => (tb?.items ?? []).filter((i) => i.accountType === type && (showZero || moved(i))).length;
  const used = (tb?.items ?? []).filter(moved).length;
  const balanced = tb ? Math.abs(tb.totalDebitTurnover - tb.totalCreditTurnover) < 0.005 : true;
  const sum = (pick: (i: TrialBalanceItem) => number) => rows.reduce((s, i) => s + pick(i), 0);

  const filterDefs: FilterDef[] = [
    {
      key: 'type',
      kind: 'segmented',
      label: t('tb.type'),
      options: [{ value: '', label: t('types.all'), count: TYPES.reduce((s, ty) => s + count(ty), 0) }, ...TYPES.map((ty) => ({ value: ty, label: t(`types.${ty}_official`), count: count(ty) }))],
    },
    { key: 'showZero', kind: 'toggle', label: t('tb.showZero') },
  ];

  const exportRows = () => [
    [t('tb.title'), `${from} – ${to}`],
    [t('tb.account'), t('tb.name'), t('tb.type'), t('tb.opening'), t('tb.debit'), t('tb.credit'), t('tb.closing')],
    ...rows.map((i) => [i.accountCode, i.accountName[locale], t(`types.${i.accountType}_official`), i.openingBalance, i.debitTurnover, i.creditTurnover, i.closingBalance]),
    [t('tb.total'), '', '', sum((i) => i.openingBalance), tb?.totalDebitTurnover ?? 0, tb?.totalCreditTurnover ?? 0, sum((i) => i.closingBalance)],
  ];

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
        <div>
          <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)' }}>{t('tb.title')}</h2>
          {tb && (
            <p className="rd-sub">
              {t('tb.used')}: {used} · {t('tb.turnover')}: {money.full(tb.totalDebitTurnover)} ·{' '}
              <span className="acct-tb-check" data-bad={!balanced || undefined}>
                {balanced ? <CheckCircle2 size={14} aria-hidden /> : <XCircle size={14} aria-hidden />}
                {balanced ? t('tb.check') : t('tb.checkBad')}
              </span>
            </p>
          )}
        </div>
        {tb && <ExportButtons filename={`aylanma-saldo_${from}_${to}`} rows={exportRows} />}
      </div>

      {tb && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <FilterBar state={lf} defs={filterDefs} searchPlaceholder={t('tb.search')} resultCount={rows.length} />
        </div>
      )}

      {q.isError ? (
        <LoadError error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : q.isPending || !tb ? (
        <SkeletonRows rows={8} columns={7} />
      ) : rows.length === 0 ? (
        <EmptyState compact icon={Scale} title={t('tb.empty')} action={<Button variant="secondary" onClick={lf.reset}>{t('movements.clear')}</Button>} />
      ) : (
        <>
          <div className="rd-table-card" style={{ border: 'none' }}>
            <DataTable
              rows={rows}
              rowKey={(i) => i.accountId}
              sort={sort}
              onSortChange={setSort}
              onRowClick={setSelected}
              caption={t('tb.rowHint')}
              columns={
                [
                  { key: 'code', label: t('tb.account'), primary: true, locked: true, sortValue: (i) => i.accountCode, render: (i) => <span className="rd-doc-no tabular-nums">{i.accountCode}</span>, footer: <strong>{t('tb.total')}</strong> },
                  {
                    key: 'name',
                    label: t('tb.name'),
                    sortValue: (i) => i.accountName[locale] || '',
                    render: (i) => (
                      <span>
                        <span style={{ fontWeight: 'var(--font-medium)' }}>{i.accountName[locale] || i.accountName.uz}</span> {i.isTechnical && <Badge variant="neutral">{t('tb.technical')}</Badge>}
                        {i.accountAlias && <span className="acct-official">{i.accountAlias[locale]}</span>}
                      </span>
                    ),
                  },
                  { key: 'type', label: t('tb.type'), sortValue: (i) => i.accountType, render: (i) => <span title={t(`types.${i.accountType}_help`)}>{t(`types.${i.accountType}_official`)}</span> },
                  { key: 'opening', label: t('tb.opening'), numeric: true, sortValue: (i) => i.openingBalance, render: (i) => money.cell(i.openingBalance), footer: money.full(sum((i) => i.openingBalance)) },
                  { key: 'debit', label: t('tb.debit'), numeric: true, sortValue: (i) => i.debitTurnover, render: (i) => money.cell(i.debitTurnover), footer: money.full(tb.totalDebitTurnover) },
                  { key: 'credit', label: t('tb.credit'), numeric: true, sortValue: (i) => i.creditTurnover, render: (i) => money.cell(i.creditTurnover), footer: money.full(tb.totalCreditTurnover) },
                  { key: 'closing', label: t('tb.closing'), numeric: true, sortValue: (i) => i.closingBalance, render: (i) => <strong>{money.cell(i.closingBalance)}</strong>, footer: money.full(sum((i) => i.closingBalance)) },
                ] as Column<TrialBalanceItem>[]
              }
            />
          </div>
          <p className="rd-sub" style={{ marginTop: 'var(--space-3)' }}>
            {t('tb.opening')}: {t('tb.openingHint')} · {t('tb.closing')}: {t('tb.closingHint')}
          </p>
        </>
      )}
      {selected && <AccountEntriesDrawer item={selected} onClose={() => setSelected(null)} />}
    </Card>
  );
}

function AccountEntriesDrawer({ item, onClose }: { item: TrialBalanceItem; onClose: () => void }) {
  const t = useTranslations('acct');
  const locale = useLocale() as 'uz' | 'ru';
  const { periodQuery } = useAccountingView();
  const q = useApiQuery<JournalEntryPage>(`/accounting/journal?accountCode=${encodeURIComponent(item.accountCode)}&${periodQuery}&pageSize=50`);
  const summary = useApiQuery<AccountingSummary>(`/accounting/summary?${periodQuery}`);
  const cards = summary.data?.cardAccounts ?? { money: [], receivables: [], payables: [], inventory: [] };
  return (
    <Drawer isOpen onClose={onClose} title={`${item.accountCode} · ${item.accountName[locale]}`} description={t('tb.panelEntries')} icon={<BookOpen size={18} aria-hidden />} confirmDiscard={false} size="lg">
      {q.isPending ? (
        <SkeletonRows rows={5} columns={3} />
      ) : q.isError ? (
        <LoadError error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : (q.data?.items.length ?? 0) === 0 ? (
        <p className="rd-sub">{t('tb.empty')}</p>
      ) : (
        <MovementList entries={q.data?.items ?? []} cardAccounts={cards} mode="accountant" />
      )}
      <Link href={`/accounting/journal?account=${encodeURIComponent(item.accountCode)}`} style={{ display: 'inline-block', marginTop: 'var(--space-4)', color: 'var(--color-primary-700)', fontWeight: 'var(--font-semibold)' }}>
        {t('tb.panelAll')} →
      </Link>
    </Drawer>
  );
}
