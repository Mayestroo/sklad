'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { toast } from '@/context/ToastContext';
import { GlobalMetrics, TenantCompanySummary } from '@shared/types';

export default function SuperAdminBillingPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token } = useAuth();

  const [metrics, setMetrics] = useState<GlobalMetrics | null>(null);
  const [tenants, setTenants] = useState<TenantCompanySummary[]>([]);
  const [loading, setLoading] = useState(true);

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
      toast.error(err.message || (isRu ? 'Ошибка загрузки данных' : 'Xatolik yuz berdi'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  const planCounts = {
    STARTER: tenants.filter((t) => t.plan === 'STARTER').length,
    PROFESSIONAL: tenants.filter((t) => t.plan === 'PROFESSIONAL').length,
    ENTERPRISE: tenants.filter((t) => t.plan === 'ENTERPRISE').length,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div>
        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', letterSpacing: '-0.02em', margin: 0 }}>
          {isRu ? 'Тарифы и Подписки (Billing)' : 'Tariflar va Obunalar (Billing)'}
        </h1>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: '4px', margin: 0 }}>
          {isRu ? 'Мониторинг тарифных планов, выручки MRR и статусов оплаты' : 'Tarif rejalari taqsimoti, oylik tushum (MRR) va to‘lov muddatlari'}
        </p>
      </div>

      {/* Pricing Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
        {/* Starter */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
              {planCounts.STARTER} {isRu ? 'клиентов' : 'korxona'}
            </span>
          </div>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', marginTop: '16px' }}>
            490 000 <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-normal)', color: 'var(--color-text-secondary)' }}>UZS / oy</span>
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '8px', lineHeight: '1.5' }}>
            {isRu ? 'До 5 сотрудников, 1 склад, базовая аналитика' : '5 tagacha xodim, 1 ta omborxona, asosiy hisobotlar'}
          </div>
        </Card>

        {/* Professional */}
        <Card style={{ border: '2px solid var(--color-primary-600)', position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              top: '-11px',
              right: '20px',
              backgroundColor: 'var(--color-primary-600)',
              color: '#ffffff',
              fontSize: '10px',
              fontWeight: 'var(--font-bold)',
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            POPULAR
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary-600)', fontWeight: 'var(--font-semibold)' }}>
              {planCounts.PROFESSIONAL} {isRu ? 'клиентов' : 'korxona'}
            </span>
          </div>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', marginTop: '16px' }}>
            990 000 <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-normal)', color: 'var(--color-text-secondary)' }}>UZS / oy</span>
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '8px', lineHeight: '1.5' }}>
            {isRu ? 'До 20 сотрудников, 5 складов, полная бухгалтерия BHMS' : '20 tagacha xodim, 5 ta ombor, to‘liq BHMS buxgalteriya'}
          </div>
        </Card>

        {/* Enterprise */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
              {planCounts.ENTERPRISE} {isRu ? 'клиентов' : 'korxona'}
            </span>
          </div>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', marginTop: '16px' }}>
            1 990 000 <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-normal)', color: 'var(--color-text-secondary)' }}>UZS / oy</span>
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '8px', lineHeight: '1.5' }}>
            {isRu ? 'Неограниченно складов и пользователей, выделенный менеджер' : 'Cheksiz ombor va xodimlar, shaxsiy menejer'}
          </div>
        </Card>
      </div>

      {/* Subscriptions List */}
      <div
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-sm)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border-light)', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
          {isRu ? 'Текущие активные подписки' : 'Mavjud obunalar holati'}
        </div>
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
                <th style={{ padding: '12px 20px' }}>{isRu ? 'Предприятие' : 'Korxona'}</th>
                <th style={{ padding: '12px 16px' }}>{isRu ? 'Тариф' : 'Tarif'}</th>
                <th style={{ padding: '12px 16px' }}>{isRu ? 'Статус' : 'Holat'}</th>
                <th style={{ padding: '12px 16px' }}>{isRu ? 'Пользователи' : 'Xodimlar'}</th>
                <th style={{ padding: '12px 20px' }}>{isRu ? 'Дата создания' : 'Yaratilgan sana'}</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => {
                const name = typeof t.name === 'string' ? t.name : t.name?.[locale] || t.name?.uz || t.slug;
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
                    <td style={{ padding: '14px 20px', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)' }}>{name}</td>
                    <td style={{ padding: '14px 16px', color: 'var(--color-text-secondary)' }}>{t.plan}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <Badge variant={t.status === 'ACTIVE' ? 'success' : 'info'}>{t.status}</Badge>
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--color-text-secondary)' }}>{t.userCount} ta</td>
                    <td style={{ padding: '14px 20px', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>{formatDate(t.createdAt, locale)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
