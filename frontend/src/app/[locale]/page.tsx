'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { FullDashboard, DashboardPeriod, CashFlowPoint } from '@shared/types';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  ShoppingCart,
  ClipboardList,
  Factory,
  Truck,
  BarChart3,
  Users,
  Building2,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Calendar,
} from 'lucide-react';

// ─── Helpers ─────────────────────────────────────────────────────

function fmt(amount: number): string {
  return new Intl.NumberFormat('uz-UZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

function getPeriodDates(period: DashboardPeriod): { date_from: string; date_to: string } {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  switch (period) {
    case 'today':
      return { date_from: todayStr, date_to: todayStr };
    case 'yesterday': {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      const s = y.toISOString().slice(0, 10);
      return { date_from: s, date_to: s };
    }
    case 'this_week': {
      const start = new Date(now); start.setDate(now.getDate() - now.getDay());
      return { date_from: start.toISOString().slice(0, 10), date_to: todayStr };
    }
    case 'last_week': {
      const end = new Date(now); end.setDate(now.getDate() - now.getDay() - 1);
      const start = new Date(end); start.setDate(end.getDate() - 6);
      return { date_from: start.toISOString().slice(0, 10), date_to: end.toISOString().slice(0, 10) };
    }
    case 'this_month':
      return { date_from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, date_to: todayStr };
    case 'last_month': {
      const d = new Date(now.getFullYear(), now.getMonth(), 0);
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { date_from: start.toISOString().slice(0, 10), date_to: d.toISOString().slice(0, 10) };
    }
    case 'this_quarter': {
      const q = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), q * 3, 1);
      return { date_from: start.toISOString().slice(0, 10), date_to: todayStr };
    }
    case 'this_year':
      return { date_from: `${now.getFullYear()}-01-01`, date_to: todayStr };
    default:
      return { date_from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, date_to: todayStr };
  }
}

// ─── Cash Flow Chart (Recharts) ──────────────────────────────────

function fmtShort(val: number): string {
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)}B`;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(0)}K`;
  return String(val);
}

