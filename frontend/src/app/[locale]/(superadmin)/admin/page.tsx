'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  Building2,
  Users,
  DollarSign,
  TrendingUp,
  Plus,
  Search,
  LogIn,
  Edit2,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  Shield,
  Layers,
} from 'lucide-react';
import { GlobalMetrics, TenantCompanySummary } from '@shared/types';
import { toast } from '@/context/ToastContext';

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
      toast.error(err.message || 'Maʼlumotlarni yuklashda xatolik yuz berdi');
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
      toast.error(err.message || 'Xatolik yuz berdi');
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
      toast.error(err.message || 'Xatolik yuz berdi');
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
      toast.error(err.message || 'Kabinetga kirishda xatolik yuz berdi');
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
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, backgroundColor: 'rgba(34, 197, 94, 0.15)', color: '#4ade80' }}>
            <CheckCircle2 size={12} /> {isRu ? 'Активен' : 'Faol'}
          </span>
        );
      case 'TRIAL':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>
            <Clock size={12} /> {isRu ? 'Пробный (Trial)' : 'Sinov (Trial)'}
          </span>
        );
      case 'SUSPENDED':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>
            <AlertTriangle size={12} /> {isRu ? 'Приостановлен' : 'To‘xtatilgan'}
          </span>
        );
      case 'BLOCKED':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#f87171' }}>
            <XCircle size={12} /> {isRu ? 'Заблокирован' : 'Bloklangan'}
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  const getPlanBadge = (plan: string) => {
    switch (plan) {
      case 'ENTERPRISE':
        return (
          <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, backgroundColor: 'rgba(168, 85, 247, 0.15)', color: '#c084fc' }}>
            ENTERPRISE
          </span>
        );
      case 'PROFESSIONAL':
        return (
          <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, backgroundColor: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}>
            PROFESSIONAL
          </span>
        );
      default:
        return (
          <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, backgroundColor: 'rgba(100, 116, 139, 0.2)', color: '#94a3b8' }}>
            STARTER
          </span>
        );
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Page Title & Add Button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.02em', margin: 0 }}>
            {isRu ? 'Предприятия (Tenants)' : 'Korxonalar Boshqaruvi (Tenants)'}
          </h1>
          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px', margin: 0 }}>
            {isRu
              ? 'Управление учетными записями клиентов, тарифными планами и прямой вход в систему'
              : 'Mijoz korxonalarni ro‘yxatga olish, tariflarni boshqarish va kabinetga bevosita kirish'}
          </p>
        </div>

        <button
          onClick={() => setCreateModalOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: '8px',
            backgroundColor: '#6366f1',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '13px',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 2px 10px rgba(99, 102, 241, 0.3)',
          }}
        >
          <Plus size={16} />
          <span>{isRu ? 'Добавить предприятие' : 'Yangi korxona qo‘shish'}</span>
        </button>
      </div>

      {/* KPI Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        {/* Card 1: Total MRR */}
        <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748b' }}>
            <span style={{ fontSize: '13px', fontWeight: 500 }}>{isRu ? 'Месячный доход (MRR)' : 'Oylik daromad (MRR)'}</span>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'rgba(34, 197, 94, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4ade80' }}>
              <DollarSign size={18} />
            </div>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#f8fafc', marginTop: '12px' }}>
            {metrics ? formatCurrency(metrics.totalMrr, locale, 'UZS') : '0 UZS'}
          </div>
          <div style={{ fontSize: '12px', color: '#4ade80', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <TrendingUp size={13} /> {isRu ? 'Активные подписки' : 'Faol obunalardan tushum'}
          </div>
        </div>

        {/* Card 2: Active Tenants */}
        <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748b' }}>
            <span style={{ fontSize: '13px', fontWeight: 500 }}>{isRu ? 'Активные клиенты' : 'Faol korxonalar'}</span>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#818cf8' }}>
              <Building2 size={18} />
            </div>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#f8fafc', marginTop: '12px' }}>
            {metrics?.activeTenantsCount ?? 0}
          </div>
          <div style={{ fontSize: '12px', color: '#818cf8', marginTop: '4px' }}>
            {isRu ? 'Платные аккаунты' : 'Haq to‘langan korxonalar'}
          </div>
        </div>

        {/* Card 3: Trial Tenants */}
        <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748b' }}>
            <span style={{ fontSize: '13px', fontWeight: 500 }}>{isRu ? 'Пробный период (Trial)' : 'Sinov davridagilar'}</span>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60a5fa' }}>
              <Clock size={18} />
            </div>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#f8fafc', marginTop: '12px' }}>
            {metrics?.trialTenantsCount ?? 0}
          </div>
          <div style={{ fontSize: '12px', color: '#60a5fa', marginTop: '4px' }}>
            {isRu ? '14 дней бесплатного доступа' : '14 kunlik bepul sinov'}
          </div>
        </div>

        {/* Card 4: Total Users */}
        <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#64748b' }}>
            <span style={{ fontSize: '13px', fontWeight: 500 }}>{isRu ? 'Всего пользователей' : 'Jami foydalanuvchilar'}</span>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'rgba(168, 85, 247, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c084fc' }}>
              <Users size={18} />
            </div>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#f8fafc', marginTop: '12px' }}>
            {metrics?.totalUsersCount ?? 0}
          </div>
          <div style={{ fontSize: '12px', color: '#c084fc', marginTop: '4px' }}>
            {isRu ? 'По всем предприятиям' : 'Barcha korxonalar bo‘yicha'}
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div
        style={{
          backgroundColor: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: '12px',
          padding: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        {/* Search */}
        <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isRu ? 'Поиск по названию или slug...' : 'Korxona nomi yoki slug bo‘yicha qidiruv...'}
            style={{
              width: '100%',
              padding: '8px 12px 8px 36px',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#f8fafc',
              fontSize: '13px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Status Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: '#64748b' }}>{isRu ? 'Статус:' : 'Status:'}</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#f8fafc',
              fontSize: '13px',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="ALL">{isRu ? 'Все статусы' : 'Barcha statuslar'}</option>
            <option value="ACTIVE">{isRu ? 'Активные' : 'Faol'}</option>
            <option value="TRIAL">{isRu ? 'Пробный (Trial)' : 'Sinov (Trial)'}</option>
            <option value="SUSPENDED">{isRu ? 'Приостановленные' : 'To‘xtatilgan'}</option>
            <option value="BLOCKED">{isRu ? 'Заблокированные' : 'Bloklangan'}</option>
          </select>
        </div>

        {/* Plan Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: '#64748b' }}>{isRu ? 'Тариф:' : 'Tarif:'}</span>
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#f8fafc',
              fontSize: '13px',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="ALL">{isRu ? 'Все тарифы' : 'Barcha tariflar'}</option>
            <option value="STARTER">STARTER</option>
            <option value="PROFESSIONAL">PROFESSIONAL</option>
            <option value="ENTERPRISE">ENTERPRISE</option>
          </select>
        </div>
      </div>

      {/* Tenants Table Card */}
      <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>
            Yuklanmoqda...
          </div>
        ) : filteredTenants.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>
            {isRu ? 'Предприятия не найдены' : 'Hech qanday korxona topilmadi'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', backgroundColor: '#0b1120', color: '#64748b', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
                        borderBottom: '1px solid #1e293b',
                        transition: 'background-color 0.15s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#131f37')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ fontWeight: 600, color: '#f8fafc' }}>{companyName}</div>
                        {t.trialEndsAt && (
                          <div style={{ fontSize: '11px', color: '#60a5fa', marginTop: '2px' }}>
                            {isRu ? 'Пробный до:' : 'Sinov muddati:'} {formatDate(t.trialEndsAt, locale)}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '16px', color: '#94a3b8', fontFamily: 'monospace' }}>
                        {t.slug}
                      </td>
                      <td style={{ padding: '16px' }}>{getStatusBadge(t.status)}</td>
                      <td style={{ padding: '16px' }}>{getPlanBadge(t.plan)}</td>
                      <td style={{ padding: '16px', color: '#cbd5e1' }}>
                        {t.userCount} {isRu ? 'чел.' : 'ta'}
                      </td>
                      <td style={{ padding: '16px', color: '#64748b' }}>
                        {formatDate(t.createdAt, locale)}
                      </td>
                      <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                          {/* Impersonate Button */}
                          <button
                            onClick={() => handleImpersonate(t)}
                            disabled={impersonateLoadingId === t.id}
                            title={isRu ? 'Войти в кабинет как админ' : 'Korxona nomidan kabinetga kirish'}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '6px 12px',
                              borderRadius: '6px',
                              backgroundColor: 'rgba(99, 102, 241, 0.15)',
                              border: '1px solid rgba(99, 102, 241, 0.3)',
                              color: '#818cf8',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <LogIn size={13} />
                            <span>
                              {impersonateLoadingId === t.id
                                ? 'Kirilmoqda...'
                                : isRu
                                  ? 'Кабинет'
                                  : 'Kirish'}
                            </span>
                          </button>

                          {/* Edit Button */}
                          <button
                            onClick={() => handleOpenEditModal(t)}
                            title={isRu ? 'Редактировать статус и тариф' : 'Status va tarifni o‘zgartirish'}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '32px',
                              height: '32px',
                              borderRadius: '6px',
                              backgroundColor: '#1e293b',
                              border: '1px solid #334155',
                              color: '#94a3b8',
                              cursor: 'pointer',
                            }}
                          >
                            <Edit2 size={13} />
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
      </div>

      {/* MODAL: Create New Tenant (Onboarding) */}
      {createModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '16px',
              maxWidth: '580px',
              width: '100%',
              overflow: 'hidden',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'rgba(99, 102, 241, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#818cf8' }}>
                  <Building2 size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>
                    {isRu ? 'Регистрация нового предприятия' : 'Yangi korxonani ro‘yxatga olish'}
                  </h3>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    {isRu ? 'Автоматическое создание филиала, склада и админа' : 'Bosh filial, ombor va admin hisobi avtomatik ochiladi'}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setCreateModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '18px' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTenant} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                    {isRu ? 'Название (UZ)' : 'Korxona nomi (UZ)'} *
                  </label>
                  <input
                    type="text"
                    required
                    value={companyNameUz}
                    onChange={(e) => setCompanyNameUz(e.target.value)}
                    placeholder="Orient Trading MCHJ"
                    style={{ width: '100%', padding: '8px 12px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f8fafc', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                    {isRu ? 'Название (RU)' : 'Korxona nomi (RU)'}
                  </label>
                  <input
                    type="text"
                    value={companyNameRu}
                    onChange={(e) => setCompanyNameRu(e.target.value)}
                    placeholder="ООО Orient Trading"
                    style={{ width: '100%', padding: '8px 12px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f8fafc', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                    Slug / Identifikator *
                  </label>
                  <input
                    type="text"
                    required
                    value={companySlug}
                    onChange={(e) => setCompanySlug(e.target.value)}
                    placeholder="orient-trading"
                    style={{ width: '100%', padding: '8px 12px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f8fafc', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                    {isRu ? 'Тарифный план' : 'Tarif rejasi'}
                  </label>
                  <select
                    value={companyPlan}
                    onChange={(e) => setCompanyPlan(e.target.value as any)}
                    style={{ width: '100%', padding: '8px 12px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f8fafc', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                  >
                    <option value="STARTER">STARTER (490 000 soʻm/oy)</option>
                    <option value="PROFESSIONAL">PROFESSIONAL (990 000 soʻm/oy)</option>
                    <option value="ENTERPRISE">ENTERPRISE (1 990 000 soʻm/oy)</option>
                  </select>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #1e293b', paddingTop: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
                  {isRu ? 'Учетная запись Главного Администратора' : 'Bosh Administrator Maʼlumotlari'}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                      {isRu ? 'Имя' : 'Ism'} *
                    </label>
                    <input
                      type="text"
                      required
                      value={adminFirstName}
                      onChange={(e) => setAdminFirstName(e.target.value)}
                      placeholder="Jasur"
                      style={{ width: '100%', padding: '8px 12px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f8fafc', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                      {isRu ? 'Фамилия' : 'Familiya'} *
                    </label>
                    <input
                      type="text"
                      required
                      value={adminLastName}
                      onChange={(e) => setAdminLastName(e.target.value)}
                      placeholder="Alimov"
                      style={{ width: '100%', padding: '8px 12px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f8fafc', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                      Email *
                    </label>
                    <input
                      type="email"
                      required
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder="admin@orient.uz"
                      style={{ width: '100%', padding: '8px 12px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f8fafc', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                      {isRu ? 'Начальный пароль' : 'Dastlabki parol'} *
                    </label>
                    <input
                      type="text"
                      required
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f8fafc', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  style={{ padding: '8px 16px', borderRadius: '8px', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#94a3b8', fontSize: '13px', cursor: 'pointer' }}
                >
                  {isRu ? 'Отмена' : 'Bekor qilish'}
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  style={{ padding: '8px 20px', borderRadius: '8px', backgroundColor: '#6366f1', color: '#ffffff', fontWeight: 600, fontSize: '13px', border: 'none', cursor: 'pointer' }}
                >
                  {createLoading ? 'Yaratilmoqda...' : isRu ? 'Создать и активировать' : 'Yaratish va Faollashtirish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Edit Tenant Status & Plan */}
      {editModalOpen && selectedTenant && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '16px',
              maxWidth: '460px',
              width: '100%',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>
                {isRu ? 'Настройки предприятия' : 'Korxona sozlamalari'}
              </h3>
              <button
                onClick={() => setEditModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '18px' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateTenant} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                  {isRu ? 'Статус аккаунта' : 'Akkaunt holati'}
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  style={{ width: '100%', padding: '8px 12px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f8fafc', fontSize: '13px', outline: 'none' }}
                >
                  <option value="ACTIVE">{isRu ? 'ACTIVE (Активен)' : 'ACTIVE (Faol)'}</option>
                  <option value="TRIAL">{isRu ? 'TRIAL (Пробный доступ)' : 'TRIAL (Sinov davri)'}</option>
                  <option value="SUSPENDED">{isRu ? 'SUSPENDED (Приостановлен)' : 'SUSPENDED (To‘xtatilgan)'}</option>
                  <option value="BLOCKED">{isRu ? 'BLOCKED (Заблокирован)' : 'BLOCKED (Bloklangan)'}</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                  {isRu ? 'Тарифный план' : 'Tarif rejasi'}
                </label>
                <select
                  value={editPlan}
                  onChange={(e) => setEditPlan(e.target.value as any)}
                  style={{ width: '100%', padding: '8px 12px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f8fafc', fontSize: '13px', outline: 'none' }}
                >
                  <option value="STARTER">STARTER</option>
                  <option value="PROFESSIONAL">PROFESSIONAL</option>
                  <option value="ENTERPRISE">ENTERPRISE</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  style={{ padding: '8px 16px', borderRadius: '8px', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#94a3b8', fontSize: '13px', cursor: 'pointer' }}
                >
                  {isRu ? 'Отмена' : 'Bekor qilish'}
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  style={{ padding: '8px 20px', borderRadius: '8px', backgroundColor: '#6366f1', color: '#ffffff', fontWeight: 600, fontSize: '13px', border: 'none', cursor: 'pointer' }}
                >
                  {editLoading ? 'Saqlanmoqda...' : isRu ? 'Сохранить' : 'Saqlash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
