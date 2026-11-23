'use client';

import { useState } from 'react';
import { useApiQuery, useInvalidateApi } from '@/lib/query/useApiQuery';
import { LoadError } from '@/components/ui/LoadError';
import { useLocale, useTranslations } from 'next-intl';
import { FilterBar, useFilterState, type FilterDef } from '@/components/ui/filters';
import { StatCard, StatCardGrid } from '@/components/ui/stats/StatCard';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatDate, errorMessage } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { toast } from '@/context/ToastContext';
import {
  Building2,
  Plus,
  LogIn,
  Edit2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
} from 'lucide-react';
import { CreatedTenantSummary, GlobalMetrics, TenantCompanySummary } from '@shared/types';
import type { AuthResponse } from '@shared/types';

type MrrState =
  | { kind: 'rows'; rows: Array<{ currency: string; amount: number }> }
  | { kind: 'empty' }
  | { kind: 'missing-currency' };

/**
 * MRR rows as the API sent them. A row without a currency (or an old
 * response without rows) is an error, never shown as USD or UZS (ADR 0022);
 * currencies are listed apart, never summed (ADR 0023).
 */
function readMrr(metrics: GlobalMetrics): MrrState {
  const rows: unknown = (metrics as { mrrByCurrency?: unknown }).mrrByCurrency;
  if (!Array.isArray(rows)) return { kind: 'missing-currency' };
  if (rows.length === 0) return { kind: 'empty' };
  const valid = rows.every(
    (row) =>
      typeof row?.currency === 'string' &&
      row.currency.trim() !== '' &&
      typeof row.amount === 'number' &&
      Number.isFinite(row.amount),
  );
  return valid ? { kind: 'rows', rows } : { kind: 'missing-currency' };
}

function MrrValue({ metrics, locale }: { metrics: GlobalMetrics | null; locale: 'uz' | 'ru' }) {
  const isRu = locale === 'ru';
  if (!metrics) return <>—</>;
  const state = readMrr(metrics);
  if (state.kind === 'missing-currency') {
    return (
      <span role="alert" style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', color: 'var(--color-error-700)' }}>
        {isRu ? 'Валюта не указана — сумму показать нельзя' : "Valyuta ko'rsatilmagan — summani ko'rsatib bo'lmaydi"}
      </span>
    );
  }
  if (state.kind === 'empty') {
    return (
      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)' }}>
        {isRu ? 'Нет активных подписок' : "Faol obuna yo'q"}
      </span>
    );
  }
  return (
    <>
      {state.rows.map((row) => (
        <div key={row.currency}>{formatCurrency(row.amount, locale, row.currency)}</div>
      ))}
    </>
  );
}

const FILTER_DEFAULTS = { status: '', plan: '' };

