'use client';

import { useState, useMemo, useSyncExternalStore } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useLocale, useTranslations } from 'next-intl';
import { quickPeriodRange } from '@/lib/date-range';
import { fillCashFlowSeries } from '@/lib/cash-flow-series';
import { usePersistentState } from '@/lib/usePersistentState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { LoadError } from '@/components/ui/LoadError';
import { formatDate, formatCurrency, formatMoney, formatCompactNumber } from '@/lib/utils';
import { MultiCurrencyValue } from '@/components/ui/MultiCurrencyValue';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import type { FullDashboard, DashboardPeriod, CashFlowPoint } from '@shared/types';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  ShoppingCart,
  Building2,
  ArrowRight,
  RefreshCw,
  Calendar,
  PackagePlus,
  PackageX,
  Receipt,
  CreditCard,
  Truck,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { Select } from '@/components/ui/Select';
import { SegmentedFilter } from '@/components/ui/filters';
import { StatCard, StatCardGrid } from '@/components/ui/stats/StatCard';

// ─── Helpers ─────────────────────────────────────────────────────

// ─── Cash Flow Chart (Recharts) ──────────────────────────────────

/** True when the user asked the system for less motion. */
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const mq = window.matchMedia(REDUCED_MOTION);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

/** "2026-11-21" → "21.11", "2026-11" → "11.2026"; anything else as is. */
function periodTick(v: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v.slice(8, 10)}.${v.slice(5, 7)}`;
  if (/^\d{4}-\d{2}$/.test(v)) return `${v.slice(5, 7)}.${v.slice(0, 4)}`;
  return v;
}

function CashFlowTooltip({ active, payload, label, currency, locale, incomeLabel, expenseLabel }: {
  active?: boolean;
  payload?: ReadonlyArray<{ dataKey?: unknown; value?: unknown }>;
  label?: unknown;
  currency: string;
  locale: string;
  incomeLabel: string;
  expenseLabel: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const val = (key: string) => Number(payload.find((p) => p.dataKey === key)?.value ?? 0);
  return (
    <div className="dash-chart-tip">
      <div className="dash-chart-tip-date">{periodTick(String(label ?? ''))}</div>
      <div className="dash-chart-tip-row">
        <span className="dash-swatch is-income" aria-hidden />
        {incomeLabel}
        <b className="tabular-nums">{formatCurrency(val('income'), locale, currency)}</b>
      </div>
      <div className="dash-chart-tip-row">
        <span className="dash-swatch is-expense" aria-hidden />
        {expenseLabel}
        <b className="tabular-nums">{formatCurrency(val('expense'), locale, currency)}</b>
      </div>
    </div>
  );
}

function CashFlowChart({
  seriesByCurrency,
  isRu,
  locale,
  granularity,
  range,
}: {
  seriesByCurrency: { currency: string; series: CashFlowPoint[] }[];
  isRu: boolean;
  locale: string;
  granularity: 'day' | 'week' | 'month';
  range: { from: string; to: string };
}) {
  // The user's tab; until one is picked (or when it has no series), the UZS
  // series if there is one, else the first. Which tab is open, not a data value.
  const [chosenCurrency, setActiveCurrency] = useState<string | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  if (seriesByCurrency.length === 0) {
    return <div className="dash-chart-empty">{isRu ? 'Нет данных за выбранный период' : 'Tanlangan davr uchun ma’lumot yo‘q'}</div>;
  }

  const currencies = seriesByCurrency.map((e) => e.currency);
  const currentEntry =
    seriesByCurrency.find((e) => e.currency === chosenCurrency) ??
    seriesByCurrency.find((e) => e.currency === 'UZS') ??
    seriesByCurrency[0];
  const activeCurrency = currentEntry.currency;
  const series = fillCashFlowSeries(currentEntry.series, granularity, range.from, range.to);
  const incomeLabel = isRu ? 'Приход' : 'Kirim';
  const expenseLabel = isRu ? 'Расход' : 'Chiqim';
  const totalIncome = series.reduce((a, s) => a + s.income, 0);
  const totalExpense = series.reduce((a, s) => a + s.expense, 0);
  const net = totalIncome - totalExpense;
  const data = series.map((s) => ({ period: s.period, income: s.income, expense: s.expense }));

  return (
    <div>
      <div className="dash-flow-head">
        {/* The totals double as the legend: swatch, word and figure together */}
        <dl className="dash-flow-totals">
          <div>
            <dt><span className="dash-swatch is-income" aria-hidden />{incomeLabel}</dt>
            <dd className="tabular-nums">{formatCurrency(totalIncome, locale, activeCurrency)}</dd>
          </div>
          <div>
            <dt><span className="dash-swatch is-expense" aria-hidden />{expenseLabel}</dt>
            <dd className="tabular-nums">{formatCurrency(totalExpense, locale, activeCurrency)}</dd>
          </div>
          <div>
            <dt>{isRu ? 'Чистый поток' : 'Sof oqim'}</dt>
            <dd className="tabular-nums" style={{ color: net < 0 ? 'var(--color-error-700)' : undefined }}>
              {net > 0 ? '+' : ''}
              {formatCurrency(net, locale, activeCurrency)}
            </dd>
          </div>
        </dl>
        {currencies.length > 1 && (
          <SegmentedFilter
            name="cashflow-currency"
            label={isRu ? 'Валюта' : 'Valyuta'}
            value={activeCurrency}
            onChange={(v) => v && setActiveCurrency(v)}
            options={currencies.map((c) => ({ value: c, label: c }))}
          />
        )}
      </div>

      {series.length === 0 ? (
        <div className="dash-chart-empty">
          {isRu ? `Нет операций в ${activeCurrency} за выбранный период` : `Tanlangan davr uchun ${activeCurrency} operatsiyalari yo‘q`}
        </div>
      ) : (
        <div role="img" aria-label={`${incomeLabel}: ${formatCurrency(totalIncome, locale, activeCurrency)}; ${expenseLabel}: ${formatCurrency(totalExpense, locale, activeCurrency)}`}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart key={`${activeCurrency}-${series.length}`} data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={1} barCategoryGap="16%">
              <CartesianGrid stroke="var(--color-border-light)" vertical={false} />
              <XAxis dataKey="period" tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }} tickLine={false} axisLine={{ stroke: 'var(--color-border)' }} tickFormatter={periodTick} minTickGap={12} />
              <YAxis tickFormatter={formatCompactNumber} tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }} tickLine={false} axisLine={false} width={52} />
              <Tooltip
                cursor={{ fill: 'var(--color-bg-tertiary)', opacity: 0.6 }}
                content={(props) => <CashFlowTooltip {...props} currency={activeCurrency} locale={locale} incomeLabel={incomeLabel} expenseLabel={expenseLabel} />}
              />
              <Bar dataKey="income" name={incomeLabel} fill="var(--color-chart-income)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={!reducedMotion} animationDuration={700} animationEasing="ease-out" />
              <Bar dataKey="expense" name={expenseLabel} fill="var(--color-chart-expense)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={!reducedMotion} animationDuration={700} animationBegin={120} animationEasing="ease-out" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── "What needs attention" row ──────────────────────────────────

function AttentionRow({ icon: Icon, tone, title, hint, amount, href, action }: {
  icon: React.ElementType;
  tone: 'error' | 'warning' | 'info' | 'success';
  title: string;
  hint?: React.ReactNode;
  amount?: React.ReactNode;
  href: string;
  action: string;
}) {
  return (
    <li className={`dash-todo rd-tone-${tone}`}>
      <span className="dash-todo-icon" aria-hidden><Icon size={18} /></span>
      <div className="dash-todo-text">
        <div className="dash-todo-title">{title}</div>
        {hint && <div className="dash-todo-hint">{hint}</div>}
      </div>
      {amount && <div className="dash-todo-amount tabular-nums">{amount}</div>}
      <Link href={href} className="rd-next-btn">
        {action} <ArrowRight size={14} aria-hidden />
      </Link>
    </li>
  );
}

// ─── Dashboard Page ───────────────────────────────────────────

const PERIODS: DashboardPeriod[] = ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'this_quarter', 'this_year'];

export default function DashboardPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const t = useTranslations('dashboard');
  const td = useTranslations('rd.dash');
  // The chosen period and chart step are remembered per browser.
  const [period, setPeriod] = usePersistentState<DashboardPeriod>('dashboard.period', 'this_month');
  const [cashFlowGranularity, setCashFlowGranularity] = usePersistentState<'day' | 'week' | 'month'>('dashboard.granularity', 'day');

  const periodRange = useMemo(() => {
    const { date_from, date_to } = quickPeriodRange(period);
    return { from: date_from, to: date_to };
  }, [period]);
  const dashboardEndpoint = useMemo(() => {
    const { from: date_from, to: date_to } = periodRange;
    return `/dashboard?${new URLSearchParams({ date_from, date_to, granularity: cashFlowGranularity })}`;
  }, [periodRange, cashFlowGranularity]);
  // keepPrevious: switching the period keeps the current numbers until the
  // new ones arrive, as before.
  const dashboardQuery = useApiQuery<FullDashboard>(dashboardEndpoint, { keepPrevious: true });
  // The "needs attention" sources are optional: a failed one just drops its row.
  const ordersQuery = useApiQuery<{ pipeline?: Partial<Record<string, number>>; upcomingDeadlines?: unknown[] }>('/dashboard/sales-orders');
  const draftSalesQuery = useApiQuery<unknown[]>('/sales/invoices?status=DRAFT');
  const draftReceiptsQuery = useApiQuery<unknown[]>('/purchases/receipts?status=DRAFT');
  const lowStockQuery = useApiQuery<unknown[]>('/inventory/products/low-stock');
  const data = dashboardQuery.data ?? null;
  const pipeline = ordersQuery.data?.pipeline ?? {};
  const loading = dashboardQuery.isFetching;
  const fetchDashboard = () => {
    for (const q of [dashboardQuery, ordersQuery, draftSalesQuery, draftReceiptsQuery, lowStockQuery]) void q.refetch();
  };

  const periodLabels: Record<DashboardPeriod, string> = {
    today: isRu ? 'Сегодня' : 'Bugun',
    yesterday: isRu ? 'Вчера' : 'Kecha',
    this_week: isRu ? 'Эта неделя' : 'Bu hafta',
    last_week: isRu ? 'Прошлая неделя' : 'O\'tgan hafta',
    this_month: isRu ? 'Этот месяц' : 'Bu oy',
    last_month: isRu ? 'Прошлый месяц' : 'O\'tgan oy',
    this_quarter: isRu ? 'Этот квартал' : 'Bu kvartal',
    this_year: isRu ? 'Этот год' : 'Bu yil',
    custom: '',
  };

  const count = (q: { data?: unknown[] }) => (Array.isArray(q.data) ? q.data.length : 0);
  const draftSales = count(draftSalesQuery);
  const draftReceipts = count(draftReceiptsQuery);
  const lowStock = count(lowStockQuery);
  const ordersReady = (pipeline.READY_TO_SHIP ?? 0) + (pipeline.READY ?? 0) + (pipeline.PAYMENT_CONFIRMED ?? 0);
  const ordersAwaitingPayment = pipeline.AWAITING_PAYMENT ?? 0;
  const deadlines = ordersQuery.data?.upcomingDeadlines?.length ?? 0;
  const receivable = data?.debts?.receivable;
  const payable = data?.debts?.payable;

  const todo: React.ReactNode[] = [];
  if (draftSales > 0) todo.push(<AttentionRow key="ds" icon={ShoppingCart} tone="warning" title={td('draftSales', { count: draftSales })} hint={td('draftSalesHint')} href="/sales?status=DRAFT" action={td('actPost')} />);
  if (draftReceipts > 0) todo.push(<AttentionRow key="dr" icon={PackagePlus} tone="warning" title={td('draftReceipts', { count: draftReceipts })} hint={td('draftReceiptsHint')} href="/purchases?status=DRAFT" action={td('actPost')} />);
  if (ordersReady > 0) todo.push(<AttentionRow key="or" icon={Truck} tone="info" title={td('ordersReady', { count: ordersReady })} href="/sales/orders" action={td('actDispatch')} />);
  if (deadlines > 0) todo.push(<AttentionRow key="dl" icon={Clock} tone="error" title={td('deadlines', { count: deadlines })} href="/sales/orders" action={td('actView')} />);
  if (ordersAwaitingPayment > 0) todo.push(<AttentionRow key="op" icon={CreditCard} tone="warning" title={td('ordersAwaitingPayment', { count: ordersAwaitingPayment })} href="/sales/orders" action={td('actView')} />);
  if (lowStock > 0) todo.push(<AttentionRow key="ls" icon={PackageX} tone="error" title={td('lowStock', { count: lowStock })} hint={td('lowStockHint')} href="/products?stock=low" action={td('actRestock')} />);

  const accountMovement = new Map((data?.finance.summaryByAccount ?? []).map((a) => [a.accountId, a]));
  const attentionLoading = dashboardQuery.isPending || draftSalesQuery.isPending || lowStockQuery.isPending;

  return (
    <div className="rd-page animate-fade-in">
      <PageHeader
        title={isRu ? 'Главная' : 'Bosh sahifa'}
        subtitle={t('subtitle')}
        actions={
          <>
            <div className="dash-period-select">
              <Select
                size="sm"
                placeholder={td('period')}
                options={PERIODS.map((p) => ({ value: p, label: periodLabels[p], icon: <Calendar size={14} aria-hidden /> }))}
                value={period}
                onChange={(v) => setPeriod(v as DashboardPeriod)}
              />
            </div>
            <Button variant="ghost" size="sm" onClick={fetchDashboard} disabled={loading} aria-label={isRu ? 'Обновить' : 'Yangilash'}>
              <RefreshCw size={16} aria-hidden className={loading ? 'app-spinner' : undefined} />
              <span className="app-header-hide-sm">{isRu ? 'Обновить' : 'Yangilash'}</span>
            </Button>
          </>
        }
      />

      {/* Quick actions: the documents people start most often */}
      <nav aria-label={t('quickActions')} className="dash-quick-actions">
        {[
          { href: '/sales/new', label: t('qaNewSale'), Icon: ShoppingCart, primary: true },
          { href: '/purchases/new', label: t('qaNewReceipt'), Icon: PackagePlus },
          { href: '/finance', label: t('qaPayment'), Icon: CreditCard },
          { href: '/purchases/expenses/new', label: t('qaNewExpense'), Icon: Receipt },
        ].map(({ href, label, Icon, primary }) => (
          <Link key={href} href={href} className={`dash-quick-action${primary ? ' is-primary' : ''}`}>
            <Icon size={18} aria-hidden />
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      {dashboardQuery.isError && (
        <Card>
          <LoadError error={dashboardQuery.error} onRetry={() => void dashboardQuery.refetch()} retrying={dashboardQuery.isFetching} />
        </Card>
      )}

      {/* Today: what to do first (left) and where the money is (right) */}
      <div className="dash-today-grid">
        <section className="rd-table-card dash-panel" aria-labelledby="dash-attention">
          <h2 id="dash-attention" className="dash-panel-title">{td('attentionTitle')}</h2>
          <p className="dash-panel-hint">{td('attentionHint')}</p>
          {attentionLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', paddingTop: 'var(--space-3)' }}>
              {[0, 1, 2].map((i) => <Skeleton key={i} height={44} />)}
            </div>
          ) : todo.length === 0 ? (
            <div className="dash-all-clear" role="status">
              <CheckCircle2 size={22} aria-hidden />
              <div>
                <div style={{ fontWeight: 'var(--font-semibold)' }}>{td('allClear')}</div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{td('allClearHint')}</div>
              </div>
            </div>
          ) : (
            <ul className="dash-todo-list">{todo}</ul>
          )}
        </section>

        <section className="rd-table-card dash-panel" aria-labelledby="dash-money">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)', alignItems: 'baseline' }}>
            <h2 id="dash-money" className="dash-panel-title">{td('moneyTitle')}</h2>
            <Link href="/finance" className="dash-card-link">{isRu ? 'Все' : 'Barchasi'} <ArrowRight size={14} aria-hidden /></Link>
          </div>
          <p className="dash-panel-hint">{td('moneyHint')}</p>
          {(data?.finance?.accounts ?? []).length === 0 ? (
            dashboardQuery.isPending ? <Skeleton height={44} /> : <EmptyState compact icon={Wallet} title={td('noAccounts')} />
          ) : (
            <ul className="dash-money-list">
              {data?.finance.accounts.map((account) => {
                const mv = accountMovement.get(account.id);
                const Icon = account.accountType === 'BANK' ? Building2 : Wallet;
                return (
                  <li key={account.id}>
                    <span className="dash-todo-icon" aria-hidden><Icon size={16} /></span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', overflowWrap: 'anywhere' }}>{account.name[locale]}</div>
                      {mv && (mv.totalIncome !== 0 || mv.totalExpense !== 0) && (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', display: 'flex', gap: 8, flexWrap: 'wrap' }} className="tabular-nums">
                          {mv.totalIncome !== 0 && <span><span style={{ color: 'var(--color-success-700)' }}>+{formatCurrency(mv.totalIncome, locale, account.currency)}</span> {td('periodIn')}</span>}
                          {mv.totalExpense !== 0 && <span><span style={{ color: 'var(--color-error-700)' }}>−{formatCurrency(mv.totalExpense, locale, account.currency)}</span> {td('periodOut')}</span>}
                        </div>
                      )}
                    </div>
                    <div className="tabular-nums" style={{ fontWeight: 'var(--font-bold)', textAlign: 'right' }}>{formatCurrency(account.balance, locale, account.currency)}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Results of the chosen period */}
      <section aria-labelledby="dash-results">
        <h2 id="dash-results" className="dash-section-title">
          {td('resultsTitle')} <span className="dash-section-period">· {periodLabels[period]}</span>
        </h2>
        <StatCardGrid label={td('resultsTitle')} count={3}>
          <StatCard
            label={td('sales')}
            loading={!data && loading}
            value={data?.sales.byCurrency?.length ? <MultiCurrencyValue inherit items={data.sales.byCurrency} locale={locale} /> : formatCurrency(data?.sales?.totalSales ?? 0, locale, 'UZS')}
            secondary={td('salesDocs', { count: data?.sales?.invoiceCount ?? 0 })}
          />
          <StatCard
            label={`${td('grossProfit')} (UZS)`}
            loading={!data && loading}
            value={formatCurrency(data?.finance?.profit?.grossProfit ?? 0, locale, 'UZS')}
            negative={(data?.finance?.profit?.grossProfit ?? 0) < 0}
            secondary={td('grossProfitHint')}
          />
          <StatCard
            label={td('expenses')}
            loading={!data && loading}
            value={
              (data?.finance?.summaryByCurrency ?? []).some((s) => s.totalExpense !== 0) ? (
                <MultiCurrencyValue inherit items={(data?.finance?.summaryByCurrency ?? []).filter((s) => s.totalExpense !== 0).map((s) => ({ currency: s.currency, amount: s.totalExpense }))} locale={locale} />
              ) : (
                formatCurrency(0, locale, 'UZS')
              )
            }
            secondary={td('expensesHint')}
          />
        </StatCardGrid>
      </section>

      {/* Who owes whom */}
      <div className="dash-debts-grid">
        {([
          { key: 'in', title: td('debtsIn'), list: receivable?.topDebtors ?? [], empty: td('noDebtsIn'), color: 'var(--color-success-700)', total: receivable?.byCurrency },
          { key: 'out', title: td('debtsOut'), list: payable?.topCreditors ?? [], empty: td('noDebtsOut'), color: 'var(--color-error-700)', total: payable?.byCurrency },
        ] as const).map((block) => (
          <section key={block.key} className="rd-table-card dash-panel" aria-labelledby={`dash-debt-${block.key}`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)', alignItems: 'baseline', flexWrap: 'wrap' }}>
              <h2 id={`dash-debt-${block.key}`} className="dash-panel-title">{block.title}</h2>
              {block.total && block.total.length > 0 && <MultiCurrencyValue items={block.total} locale={locale} color={block.color} />}
            </div>
            {block.list.length === 0 ? (
              <p className="dash-panel-hint" style={{ marginTop: 'var(--space-3)' }}>{block.empty}</p>
            ) : (
              <table className="rd-mini-table" style={{ marginTop: 'var(--space-3)' }}>
                <tbody>
                  {block.list.slice(0, 5).map((d) => (
                    <tr key={`${d.id}-${d.currency}`}>
                      <td style={{ overflowWrap: 'anywhere' }}>{d.name}</td>
                      <td className="tabular-nums" style={{ textAlign: 'right', fontWeight: 'var(--font-semibold)', color: block.color, whiteSpace: 'nowrap' }}>{formatCurrency(d.amount, locale, d.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <Link href="/counterparties" className="dash-card-link" style={{ marginTop: 'var(--space-3)', display: 'inline-flex' }}>
              {td('allCounterparties')} <ArrowRight size={14} aria-hidden />
            </Link>
          </section>
        ))}
      </div>

      {/* Cash flow: one chart, one question; the latest operations beside it */}
      <div className="dash-flow-grid">
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
          <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)' }}>{td('cashFlowQ')}</h2>
          <SegmentedFilter
            name="granularity"
            label={td('period')}
            value={cashFlowGranularity}
            onChange={(v) => v && setCashFlowGranularity(v as typeof cashFlowGranularity)}
            options={[
              { value: 'day', label: isRu ? 'День' : 'Kun' },
              { value: 'week', label: isRu ? 'Неделя' : 'Hafta' },
              { value: 'month', label: isRu ? 'Месяц' : 'Oy' },
            ]}
          />
        </div>
        <CashFlowChart seriesByCurrency={data?.cashFlow?.seriesByCurrency ?? []} isRu={isRu} locale={locale} granularity={cashFlowGranularity} range={periodRange} />
      </Card>

      {/* Recent money operations */}
      <Card
        title={td('recentTitle')}
        action={
          <Link href="/finance" className="dash-card-link">
            {isRu ? 'Все' : 'Barchasi'} <ArrowRight size={14} aria-hidden />
          </Link>
        }
      >
        {!data?.recentTransactions || data.recentTransactions.length === 0 ? (
          <EmptyState compact icon={Wallet} title={isRu ? 'Операций за период нет' : 'Bu davrda operatsiyalar yo‘q'} description={t('noTransactionsHint')} />
        ) : (
          <table className="rd-mini-table" style={{ marginTop: 'var(--space-2)' }}>
            <tbody>
              {data.recentTransactions.slice(0, 6).map((tx) => (
                <tr key={tx.id}>
                  <td style={{ width: 36 }}>
                    {tx.direction === 'INCOME' && <TrendingUp size={16} aria-hidden style={{ color: 'var(--color-success-700)' }} />}
                    {tx.direction === 'EXPENSE' && <TrendingDown size={16} aria-hidden style={{ color: 'var(--color-error-700)' }} />}
                    {tx.direction === 'TRANSFER' && <ArrowRight size={16} aria-hidden style={{ color: 'var(--color-info-700)' }} />}
                  </td>
                  <td>
                    <div style={{ fontWeight: 'var(--font-medium)' }}>{tx.counterparty?.name ?? tx.account?.name?.[locale] ?? (isRu ? 'Операция' : 'Operatsiya')}</div>
                    <div className="rd-sub">{formatDate(tx.transactionDate, locale)}{tx.counterparty?.name && tx.account?.name?.[locale] ? ` · ${tx.account.name[locale]}` : ''}</div>
                  </td>
                  <td
                    className="tabular-nums"
                    style={{
                      textAlign: 'right',
                      whiteSpace: 'nowrap',
                      fontWeight: 'var(--font-semibold)',
                      color: tx.direction === 'INCOME' ? 'var(--color-success-700)' : tx.direction === 'EXPENSE' ? 'var(--color-error-700)' : 'var(--color-info-700)',
                    }}
                  >
                    {tx.direction === 'INCOME' ? '+' : tx.direction === 'EXPENSE' ? '−' : ''}{formatMoney(Number(tx.amount), tx.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      </div>
    </div>
  );
}
