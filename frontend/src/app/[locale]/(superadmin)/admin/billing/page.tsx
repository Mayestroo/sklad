'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { CreditCard, TrendingUp, CheckCircle, Clock, ArrowUpRight, DollarSign } from 'lucide-react';
import { GlobalMetrics, TenantCompanySummary } from '@shared/types';
import { toast } from '@/context/ToastContext';

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
      toast.error(err.message || 'Xatolik yuz berdi');
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.02em', margin: 0 }}>
          {isRu ? 'Тарифы и Подписки (Billing)' : 'Tariflar va Obunalar (Billing)'}
        </h1>
        <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px', margin: 0 }}>
          {isRu ? 'Мониторинг тарифных планов, выручки MRR и статусов оплаты' : 'Tarif rejalari taqsimoti, oylik tushum (MRR) va to‘lov muddatlari'}
        </p>
      </div>

      {/* Pricing Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        {/* Starter */}
        <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, backgroundColor: 'rgba(100, 116, 139, 0.2)', color: '#94a3b8' }}>
              STARTER
            </span>
            <span style={{ fontSize: '12px', color: '#64748b' }}>{planCounts.STARTER} {isRu ? 'клиентов' : 'korxona'}</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#f8fafc', marginTop: '16px' }}>
            490 000 <span style={{ fontSize: '14px', fontWeight: 400, color: '#64748b' }}>UZS / oy</span>
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '8px', lineHeight: '1.5' }}>
            {isRu ? 'До 5 сотрудников, 1 склад, базовая аналитика' : '5 tagacha xodim, 1 ta omborxona, asosiy hisobotlar'}
          </div>
        </div>

        {/* Professional */}
        <div style={{ backgroundColor: '#0f172a', border: '1px solid #6366f1', borderRadius: '12px', padding: '24px', position: 'relative' }}>
          <div style={{ position: 'absolute', top: '-10px', right: '20px', backgroundColor: '#6366f1', color: '#ffffff', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>
            POPULAR
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, backgroundColor: 'rgba(99, 102, 241, 0.2)', color: '#818cf8' }}>
              PROFESSIONAL
            </span>
            <span style={{ fontSize: '12px', color: '#818cf8', fontWeight: 600 }}>{planCounts.PROFESSIONAL} {isRu ? 'клиентов' : 'korxona'}</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#f8fafc', marginTop: '16px' }}>
            990 000 <span style={{ fontSize: '14px', fontWeight: 400, color: '#64748b' }}>UZS / oy</span>
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '8px', lineHeight: '1.5' }}>
            {isRu ? 'До 20 сотрудников, 5 складов, полная бухгалтерия BHMS' : '20 tagacha xodim, 5 ta ombor, to‘liq BHMS buxgalteriya'}
          </div>
        </div>

        {/* Enterprise */}
        <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, backgroundColor: 'rgba(168, 85, 247, 0.2)', color: '#c084fc' }}>
              ENTERPRISE
            </span>
            <span style={{ fontSize: '12px', color: '#64748b' }}>{planCounts.ENTERPRISE} {isRu ? 'клиентов' : 'korxona'}</span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#f8fafc', marginTop: '16px' }}>
            1 990 000 <span style={{ fontSize: '14px', fontWeight: 400, color: '#64748b' }}>UZS / oy</span>
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '8px', lineHeight: '1.5' }}>
            {isRu ? 'Неограниченно складов и пользователей, выделенный менеджер' : 'Cheksiz ombor va xodimlar, shaxsiy menejer'}
          </div>
        </div>
      </div>

      {/* Subscriptions List */}
      <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e293b', fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>
          {isRu ? 'Текущие активные подписки' : 'Mavjud obunalar holati'}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b', backgroundColor: '#0b1120', color: '#64748b', fontSize: '12px', textTransform: 'uppercase' }}>
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
                  <tr key={t.id} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '16px 20px', fontWeight: 600, color: '#f8fafc' }}>{name}</td>
                    <td style={{ padding: '16px' }}>{t.plan}</td>
                    <td style={{ padding: '16px', color: t.status === 'ACTIVE' ? '#4ade80' : '#60a5fa' }}>{t.status}</td>
                    <td style={{ padding: '16px', color: '#cbd5e1' }}>{t.userCount} ta</td>
                    <td style={{ padding: '16px 20px', color: '#64748b' }}>{formatDate(t.createdAt, locale)}</td>
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
