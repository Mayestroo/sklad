'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { LoadError } from '@/components/ui/LoadError';
import { formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { FilterBar, useFilterState } from '@/components/ui/filters';
import { StatCard, StatCardGrid } from '@/components/ui/stats/StatCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { COMPANY_STATUS_LABELS, PLAN_LABELS, labelOf, variantOf } from '@/lib/platform-labels';
import { TenantCompanySummary } from '@shared/types';

const PLANS: Array<{ id: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE'; price: string; features: { uz: string; ru: string } }> = [
  { id: 'STARTER', price: '490 000', features: { uz: '5 tagacha xodim, 1 ta ombor, asosiy hisobotlar', ru: 'До 5 сотрудников, 1 склад, базовая аналитика' } },
  { id: 'PROFESSIONAL', price: '990 000', features: { uz: '20 tagacha xodim, 5 ta ombor, to‘liq BHMS buxgalteriya', ru: 'До 20 сотрудников, 5 складов, полная бухгалтерия НСБУ' } },
  { id: 'ENTERPRISE', price: '1 990 000', features: { uz: 'Cheksiz ombor va xodimlar, shaxsiy menejer', ru: 'Без ограничений по складам и сотрудникам, персональный менеджер' } },
];

const FILTER_DEFAULTS = { plan: '' };

export default function SuperAdminBillingPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const tenantsQuery = useApiQuery<TenantCompanySummary[]>('/super-admin/tenants', { scope: 'platform' });
  const tenants = tenantsQuery.data ?? [];
  const count = (plan: string) => tenants.filter((t) => t.plan === plan).length;
  const th: React.CSSProperties = { padding: '12px 16px', fontWeight: 'var(--font-medium)' };
  const tb = useTranslations('rd.adminBilling');
  // A plan card filters the table to the companies on that plan.
  // The plan filter lives in the URL and is remembered per user.
  const lf = useFilterState('admin.billing', FILTER_DEFAULTS);
  const planFilter = lf.values.plan;
  const [now] = useState(() => Date.now());
  const shown = planFilter ? tenants.filter((t) => t.plan === planFilter) : tenants;
  const trialLeft = (t: TenantCompanySummary) => (t.status === 'TRIAL' && t.trialEndsAt ? Math.ceil((new Date(t.trialEndsAt).getTime() - now) / 86400000) : null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ marginBottom: 'calc(-1 * var(--space-5))' }}>
        <PageHeader
          showBreadcrumbs={false}
          title={isRu ? 'Тарифы и подписки' : 'Tariflar va obunalar'}
          subtitle={isRu ? 'Сколько компаний на каждом тарифе и состояние их подписок.' : 'Har bir tarifda nechta korxona bor va obunalari holati.'}
        />
      </div>

      <StatCardGrid label={isRu ? 'Тарифы' : 'Tariflar'} count={3}>
        {PLANS.map((plan) => (
          <StatCard
            key={plan.id}
            label={plan.id === 'PROFESSIONAL' ? `${labelOf(PLAN_LABELS, plan.id, locale)} · ${isRu ? 'Чаще выбирают' : 'Ko‘p tanlanadi'}` : labelOf(PLAN_LABELS, plan.id, locale)}
            value={`${plan.price} UZS / ${isRu ? 'мес.' : 'oy'}`}
            secondary={
              <>
                <span className="tabular-nums" style={{ display: 'block', fontWeight: 'var(--font-medium)' }}>{isRu ? `Компаний: ${count(plan.id)}` : `Korxonalar: ${count(plan.id)}`}</span>
                {plan.features[locale]}
              </>
            }
          />
        ))}
      </StatCardGrid>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <h2 style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border-light)', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)' }}>
          {isRu ? 'Подписки компаний' : 'Korxonalar obunalari'}
        </h2>
        <div style={{ padding: 'var(--space-3) var(--space-5)', borderBottom: '1px solid var(--color-border-light)' }}>
          <FilterBar state={lf} defs={[{ key: 'plan', kind: 'segmented', label: isRu ? 'Тариф' : 'Tarif', options: PLANS.map((p) => ({ value: p.id, label: labelOf(PLAN_LABELS, p.id, locale), count: count(p.id) })) }]} resultCount={tenantsQuery.isPending ? null : shown.length} />
        </div>
        {tenantsQuery.isError ? (
          <LoadError error={tenantsQuery.error} onRetry={() => void tenantsQuery.refetch()} retrying={tenantsQuery.isFetching} />
        ) : tenantsQuery.isPending ? (
          <SkeletonRows rows={4} columns={5} />
        ) : tenants.length === 0 ? (
          <EmptyState compact title={isRu ? 'Компаний пока нет' : 'Hozircha korxonalar yo‘q'} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="app-table-stack" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}>
                  <th scope="col" style={th}>{isRu ? 'Компания' : 'Korxona'}</th>
                  <th scope="col" style={th}>{isRu ? 'Тариф' : 'Tarif'}</th>
                  <th scope="col" style={th}>{isRu ? 'Статус' : 'Holat'}</th>
                  <th scope="col" style={th}>{tb('trialCol')}</th>
                  <th scope="col" style={{ ...th, textAlign: 'right' }}>{isRu ? 'Сотрудники' : 'Xodimlar'}</th>
                  <th scope="col" style={th}>{isRu ? 'Создана' : 'Yaratilgan'}</th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>{tb('noneOnPlan')}</td>
                  </tr>
                )}
                {shown.map((t) => {
                  const left = trialLeft(t);
                  const name = typeof t.name === 'string' ? t.name : t.name?.[locale] || t.name?.uz || t.slug;
                  return (
                    <tr key={t.id} className="ux-row-hover" style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                      <td data-primary style={{ padding: '12px 16px', fontWeight: 'var(--font-semibold)' }}>{name}</td>
                      <td data-label={isRu ? 'Тариф' : 'Tarif'} style={{ padding: '12px 16px' }}>
                        <Badge variant={variantOf(PLAN_LABELS, t.plan)}>{labelOf(PLAN_LABELS, t.plan, locale)}</Badge>
                      </td>
                      <td data-label={isRu ? 'Статус' : 'Holat'} style={{ padding: '12px 16px' }}>
                        <Badge variant={variantOf(COMPANY_STATUS_LABELS, t.status)}>{labelOf(COMPANY_STATUS_LABELS, t.status, locale)}</Badge>
                      </td>
                      <td data-label={tb('trialCol')} style={{ padding: '12px 16px', color: left != null && left <= 3 ? 'var(--color-error-700)' : 'var(--color-text-secondary)', fontWeight: left != null && left <= 3 ? 'var(--font-semibold)' : undefined }}>
                        {left == null ? '—' : left <= 0 ? tb('trialEnded') : tb('trialLeft', { count: left, date: formatDate(t.trialEndsAt as string, locale) })}
                      </td>
                      <td data-label={isRu ? 'Сотрудники' : 'Xodimlar'} style={{ padding: '12px 16px', textAlign: 'right' }} className="tabular-nums">{t.userCount}</td>
                      <td data-label={isRu ? 'Создана' : 'Yaratilgan'} style={{ padding: '12px 16px', color: 'var(--color-text-secondary)' }}>{formatDate(t.createdAt, locale)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
