'use client';

import { useState, type ReactNode } from 'react';
import { useLocale } from 'next-intl';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { usePersistentState } from '@/lib/usePersistentState';
import { LoadError } from '@/components/ui/LoadError';
import { formatCurrency } from '@/lib/utils';
import { MultiCurrencyValue } from '@/components/ui/MultiCurrencyValue';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { BarChart3, Printer } from 'lucide-react';
import {
  KpiSummary,
  SalesTrendDataPoint,
  CategoryBreakdownItem,
  TopProductItem,
  FinancialRatios,
  TopClientItem,
} from '@shared/types';
import { unitLabel } from '@/lib/units';

type Range = 'today' | 'week' | 'month' | 'quarter' | 'year';
const RANGES: Range[] = ['today', 'week', 'month', 'quarter', 'year'];
const RANGE_LABEL: Record<Range, { uz: string; ru: string }> = {
  today: { uz: 'Bugun', ru: 'Сегодня' },
  week: { uz: 'Shu hafta', ru: 'Эта неделя' },
  month: { uz: 'Shu oy', ru: 'Этот месяц' },
  quarter: { uz: 'Shu chorak', ru: 'Квартал' },
  year: { uz: 'Yillik', ru: 'Год' },
};
const MONTHS = {
  uz: ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'],
  ru: ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
};

/** "2026-11" → "Noy 2026"; anything else unchanged. */
function periodLabel(period: string, locale: 'uz' | 'ru'): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  return m ? `${MONTHS[locale][Number(m[2]) - 1]} ${m[1]}` : period;
}

function Kpi({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)' }}>{label}</div>
      <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)' }} className="tabular-nums">{children}</div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{hint}</div>
    </Card>
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)' }}>{title}</h2>
      {hint && <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 2 }}>{hint}</p>}
    </div>
  );
}

