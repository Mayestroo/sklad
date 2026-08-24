'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { SalesInvoice } from '@shared/types';
import {
  Users,
  CreditCard,
  RotateCcw,
  ShoppingBag,
  TrendingUp,
  Phone,
  FileText,
  Clock,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';

interface CustomerProfileData {
  customer: {
    id: string;
    name: string;
    inn?: string;
    phone?: string;
    email?: string;
    address?: string;
    debtBalance: number;
  };
  metrics: {
    totalPurchased?: number;
    totalPaid?: number;
    totalReturned?: number;
    debtBalance: number;
  };
  invoices?: SalesInvoice[];
  orders?: any[];
  returns?: any[];
  payments?: any[];
}

interface CustomerProfileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  customerId: string | null;
}

export function CustomerProfileDrawer({
  isOpen,
  onClose,
  customerId,
}: CustomerProfileDrawerProps) {
  const { token, company } = useAuth();
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  const [data, setData] = useState<CustomerProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'info' | 'invoices' | 'orders' | 'payments' | 'returns'>('info');

  useEffect(() => {
    if (!token || !company || !customerId) return;

    setLoading(true);
    apiFetch<CustomerProfileData>(`/sales/customers/${customerId}/profile`, {
      token,
      tenantId: company.id,
      locale,
    })
      .then(setData)
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [token, company, customerId, locale]);

  if (!customerId) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={data?.customer?.name || (isRu ? 'Профиль клиента' : 'Mijoz profili')}
      size="xl"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', width: '100%' }}>
        {loading ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            {isRu ? 'Загрузка профиля...' : 'Profil yuklanmoqda...'}
          </div>
        ) : !data ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            {isRu ? 'Данные не найдены' : 'Ma\'lumot topilmadi'}
          </div>
        ) : (
          <>
            {/* Header Debt KPI Banner */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 'var(--space-3)',
              }}
            >
              <div
                style={{
                  padding: 'var(--space-4)',
                  backgroundColor: 'var(--color-bg-subtle)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                  {isRu ? 'Текущий долг клиента' : 'Mijozning joriy qarzi'}
                </div>
                <div
                  style={{
                    fontSize: 'var(--text-xl)',
                    fontWeight: 700,
                    color: Number(data.metrics?.debtBalance || data.customer?.debtBalance || 0) > 0 ? '#ef4444' : 'var(--color-text-primary)',
                  }}
                  className="tabular-nums"
                >
                  {formatCurrency(data.metrics?.debtBalance || data.customer?.debtBalance || 0, locale)}
                </div>
              </div>

              <div
                style={{
                  padding: 'var(--space-4)',
                  backgroundColor: 'var(--color-bg-subtle)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                  {isRu ? 'Всего продано' : 'Jami savdo hajmi'}
                </div>
                <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--color-text-primary)' }} className="tabular-nums">
                  {formatCurrency(data.metrics?.totalPurchased || 0, locale)}
                </div>
              </div>

              <div
                style={{
                  padding: 'var(--space-4)',
                  backgroundColor: 'var(--color-bg-subtle)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                  {isRu ? 'Всего оплачено' : 'Jami to‘langan'}
                </div>
                <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: '#10b981' }} className="tabular-nums">
                  {formatCurrency(data.metrics?.totalPaid || 0, locale)}
                </div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', gap: 'var(--space-2)' }}>
              <button
                onClick={() => setActiveTab('info')}
                style={{
                  padding: '8px 16px',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  borderBottom: activeTab === 'info' ? '2px solid var(--color-primary-600)' : '2px solid transparent',
                  color: activeTab === 'info' ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
                }}
              >
                {isRu ? 'Реквизиты' : 'Rekvizitlar'}
              </button>
              <button
                onClick={() => setActiveTab('invoices')}
                style={{
                  padding: '8px 16px',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  borderBottom: activeTab === 'invoices' ? '2px solid var(--color-primary-600)' : '2px solid transparent',
                  color: activeTab === 'invoices' ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
                }}
              >
                {isRu ? 'Накладные' : 'Fakturalar'} ({data.invoices?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('orders')}
                style={{
                  padding: '8px 16px',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  borderBottom: activeTab === 'orders' ? '2px solid var(--color-primary-600)' : '2px solid transparent',
                  color: activeTab === 'orders' ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
                }}
              >
                {isRu ? 'Заказы' : 'Buyurtmalar'} ({data.orders?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('payments')}
                style={{
                  padding: '8px 16px',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  borderBottom: activeTab === 'payments' ? '2px solid var(--color-primary-600)' : '2px solid transparent',
                  color: activeTab === 'payments' ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
                }}
              >
                {isRu ? 'Платежи' : 'To‘lovlar'} ({data.payments?.length || 0})
              </button>
            </div>

            {/* Tab: Info */}
            {activeTab === 'info' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
                <div>
                  <span style={{ color: 'var(--color-text-secondary)', display: 'block', fontSize: 'var(--text-xs)', marginBottom: 2 }}>{isRu ? 'ИНН (СТИР)' : 'INN (STIR)'}:</span>
                  <strong>{data.customer.inn || '—'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--color-text-secondary)', display: 'block', fontSize: 'var(--text-xs)', marginBottom: 2 }}>{isRu ? 'Телефон' : 'Telefon'}:</span>
                  <strong>{data.customer.phone || '—'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--color-text-secondary)', display: 'block', fontSize: 'var(--text-xs)', marginBottom: 2 }}>Email:</span>
                  <strong>{data.customer.email || '—'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--color-text-secondary)', display: 'block', fontSize: 'var(--text-xs)', marginBottom: 2 }}>{isRu ? 'Адрес' : 'Manzil'}:</span>
                  <strong>{data.customer.address || '—'}</strong>
                </div>
              </div>
            )}

            {/* Tab: Invoices */}
            {activeTab === 'invoices' && (
              <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
                {(!data.invoices || data.invoices.length === 0) ? (
                  <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--color-text-tertiary)' }}>
                    {isRu ? 'Накладные отсутствуют' : 'Fakturalar mavjud emas'}
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-subtle)' }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>№ / SANA</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>HOLAT</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>SUMMA</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>QOLDIQ QARZ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.invoices.map((inv: any) => (
                        <tr key={inv.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                          <td style={{ padding: '8px 12px' }}>
                            <div style={{ fontWeight: 600 }}>{inv.invoiceNumber || inv.docNumber}</div>
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{formatDate(inv.invoiceDate || inv.createdAt)}</div>
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <Badge variant={inv.status === 'POSTED' ? 'success' : 'warning'}>{inv.status}</Badge>
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }} className="tabular-nums">
                            {formatCurrency(Number(inv.totalAmount || 0), locale, inv.currency)}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: Number(inv.debtAmount || 0) > 0 ? '#ef4444' : '#10b981' }} className="tabular-nums">
                            {formatCurrency(Number(inv.debtAmount || (Number(inv.totalAmount || 0) - Number(inv.paidAmount || 0))), locale, inv.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Tab: Orders */}
            {activeTab === 'orders' && (
              <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
                {(!data.orders || data.orders.length === 0) ? (
                  <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--color-text-tertiary)' }}>
                    {isRu ? 'Заказы отсутствуют' : 'Buyurtmalar mavjud emas'}
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-subtle)' }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>ZAKAZ № / SANA</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>HOLAT</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>SUMMA</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>TO‘LANGAN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.orders.map((ord: any) => (
                        <tr key={ord.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                          <td style={{ padding: '8px 12px' }}>
                            <div style={{ fontWeight: 600 }}>{ord.orderNumber}</div>
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{formatDate(ord.createdAt)}</div>
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <Badge variant="neutral">{ord.status}</Badge>
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }} className="tabular-nums">
                            {formatCurrency(Number(ord.totalAmount || 0), locale, ord.currency)}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: '#10b981' }} className="tabular-nums">
                            {formatCurrency(Number(ord.paidAmount || 0), locale, ord.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Tab: Payments */}
            {activeTab === 'payments' && (
              <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
                {(!data.payments || data.payments.length === 0) ? (
                  <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--color-text-tertiary)' }}>
                    {isRu ? 'Платежи отсутствуют' : 'To‘lovlar mavjud emas'}
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-subtle)' }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>SANA / USUL</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>IZOH</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>SUMMA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.payments.map((p: any) => (
                        <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                          <td style={{ padding: '8px 12px' }}>
                            <div style={{ fontWeight: 600 }}>{formatDate(p.createdAt)}</div>
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{p.method}</div>
                          </td>
                          <td style={{ padding: '8px 12px', color: 'var(--color-text-secondary)' }}>
                            {p.comment || '—'}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#10b981' }} className="tabular-nums">
                            {formatCurrency(Number(p.amount || 0), locale)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