function CashFlowChart({
  seriesByCurrency,
  isRu,
}: {
  seriesByCurrency: { currency: string; series: CashFlowPoint[] }[];
  isRu: boolean;
}) {
  const [activeCurrency, setActiveCurrency] = useState<string>('UZS');

  // Sync activeCurrency whenever data loads or changes
  useEffect(() => {
    if (seriesByCurrency.length === 0) return;
    const preferred = seriesByCurrency.find((e) => e.currency === 'UZS');
    const fallback = seriesByCurrency[0];
    setActiveCurrency((prev) => {
      // Keep current selection if it still exists in new data
      const stillExists = seriesByCurrency.some((e) => e.currency === prev);
      if (stillExists) return prev;
      return preferred?.currency ?? fallback?.currency ?? 'UZS';
    });
  }, [seriesByCurrency]);

  const currencies = seriesByCurrency.map((e) => e.currency);
  const currentEntry = seriesByCurrency.find((e) => e.currency === activeCurrency);
  const series = currentEntry?.series ?? [];

  if (seriesByCurrency.length === 0) {
    return (
      <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>
        {isRu ? 'Нет данных за выбранный период' : 'Tanlangan davr uchun ma\'lumot yo\'q'}
      </div>
    );
  }


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
                <stop offset="5%" stopColor="#16a34a" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
              </linearGradient>
              <linearGradient id={`colorExpense-${activeCurrency}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#dc2626" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
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
              tickFormatter={fmtShort}
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
                new Intl.NumberFormat('uz-UZ').format(typeof value === 'number' ? value : Number(value) || 0) + ` ${activeCurrency}`,
                name ? String(name) : '',
              ]}
              labelStyle={{ color: 'var(--color-text-secondary)', marginBottom: 4 }}
            />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            <Area
              type="monotone"
              dataKey={incomeKey}
              stroke="#16a34a"
              strokeWidth={2}
              fill={`url(#colorIncome-${activeCurrency})`}
              dot={series.length <= 14 ? { r: 3, fill: '#16a34a', strokeWidth: 0 } : false}
              activeDot={{ r: 5 }}
            />
            <Area
              type="monotone"
              dataKey={expenseKey}
              stroke="#dc2626"
              strokeWidth={2}
              fill={`url(#colorExpense-${activeCurrency})`}
              dot={series.length <= 14 ? { r: 3, fill: '#dc2626', strokeWidth: 0 } : false}
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
            new Intl.NumberFormat('uz-UZ').format(typeof value === 'number' ? value : Number(value) || 0) + ' UZS',
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

function KpiCard({ title, value, subtitle, icon: Icon, iconColor, iconBg, trend, currency }: KpiCardProps) {
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
  const { token, company } = useAuth();

  const [period, setPeriod] = useState<DashboardPeriod>('this_month');
  const [data, setData] = useState<FullDashboard | null>(null);
  const [orderStats, setOrderStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [cashFlowGranularity, setCashFlowGranularity] = useState<'day' | 'week' | 'month'>('day');

  const fetchDashboard = useCallback(async () => {
    if (!token || !company) return;
    setLoading(true);
    const { date_from, date_to } = getPeriodDates(period);
    const params = new URLSearchParams({ date_from, date_to, granularity: cashFlowGranularity });

    try {
      const [result, orders] = await Promise.all([
        apiFetch<FullDashboard>(`/dashboard?${params}`, { token, tenantId: company.id, locale }),
        apiFetch<any>('/api/dashboard/sales-orders', { token, tenantId: company.id, locale }).catch(() => null),
      ]);
      setData(result);
      setOrderStats(orders);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [token, company, locale, period, cashFlowGranularity]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

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

  // Cash accounts
  const uzsAccount = data?.finance?.accounts?.find((a) => a.accountType === 'UZS_CASH');
  const usdAccount = data?.finance?.accounts?.find((a) => a.accountType === 'USD_CASH');
  const bankAccount = data?.finance?.accounts?.find((a) => a.accountType === 'BANK');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }} className="animate-fade-in">

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            {isRu ? 'Главная' : 'Bosh sahifa'}
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
            {isRu ? 'Финансовое состояние вашей компании' : 'Kompaniyangizning moliyaviy holati'}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchDashboard} disabled={loading}>
          <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : undefined }} />
          {isRu ? 'Обновить' : 'Yangilash'}
        </Button>
      </div>

      {/* Period Selector */}
      <div style={{
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border-light)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-2)',
        display: 'flex',
        gap: 'var(--space-1)',
        flexWrap: 'wrap',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <Calendar size={18} style={{ color: 'var(--color-text-tertiary)', alignSelf: 'center', marginLeft: '8px', marginRight: '4px' }} />
        {periodsList.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              cursor: 'pointer',
              fontSize: 'var(--text-sm)',
              fontWeight: period === p.value ? 'var(--font-semibold)' : 'var(--font-regular)',
              background: period === p.value ? 'var(--color-primary-600)' : 'transparent',
              color: period === p.value ? '#fff' : 'var(--color-text-secondary)',
              transition: 'all var(--transition-fast)',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Core KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
        {/* Cash Balances */}
        <div style={{
          background: 'linear-gradient(135deg, var(--color-primary-600), #7c3aed)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-5)',
          color: '#fff',
          gridColumn: 'span 1',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            <Wallet size={20} style={{ opacity: 0.9 }} />
            <span style={{ fontSize: 'var(--text-sm)', opacity: 0.85 }}>{isRu ? 'Всего наличных' : 'Jami naqd pul'}</span>
          </div>
          {uzsAccount && (
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', fontVariantNumeric: 'tabular-nums', marginBottom: '4px' }}>
              {fmt(Number(uzsAccount.balance))} <span style={{ fontSize: 'var(--text-sm)', opacity: 0.8 }}>UZS</span>
            </div>
          )}
          {usdAccount && (
            <div style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)', fontVariantNumeric: 'tabular-nums', opacity: 0.85 }}>
              {fmt(Number(usdAccount.balance))} <span style={{ fontSize: 'var(--text-xs)', opacity: 0.8 }}>USD</span>
            </div>
          )}
          {bankAccount && (
            <div style={{ fontSize: 'var(--text-sm)', marginTop: '8px', opacity: 0.7 }}>
              Bank: {fmt(Number(bankAccount.balance))} UZS
            </div>
          )}
        </div>

        {/* Sales */}
        <KpiCard
          title={isRu ? 'Объём продаж' : 'Sotuv hajmi'}
          value={`${fmt(data?.sales?.totalSales ?? 0)} UZS`}
          subtitle={`${data?.sales?.invoiceCount ?? 0} ${isRu ? 'документов' : 'ta hujjat'}`}
          icon={ShoppingCart}
          iconColor="var(--color-info-600)"
          iconBg="var(--color-info-50)"
        />

        {/* Expenses */}
        <KpiCard
          title={isRu ? 'Всего расходов' : 'Jami chiqim'}
          value={`${fmt(uzsSummary?.totalExpense ?? 0)} UZS`}
          subtitle={usdSummary ? `+ ${fmt(usdSummary.totalExpense)} USD` : undefined}
          icon={TrendingDown}
          iconColor="var(--color-error-600)"
          iconBg="var(--color-error-50)"
        />

        {/* Profit */}
        <KpiCard
          title={isRu ? 'Валовая прибыль' : 'Yalpi foyda'}
          value={`${fmt(data?.finance?.profit?.grossProfit ?? 0)} UZS`}
          subtitle={`${isRu ? 'Продажи' : 'Sotuv'}: ${fmt(data?.finance?.profit?.revenue ?? 0)} UZS`}
          icon={BarChart3}
          iconColor="var(--color-warning-600)"
          iconBg="var(--color-warning-50)"
        />
      </div>

      {/* Orders Pipeline (Zakazlar voronkasi) */}
      {orderStats && (
        <Card
          title={isRu ? 'Воронка заказов и производство' : 'Zakazlar voronkasi va ishlab chiqarish'}
          action={
            <Link href="/sales/orders" style={{ textDecoration: 'none' }}>
              <Button variant="ghost" size="sm">
                {isRu ? 'Все заказы' : 'Barcha zakazlar'} <ArrowRight size={14} />
              </Button>
            </Link>
          }
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 'var(--space-3)',
              marginTop: 'var(--space-2)',
            }}
          >
            <div style={{ padding: '12px', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', borderLeft: '4px solid var(--color-primary-500)' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                {isRu ? 'НОВЫЕ / СОГЛАСОВАНИЕ' : 'YANGI / TASDIQLASHDA'}
              </div>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginTop: '4px' }}>
                {(orderStats.pipeline?.NEW || 0) + (orderStats.pipeline?.PENDING_APPROVAL || 0)}
              </div>
            </div>

            <div style={{ padding: '12px', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', borderLeft: '4px solid var(--color-warning-500)' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                {isRu ? 'В ПРОИЗВОДСТВЕ' : 'ISHLAB CHIQARISHDA'}
              </div>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginTop: '4px', color: 'var(--color-warning-600)' }}>
                {(orderStats.pipeline?.SENT_TO_PRODUCTION || 0) + (orderStats.pipeline?.IN_PRODUCTION || 0) + (orderStats.pipeline?.PARTIALLY_READY || 0)}
              </div>
            </div>

            <div style={{ padding: '12px', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', borderLeft: '4px solid var(--color-error-500)' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                {isRu ? 'ОЖИДАЮТ ОПЛАТЫ' : 'TO‘LOV KUTILMOQDA'}
              </div>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginTop: '4px', color: 'var(--color-error-600)' }}>
                {orderStats.pipeline?.AWAITING_PAYMENT || 0}
              </div>
            </div>

            <div style={{ padding: '12px', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', borderLeft: '4px solid var(--color-success-500)' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                {isRu ? 'ГОТОВЫ К ОТГРУЗКЕ' : 'JO‘NATISHGA TAYYOR'}
              </div>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginTop: '4px', color: 'var(--color-success-600)' }}>
                {orderStats.pipeline?.READY_TO_SHIP || 0}
              </div>
            </div>

            <div style={{ padding: '12px', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', borderLeft: '4px solid var(--color-info-500)' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                {isRu ? 'ОТГРУЖЕНЫ' : 'JO‘NATILGAN'}
              </div>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginTop: '4px', color: 'var(--color-info-600)' }}>
                {orderStats.pipeline?.SHIPPED || 0}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Receivables & Payables */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
        {/* Receivables */}
        <Card
          title={isRu ? 'Дебиторы (нам должны)' : 'Debitorlar (bizga qarzdorlar)'}
          action={<Link href="/accounting" style={{ textDecoration: 'none' }}><Button variant="ghost" size="sm">{isRu ? 'Все' : 'Barchasi'} <ArrowRight size={14} /></Button></Link>}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            <div>
              <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-success-600)', fontVariantNumeric: 'tabular-nums' }}>
                {fmt(data?.debts?.receivable?.total ?? 0)} UZS
              </div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>
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
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', color: 'var(--color-success-600)', fontVariantNumeric: 'tabular-nums' }}>{fmt(d.amount)} UZS</span>
            </div>
          ))}
        </Card>

        {/* Payables */}
        <Card
          title={isRu ? 'Кредиторы (мы должны)' : 'Kreditorlar (biz qarzdormiz)'}
          action={<Link href="/accounting" style={{ textDecoration: 'none' }}><Button variant="ghost" size="sm">{isRu ? 'Все' : 'Barchasi'} <ArrowRight size={14} /></Button></Link>}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            <div>
              <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-error-600)', fontVariantNumeric: 'tabular-nums' }}>
                {fmt(data?.debts?.payable?.total ?? 0)} UZS
              </div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>
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
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', color: 'var(--color-error-600)', fontVariantNumeric: 'tabular-nums' }}>{fmt(c.amount)} UZS</span>
            </div>
          ))}
        </Card>
      </div>

      {/* Cash Flow Chart */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)' }}>
              {isRu ? 'График движения денежных средств' : 'Pul oqimi grafigi'}
            </h2>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
            {(['day', 'week', 'month'] as const).map((g) => (
              <button
                key={g}
                onClick={() => setCashFlowGranularity(g)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  cursor: 'pointer',
                  fontSize: 'var(--text-xs)',
                  fontWeight: cashFlowGranularity === g ? 'var(--font-semibold)' : 'var(--font-regular)',
                  background: cashFlowGranularity === g ? 'var(--color-primary-600)' : 'var(--color-bg-secondary)',
                  color: cashFlowGranularity === g ? '#fff' : 'var(--color-text-secondary)',
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
          <div style={{ display: 'flex', gap: 'var(--space-6)', marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-border-light)' }}>
            <div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Всего приход (UZS)' : 'Jami kirim (UZS)'}</div>
              <div style={{ fontWeight: 'var(--font-bold)', color: 'var(--color-success-600)', fontVariantNumeric: 'tabular-nums' }}>{fmt(uzsSummary.totalIncome)}</div>
            </div>
            <div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Всего расход (UZS)' : 'Jami chiqim (UZS)'}</div>
              <div style={{ fontWeight: 'var(--font-bold)', color: 'var(--color-error-600)', fontVariantNumeric: 'tabular-nums' }}>{fmt(uzsSummary.totalExpense)}</div>
            </div>
            <div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Чистый поток (UZS)' : 'Sof oqim (UZS)'}</div>
              <div style={{ fontWeight: 'var(--font-bold)', color: uzsSummary.netCashFlow >= 0 ? 'var(--color-success-600)' : 'var(--color-error-600)', fontVariantNumeric: 'tabular-nums' }}>
                {uzsSummary.netCashFlow >= 0 ? '+' : ''}{fmt(uzsSummary.netCashFlow)}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Bottom Row: Sales Chart + Recent Transactions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 'var(--space-4)' }}>
        {/* Sales Dynamics */}
        <Card title={isRu ? 'Динамика продаж' : 'Sotuv dinamikasi'}>
          <div style={{ marginTop: 'var(--space-2)' }}>
            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', fontVariantNumeric: 'tabular-nums', marginBottom: 'var(--space-2)' }}>
              {fmt(data?.sales?.totalSales ?? 0)} <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)', fontWeight: 'var(--font-regular)' }}>UZS</span>
            </div>
            <SalesBarChart dynamics={data?.sales?.dynamics ?? []} isRu={isRu} />
          </div>
        </Card>

        {/* Recent Transactions */}
        <Card
          title={isRu ? 'Последние операции' : 'Oxirgi operatsiyalar'}
          action={
            <Link href="/finance" style={{ textDecoration: 'none' }}>
              <Button variant="ghost" size="sm">{isRu ? 'Все' : 'Barchasi'} <ArrowRight size={14} /></Button>
            </Link>
          }
        >
          {!data?.recentTransactions || data.recentTransactions.length === 0 ? (
            <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>
              {isRu ? 'Операции не найдены' : 'Hech qanday operatsiya topilmadi'}
            </div>
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
                        {tx.counterparty?.name ?? (tx.account?.name as any)?.[locale] ?? (isRu ? 'Операция' : 'Operatsiya')}
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                        {formatDate(tx.transactionDate, locale)} · {(tx.account?.name as any)?.[locale] ?? ''}
                      </div>
                    </div>
                  </div>
                  <div style={{
                    fontSize: 'var(--text-sm)',
                    fontWeight: 'var(--font-semibold)',
                    fontVariantNumeric: 'tabular-nums',
                    color: tx.direction === 'INCOME' ? 'var(--color-success-600)' : tx.direction === 'EXPENSE' ? 'var(--color-error-600)' : 'var(--color-info-600)',
                  }}>
                    {tx.direction === 'INCOME' ? '+' : tx.direction === 'EXPENSE' ? '−' : ''}{fmt(Number(tx.amount))} {tx.currency}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Bank & Cash Balances */}
      {data?.finance?.accounts && data.finance.accounts.length > 0 && (
        <Card title={isRu ? 'Балансы банков и касс' : 'Bank va naqd pul balanslari'}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
            {data.finance.accounts.map((acc) => {
              const colors: Record<string, { text: string; bg: string }> = {
                UZS_CASH: { text: 'var(--color-success-600)', bg: 'var(--color-success-50)' },
                USD_CASH: { text: 'var(--color-info-600)', bg: 'var(--color-info-50)' },
                BANK: { text: 'var(--color-primary-600)', bg: 'var(--color-primary-50)' },
              };
              const c = colors[acc.accountType] ?? { text: 'var(--color-text-primary)', bg: 'var(--color-bg-tertiary)' };
              return (
                <div key={acc.id} style={{
                  padding: 'var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  background: c.bg,
                  border: `1px solid ${c.bg}`,
                }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginBottom: '4px' }}>
                    {(acc.name as any)[locale] || (acc.name as any).ru || (acc.name as any).uz}
                  </div>
                  <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: c.text, fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(Number(acc.balance))} {acc.currency}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
