'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  BarChart3,
  TrendingUp,
  PieChart,
  Package,
  Calendar,
  Download,
  Printer,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  Users,
} from 'lucide-react';
import {
  KpiSummary,
  SalesTrendDataPoint,
  CategoryBreakdownItem,
  TopProductItem,
  FinancialRatios,
} from '@shared/types';

export default function AnalyticsPage() {
  const tCommon = useTranslations('common');
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token, company } = useAuth();

  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month' | 'quarter' | 'year'>('month');
  const [kpi, setKpi] = useState<KpiSummary | null>(null);
  const [trend, setTrend] = useState<SalesTrendDataPoint[]>([]);
  const [categories, setCategories] = useState<CategoryBreakdownItem[]>([]);
  const [topProducts, setTopProducts] = useState<TopProductItem[]>([]);
  const [topClients, setTopClients] = useState<any[]>([]);
  const [ratios, setRatios] = useState<FinancialRatios | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    if (!token || !company) return;
    setLoading(true);
    try {
      const opts = { token, tenantId: company.id, locale };
      const [k, t, c, tp, tc, r] = await Promise.all([
        apiFetch<KpiSummary>(`/analytics/kpi-summary?range=${timeRange}`, opts),
        apiFetch<SalesTrendDataPoint[]>(`/analytics/sales-trend?range=${timeRange}`, opts),
        apiFetch<CategoryBreakdownItem[]>(`/analytics/category-breakdown?range=${timeRange}`, opts),
        apiFetch<TopProductItem[]>(`/analytics/top-products?range=${timeRange}&limit=10`, opts),
        apiFetch<any[]>(`/analytics/top-clients?range=${timeRange}&limit=5`, opts).catch(() => []),
        apiFetch<FinancialRatios>(`/analytics/financial-ratios`, opts),
      ]);
      setKpi(k);
      setTrend(t || []);
      setCategories(c || []);
      setTopProducts(tp || []);
      setTopClients(tc || []);
      setRatios(r);
    } catch (err) {
      console.error('Failed to load BI Analytics data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token, company, timeRange, locale]);

  const maxTrendRevenue = Math.max(...trend.map((t) => t.revenue), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            {isRu ? 'BI-Аналитика и Дашборд Руководителя' : 'BI Analitika va Rahbar Dashboardi (Executive BI)'}
          </h1>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
          {/* Time Range Selector */}
          <div style={{ display: 'flex', backgroundColor: 'var(--color-bg-tertiary)', padding: '3px', borderRadius: 'var(--radius-md)' }}>
            {(['today', 'week', 'month', 'quarter', 'year'] as const).map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setTimeRange(range)}
                style={{
                  padding: '6px 12px',
                  fontSize: 'var(--text-xs)',
                  fontWeight: timeRange === range ? 'var(--font-semibold)' : 'var(--font-medium)',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  backgroundColor: timeRange === range ? '#fff' : 'transparent',
                  color: timeRange === range ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  boxShadow: timeRange === range ? 'var(--shadow-sm)' : 'none',
                }}
              >
                {range === 'today'
                  ? (isRu ? 'Сегодня' : 'Bugun')
                  : range === 'week'
                  ? (isRu ? 'Эта неделя' : 'Shu hafta')
                  : range === 'month'
                  ? (isRu ? 'Этот месяц' : 'Shu oy')
                  : range === 'quarter'
                  ? (isRu ? 'Квартал' : 'Shu chorak')
                  : (isRu ? 'Год' : 'Yillik')}
              </button>
            ))}
          </div>

          <Button variant="outline" onClick={() => window.print()}>
            <Printer size={16} /> {isRu ? 'Печать отчёта' : 'Hisobot Chop etish'}
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      {loading ? (
        <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
          {tCommon('loading')}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
            <Card style={{ background: 'linear-gradient(135deg, rgba(79,70,229,0.05) 0%, rgba(79,70,229,0.01) 100%)', borderLeft: '4px solid var(--color-primary-600)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-tertiary)' }}>
                  {isRu ? 'ОБЩАЯ ВЫРУЧКА ОТ ПРОДАЖ' : 'JAMI SOTUV TUSHUMI'}
                </div>
                <TrendingUp size={18} style={{ color: 'var(--color-primary-600)' }} />
              </div>
              <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', marginTop: '8px' }} className="tabular-nums">
                {formatCurrency(kpi?.totalRevenue || 0, locale)}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-success-600)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '2px' }}>
                <ArrowUpRight size={14} /> <span>{isRu ? 'Сумма по документам реализации' : 'Shartnomalar bo\'yicha yig\'indi'}</span>
              </div>
            </Card>

            <Card style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.05) 0%, rgba(16,185,129,0.01) 100%)', borderLeft: '4px solid var(--color-success-600)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-tertiary)' }}>
                  {isRu ? 'РЕНТАБЕЛЬНОСТЬ ЧИСТОЙ ПРИБЫЛИ' : 'SOF FOYDA RENTABELLIGI'}
                </div>
                <Badge variant="success">+{kpi?.netProfitMargin || 0}% Margin</Badge>
              </div>
              <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-success-600)', marginTop: '8px' }} className="tabular-nums">
                {formatCurrency(kpi?.grossProfit || 0, locale)}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                {isRu ? 'Выручка минус себестоимость (COGS)' : 'Sotuv tushumi minus tovarlar tannarxi (COGS)'}
              </div>
            </Card>

            <Card style={{ borderLeft: '4px solid var(--color-warning-600)' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-tertiary)' }}>
                {isRu ? 'ДЕБИТОРСКАЯ ЗАДОЛЖЕННОСТЬ' : 'DEBITORLIK (MIJOZLAR QARZI)'}
              </div>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-warning-600)', marginTop: '8px' }} className="tabular-nums">
                {formatCurrency(kpi?.totalAccountsReceivable || 0, locale)}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                {isRu ? 'Ожидаемые поступления от клиентов' : 'Mijozlardan kelib tushishi kutilayotgan mablag\'}'}
              </div>
            </Card>

            <Card style={{ borderLeft: '4px solid var(--color-error-600)' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-tertiary)' }}>
                {isRu ? 'КРЕДИТОРСКАЯ ЗАДОЛЖЕННОСТЬ' : 'KREDITORLIK (POSTAVSHIKLAR QARZI)'}
              </div>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-error-600)', marginTop: '8px' }} className="tabular-nums">
                {formatCurrency(kpi?.totalAccountsPayable || 0, locale)}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                {isRu ? 'Задолженность перед поставщиками' : 'Yetkazib beruvchilar oldidagi qarzimiz'}
              </div>
            </Card>
          </div>

          {/* Analytics Charts Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-6)' }}>
            {/* Sales Trend Bar Chart */}
            <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)' }}>
                    {isRu ? 'Динамика продаж и прибыли' : 'Sotuvlar va Foyda Oylik Dinamikasi'}
                  </h3>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                    {isRu ? 'График роста выручки и валовой прибыли' : 'Tushum va yalpi foyda o\'sish grafigi'}
                  </p>
                </div>
              </div>

              {trend.length === 0 ? (
                <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
                  {isRu ? 'Данные для графика отсутствуют' : 'Grafik ma\'lumotlari hali shakllanmagan'}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-4)', height: '220px', paddingTop: 'var(--space-4)', borderBottom: '1px solid var(--color-border-light)' }}>
                  {trend.map((point, idx) => {
                    const heightPercent = Math.max(Math.round((point.revenue / maxTrendRevenue) * 100), 8);
                    return (
                      <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', height: '100%', justifyContent: 'flex-end' }}>
                        <div style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--color-primary-600)' }} className="tabular-nums">
                          {formatCurrency(point.revenue, locale)}
                        </div>
                        <div
                          style={{
                            width: '100%',
                            maxWidth: '36px',
                            height: `${heightPercent}%`,
                            backgroundColor: 'var(--color-primary-600)',
                            borderRadius: '4px 4px 0 0',
                            transition: 'all 0.3s ease',
                          }}
                        />
                        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', fontWeight: '500' }}>
                          {point.period}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* Category Breakdown Donut / Progress list */}
            <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)' }}>
                  {isRu ? 'Распределение по категориям' : 'Kategoriyalar Taqsimoti'}
                </h3>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                  {isRu ? 'Доля выручки по категориям товаров' : 'Sotuv tushumining tovar turlari bo\'yicha ulushi'}
                </p>
              </div>

              {categories.length === 0 ? (
                <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
                  {isRu ? 'Данные по категориям отсутствуют' : 'Kategoriya ma\'lumotlari mavjud emas'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {categories.map((cat) => (
                    <div key={cat.categoryId} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)' }}>
                        <span style={{ fontWeight: 'var(--font-medium)' }}>
                          {cat.categoryName[locale] || cat.categoryName.ru || cat.categoryName.uz}
                        </span>
                        <span style={{ fontWeight: 'var(--font-bold)' }}>{cat.percentage}% ({formatCurrency(cat.revenue, locale)})</span>
                      </div>
                      <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                        <div style={{ width: `${cat.percentage}%`, height: '100%', backgroundColor: 'var(--color-primary-600)', borderRadius: 'var(--radius-full)' }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Top 10 Bestsellers & Top Clients Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-6)' }}>
            {/* Top 10 Best-Selling Products Table */}
            <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div>
                <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)' }}>
                  {isRu ? 'Топ-10 популярных товаров (Bestsellers)' : 'Top 10 Eng Xaridorgir Mahsulotlar (Bestsellers)'}
                </h3>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                  {isRu ? 'Лидеры по объёму продаж и выручке' : 'Sotuv hajmi va tushum bo\'yicha etakchilar'}
                </p>
              </div>

              {topProducts.length === 0 ? (
                <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
                  {isRu ? 'История продаж отсутствует' : 'Sotuvlar tarixi mavjud emas'}
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-xs)' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-tertiary)' }}>
                        <th style={{ padding: '8px' }}>№</th>
                        <th style={{ padding: '8px' }}>{isRu ? 'НАИМЕНОВАНИЕ ТОВАРА' : 'MAHSULOT NOMI'}</th>
                        <th style={{ padding: '8px' }}>SKU</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>{isRu ? 'ПРОДАНО' : 'SOTILGAN MIQDOR'}</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>{isRu ? 'ОБЩАЯ ВЫРУЧКА' : 'JAMI TUSHUM'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topProducts.map((p, idx) => (
                        <tr key={p.productId} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                          <td style={{ padding: '8px', fontWeight: 'bold' }}>{idx + 1}</td>
                          <td style={{ padding: '8px', fontWeight: 'var(--font-semibold)' }}>
                            {p.productName[locale] || p.productName.ru || p.productName.uz}
                          </td>
                          <td style={{ padding: '8px', fontFamily: 'var(--font-mono)' }}>{p.sku}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>{p.totalQuantity} {p.unitOfMeasure}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', color: 'var(--color-primary-600)' }} className="tabular-nums">
                            {formatCurrency(p.totalRevenue, locale)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* Top Clients & Financial Ratios */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
              {/* Top Clients */}
              <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <div>
                  <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)' }}>
                    {isRu ? 'Ключевые клиенты' : 'Asosiy Mijozlar (Top Clients)'}
                  </h3>
                  <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                    {isRu ? 'Клиенты с наибольшей выручкой' : 'Eng ko\'p tushum keltirgan mijozlar'}
                  </p>
                </div>

                {topClients.length === 0 ? (
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', textAlign: 'center', padding: '12px' }}>
                    {isRu ? 'История клиентов отсутствует' : 'Mijozlar tarixi mavjud emas'}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {topClients.map((client, idx) => (
                      <div key={client.counterpartyId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)' }}>
                        <div>
                          <div style={{ fontWeight: 'bold' }}>{idx + 1}. {client.name}</div>
                          <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>
                            {client.invoiceCount} {isRu ? 'счетов' : 'ta faktura'} {client.inn ? `| ИНН: ${client.inn}` : ''}
                          </div>
                        </div>
                        <div style={{ fontWeight: 'bold', color: 'var(--color-success-600)' }} className="tabular-nums">
                          {formatCurrency(client.totalSpent, locale)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Financial Ratios Cards */}
              <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <div>
                  <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)' }}>
                    {isRu ? 'Финансовые показатели (Ratios)' : 'Moliyaviy Ko\'rsatkichlar (Ratios)'}
                  </h3>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', fontSize: 'var(--text-xs)' }}>
                  <div style={{ padding: '8px 12px', backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>
                      {isRu ? 'ЧИСТЫЙ ОБОРОТНЫЙ КАПИТАЛ' : 'SOF AYLANMA MABLAG\' (WORKING CAPITAL)'}
                    </div>
                    <div style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)', color: 'var(--color-primary-600)' }} className="tabular-nums">
                      {formatCurrency(ratios?.workingCapital || 0, locale)}
                    </div>
                  </div>

                  <div style={{ padding: '8px 12px', backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>
                      {isRu ? 'ОБОРАЧИВАЕМОСТЬ ЗАПАСОВ (ДНЕЙ)' : 'TOVARLAR AYLANISH DAVRI (INVENTORY DAYS)'}
                    </div>
                    <div style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)' }} className="tabular-nums">
                      {ratios?.inventoryTurnoverDays || 0} {isRu ? 'дн' : 'Kun'}
                    </div>
                  </div>

                  <div style={{ padding: '8px 12px', backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>
                      {isRu ? 'ПЕРИОД СБОРА ДЕБИТОРКИ (ДНЕЙ)' : 'QARZDORLIK YIG\'ISH MUDDATI (AR DAYS)'}
                    </div>
                    <div style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)', color: 'var(--color-warning-600)' }} className="tabular-nums">
                      {ratios?.arCollectionDays || 0} {isRu ? 'дн' : 'Kun'}
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
