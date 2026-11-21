'use client';

import { useState, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useLocale, useTranslations } from 'next-intl';
import { quickPeriodRange } from '@/lib/date-range';
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
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Calendar,
  Plus,
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
import { Signal } from '@/components/ui/list/ListKit';

// ─── Helpers ─────────────────────────────────────────────────────

// ─── Cash Flow Chart (Recharts) ──────────────────────────────────

function CashFlowChart({
  seriesByCurrency,
  isRu,
}: {
  seriesByCurrency: { currency: string; series: CashFlowPoint[] }[];
  isRu: boolean;
}) {
  // The user's tab; until one is picked (or when it has no series), the UZS
  // series if there is one, else the first. Which tab is open, not a data value.
  const [chosenCurrency, setActiveCurrency] = useState<string | null>(null);

  if (seriesByCurrency.length === 0) {
    return (
      <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>
        {isRu ? 'Нет данных за выбранный период' : 'Tanlangan davr uchun ma\'lumot yo\'q'}
      </div>
    );
  }

  const currencies = seriesByCurrency.map((e) => e.currency);
  const currentEntry =
    seriesByCurrency.find((e) => e.currency === chosenCurrency) ??
    seriesByCurrency.find((e) => e.currency === 'UZS') ??
    seriesByCurrency[0];
  const activeCurrency = currentEntry.currency;
  const series = currentEntry.series;


  const incomeKey = isRu ? 'Приход' : 'Kirim';
  const expenseKey = isRu ? 'Расход' : 'Chiqim';

  const data = series.map((s) => ({
    period: s.period,
    [incomeKey]: s.income,
    [expenseKey]: s.expense,
  }));

  return (
    <div>
      {/* Currency Tabs — always visible when multiple currencies exist */}
      {currencies.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {currencies.map((cur) => (
            <button
              key={cur}
              onClick={() => setActiveCurrency(cur)}
              style={{
                padding: '3px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                cursor: 'pointer',
                fontSize: 'var(--text-xs)',
                fontWeight: activeCurrency === cur ? 600 : 400,
                background: activeCurrency === cur ? 'var(--color-btn-primary-bg, var(--color-primary-600))' : 'var(--color-bg-secondary)',
                color: activeCurrency === cur ? 'var(--color-btn-primary-text, #fff)' : 'var(--color-text-secondary)',
                transition: 'all 0.15s',
              }}
            >
              {cur}
            </button>
          ))}
        </div>
      )}

      {series.length === 0 ? (
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>
          {isRu ? `Нет операций в ${activeCurrency} за выбранный период` : `Tanlangan davr uchun ${activeCurrency} operatsiyalari yo'q`}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`colorIncome-${activeCurrency}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-success-600)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="var(--color-success-600)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id={`colorExpense-${activeCurrency}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-error-600)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="var(--color-error-600)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" vertical={false} />
            <XAxis
              dataKey="period"
              tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: string) => v.slice(5)}
            />
            <YAxis
              tickFormatter={formatCompactNumber}
              tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
              tickLine={false}
              axisLine={false}
              width={52}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                fontSize: 12,
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              }}
              formatter={(value: number | string | readonly (number | string)[] | undefined, name?: number | string) => [
                formatMoney(typeof value === 'number' ? value : Number(value) || 0, activeCurrency),
                name ? String(name) : '',
              ]}
              labelStyle={{ color: 'var(--color-text-secondary)', marginBottom: 4 }}
            />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            <Area
              type="monotone"
              dataKey={incomeKey}
              stroke="var(--color-success-600)"
              strokeWidth={2}
              fill={`url(#colorIncome-${activeCurrency})`}
              dot={series.length <= 14 ? { r: 3, fill: 'var(--color-success-600)', strokeWidth: 0 } : false}
              activeDot={{ r: 5 }}
            />
            <Area
              type="monotone"
              dataKey={expenseKey}
              stroke="var(--color-error-600)"
              strokeWidth={2}
              fill={`url(#colorExpense-${activeCurrency})`}
              dot={series.length <= 14 ? { r: 3, fill: 'var(--color-error-600)', strokeWidth: 0 } : false}
              activeDot={{ r: 5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
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

  const dashboardEndpoint = useMemo(() => {
    const { date_from, date_to } = quickPeriodRange(period);
    return `/dashboard?${new URLSearchParams({ date_from, date_to, granularity: cashFlowGranularity })}`;
  }, [period, cashFlowGranularity]);
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
  const money = (items: { currency: string; amount: number }[] | undefined) =>
    items && items.length > 0 ? <MultiCurrencyValue items={items} locale={locale} /> : undefined;

  const todo: React.ReactNode[] = [];
  if (draftSales > 0) todo.push(<AttentionRow key="ds" icon={ShoppingCart} tone="warning" title={td('draftSales', { count: draftSales })} hint={td('draftSalesHint')} href="/sales?status=DRAFT" action={td('actPost')} />);
  if (draftReceipts > 0) todo.push(<AttentionRow key="dr" icon={PackagePlus} tone="warning" title={td('draftReceipts', { count: draftReceipts })} hint={td('draftReceiptsHint')} href="/purchases?status=DRAFT" action={td('actPost')} />);
  if (ordersReady > 0) todo.push(<AttentionRow key="or" icon={Truck} tone="info" title={td('ordersReady', { count: ordersReady })} href="/sales/orders" action={td('actDispatch')} />);
  if (deadlines > 0) todo.push(<AttentionRow key="dl" icon={Clock} tone="error" title={td('deadlines', { count: deadlines })} href="/sales/orders" action={td('actView')} />);
  if (ordersAwaitingPayment > 0) todo.push(<AttentionRow key="op" icon={CreditCard} tone="warning" title={td('ordersAwaitingPayment', { count: ordersAwaitingPayment })} href="/sales/orders" action={td('actView')} />);
  if (lowStock > 0) todo.push(<AttentionRow key="ls" icon={PackageX} tone="error" title={td('lowStock', { count: lowStock })} hint={td('lowStockHint')} href="/products?stock=low" action={td('actRestock')} />);
  if ((receivable?.count ?? 0) > 0) todo.push(<AttentionRow key="rc" icon={ArrowDownRight} tone="success" title={td('receivable', { count: receivable?.count ?? 0 })} amount={money(receivable?.byCurrency)} href="/counterparties" action={td('actCollect')} />);
  if ((payable?.count ?? 0) > 0) todo.push(<AttentionRow key="pb" icon={ArrowUpRight} tone="error" title={td('payable', { count: payable?.count ?? 0 })} amount={money(payable?.byCurrency)} href="/counterparties" action={td('actPay')} />);

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
          { href: '/products/new', label: t('qaNewProduct'), Icon: Plus },
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
        <div className="rd-signals">
          <Signal
            tone="info"
            label={td('sales')}
            value={
              data?.sales.byCurrency?.length
                ? <MultiCurrencyValue items={data.sales.byCurrency} locale={locale} />
                : formatCurrency(data?.sales?.totalSales ?? 0, locale, 'UZS')
            }
            hint={td('salesDocs', { count: data?.sales?.invoiceCount ?? 0 })}
          />
          <Signal tone="success" label={`${td('grossProfit')} (UZS)`} value={formatCurrency(data?.finance?.profit?.grossProfit ?? 0, locale, 'UZS')} hint={td('grossProfitHint')} />
          <Signal
            tone="error"
            label={td('expenses')}
            value={
              (data?.finance?.summaryByCurrency ?? []).some((s) => s.totalExpense !== 0)
                ? <MultiCurrencyValue items={(data?.finance?.summaryByCurrency ?? []).filter((s) => s.totalExpense !== 0).map((s) => ({ currency: s.currency, amount: s.totalExpense }))} locale={locale} />
                : formatCurrency(0, locale, 'UZS')
            }
            hint={td('expensesHint')}
          />
        </div>
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

      {/* Cash flow: one chart, one question */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
          <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)' }}>{td('cashFlowQ')}</h2>
          <div className="rd-chips" role="group" aria-label={td('period')}>
            {(['day', 'week', 'month'] as const).map((g) => (
              <button key={g} type="button" className="rd-chip" aria-pressed={cashFlowGranularity === g} onClick={() => setCashFlowGranularity(g)}>
                {g === 'day' ? (isRu ? 'День' : 'Kun') : g === 'week' ? (isRu ? 'Неделя' : 'Hafta') : (isRu ? 'Месяц' : 'Oy')}
              </button>
            ))}
          </div>
        </div>
        <CashFlowChart seriesByCurrency={data?.cashFlow?.seriesByCurrency ?? []} isRu={isRu} />
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
              {data.recentTransactions.slice(0, 7).map((tx) => (
                <tr key={tx.id}>
                  <td style={{ width: 36 }}>
                    {tx.direction === 'INCOME' && <TrendingUp size={16} aria-hidden style={{ color: 'var(--color-success-700)' }} />}
                    {tx.direction === 'EXPENSE' && <TrendingDown size={16} aria-hidden style={{ color: 'var(--color-error-700)' }} />}
                    {tx.direction === 'TRANSFER' && <ArrowRight size={16} aria-hidden style={{ color: 'var(--color-info-700)' }} />}
                  </td>
                  <td>
                    <div style={{ fontWeight: 'var(--font-medium)' }}>{tx.counterparty?.name ?? tx.account?.name?.[locale] ?? (isRu ? 'Операция' : 'Operatsiya')}</div>
                    <div className="rd-sub">{formatDate(tx.transactionDate, locale)} · {tx.account?.name?.[locale] ?? ''}</div>
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
  );
}
