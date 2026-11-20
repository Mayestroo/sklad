'use client';

import { useState, useMemo } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
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
import { formatDate, formatCurrency, formatAmount, formatMoney, formatCompactNumber } from '@/lib/utils';
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
  BarChart3,
  Building2,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Calendar,
  Plus,
  PackagePlus,
  Receipt,
  CreditCard,
} from 'lucide-react';

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
                background: activeCurrency === cur ? 'var(--color-primary-600)' : 'var(--color-bg-secondary)',
                color: activeCurrency === cur ? '#fff' : 'var(--color-text-secondary)',
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

// ─── Sales Bar Chart (Recharts) ───────────────────────────────────

function SalesBarChart({ dynamics, isRu }: { dynamics: { period: string; amount: number }[]; isRu: boolean }) {
  if (!dynamics || dynamics.length === 0) {
    return (
      <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>
        {isRu ? 'Нет данных' : 'Ma\'lumot yo\'q'}
      </div>
    );
  }

  const data = dynamics.map((d) => ({
    period: d.period.slice(5),
    [isRu ? 'Sotuv' : 'Sotuv']: d.amount,
  }));

  return (
    <ResponsiveContainer width="100%" height={120}>
      <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barSize={12}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" vertical={false} />
        <XAxis
          dataKey="period"
          tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis hide />
        <Tooltip
          contentStyle={{
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value: number | string | readonly (number | string)[] | undefined) => [
            formatMoney(typeof value === 'number' ? value : Number(value) || 0, 'UZS'),
            isRu ? 'Продажи' : 'Sotuv',
          ]}
          cursor={{ fill: 'var(--color-bg-hover)' }}
        />
        <Bar
          dataKey={isRu ? 'Sotuv' : 'Sotuv'}
          fill="#4f46e5"
          radius={[4, 4, 0, 0]}
          opacity={0.85}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── KPI Card ────────────────────────────────────────────────

interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  trend?: number;
  currency?: string;
}

function KpiCard({ title, value, subtitle, icon: Icon, iconColor, iconBg, currency }: KpiCardProps) {
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
        <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', backgroundColor: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={22} style={{ color: iconColor }} />
        </div>
        {currency && (
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-tertiary)', background: 'var(--color-bg-tertiary)', padding: '2px 8px', borderRadius: 'var(--radius-sm)' }}>
            {currency}
          </span>
        )}
      </div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginBottom: '4px' }}>{title}</div>
      <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
        {value}
      </div>
      {subtitle && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>{subtitle}</div>
      )}
    </Card>
  );
}

// ─── Dashboard Page ───────────────────────────────────────────

