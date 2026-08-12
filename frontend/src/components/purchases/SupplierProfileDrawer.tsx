'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { PurchaseReceipt, PurchaseReturn } from '@shared/types';

interface SupplierProfileData {
  supplier: {
    id: string;
    name: string;
    inn?: string;
    mfo?: string;
    bankAccount?: string;
    bankName?: string;
    phone?: string;
    email?: string;
    address?: string;
    debtBalance: number;
  };
  metrics: {
    totalPurchased: number;
    totalPaid: number;
    totalReturned: number;
    debtBalance: number;
  };
  receipts: PurchaseReceipt[];
  returns: PurchaseReturn[];
  payments: any[];
}

interface SupplierProfileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  supplierId: string | null;
}

export function SupplierProfileDrawer({
  isOpen,
  onClose,
  supplierId,
}: SupplierProfileDrawerProps) {
  const { token, company } = useAuth();
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  const [data, setData] = useState<SupplierProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'info' | 'receipts' | 'payments' | 'returns'>('info');

  useEffect(() => {
    if (!token || !company || !supplierId) return;

    setLoading(true);
    apiFetch<SupplierProfileData>(`/purchases/suppliers/${supplierId}`, {
      token,
      tenantId: company.id,
      locale,
    })
      .then(setData)
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [token, company, supplierId, locale]);

  if (!supplierId) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={data?.supplier.name || (isRu ? 'Профиль поставщика' : 'Yetkazib beruvchi profili')}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: '800px', width: '100%' }}>
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
                padding: 'var(--space-4)',
                backgroundColor: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                  {isRu ? 'Общая сумма закупок' : 'Jami Xaridlar Summasi'}
                </div>
                <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)' }} className="tabular-nums">
                  {formatCurrency(data.metrics.totalPurchased, locale)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                  {isRu ? 'Оплаченная сумма' : 'To\'langan Summa'}
                </div>
                <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', color: 'var(--color-success-600)' }} className="tabular-nums">
                  {formatCurrency(data.metrics.totalPaid, locale)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                  {isRu ? 'Наш долг' : 'Bizning Qarzimiz'}
                </div>
                <div
                  style={{
                    fontSize: 'var(--text-lg)',
                    fontWeight: 'var(--font-bold)',
                    color: data.metrics.debtBalance > 0 ? 'var(--color-danger-600)' : 'var(--color-text-primary)',
                  }}
                  className="tabular-nums"
                >
                  {formatCurrency(data.metrics.debtBalance, locale)}
                </div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div style={{ display: 'flex', gap: 'var(--space-2)', borderBottom: '1px solid var(--color-border)' }}>
              <button
                type="button"
                onClick={() => setActiveTab('info')}
                style={{
                  padding: '8px 16px',
                  fontWeight: activeTab === 'info' ? 'var(--font-bold)' : 'var(--font-medium)',
                  color: activeTab === 'info' ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
                  borderBottom: activeTab === 'info' ? '2px solid var(--color-primary-600)' : '2px solid transparent',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 'var(--text-sm)',
                }}
              >
                {isRu ? 'Реквизиты и договоры' : 'Rekvizitlar & Shartnomalar'}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('receipts')}
                style={{
                  padding: '8px 16px',
                  fontWeight: activeTab === 'receipts' ? 'var(--font-bold)' : 'var(--font-medium)',
                  color: activeTab === 'receipts' ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
                  borderBottom: activeTab === 'receipts' ? '2px solid var(--color-primary-600)' : '2px solid transparent',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 'var(--text-sm)',
                }}
              >
                {isRu ? 'История закупок' : 'Xaridlar Tarixi'} ({data.receipts.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('payments')}
                style={{
                  padding: '8px 16px',
                  fontWeight: activeTab === 'payments' ? 'var(--font-bold)' : 'var(--font-medium)',
                  color: activeTab === 'payments' ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
                  borderBottom: activeTab === 'payments' ? '2px solid var(--color-primary-600)' : '2px solid transparent',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 'var(--text-sm)',
                }}
              >
                {isRu ? 'История платежей' : 'To\'lovlar Tarixi'} ({data.payments.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('returns')}
                style={{
                  padding: '8px 16px',
                  fontWeight: activeTab === 'returns' ? 'var(--font-bold)' : 'var(--font-medium)',
                  color: activeTab === 'returns' ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
                  borderBottom: activeTab === 'returns' ? '2px solid var(--color-primary-600)' : '2px solid transparent',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 'var(--text-sm)',
                }}
              >
                {isRu ? 'Возвраты' : 'Qaytarishlar'} ({data.returns.length})
              </button>
            </div>

            {/* Tab Contents */}
            {activeTab === 'info' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
                <div style={{ padding: 'var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>ИНН / STIR</div>
                  <strong style={{ fontSize: 'var(--text-base)' }}>{data.supplier.inn || '—'}</strong>
                </div>
                <div style={{ padding: 'var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>{isRu ? 'Телефон' : 'Telefon'}</div>
                  <strong>{data.supplier.phone || '—'}</strong>
                </div>
                <div style={{ padding: 'var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>{isRu ? 'Расчётный счёт / МФО' : 'Bank Hisob raqami / MFO'}</div>
                  <div>{data.supplier.bankAccount || '—'}</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>MFO: {data.supplier.mfo || '—'} ({data.supplier.bankName || ''})</div>
                </div>
                <div style={{ padding: 'var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>{isRu ? 'Юридический адрес' : 'Yuridik Manzil'}</div>
                  <div>{data.supplier.address || '—'}</div>
                </div>
              </div>
            )}

            {activeTab === 'receipts' && (
              <div style={{ overflowX: 'auto', maxHeight: '350px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)' }}>
                      <th style={{ padding: '8px' }}>{isRu ? '№ ДОКУМЕНТА' : 'HUJJAT №'}</th>
                      <th style={{ padding: '8px' }}>{isRu ? 'ДАТА' : 'SANA'}</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>{isRu ? 'СУММА' : 'SUMMA'}</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>{isRu ? 'СТАТУС' : 'HOLAT'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.receipts.map((r) => (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                        <td style={{ padding: '8px', fontWeight: 'var(--font-bold)', fontFamily: 'var(--font-mono)' }}>{r.docNumber}</td>
                        <td style={{ padding: '8px' }}>{formatDate(r.docDate, locale)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'var(--font-bold)' }} className="tabular-nums">
                          {formatCurrency(Number(r.totalAmount), locale)} {r.currency}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <Badge variant={r.status === 'POSTED' ? 'success' : 'neutral'}>{r.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'payments' && (
              <div style={{ overflowX: 'auto', maxHeight: '350px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)' }}>
                      <th style={{ padding: '8px' }}>{isRu ? 'ДАТА' : 'SANA'}</th>
                      <th style={{ padding: '8px' }}>{isRu ? 'СЧЁТ / касса' : 'SCHET / KASSA'}</th>
                      <th style={{ padding: '8px' }}>{isRu ? 'КОММЕНТАРИЙ' : 'IZOH'}</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>{isRu ? 'ОПЛАЧЕНО' : 'TO‘LANGAN SUMMA'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.payments.map((p) => (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                        <td style={{ padding: '8px' }}>{formatDate(p.transactionDate, locale)}</td>
                        <td style={{ padding: '8px' }}>{typeof p.account?.name === 'object' ? (p.account?.name[locale] || p.account?.name?.uz) : (p.account?.name || (isRu ? 'Касса' : 'Kassa'))}</td>
                        <td style={{ padding: '8px' }}>{p.comment || (isRu ? 'Оплата поставщику' : 'Yetkazib beruvchiga to\'lov')}</td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'var(--font-bold)', color: 'var(--color-success-600)' }} className="tabular-nums">
                          {formatCurrency(Number(p.amount), locale)} {p.currency}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'returns' && (
              <div style={{ overflowX: 'auto', maxHeight: '350px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)' }}>
                      <th style={{ padding: '8px' }}>{isRu ? '№ ВОЗВРАТА' : 'QAYTARISH №'}</th>
                      <th style={{ padding: '8px' }}>{isRu ? 'ДАТА' : 'SANA'}</th>
                      <th style={{ padding: '8px' }}>{isRu ? 'ПРИЧИНА' : 'SABABI'}</th>
                      <th style={{ padding: '8px', textAlign: 'right' }}>{isRu ? 'СУММА' : 'SUMMA'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.returns.map((ret) => (
                      <tr key={ret.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                        <td style={{ padding: '8px', fontWeight: 'var(--font-bold)', fontFamily: 'var(--font-mono)' }}>{ret.returnNumber}</td>
                        <td style={{ padding: '8px' }}>{formatDate(ret.returnDate, locale)}</td>
                        <td style={{ padding: '8px' }}>{ret.reason || '—'}</td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'var(--font-bold)', color: 'var(--color-warning-700)' }} className="tabular-nums">
                          -{formatCurrency(Number(ret.totalAmount), locale)} {ret.currency}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