/** Monthly revenue bars: true-zero baseline, value on hover/focus, the peak labelled, a table for screen readers. */
function TrendChart({ trend, locale }: { trend: SalesTrendDataPoint[]; locale: 'uz' | 'ru' }) {
  const isRu = locale === 'ru';
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...trend.map((t) => t.revenue), 1);
  const peak = trend.reduce((best, t, i) => (t.revenue > trend[best].revenue ? i : best), 0);
  const shown = active ?? peak;
  const p = trend[shown];
  return (
    <div>
      <div aria-live="polite" style={{ minHeight: 40, display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'baseline', fontSize: 'var(--text-sm)' }}>
        <strong>{periodLabel(p.period, locale)}{active === null ? (isRu ? ' · пик' : ' · eng yuqori') : ''}</strong>
        <span>{isRu ? 'Выручка' : 'Tushum'} <strong className="tabular-nums">{formatCurrency(p.revenue, locale, p.currency)}</strong></span>
        <span style={{ color: 'var(--color-text-secondary)' }}>{isRu ? 'Прибыль' : 'Foyda'} <span className="tabular-nums">{formatCurrency(p.profit, locale, p.currency)}</span></span>
      </div>
      <div aria-hidden style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 200, borderBottom: '1px solid var(--color-border)' }} onMouseLeave={() => setActive(null)}>
        {trend.map((point, idx) => {
          const h = point.revenue > 0 ? Math.max((point.revenue / max) * 100, 1) : 0;
          return (
            <div key={point.period} onMouseEnter={() => setActive(idx)} style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', cursor: 'default' }}>
              <div
                style={{
                  width: '70%',
                  maxWidth: 40,
                  height: `${h}%`,
                  background: 'var(--color-primary-600)',
                  opacity: active === null || active === idx ? 1 : 0.45,
                  borderRadius: '4px 4px 0 0',
                }}
              />
            </div>
          );
        })}
      </div>
      <div aria-hidden style={{ display: 'flex', gap: 2, marginTop: 6 }}>
        {trend.map((point, idx) => (
          <div key={point.period} style={{ flex: 1, textAlign: 'center', fontSize: 'var(--text-xs)', color: idx === shown ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {periodLabel(point.period, locale)}
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>{isRu ? 'Выручка и прибыль по месяцам, UZS' : 'Oylar bo‘yicha tushum va foyda, UZS'}</caption>
        <thead><tr><th>{isRu ? 'Месяц' : 'Oy'}</th><th>{isRu ? 'Выручка' : 'Tushum'}</th><th>{isRu ? 'Прибыль' : 'Foyda'}</th></tr></thead>
        <tbody>
          {trend.map((t) => (
            <tr key={t.period}><td>{periodLabel(t.period, locale)}</td><td>{formatCurrency(t.revenue, locale, t.currency)}</td><td>{formatCurrency(t.profit, locale, t.currency)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AnalyticsPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  const [timeRange, setTimeRange] = usePersistentState<Range>('analytics.range', 'month');
  // One query per report; the range is part of each endpoint (= cache key).
  const kpiQuery = useApiQuery<KpiSummary>(`/analytics/kpi-summary?range=${timeRange}`);
  const trendQuery = useApiQuery<SalesTrendDataPoint[]>(`/analytics/sales-trend?range=${timeRange}`);
  const categoriesQuery = useApiQuery<CategoryBreakdownItem[]>(`/analytics/category-breakdown?range=${timeRange}`);
  const topProductsQuery = useApiQuery<TopProductItem[]>(`/analytics/top-products?range=${timeRange}&limit=10`);
  // Optional block: a failure leaves it empty instead of failing the page.
  const topClientsQuery = useApiQuery<TopClientItem[]>(`/analytics/top-clients?range=${timeRange}&limit=5`);
  const ratiosQuery = useApiQuery<FinancialRatios>('/analytics/financial-ratios');
  const requiredQueries = [kpiQuery, trendQuery, categoriesQuery, topProductsQuery, ratiosQuery];

  const kpi = kpiQuery.data ?? null;
  const trend = trendQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const topProducts = topProductsQuery.data ?? [];
  const topClients = topClientsQuery.data ?? [];
  const ratios = ratiosQuery.data ?? null;
  const failedQuery = requiredQueries.find((q) => q.isError);
  const loading = requiredQueries.some((q) => q.isPending);
  const retryFailed = () => requiredQueries.filter((q) => q.isError).forEach((q) => void q.refetch());
  const rangeName = isRu ? RANGE_LABEL[timeRange].ru.toLowerCase() : RANGE_LABEL[timeRange].uz.toLowerCase();

  // A ratio the backend cannot compute honestly (e.g. debts in USD) is null.
  const notComputable = (
    <span title={isRu ? 'Нельзя посчитать: долги в разных валютах или нет данных за год' : 'Hisoblab bo‘lmaydi: qarzlar turli valyutada yoki yil bo‘yicha ma’lumot yo‘q'}>—</span>
  );
  const th = { padding: '8px 12px', fontWeight: 'var(--font-medium)' } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ marginBottom: 'calc(-1 * var(--space-5))' }}>
        <PageHeader
          title={isRu ? 'Отчёты' : 'Hisobotlar'}
          subtitle={isRu ? 'Выручка, прибыль, долги и самые продаваемые товары за выбранный период.' : 'Tanlangan davr uchun tushum, foyda, qarzlar va eng ko‘p sotilgan tovarlar.'}
          actions={
            <Button variant="outline" onClick={() => window.print()} className="no-print">
              <Printer size={16} aria-hidden /> {isRu ? 'Печать' : 'Chop etish'}
            </Button>
          }
        />
      </div>

      <div role="group" aria-label={isRu ? 'Период' : 'Davr'} className="no-print" style={{ display: 'flex', maxWidth: '100%', overflowX: 'auto', alignSelf: 'flex-start', backgroundColor: 'var(--color-segmented-bg)', padding: 2, borderRadius: 'var(--radius-md)', border: '1px solid var(--color-segmented-border)' }}>
        {RANGES.map((range) => {
          const on = timeRange === range;
          return (
            <button
              key={range}
              type="button"
              aria-pressed={on}
              onClick={() => setTimeRange(range)}
              style={{
                minHeight: 32,
                padding: '6px 14px',
                fontSize: 'var(--text-sm)',
                fontWeight: on ? 600 : 500,
                whiteSpace: 'nowrap',
                borderRadius: 'var(--radius-sm)',
                border: on ? '1px solid var(--color-segmented-active-border)' : '1px solid transparent',
                backgroundColor: on ? 'var(--color-segmented-active-bg)' : 'transparent',
                color: on ? 'var(--color-primary-700)' : 'var(--color-text-secondary)',
                cursor: 'pointer',
                boxShadow: on ? 'var(--color-segmented-active-shadow)' : 'none',
              }}
            >
              {isRu ? RANGE_LABEL[range].ru : RANGE_LABEL[range].uz}
            </button>
          );
        })}
      </div>

      {failedQuery ? (
        <Card><LoadError error={failedQuery.error} onRetry={retryFailed} retrying={requiredQueries.some((q) => q.isFetching)} /></Card>
      ) : loading ? (
        <div role="status" className="ux-kpi-grid">
          <span className="sr-only">{isRu ? 'Загрузка…' : 'Yuklanmoqda…'}</span>
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}><Skeleton height={12} width="60%" /><Skeleton height={24} width="80%" style={{ marginTop: 12 }} /></Card>
          ))}
        </div>
      ) : (
        <>
          <div className="ux-kpi-grid">
            <Kpi label={isRu ? 'Выручка' : 'Sotuv tushumi'} hint={isRu ? `Проведённые продажи, ${rangeName}` : `Tasdiqlangan sotuvlar, ${rangeName}`}>
              <MultiCurrencyValue items={kpi?.totalRevenueByCurrency} locale={locale} />
            </Kpi>
            <Kpi
              label={isRu ? 'Валовая прибыль' : 'Yalpi foyda'}
              hint={
                kpi && kpi.netProfitMargin
                  ? isRu ? `Маржа ${kpi.netProfitMargin}% · выручка без НДС минус себестоимость` : `Marja ${kpi.netProfitMargin}% · QQSsiz tushum minus tannarx`
                  : isRu ? 'Выручка без НДС минус себестоимость' : 'QQSsiz tushum minus tannarx'
              }
            >
              <MultiCurrencyValue items={kpi?.grossProfitByCurrency} locale={locale} />
            </Kpi>
            <Kpi label={isRu ? 'Нам должны клиенты' : 'Mijozlar qarzi'} hint={isRu ? 'Дебиторская задолженность сейчас' : 'Hozirgi debitorlik qarzi'}>
              <MultiCurrencyValue items={kpi?.receivablesByCurrency} locale={locale} />
            </Kpi>
            <Kpi label={isRu ? 'Мы должны поставщикам' : 'Yetkazib beruvchilarga qarzimiz'} hint={isRu ? 'Кредиторская задолженность сейчас' : 'Hozirgi kreditorlik qarzi'}>
              <MultiCurrencyValue items={kpi?.payablesByCurrency} locale={locale} />
            </Kpi>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'var(--ux-split-2-1)', gap: 'var(--space-6)', alignItems: 'start' }}>
            <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <SectionTitle title={isRu ? 'Выручка по месяцам' : 'Oylar bo‘yicha tushum'} hint={
                  trend.length > 1
                    ? isRu ? 'В UZS по курсу каждого документа. Наведите на столбец, чтобы увидеть сумму.' : 'Har bir hujjat kursi bo‘yicha UZS da. Summani ko‘rish uchun ustun ustiga olib boring.'
                    : isRu ? 'В UZS по курсу каждого документа' : 'Har bir hujjat kursi bo‘yicha UZS da'
                } />
              {trend.length === 0 ? (
                <EmptyState compact icon={BarChart3} title={isRu ? `Продаж нет — ${rangeName}` : `Sotuvlar yo‘q — ${rangeName}`} description={isRu ? 'Выберите более длинный период или проведите продажу.' : 'Uzunroq davrni tanlang yoki sotuvni tasdiqlang.'} />
              ) : trend.length === 1 ? (
                <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 'var(--space-4)' }}>
                  {[
                    [isRu ? 'Выручка' : 'Tushum', trend[0].revenue],
                    [isRu ? 'Себестоимость' : 'Tannarx', trend[0].cogs],
                    [isRu ? 'Прибыль' : 'Foyda', trend[0].profit],
                  ].map(([label, v]) => (
                    <div key={String(label)}>
                      <dt style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{label} · {periodLabel(trend[0].period, locale)}</dt>
                      <dd style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-semibold)' }} className="tabular-nums">{formatCurrency(Number(v), locale, trend[0].currency)}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <TrendChart trend={trend} locale={locale} />
              )}
            </Card>

            <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <SectionTitle title={isRu ? 'По категориям' : 'Kategoriyalar bo‘yicha'} hint={isRu ? 'Доля выручки, в UZS' : 'Tushumdagi ulush, UZS da'} />
              {categories.length === 0 ? (
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{isRu ? 'Нет продаж за период.' : 'Davr uchun sotuvlar yo‘q.'}</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {categories.map((cat) => (
                    <li key={cat.categoryId} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
                        <span style={{ fontWeight: 'var(--font-medium)', minWidth: 0, overflowWrap: 'anywhere' }}>{cat.categoryName[locale] || cat.categoryName.ru || cat.categoryName.uz}</span>
                        <span className="tabular-nums" style={{ whiteSpace: 'nowrap' }}>
                          <strong>{cat.percentage}%</strong> <span style={{ color: 'var(--color-text-secondary)' }}>{formatCurrency(cat.revenue, locale, cat.currency)}</span>
                        </span>
                      </div>
                      <div aria-hidden style={{ width: '100%', height: 6, backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                        <div style={{ width: `${cat.percentage}%`, height: '100%', backgroundColor: 'var(--color-primary-600)', borderRadius: 'var(--radius-full)' }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'var(--ux-split-2-1)', gap: 'var(--space-6)', alignItems: 'start' }}>
            <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <SectionTitle title={isRu ? 'Самые продаваемые товары' : 'Eng ko‘p sotilgan tovarlar'} hint={isRu ? 'Топ-10 по выручке за период' : 'Davr uchun tushum bo‘yicha top-10'} />
              {topProducts.length === 0 ? (
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{isRu ? 'Нет продаж за период.' : 'Davr uchun sotuvlar yo‘q.'}</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="app-table-stack" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}>
                        <th scope="col" style={th}>{isRu ? 'Товар' : 'Tovar'}</th>
                        <th scope="col" style={th}>{isRu ? 'Артикул' : 'Artikul'}</th>
                        <th scope="col" style={{ ...th, textAlign: 'right' }}>{isRu ? 'Продано' : 'Sotildi'}</th>
                        <th scope="col" style={{ ...th, textAlign: 'right' }}>{isRu ? 'Выручка' : 'Tushum'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topProducts.map((p, idx) => (
                        <tr key={p.productId} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                          <td data-primary style={{ padding: '8px 12px', fontWeight: 'var(--font-medium)' }}>
                            <span style={{ color: 'var(--color-text-secondary)', marginRight: 6 }} className="tabular-nums">{idx + 1}.</span>
                            {p.productName[locale] || p.productName.ru || p.productName.uz}
                          </td>
                          <td data-label={isRu ? 'Артикул' : 'Artikul'} style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{p.sku || '—'}</td>
                          <td data-label={isRu ? 'Продано' : 'Sotildi'} style={{ padding: '8px 12px', textAlign: 'right', whiteSpace: 'nowrap' }} className="tabular-nums">{p.totalQuantity} {unitLabel(p.unitOfMeasure, locale)}</td>
                          <td data-label={isRu ? 'Выручка' : 'Tushum'} style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'var(--font-semibold)', whiteSpace: 'nowrap' }} className="tabular-nums">{formatCurrency(p.totalRevenue, locale, p.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
              <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <SectionTitle title={isRu ? 'Основные клиенты' : 'Asosiy mijozlar'} hint={isRu ? 'Больше всего купили за период' : 'Davr ichida eng ko‘p xarid qilganlar'} />
                {topClients.length === 0 ? (
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{isRu ? 'Нет продаж за период.' : 'Davr uchun sotuvlar yo‘q.'}</p>
                ) : (
                  <ol style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    {topClients.map((client, idx) => (
                      <li key={client.counterpartyId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)', backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 'var(--font-medium)', overflowWrap: 'anywhere' }}>{idx + 1}. {client.name}</div>
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                            {isRu ? `Продаж: ${client.invoiceCount}` : `Sotuvlar: ${client.invoiceCount}`}
                            {client.inn ? ` · ${isRu ? 'ИНН' : 'STIR'} ${client.inn}` : ''}
                          </div>
                        </div>
                        <div style={{ fontWeight: 'var(--font-semibold)', whiteSpace: 'nowrap' }} className="tabular-nums">{formatCurrency(client.totalSpent, locale, client.currency)}</div>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>

              <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <SectionTitle title={isRu ? 'Финансовые показатели' : 'Moliyaviy ko‘rsatkichlar'} hint={isRu ? 'На сегодня, не зависят от периода' : 'Bugungi holat, davrga bog‘liq emas'} />
                <dl style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {[
                    {
                      label: isRu ? 'Чистый оборотный капитал' : 'Sof aylanma mablag‘',
                      hint: isRu ? 'Деньги, товар и долги клиентов минус наши долги' : 'Pul, tovar va mijozlar qarzi minus bizning qarzlar',
                      value: ratios && ratios.workingCapital !== null ? formatCurrency(ratios.workingCapital, locale, ratios.currency) : notComputable,
                    },
                    {
                      label: isRu ? 'Оборачиваемость запасов' : 'Tovar aylanish davri',
                      hint: isRu ? 'За сколько дней продаётся текущий остаток' : 'Hozirgi qoldiq necha kunda sotiladi',
                      value: ratios && ratios.inventoryTurnoverDays !== null ? `${ratios.inventoryTurnoverDays} ${isRu ? 'дн.' : 'kun'}` : notComputable,
                    },
                    {
                      label: isRu ? 'Срок оплаты клиентами' : 'Mijozlar to‘lash muddati',
                      hint: isRu ? 'Через сколько дней в среднем платят клиенты' : 'Mijozlar o‘rtacha necha kunda to‘laydi',
                      value: ratios && ratios.arCollectionDays !== null ? `${ratios.arCollectionDays} ${isRu ? 'дн.' : 'kun'}` : notComputable,
                    },
                  ].map((r) => (
                    <div key={r.label} style={{ padding: 'var(--space-2) var(--space-3)', backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                      <dt style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }} title={r.hint}>{r.label}</dt>
                      <dd style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)' }} className="tabular-nums">{r.value}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
