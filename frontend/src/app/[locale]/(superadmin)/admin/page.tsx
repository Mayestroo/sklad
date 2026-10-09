'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { toast } from '@/context/ToastContext';
import {
  Building2,
  Users,
  DollarSign,
  TrendingUp,
  Plus,
  Search,
  LogIn,
  Edit2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
} from 'lucide-react';
import { GlobalMetrics, TenantCompanySummary } from '@shared/types';

export default function SuperAdminTenantsPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token, startImpersonation } = useAuth();

  const [metrics, setMetrics] = useState<GlobalMetrics | null>(null);
  const [tenants, setTenants] = useState<TenantCompanySummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [planFilter, setPlanFilter] = useState('ALL');

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
  const [adminPassword, setAdminPassword] = useState('Admin123!');

  // Edit Tenant Modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<TenantCompanySummary | null>(null);
  const [editStatus, setEditStatus] = useState<'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'BLOCKED'>('ACTIVE');
  const [editPlan, setEditPlan] = useState<'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE'>('PROFESSIONAL');
  const [editLoading, setEditLoading] = useState(false);

  // Impersonation loading state
  const [impersonateLoadingId, setImpersonateLoadingId] = useState<string | null>(null);

  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [m, t] = await Promise.all([
        apiFetch<GlobalMetrics>('/super-admin/metrics', { token, locale }),
        apiFetch<TenantCompanySummary[]>('/super-admin/tenants', { token, locale }),
      ]);
      setMetrics(m);
      setTenants(t);
    } catch (err: any) {
      toast.error(err.message || (isRu ? 'Ошибка загрузки данных' : 'Maʼlumotlarni yuklashda xatolik yuz berdi'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setCreateLoading(true);
    try {
      await apiFetch('/super-admin/tenants', {
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
          adminPassword,
        }),
      });

      toast.success(
        isRu ? 'Предприятие успешно создано' : 'Yangi korxona muvaffaqiyatli yaratildi',
      );
      setCreateModalOpen(false);
      resetCreateForm();
      fetchData();
    } catch (err: any) {
      toast.error(err.message || (isRu ? 'Ошибка при создании' : 'Xatolik yuz berdi'));
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
    setAdminPassword('Admin123!');
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
      fetchData();
    } catch (err: any) {
      toast.error(err.message || (isRu ? 'Ошибка сохранения' : 'Xatolik yuz berdi'));
    } finally {
      setEditLoading(false);
    }
  };

  const handleImpersonate = async (t: TenantCompanySummary) => {
    if (!token) return;
    setImpersonateLoadingId(t.id);
    try {
      const res = await apiFetch<any>(`/super-admin/impersonate/${t.id}`, {
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
    } catch (err: any) {
      toast.error(err.message || (isRu ? 'Ошибка входа в кабинет' : 'Kabinetga kirishda xatolik yuz berdi'));
    } finally {
      setImpersonateLoadingId(null);
    }
  };

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

  const getPlanBadge = (plan: string) => {
    switch (plan) {
      case 'ENTERPRISE':
        return (
          <span
            style={{
              padding: '3px 8px',
              borderRadius: 'var(--radius-full)',
              fontSize: 'var(--text-xs)',
              fontWeight: 'var(--font-bold)',
              backgroundColor: 'rgba(168, 85, 247, 0.12)',
              color: '#9333ea',
              border: '1px solid rgba(168, 85, 247, 0.25)',
            }}
          >
            ENTERPRISE
          </span>
        );
      case 'PROFESSIONAL':
        return (
          <span
            style={{
              padding: '3px 8px',
              borderRadius: 'var(--radius-full)',
              fontSize: 'var(--text-xs)',
              fontWeight: 'var(--font-bold)',
              backgroundColor: 'var(--color-primary-50)',
              color: 'var(--color-primary-700)',
              border: '1px solid var(--color-primary-200)',
            }}
          >
            PROFESSIONAL
          </span>
        );
      default:
        return (
          <span
            style={{
              padding: '3px 8px',
              borderRadius: 'var(--radius-full)',
              fontSize: 'var(--text-xs)',
              fontWeight: 'var(--font-bold)',
              backgroundColor: 'var(--color-bg-tertiary)',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
            }}
          >
            STARTER
          </span>
        );
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    backgroundColor: 'var(--color-bg-tertiary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-text-primary)',
    fontSize: 'var(--text-sm)',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color var(--transition-fast)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Title & Add Button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1
            style={{
              fontSize: 'var(--text-2xl)',
              fontWeight: 'var(--font-bold)',
              color: 'var(--color-text-primary)',
              letterSpacing: '-0.02em',
              margin: 0,
            }}
          >
            {isRu ? 'Предприятия' : 'Korxonalar'}
          </h1>
        </div>

        <Button onClick={() => setCreateModalOpen(true)} variant="primary">
          <Plus size={16} />
          <span>{isRu ? 'Добавить предприятие' : 'Yangi korxona qo‘shish'}</span>
        </Button>
      </div>

      {/* KPI Metric Cards using official Card component */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-4)' }}>
        {/* Card 1: Total MRR */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)' }}>
              {isRu ? 'Месячный доход (MRR)' : 'Oylik daromad (MRR)'}
            </span>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-success-50)',
                color: 'var(--color-success-600)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <DollarSign size={18} />
            </div>
          </div>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', marginTop: '12px' }}>
            {metrics ? formatCurrency(metrics.totalMrr, locale, (metrics as any)?.currency || 'USD') : '—'}
          </div>
        </Card>

        {/* Card 2: Active Tenants */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)' }}>
              {isRu ? 'Активные клиенты' : 'Faol korxonalar'}
            </span>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-primary-50)',
                color: 'var(--color-primary-600)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Building2 size={18} />
            </div>
          </div>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', marginTop: '12px' }}>
            {metrics?.activeTenantsCount ?? 0}
          </div>
        </Card>

        {/* Card 3: Trial Tenants */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)' }}>
              {isRu ? 'Пробный период (Trial)' : 'Sinov davridagilar'}
            </span>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-info-50)',
                color: 'var(--color-info-600)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Clock size={18} />
            </div>
          </div>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', marginTop: '12px' }}>
            {metrics?.trialTenantsCount ?? 0}
          </div>
        </Card>

        {/* Card 4: Total Users */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)' }}>
              {isRu ? 'Всего пользователей' : 'Jami foydalanuvchilar'}
            </span>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-bg-tertiary)',
                color: 'var(--color-text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Users size={18} />
            </div>
          </div>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', marginTop: '12px' }}>
            {metrics?.totalUsersCount ?? 0}
          </div>
        </Card>
      </div>

      {/* Filter & Search Bar */}
      <Card style={{ padding: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          {/* Search */}
          <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isRu ? 'Поиск по названию или slug...' : 'Korxona nomi yoki slug bo‘yicha qidiruv...'}
              style={{
                ...inputStyle,
                paddingLeft: '36px',
              }}
            />
          </div>

          {/* Status Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-medium)' }}>
              {isRu ? 'Статус:' : 'Status:'}
            </span>
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: 'max-content' }}
              options={[
                { value: 'ALL', label: isRu ? 'Все статусы' : 'Barcha statuslar' },
                { value: 'ACTIVE', label: isRu ? 'Активные' : 'Faol' },
                { value: 'TRIAL', label: isRu ? 'Пробный (Trial)' : 'Sinov (Trial)' },
                { value: 'SUSPENDED', label: isRu ? 'Приостановленные' : 'To‘xtatilgan' },
                { value: 'BLOCKED', label: isRu ? 'Заблокированные' : 'Bloklangan' },
              ]}
            />
          </div>

          {/* Plan Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-medium)' }}>
              {isRu ? 'Тариф:' : 'Tarif:'}
            </span>
            <Select
              value={planFilter}
              onChange={setPlanFilter}
              style={{ width: 'max-content' }}
              options={[
                { value: 'ALL', label: isRu ? 'Все тарифы' : 'Barcha tariflar' },
                { value: 'STARTER', label: 'STARTER' },
                { value: 'PROFESSIONAL', label: 'PROFESSIONAL' },
                { value: 'ENTERPRISE', label: 'ENTERPRISE' },
              ]}
            />
          </div>
        </div>
      </Card>

      {/* Tenants Table Card */}
      <div
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-sm)',
          overflow: 'hidden',
        }}
      >
        {loading ? (
          <div style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            Yuklanmoqda...
          </div>
        ) : filteredTenants.length === 0 ? (
          <div style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            {isRu ? 'Предприятия не найдены' : 'Hech qanday korxona topilmadi'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-bg-tertiary)',
                    color: 'var(--color-text-secondary)',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 'var(--font-semibold)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  <th style={{ padding: '12px 20px' }}>{isRu ? 'Предприятие' : 'Korxona Nomi'}</th>
                  <th style={{ padding: '12px 16px' }}>Slug / ID</th>
                  <th style={{ padding: '12px 16px' }}>{isRu ? 'Статус' : 'Status'}</th>
                  <th style={{ padding: '12px 16px' }}>{isRu ? 'Тарифный план' : 'Tarif'}</th>
                  <th style={{ padding: '12px 16px' }}>{isRu ? 'Сотрудники' : 'Xodimlar'}</th>
                  <th style={{ padding: '12px 16px' }}>{isRu ? 'Дата создания' : 'Yaratilgan'}</th>
                  <th style={{ padding: '12px 20px', textAlign: 'right' }}>{isRu ? 'Действия' : 'Amallar'}</th>
                </tr>
              </thead>
              <tbody>
                {filteredTenants.map((t) => {
                  const companyName =
                    typeof t.name === 'string'
                      ? t.name
                      : t.name?.[locale] || t.name?.uz || t.slug;

                  return (
                    <tr
                      key={t.id}
                      style={{
                        borderBottom: '1px solid var(--color-border-light)',
                        transition: 'background-color var(--transition-fast)',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)' }}>{companyName}</div>
                        {t.trialEndsAt && (
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-info-600)', marginTop: '2px' }}>
                            {isRu ? 'Пробный до:' : 'Sinov muddati:'} {formatDate(t.trialEndsAt, locale)}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                        {t.slug}
                      </td>
                      <td style={{ padding: '14px 16px' }}>{getStatusBadge(t.status)}</td>
                      <td style={{ padding: '14px 16px' }}>{getPlanBadge(t.plan)}</td>
                      <td style={{ padding: '14px 16px', color: 'var(--color-text-secondary)' }}>
                        {t.userCount} {isRu ? 'чел.' : 'ta'}
                      </td>
                      <td style={{ padding: '14px 16px', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>
                        {formatDate(t.createdAt, locale)}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
                          {/* Impersonate Button */}
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => handleImpersonate(t)}
                            disabled={impersonateLoadingId === t.id}
                            title={isRu ? 'Войти в кабинет как админ' : 'Korxona nomidan kabinetga kirish'}
                            style={{
                              padding: '5px 10px',
                              fontSize: 'var(--text-xs)',
                            }}
                          >
                            <LogIn size={13} />
                            <span>
                              {impersonateLoadingId === t.id
                                ? (isRu ? 'Вход...' : 'Kirilmoqda...')
                                : isRu
                                  ? 'Кабинет'
                                  : 'Kirish'}
                            </span>
                          </Button>

                          {/* Edit Button */}
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleOpenEditModal(t)}
                            title={isRu ? 'Редактировать статус и тариф' : 'Status va tarifni o‘zgartirish'}
                            style={{
                              padding: '6px',
                              minWidth: '32px',
                              height: '32px',
                            }}
                          >
                            <Edit2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: Create New Tenant using standard Modal component */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title={isRu ? 'Регистрация предприятия' : 'Yangi korxona qo‘shish'}
        size="lg"
      >
        <form onSubmit={handleCreateTenant} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                {isRu ? 'Название (UZ)' : 'Korxona nomi (UZ)'} *
              </label>
              <input
                type="text"
                required
                value={companyNameUz}
                onChange={(e) => setCompanyNameUz(e.target.value)}
                placeholder="Orient Trading MCHJ"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                {isRu ? 'Название (RU)' : 'Korxona nomi (RU)'}
              </label>
              <input
                type="text"
                value={companyNameRu}
                onChange={(e) => setCompanyNameRu(e.target.value)}
                placeholder="ООО Orient Trading"
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                Slug / Identifikator *
              </label>
              <input
                type="text"
                required
                value={companySlug}
                onChange={(e) => setCompanySlug(e.target.value)}
                placeholder="orient-trading"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                {isRu ? 'Тарифный план' : 'Tarif rejasi'}
              </label>
              <Select
                value={companyPlan}
                onChange={(value) => setCompanyPlan(value as typeof companyPlan)}
                style={{ width: '100%' }}
                options={[
                  { value: 'STARTER', label: 'STARTER (490 000 soʻm/oy)' },
                  { value: 'PROFESSIONAL', label: 'PROFESSIONAL (990 000 soʻm/oy)' },
                  { value: 'ENTERPRISE', label: 'ENTERPRISE (1 990 000 soʻm/oy)' },
                ]}
              />
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--color-border-light)', paddingTop: 'var(--space-4)' }}>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)', color: 'var(--color-primary-600)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
              {isRu ? 'Учетная запись Главного Администратора' : 'Bosh Administrator Maʼlumotlari'}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                  {isRu ? 'Имя' : 'Ism'} *
                </label>
                <input
                  type="text"
                  required
                  value={adminFirstName}
                  onChange={(e) => setAdminFirstName(e.target.value)}
                  placeholder="Jasur"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                  {isRu ? 'Фамилия' : 'Familiya'} *
                </label>
                <input
                  type="text"
                  required
                  value={adminLastName}
                  onChange={(e) => setAdminLastName(e.target.value)}
                  placeholder="Alimov"
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                  Email *
                </label>
                <input
                  type="email"
                  required
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@orient.uz"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                  {isRu ? 'Начальный пароль' : 'Dastlabki parol'} *
                </label>
                <input
                  type="text"
                  required
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
            <Button variant="secondary" onClick={() => setCreateModalOpen(false)}>
              {isRu ? 'Отмена' : 'Bekor qilish'}
            </Button>
            <Button variant="primary" type="submit" disabled={createLoading}>
              {createLoading ? (isRu ? 'Создание...' : 'Yaratilmoqda...') : isRu ? 'Создать и активировать' : 'Yaratish va Faollashtirish'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Edit Tenant Status & Plan */}
      <Modal
        isOpen={editModalOpen && !!selectedTenant}
        onClose={() => setEditModalOpen(false)}
        title={isRu ? 'Настройки предприятия' : 'Korxona sozlamalari'}
        size="md"
      >
        <form onSubmit={handleUpdateTenant} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              {isRu ? 'Статус аккаунта' : 'Akkaunt holati'}
            </label>
            <Select
              value={editStatus}
              onChange={(value) => setEditStatus(value as typeof editStatus)}
              style={{ width: '100%' }}
              options={[
                { value: 'ACTIVE', label: isRu ? 'ACTIVE (Активен)' : 'ACTIVE (Faol)' },
                { value: 'TRIAL', label: isRu ? 'TRIAL (Пробный доступ)' : 'TRIAL (Sinov davri)' },
                { value: 'SUSPENDED', label: isRu ? 'SUSPENDED (Приостановлен)' : 'SUSPENDED (To‘xtatilgan)' },
                { value: 'BLOCKED', label: isRu ? 'BLOCKED (Заблокирован)' : 'BLOCKED (Bloklangan)' },
              ]}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              {isRu ? 'Тарифный план' : 'Tarif rejasi'}
            </label>
            <Select
              value={editPlan}
              onChange={(value) => setEditPlan(value as typeof editPlan)}
              style={{ width: '100%' }}
              options={[
                { value: 'STARTER', label: 'STARTER' },
                { value: 'PROFESSIONAL', label: 'PROFESSIONAL' },
                { value: 'ENTERPRISE', label: 'ENTERPRISE' },
              ]}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
            <Button variant="secondary" onClick={() => setEditModalOpen(false)}>
              {isRu ? 'Отмена' : 'Bekor qilish'}
            </Button>
            <Button variant="primary" type="submit" disabled={editLoading}>
              {editLoading ? (isRu ? 'Сохранение...' : 'Saqlanmoqda...') : isRu ? 'Сохранить' : 'Saqlash'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