export default function SuperAdminTenantsPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token, startImpersonation } = useAuth();

  const invalidateApi = useInvalidateApi();
  const metrics = useApiQuery<GlobalMetrics>('/super-admin/metrics', { scope: 'platform' }).data ?? null;
  const tenantsQuery = useApiQuery<TenantCompanySummary[]>('/super-admin/tenants', { scope: 'platform' });
  const tenants = tenantsQuery.data ?? [];
  // A tenant change moves the metrics too (active/trial counts, MRR).
  const refreshPlatform = () => {
    void invalidateApi('/super-admin/tenants');
    void invalidateApi('/super-admin/metrics');
  };

  // Search & Filter
  // Filters live in the URL and are remembered per user; the list is filtered here.
  const lf = useFilterState('admin.tenants', FILTER_DEFAULTS);
  const searchQuery = lf.search.trim();
  const statusFilter = lf.values.status || 'ALL';
  const planFilter = lf.values.plan || 'ALL';

  // Create Tenant Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [companyNameUz, setCompanyNameUz] = useState('');
  const [companyNameRu, setCompanyNameRu] = useState('');
  const [companySlug, setCompanySlug] = useState('');
  const [companyPlan, setCompanyPlan] = useState<'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE'>('PROFESSIONAL');
  const [adminFirstName, setAdminFirstName] = useState('');
  const [adminLastName, setAdminLastName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  // Empty means "generate one": the server returns it once and we show it once.
  const [adminPassword, setAdminPassword] = useState('');
  const [createdCredentials, setCreatedCredentials] = useState<{
    email: string;
    password: string;
  } | null>(null);

  // Edit Tenant Modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<TenantCompanySummary | null>(null);
  const [editStatus, setEditStatus] = useState<'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'BLOCKED'>('ACTIVE');
  const [editPlan, setEditPlan] = useState<'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE'>('PROFESSIONAL');
  const [editLoading, setEditLoading] = useState(false);

  // Impersonation loading state
  const [impersonateLoadingId, setImpersonateLoadingId] = useState<string | null>(null);


  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setCreateLoading(true);
    try {
      const created = await apiFetch<CreatedTenantSummary>('/super-admin/tenants', {
        token,
        locale,
        method: 'POST',
        body: JSON.stringify({
          name: { uz: companyNameUz, ru: companyNameRu || companyNameUz },
          slug: companySlug.trim().toLowerCase(),
          plan: companyPlan,
          adminFirstName,
          adminLastName,
          adminEmail: adminEmail.trim().toLowerCase(),
          ...(adminPassword ? { adminPassword } : {}),
        }),
      });
      if (created.generatedAdminPassword) {
        setCreatedCredentials({
          email: adminEmail.trim().toLowerCase(),
          password: created.generatedAdminPassword,
        });
      }

      toast.success(
        isRu ? 'Предприятие успешно создано' : 'Yangi korxona muvaffaqiyatli yaratildi',
      );
      setCreateModalOpen(false);
      resetCreateForm();
      refreshPlatform();
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Ошибка при создании' : 'Xatolik yuz berdi'));
    } finally {
      setCreateLoading(false);
    }
  };

  const resetCreateForm = () => {
    setCompanyNameUz('');
    setCompanyNameRu('');
    setCompanySlug('');
    setCompanyPlan('PROFESSIONAL');
    setAdminFirstName('');
    setAdminLastName('');
    setAdminEmail('');
    setAdminPassword('');
  };

  const handleOpenEditModal = (t: TenantCompanySummary) => {
    setSelectedTenant(t);
    setEditStatus(t.status);
    setEditPlan(t.plan);
    setEditModalOpen(true);
  };

  const handleUpdateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedTenant) return;
    setEditLoading(true);
    try {
      await apiFetch(`/super-admin/tenants/${selectedTenant.id}`, {
        token,
        locale,
        method: 'PUT',
        body: JSON.stringify({
          status: editStatus,
          plan: editPlan,
        }),
      });

      toast.success(
        isRu ? 'Данные предприятия обновлены' : 'Korxona maʼlumotlari yangilandi',
      );
      setEditModalOpen(false);
      refreshPlatform();
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Ошибка сохранения' : 'Xatolik yuz berdi'));
    } finally {
      setEditLoading(false);
    }
  };

  const handleImpersonate = async (t: TenantCompanySummary) => {
    if (!token) return;
    setImpersonateLoadingId(t.id);
    try {
      const res = await apiFetch<AuthResponse>(`/super-admin/impersonate/${t.id}`, {
        token,
        locale,
        method: 'POST',
      });

      toast.success(
        isRu
          ? `Вход в кабинет «${typeof t.name === 'string' ? t.name : t.name[locale] || t.name.uz}»`
          : `«${typeof t.name === 'string' ? t.name : t.name[locale] || t.name.uz}» kabinetiga kirilmoqda...`,
      );

      startImpersonation(res);
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Ошибка входа в кабинет' : 'Kabinetga kirishda xatolik yuz berdi'));
    } finally {
      setImpersonateLoadingId(null);
    }
  };

  const ta = useTranslations('rd.admin');
  const countBy = (st: string) => tenants.filter((t) => t.status === st).length;
  // Trials that end within a week (or already ended) need a call or a plan.
  const [weekAhead] = useState(() => Date.now() + 7 * 86400000);
  const trialEnding = tenants.filter((t) => t.status === 'TRIAL' && t.trialEndsAt && new Date(t.trialEndsAt).getTime() <= weekAhead);

  // Filtered tenants
  const filteredTenants = tenants.filter((t) => {
    const nameStr =
      typeof t.name === 'string'
        ? t.name
        : `${t.name?.uz || ''} ${t.name?.ru || ''}`;
    const matchesSearch =
      nameStr.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.slug.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
    const matchesPlan = planFilter === 'ALL' || t.plan === planFilter;

    return matchesSearch && matchesStatus && matchesPlan;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <Badge variant="success">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <CheckCircle2 size={12} /> {isRu ? 'Активен' : 'Faol'}
            </span>
          </Badge>
        );
      case 'TRIAL':
        return (
          <Badge variant="info">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={12} /> {isRu ? 'Пробный (Trial)' : 'Sinov (Trial)'}
            </span>
          </Badge>
        );
      case 'SUSPENDED':
        return (
          <Badge variant="warning">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <AlertTriangle size={12} /> {isRu ? 'Приостановлен' : 'To‘xtatilgan'}
            </span>
          </Badge>
        );
      case 'BLOCKED':
        return (
          <Badge variant="error">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <XCircle size={12} /> {isRu ? 'Заблокирован' : 'Bloklangan'}
            </span>
          </Badge>
        );
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const PLAN_NAMES: Record<string, { uz: string; ru: string; price: string; variant: 'neutral' | 'info' | 'success' }> = {
    STARTER: { uz: 'Boshlang‘ich', ru: 'Стартовый', price: '490 000', variant: 'neutral' },
    PROFESSIONAL: { uz: 'Professional', ru: 'Профессиональный', price: '990 000', variant: 'info' },
    ENTERPRISE: { uz: 'Korporativ', ru: 'Корпоративный', price: '1 990 000', variant: 'success' },
  };
  const planName = (plan: string) => (PLAN_NAMES[plan] ? (isRu ? PLAN_NAMES[plan].ru : PLAN_NAMES[plan].uz) : plan);
  const getPlanBadge = (plan: string) => <Badge variant={PLAN_NAMES[plan]?.variant ?? 'neutral'}>{planName(plan)}</Badge>;
  const planOptions = Object.keys(PLAN_NAMES).map((p) => ({ value: p, label: planName(p) }));
  const STATUS_NAMES: Record<string, { uz: string; ru: string }> = {
    ACTIVE: { uz: 'Faol', ru: 'Активна' },
    TRIAL: { uz: 'Sinov davri', ru: 'Пробный период' },
    SUSPENDED: { uz: 'To‘xtatilgan', ru: 'Приостановлена' },
    BLOCKED: { uz: 'Bloklangan', ru: 'Заблокирована' },
  };
  const statusOptions = Object.keys(STATUS_NAMES).map((s) => ({ value: s, label: isRu ? STATUS_NAMES[s].ru : STATUS_NAMES[s].uz }));
  const filtered = Boolean(searchQuery || lf.activeCount > 0);
  const filterDefs: FilterDef[] = [
    { key: 'status', kind: 'segmented', label: isRu ? 'Статус' : 'Holat', options: statusOptions.map((o) => ({ ...o, count: countBy(o.value) })) },
    { key: 'plan', kind: 'select', label: isRu ? 'Тариф' : 'Tarif', options: planOptions },
  ];
  const formGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 'var(--space-3)' };
  const th: React.CSSProperties = { padding: '12px 16px', fontWeight: 'var(--font-medium)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ marginBottom: 'calc(-1 * var(--space-5))' }}>
        <PageHeader
          showBreadcrumbs={false}
          title={isRu ? 'Компании' : 'Korxonalar'}
          subtitle={isRu ? 'Все компании платформы: статус, тариф, сотрудники. «Войти» открывает кабинет компании от имени администратора.' : 'Platformadagi barcha korxonalar: holat, tarif, xodimlar. «Kirish» korxona kabinetini administrator nomidan ochadi.'}
          actions={
            <Button onClick={() => setCreateModalOpen(true)} variant="primary">
              <Plus size={16} aria-hidden /> {isRu ? 'Новая компания' : 'Yangi korxona'}
            </Button>
          }
        />
      </div>

      {/* What needs the owner's attention, then the money in one line */}
      <StatCardGrid label={ta('attention')} count={4}>
        <StatCard label={ta('trialEnding')} loading={tenantsQuery.isPending} value={trialEnding.length} secondary={ta('trialEndingHint')} />
        <StatCard label={isRu ? 'Приостановлена' : 'To‘xtatilgan'} loading={tenantsQuery.isPending} value={countBy('SUSPENDED')} />
        <StatCard label={isRu ? 'Заблокирована' : 'Bloklangan'} loading={tenantsQuery.isPending} value={countBy('BLOCKED')} />
        <StatCard label={isRu ? 'Активные компании' : 'Faol korxonalar'} loading={tenantsQuery.isPending} value={metrics?.activeTenantsCount ?? countBy('ACTIVE')} secondary={ta('users', { count: metrics?.totalUsersCount ?? 0 })} />
      </StatCardGrid>
      <p data-mrr-card style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
        <span>{isRu ? 'Доход в месяц (MRR)' : 'Oylik daromad (MRR)'}</span>
        <strong style={{ color: 'var(--color-text-primary)' }}><MrrValue metrics={metrics} locale={locale} /></strong>
      </p>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border-light)' }}>
          <FilterBar state={lf} defs={filterDefs} searchPlaceholder={isRu ? 'Название или slug компании' : 'Korxona nomi yoki slug'} resultCount={tenantsQuery.isPending ? null : filteredTenants.length} />
        </div>

        {tenantsQuery.isError ? (
          <LoadError error={tenantsQuery.error} onRetry={() => void tenantsQuery.refetch()} retrying={tenantsQuery.isFetching} />
        ) : tenantsQuery.isPending ? (
          <SkeletonRows rows={5} columns={6} />
        ) : filteredTenants.length === 0 ? (
          filtered ? (
            <EmptyState compact title={isRu ? 'Ничего не найдено' : 'Hech narsa topilmadi'} description={isRu ? 'Измените поиск или фильтры.' : 'Qidiruv yoki filtrlarni o‘zgartiring.'} />
          ) : (
            <EmptyState
              icon={Building2}
              title={isRu ? 'Компаний пока нет' : 'Hozircha korxonalar yo‘q'}
              description={isRu ? 'Добавьте первую компанию — для неё сразу создаётся администратор.' : 'Birinchi korxonani qo‘shing — unga darhol administrator yaratiladi.'}
              action={<Button onClick={() => setCreateModalOpen(true)}><Plus size={16} aria-hidden /> {isRu ? 'Новая компания' : 'Yangi korxona'}</Button>}
            />
          )
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="app-table-stack" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}>
                  <th scope="col" style={th}>{isRu ? 'Компания' : 'Korxona'}</th>
                  <th scope="col" style={th}>Slug</th>
                  <th scope="col" style={th}>{isRu ? 'Статус' : 'Holat'}</th>
                  <th scope="col" style={th}>{isRu ? 'Тариф' : 'Tarif'}</th>
                  <th scope="col" style={{ ...th, textAlign: 'right' }}>{isRu ? 'Сотрудники' : 'Xodimlar'}</th>
                  <th scope="col" style={th}>{isRu ? 'Создана' : 'Yaratilgan'}</th>
                  <th scope="col" style={th}><span className="sr-only">{isRu ? 'Действия' : 'Amallar'}</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredTenants.map((t) => {
                  const companyName = typeof t.name === 'string' ? t.name : t.name?.[locale] || t.name?.uz || t.slug;
                  return (
                    <tr key={t.id} className="ux-row-hover" style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                      <td data-primary style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 'var(--font-semibold)' }}>{companyName}</div>
                        {t.trialEndsAt && t.status === 'TRIAL' && (
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 2, fontWeight: 'var(--font-normal)' }}>
                            {isRu ? 'Пробный до ' : 'Sinov muddati: '}{formatDate(t.trialEndsAt, locale)}
                          </div>
                        )}
                      </td>
                      <td data-label="Slug" style={{ padding: '12px 16px', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{t.slug}</td>
                      <td data-label={isRu ? 'Статус' : 'Holat'} style={{ padding: '12px 16px' }}>{getStatusBadge(t.status)}</td>
                      <td data-label={isRu ? 'Тариф' : 'Tarif'} style={{ padding: '12px 16px' }}>{getPlanBadge(t.plan)}</td>
                      <td data-label={isRu ? 'Сотрудники' : 'Xodimlar'} style={{ padding: '12px 16px', textAlign: 'right' }} className="tabular-nums">{t.userCount}</td>
                      <td data-label={isRu ? 'Создана' : 'Yaratilgan'} style={{ padding: '12px 16px', color: 'var(--color-text-secondary)' }}>{formatDate(t.createdAt, locale)}</td>
                      <td style={{ padding: '8px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleImpersonate(t)}
                            loading={impersonateLoadingId === t.id}
                            loadingText={isRu ? 'Вход…' : 'Kirilmoqda…'}
                            aria-label={isRu ? `Войти в кабинет «${companyName}»` : `«${companyName}» kabinetiga kirish`}
                          >
                            <LogIn size={14} aria-hidden /> {isRu ? 'Войти' : 'Kirish'}
                          </Button>
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(t)}
                            aria-label={isRu ? `Статус и тариф: ${companyName}` : `Holat va tarif: ${companyName}`}
                            title={isRu ? 'Статус и тариф' : 'Holat va tarif'}
                            style={{ width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
                          >
                            <Edit2 size={14} aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title={isRu ? 'Новая компания' : 'Yangi korxona'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateModalOpen(false)}>{isRu ? 'Отмена' : 'Bekor qilish'}</Button>
            <Button variant="primary" type="submit" form="sa-create-tenant" loading={createLoading} loadingText={isRu ? 'Создание…' : 'Yaratilmoqda…'}>
              {isRu ? 'Создать компанию' : 'Korxonani yaratish'}
            </Button>
          </>
        }
      >
        <form id="sa-create-tenant" onSubmit={handleCreateTenant} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div style={formGrid}>
            <Input autoFocus required label={isRu ? 'Название (по-узбекски) *' : 'Nomi (o‘zbekcha) *'} value={companyNameUz} onChange={(e) => setCompanyNameUz(e.target.value)} placeholder="Orient Trading MCHJ" />
            <Input label={isRu ? 'Название (по-русски)' : 'Nomi (ruscha)'} value={companyNameRu} onChange={(e) => setCompanyNameRu(e.target.value)} placeholder="ООО Orient Trading" />
          </div>
          <div style={formGrid}>
            <Input required label={isRu ? 'Slug (адрес компании) *' : 'Slug (korxona manzili) *'} value={companySlug} onChange={(e) => setCompanySlug(e.target.value)} placeholder="orient-trading" />
            <Select
              label={isRu ? 'Тариф' : 'Tarif'}
              value={companyPlan}
              onChange={(value) => setCompanyPlan(value as typeof companyPlan)}
              style={{ width: '100%' }}
              options={Object.keys(PLAN_NAMES).map((p) => ({ value: p, label: `${planName(p)} — ${PLAN_NAMES[p].price} UZS / ${isRu ? 'мес.' : 'oy'}` }))}
            />
          </div>
          <fieldset style={{ border: 'none', borderTop: '1px solid var(--color-border-light)', margin: 0, padding: 'var(--space-4) 0 0' }}>
            <legend style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', padding: 0, marginBottom: 'var(--space-3)' }}>
              {isRu ? 'Главный администратор компании' : 'Korxonaning bosh administratori'}
            </legend>
            <div style={{ ...formGrid, marginBottom: 'var(--space-3)' }}>
              <Input required autoComplete="off" label={isRu ? 'Имя *' : 'Ism *'} value={adminFirstName} onChange={(e) => setAdminFirstName(e.target.value)} placeholder="Jasur" />
              <Input required autoComplete="off" label={isRu ? 'Фамилия *' : 'Familiya *'} value={adminLastName} onChange={(e) => setAdminLastName(e.target.value)} placeholder="Alimov" />
            </div>
            <div style={formGrid}>
              <Input required type="email" autoComplete="off" label="Email *" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@orient.uz" />
              <Input
                type="text"
                minLength={8}
                autoComplete="new-password"
                label={isRu ? 'Начальный пароль' : 'Dastlabki parol'}
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder={isRu ? 'Пусто — сгенерировать' : 'Bo‘sh — avtomatik yaratiladi'}
              />
            </div>
          </fieldset>
        </form>
      </Modal>

      <Modal
        isOpen={!!createdCredentials}
        onClose={() => setCreatedCredentials(null)}
        title={isRu ? 'Пароль администратора' : 'Administrator paroli'}
        size="md"
        footer={
          createdCredentials ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard
                    .writeText(createdCredentials.password)
                    .then(() => toast.success(isRu ? 'Пароль скопирован' : 'Parol nusxalandi'))
                    .catch(() => toast.error(isRu ? 'Не удалось скопировать' : 'Nusxa olib bo‘lmadi'));
                }}
              >
                {isRu ? 'Копировать пароль' : 'Parolni nusxalash'}
              </Button>
              <Button variant="primary" onClick={() => setCreatedCredentials(null)}>{isRu ? 'Я сохранил пароль' : 'Parolni saqladim'}</Button>
            </>
          ) : undefined
        }
      >
        {createdCredentials && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <p role="note" className="doc-banner is-warning" style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start' }}>
              <AlertTriangle size={18} aria-hidden style={{ flexShrink: 0 }} />
              <span>
                {isRu
                  ? 'Пароль показывается только один раз. Сохраните его и передайте администратору — после закрытия окна его нельзя будет посмотреть.'
                  : 'Parol faqat bir marta ko‘rsatiladi. Uni saqlab, administratorga yetkazing — oyna yopilgandan keyin uni qayta ko‘rib bo‘lmaydi.'}
              </span>
            </p>
            <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px', fontSize: 'var(--text-sm)' }}>
              <dt style={{ color: 'var(--color-text-secondary)' }}>Email</dt>
              <dd style={{ fontWeight: 'var(--font-semibold)' }}>{createdCredentials.email}</dd>
              <dt style={{ color: 'var(--color-text-secondary)' }}>{isRu ? 'Пароль' : 'Parol'}</dt>
              <dd><code style={{ fontSize: 'var(--text-base)', userSelect: 'all' }}>{createdCredentials.password}</code></dd>
            </dl>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={editModalOpen && !!selectedTenant}
        onClose={() => setEditModalOpen(false)}
        title={selectedTenant ? (typeof selectedTenant.name === 'string' ? selectedTenant.name : selectedTenant.name?.[locale] || selectedTenant.name?.uz || selectedTenant.slug) : isRu ? 'Компания' : 'Korxona'}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditModalOpen(false)}>{isRu ? 'Отмена' : 'Bekor qilish'}</Button>
            <Button variant="primary" type="submit" form="sa-edit-tenant" loading={editLoading} loadingText={isRu ? 'Сохранение…' : 'Saqlanmoqda…'}>
              {isRu ? 'Сохранить' : 'Saqlash'}
            </Button>
          </>
        }
      >
        <form id="sa-edit-tenant" onSubmit={handleUpdateTenant} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Select label={isRu ? 'Статус' : 'Holat'} value={editStatus} onChange={(value) => setEditStatus(value as typeof editStatus)} style={{ width: '100%' }} options={statusOptions} />
          {(editStatus === 'SUSPENDED' || editStatus === 'BLOCKED') && (
            <p role="note" className="doc-banner is-warning">
              {isRu ? 'Сотрудники компании не смогут работать в системе, пока статус не изменят.' : 'Holat o‘zgartirilmaguncha korxona xodimlari tizimda ishlay olmaydi.'}
            </p>
          )}
          <Select label={isRu ? 'Тариф' : 'Tarif'} value={editPlan} onChange={(value) => setEditPlan(value as typeof editPlan)} style={{ width: '100%' }} options={planOptions} />
        </form>
      </Modal>
    </div>
  );
}