export default function DashboardPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const t = useTranslations('dashboard');
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
  // Optional: the order pipeline card stays empty if this fails.
  const ordersQuery = useApiQuery<{ pipeline?: Partial<Record<string, number>> }>('/dashboard/sales-orders');
  const data = dashboardQuery.data ?? null;
  const orderStats = ordersQuery.data ?? null;
  const loading = dashboardQuery.isFetching;
  const fetchDashboard = () => {
    void dashboardQuery.refetch();
    void ordersQuery.refetch();
  };

  const periodsList: { label: string; value: DashboardPeriod }[] = [
    { label: isRu ? 'Сегодня' : 'Bugun', value: 'today' },
    { label: isRu ? 'Вчера' : 'Kecha', value: 'yesterday' },
    { label: isRu ? 'Эта неделя' : 'Bu hafta', value: 'this_week' },
    { label: isRu ? 'Прошлая неделя' : 'O\'tgan hafta', value: 'last_week' },
    { label: isRu ? 'Этот месяц' : 'Bu oy', value: 'this_month' },
    { label: isRu ? 'Прошлый месяц' : 'O\'tgan oy', value: 'last_month' },
    { label: isRu ? 'Этот квартал' : 'Bu kvartal', value: 'this_quarter' },
    { label: isRu ? 'Этот год' : 'Bu yil', value: 'this_year' },
  ];

  // Get primary currency summary (UZS by default)
  const uzsSummary = data?.finance?.summaryByCurrency?.find((s) => s.currency === 'UZS');
  const usdSummary = data?.finance?.summaryByCurrency?.find((s) => s.currency === 'USD');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }} className="animate-fade-in">

      {/* Header */}
      <div style={{ marginBottom: 'calc(-1 * var(--space-3))' }}>
        <PageHeader
          title={isRu ? 'Главная' : 'Bosh sahifa'}
          subtitle={t('subtitle')}
          actions={
            <Button variant="ghost" size="sm" onClick={fetchDashboard} disabled={loading} aria-label={isRu ? 'Обновить' : 'Yangilash'}>
              <RefreshCw size={16} aria-hidden className={loading ? 'app-spinner' : undefined} />
              <span className="app-header-hide-sm">{isRu ? 'Обновить' : 'Yangilash'}</span>
            </Button>
          }
        />
      </div>

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

      {/* Period Selector */}
      <div role="group" aria-label={t('period')} style={{
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border-light)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-2)',
        display: 'flex',
        gap: 'var(--space-1)',
        flexWrap: 'wrap',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <Calendar size={18} aria-hidden style={{ color: 'var(--color-text-tertiary)', alignSelf: 'center', marginLeft: '8px', marginRight: '4px' }} />
        {periodsList.map((p) => (
          <button
            key={p.value}
            type="button"
            aria-pressed={period === p.value}
            onClick={() => setPeriod(p.value)}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              cursor: 'pointer',
              fontSize: 'var(--text-sm)',
              fontWeight: period === p.value ? 'var(--font-semibold)' : 'var(--font-regular)',
              background: period === p.value ? 'var(--color-primary-600)' : 'transparent',
              color: period === p.value ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)',
              minHeight: 32,
              transition: 'all var(--transition-fast)',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Core KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 'var(--space-4)' }}>
        {/* Bank and cash balances */}
        {data?.finance?.accounts.map((account) => {
          const isBank = account.accountType === 'BANK';
          const Icon = isBank ? Building2 : Wallet;
          const accent = account.accountType === 'UZS_CASH'
            ? 'var(--color-success-600)'
            : account.accountType === 'USD_CASH'
              ? 'var(--color-info-600)'
              : 'var(--color-primary-600)';
          const iconBackground = account.accountType === 'UZS_CASH'
            ? 'var(--color-success-50)'
            : account.accountType === 'USD_CASH'
              ? 'var(--color-info-50)'
              : 'var(--color-primary-50)';

          return (
            <div key={account.id} style={{
              minWidth: 0,
              padding: 'var(--space-4)',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border-light)',
              borderTop: `3px solid ${accent}`,
              boxShadow: 'var(--shadow-sm)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                <div style={{
                  width: 40,
                  height: 40,
                  flexShrink: 0,
                  borderRadius: 'var(--radius-md)',
                  background: iconBackground,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Icon size={20} style={{ color: accent }} />
                </div>
                <span style={{
                  minWidth: 0,
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-text-secondary)',
                  overflowWrap: 'anywhere',
                }}>
                  {account.name[locale]}
                </span>
              </div>
              <div style={{
                fontSize: 'var(--text-xl)',
                fontWeight: 'var(--font-bold)',
                color: 'var(--color-text-primary)',
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1.25,
                overflowWrap: 'anywhere',
              }}>
                {formatCurrency(account.balance, locale, account.currency)}
              </div>
            </div>
          );
        })}

        {/* Sales */}
        <KpiCard
          title={isRu ? 'Объём продаж' : 'Sotuv hajmi'}
          value={
            data?.sales.byCurrency?.length
              ? data.sales.byCurrency.map((summary) => formatCurrency(summary.amount, locale, summary.currency)).join(' / ')
              : formatCurrency(data?.sales?.totalSales ?? 0, locale, 'UZS')
          }
          subtitle={`${data?.sales?.invoiceCount ?? 0} ${isRu ? 'документов' : 'ta hujjat'}`}
          icon={ShoppingCart}
          iconColor="var(--color-info-600)"
          iconBg="var(--color-info-50)"
        />

        {/* Expenses */}
        <KpiCard
          title={isRu ? 'Всего расходов' : 'Jami chiqim'}
          value={formatMoney(uzsSummary?.totalExpense ?? 0, 'UZS')}
          subtitle={usdSummary ? `+ ${formatMoney(usdSummary.totalExpense, 'USD')}` : undefined}
          icon={TrendingDown}
          iconColor="var(--color-error-600)"
          iconBg="var(--color-error-50)"
        />

        {/* Profit */}
        <KpiCard
          title={isRu ? 'Валовая прибыль (UZS)' : 'Yalpi foyda (UZS)'}
          value={formatMoney(data?.finance?.profit?.grossProfit ?? 0, 'UZS')}
          subtitle={`${isRu ? 'Продажи' : 'Sotuv'}: ${formatMoney(data?.finance?.profit?.revenue ?? 0, 'UZS')}`}
          icon={BarChart3}
          iconColor="var(--color-warning-600)"
          iconBg="var(--color-warning-50)"
        />
      </div>

      {(data?.finance.summaryByAccount ?? []).length > 0 && (
      <Card title={isRu ? 'Движение по каждой кассе и банковскому счёту' : 'Har bir kassa va bank hisobi harakati'}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 'var(--space-3)' }}>
          {(data?.finance.summaryByAccount ?? []).map((account) => (
            <div
              key={account.accountId}
              style={{
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-bg-tertiary)',
                borderLeft: `3px solid ${account.netCashFlow >= 0 ? 'var(--color-success-600)' : 'var(--color-error-600)'}`,
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', marginBottom: 8 }}>
                {account.name[locale]} · {account.currency}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 'var(--text-xs)' }}>
                <span style={{ color: 'var(--color-success-700)' }}>
                  {isRu ? 'Приход' : 'Kirim'}: {formatCurrency(account.totalIncome, locale, account.currency)}
                </span>
                <span style={{ color: 'var(--color-error-700)' }}>
                  {isRu ? 'Расход' : 'Chiqim'}: {formatCurrency(account.totalExpense, locale, account.currency)}
                </span>
                <span style={{ color: 'var(--color-text-primary)' }}>
                  {isRu ? 'Перевод входящий' : 'O‘tkazma kirim'}: {formatCurrency(account.transferIn, locale, account.currency)}
                </span>
                <span style={{ color: 'var(--color-warning-700)' }}>
                  {isRu ? 'Перевод исходящий' : 'O‘tkazma chiqim'}: {formatCurrency(account.transferOut, locale, account.currency)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>
      )}

      {/* Orders Pipeline (Buyurtmalar voronkasi) */}
      {orderStats && (
        <Card
          title={isRu ? 'Воронка заказов и производство' : 'Buyurtmalar voronkasi va ishlab chiqarish'}
          action={
            <Link href="/sales/orders" className="dash-card-link">
              {isRu ? 'Все заказы' : 'Barcha buyurtmalar'} <ArrowRight size={14} aria-hidden />
            </Link>
          }
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))',
              gap: 'var(--space-3)',
              marginTop: 'var(--space-2)',
            }}
          >
            <div style={{ padding: '12px', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', borderLeft: '4px solid var(--color-primary-500)' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                {isRu ? 'Новые / на согласовании' : 'Yangi / tasdiqlashda'}
              </div>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginTop: '4px' }}>
                {(orderStats.pipeline?.NEW || 0) + (orderStats.pipeline?.PENDING_APPROVAL || 0)}
              </div>
            </div>

            <div style={{ padding: '12px', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', borderLeft: '4px solid var(--color-warning-500)' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                {isRu ? 'В производстве' : 'Ishlab chiqarishda'}
              </div>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginTop: '4px', color: 'var(--color-warning-600)' }}>
                {(orderStats.pipeline?.SENT_TO_PRODUCTION || 0) + (orderStats.pipeline?.IN_PRODUCTION || 0) + (orderStats.pipeline?.PARTIALLY_READY || 0)}
              </div>
            </div>

            <div style={{ padding: '12px', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', borderLeft: '4px solid var(--color-error-500)' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                {isRu ? 'Ожидают оплаты' : 'To‘lov kutilmoqda'}
              </div>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginTop: '4px', color: 'var(--color-error-600)' }}>
                {orderStats.pipeline?.AWAITING_PAYMENT || 0}
              </div>
            </div>

            <div style={{ padding: '12px', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', borderLeft: '4px solid var(--color-success-500)' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                {isRu ? 'Готовы к отгрузке' : 'Jo‘natishga tayyor'}
              </div>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginTop: '4px', color: 'var(--color-success-600)' }}>
                {orderStats.pipeline?.READY_TO_SHIP || 0}
              </div>
            </div>

            <div style={{ padding: '12px', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', borderLeft: '4px solid var(--color-info-500)' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                {isRu ? 'Отгружены' : 'Jo‘natilgan'}
              </div>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginTop: '4px', color: 'var(--color-info-600)' }}>
                {orderStats.pipeline?.SHIPPED || 0}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Receivables & Payables */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 'var(--space-4)' }}>
        {/* Receivables */}
        <Card
          title={isRu ? 'Дебиторы (нам должны)' : 'Debitorlar (bizga qarzdorlar)'}
          action={<Link href="/counterparties" className="dash-card-link">{isRu ? 'Все' : 'Barchasi'} <ArrowRight size={14} aria-hidden /></Link>}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            <div>
              <MultiCurrencyValue
                items={data?.debts?.receivable?.byCurrency}
                locale={locale}
                color="var(--color-success-600)"
              />
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>
                {data?.debts?.receivable?.count ?? 0} {isRu ? 'контрагентов' : 'ta kontragent'}
              </div>
            </div>
            <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-full)', background: 'var(--color-success-50)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowDownRight size={24} style={{ color: 'var(--color-success-600)' }} />
            </div>
          </div>
          {data?.debts?.receivable?.topDebtors?.slice(0, 3).map((d) => (
            <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-tertiary)', marginBottom: '6px' }}>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)' }}>{d.name}</span>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', color: 'var(--color-success-600)', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(d.amount, locale, d.currency)}</span>
            </div>
          ))}
        </Card>

        {/* Payables */}
        <Card
          title={isRu ? 'Кредиторы (мы должны)' : 'Kreditorlar (biz qarzdormiz)'}
          action={<Link href="/counterparties" className="dash-card-link">{isRu ? 'Все' : 'Barchasi'} <ArrowRight size={14} aria-hidden /></Link>}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            <div>
              <MultiCurrencyValue
                items={data?.debts?.payable?.byCurrency}
                locale={locale}
                color="var(--color-error-600)"
              />
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>
                {data?.debts?.payable?.count ?? 0} {isRu ? 'контрагентов' : 'ta kontragent'}
              </div>
            </div>
            <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-full)', background: 'var(--color-error-50)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowUpRight size={24} style={{ color: 'var(--color-error-600)' }} />
            </div>
          </div>
          {data?.debts?.payable?.topCreditors?.slice(0, 3).map((c) => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-tertiary)', marginBottom: '6px' }}>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)' }}>{c.name}</span>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', color: 'var(--color-error-600)', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(c.amount, locale, c.currency)}</span>
            </div>
          ))}
        </Card>
      </div>

      {/* Cash Flow Chart */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)' }}>
              {isRu ? 'График движения денежных средств' : 'Pul oqimi grafigi'}
            </h2>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
            {(['day', 'week', 'month'] as const).map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={cashFlowGranularity === g}
                onClick={() => setCashFlowGranularity(g)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  cursor: 'pointer',
                  fontSize: 'var(--text-xs)',
                  fontWeight: cashFlowGranularity === g ? 'var(--font-semibold)' : 'var(--font-regular)',
                  background: cashFlowGranularity === g ? 'var(--color-primary-600)' : 'var(--color-bg-secondary)',
                  color: cashFlowGranularity === g ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)',
                  minHeight: 32,
                  transition: 'all var(--transition-fast)',
                }}
              >
                {g === 'day' ? (isRu ? 'День' : 'Kun') : g === 'week' ? (isRu ? 'Неделя' : 'Hafta') : (isRu ? 'Месяц' : 'Oy')}
              </button>
            ))}
          </div>
        </div>
        <CashFlowChart seriesByCurrency={data?.cashFlow?.seriesByCurrency ?? []} isRu={isRu} />
        {uzsSummary && (
          <div style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap', marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-border-light)' }}>
            <div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Всего приход (UZS)' : 'Jami kirim (UZS)'}</div>
              <div style={{ fontWeight: 'var(--font-bold)', color: 'var(--color-success-600)', fontVariantNumeric: 'tabular-nums' }}>{formatAmount(uzsSummary.totalIncome, 'UZS')}</div>
            </div>
            <div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Всего расход (UZS)' : 'Jami chiqim (UZS)'}</div>
              <div style={{ fontWeight: 'var(--font-bold)', color: 'var(--color-error-600)', fontVariantNumeric: 'tabular-nums' }}>{formatAmount(uzsSummary.totalExpense, 'UZS')}</div>
            </div>
            <div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Чистый поток (UZS)' : 'Sof oqim (UZS)'}</div>
              <div style={{ fontWeight: 'var(--font-bold)', color: uzsSummary.netCashFlow >= 0 ? 'var(--color-success-600)' : 'var(--color-error-600)', fontVariantNumeric: 'tabular-nums' }}>
                {uzsSummary.netCashFlow >= 0 ? '+' : ''}{formatAmount(uzsSummary.netCashFlow, 'UZS')}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Bottom Row: Sales Chart + Recent Transactions */}
      <div className="dash-bottom-grid">
        {/* Sales Dynamics */}
        <Card title={isRu ? 'Динамика продаж (эквивалент UZS)' : 'Sotuv dinamikasi (UZS ekv.)'}>
          <div style={{ marginTop: 'var(--space-2)' }}>
            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', fontVariantNumeric: 'tabular-nums', marginBottom: 'var(--space-2)' }}>
              {formatAmount(data?.sales?.totalSales ?? 0, 'UZS')} <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)', fontWeight: 'var(--font-regular)' }}>UZS</span>
            </div>
            <SalesBarChart dynamics={data?.sales?.dynamics ?? []} isRu={isRu} />
          </div>
        </Card>

        {/* Recent Transactions */}
        <Card
          title={isRu ? 'Последние операции' : 'Oxirgi operatsiyalar'}
          action={
            <Link href="/finance" className="dash-card-link">
              {isRu ? 'Все' : 'Barchasi'} <ArrowRight size={14} aria-hidden />
            </Link>
          }
        >
          {!data?.recentTransactions || data.recentTransactions.length === 0 ? (
            <EmptyState compact icon={Wallet} title={isRu ? 'Операций за период нет' : 'Bu davrda operatsiyalar yo‘q'} description={t('noTransactionsHint')} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: 'var(--space-2)' }}>
              {data.recentTransactions.slice(0, 7).map((tx) => (
                <div key={tx.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  transition: 'background var(--transition-fast)',
                  cursor: 'default',
                }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: 'var(--radius-full)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: tx.direction === 'INCOME' ? 'var(--color-success-50)' : tx.direction === 'EXPENSE' ? 'var(--color-error-50)' : 'var(--color-info-50)',
                    }}>
                      {tx.direction === 'INCOME' && <TrendingUp size={16} style={{ color: 'var(--color-success-600)' }} />}
                      {tx.direction === 'EXPENSE' && <TrendingDown size={16} style={{ color: 'var(--color-error-600)' }} />}
                      {tx.direction === 'TRANSFER' && <ArrowRight size={16} style={{ color: 'var(--color-info-600)' }} />}
                    </div>
                    <div>
                      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)' }}>
                        {tx.counterparty?.name ?? tx.account?.name?.[locale] ?? (isRu ? 'Операция' : 'Operatsiya')}
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                        {formatDate(tx.transactionDate, locale)} · {tx.account?.name?.[locale] ?? ''}
                      </div>
                    </div>
                  </div>
                  <div style={{
                    fontSize: 'var(--text-sm)',
                    fontWeight: 'var(--font-semibold)',
                    fontVariantNumeric: 'tabular-nums',
                    color: tx.direction === 'INCOME' ? 'var(--color-success-600)' : tx.direction === 'EXPENSE' ? 'var(--color-error-600)' : 'var(--color-info-600)',
                  }}>
                    {tx.direction === 'INCOME' ? '+' : tx.direction === 'EXPENSE' ? '−' : ''}{formatMoney(Number(tx.amount), tx.currency)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

    </div>
  );
}
