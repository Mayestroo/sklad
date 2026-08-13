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
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 'var(--space-4)',
              }}
            >
              <div
                style={{
                  padding: 'var(--space-4)',
                  backgroundColor: 'var(--color-bg-tertiary)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>
                  {isRu ? 'Общая сумма закупок' : 'Jami Xaridlar Summasi'}
                </div>
                <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }} className="tabular-nums">
                  {formatCurrency(data.metrics.totalPurchased, locale)}
                </div>
              </div>

              <div
                style={{
                  padding: 'var(--space-4)',
                  backgroundColor: 'var(--color-bg-tertiary)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>
                  {isRu ? 'Оплаченная сумма' : 'To\'langan Summa'}
                </div>
                <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-success-600)' }} className="tabular-nums">
                  {formatCurrency(data.metrics.totalPaid, locale)}
                </div>
              </div>

              <div
                style={{
                  padding: 'var(--space-4)',
                  backgroundColor: 'var(--color-bg-tertiary)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>
                  {isRu ? 'Наш долг' : 'Bizning Qarzimiz'}
                </div>
                <div
                  style={{
                    fontSize: 'var(--text-xl)',
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
            <div style={{ display: 'flex', gap: 'var(--space-1)', borderBottom: '1px solid var(--color-border)', overflowX: 'auto', paddingBottom: '1px' }}>
              <button
                type="button"
                onClick={() => setActiveTab('info')}
                style={{
                  padding: '10px 18px',
                  fontWeight: activeTab === 'info' ? 'var(--font-bold)' : 'var(--font-medium)',
                  color: activeTab === 'info' ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
                  borderTop: 'none',
                  borderLeft: 'none',
                  borderRight: 'none',
                  borderBottom: activeTab === 'info' ? '2px solid var(--color-primary-600)' : '2px solid transparent',
                  background: 'none',
                  cursor: 'pointer',
                  fontSize: 'var(--text-sm)',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                }}
              >
                {isRu ? 'Реквизиты и договоры' : 'Rekvizitlar & Shartnomalar'}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('receipts')}
                style={{
                  padding: '10px 18px',
                  fontWeight: activeTab === 'receipts' ? 'var(--font-bold)' : 'var(--font-medium)',
                  color: activeTab === 'receipts' ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
                  borderTop: 'none',
                  borderLeft: 'none',
                  borderRight: 'none',
                  borderBottom: activeTab === 'receipts' ? '2px solid var(--color-primary-600)' : '2px solid transparent',
                  background: 'none',
                  cursor: 'pointer',
                  fontSize: 'var(--text-sm)',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                }}
              >
                {isRu ? 'История закупок' : 'Xaridlar Tarixi'} ({data.receipts.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('payments')}
                style={{
                  padding: '10px 18px',
                  fontWeight: activeTab === 'payments' ? 'var(--font-bold)' : 'var(--font-medium)',
                  color: activeTab === 'payments' ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
                  borderTop: 'none',
                  borderLeft: 'none',
                  borderRight: 'none',
                  borderBottom: activeTab === 'payments' ? '2px solid var(--color-primary-600)' : '2px solid transparent',
                  background: 'none',
                  cursor: 'pointer',
                  fontSize: 'var(--text-sm)',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                }}
              >
                {isRu ? 'История платежей' : 'To\'lovlar Tarixi'} ({data.payments.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('returns')}
                style={{
                  padding: '10px 18px',
                  fontWeight: activeTab === 'returns' ? 'var(--font-bold)' : 'var(--font-medium)',
                  color: activeTab === 'returns' ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
                  borderTop: 'none',
                  borderLeft: 'none',
                  borderRight: 'none',
                  borderBottom: activeTab === 'returns' ? '2px solid var(--color-primary-600)' : '2px solid transparent',
                  background: 'none',
                  cursor: 'pointer',
                  fontSize: 'var(--text-sm)',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                }}
              >
                {isRu ? 'Возвраты' : 'Qaytarishlar'} ({data.returns.length})
              </button>
            </div>

            {/* Tab Contents */}
            {activeTab === 'info' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
                <div style={{ padding: 'var(--space-4)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--color-bg-tertiary)' }}>
                  <div style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)', marginBottom: '4px' }}>ИНН / STIR</div>
                  <strong style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-primary)' }}>{data.supplier.inn || '—'}</strong>
                </div>
                <div style={{ padding: 'var(--space-4)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--color-bg-tertiary)' }}>
                  <div style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)', marginBottom: '4px' }}>{isRu ? 'Телефон' : 'Telefon'}</div>
                  <strong style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-primary)' }}>{data.supplier.phone || '—'}</strong>
                </div>
                <div style={{ padding: 'var(--space-4)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--color-bg-tertiary)' }}>
                  <div style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)', marginBottom: '4px' }}>{isRu ? 'Расчётный счёт / МФО' : 'Bank Hisob raqami / MFO'}</div>
                  <strong style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-primary)', display: 'block' }}>{data.supplier.bankAccount || '—'}</strong>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>MFO: {data.supplier.mfo || '—'} {data.supplier.bankName ? `(${data.supplier.bankName})` : ''}</div>
                </div>
                <div style={{ padding: 'var(--space-4)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--color-bg-tertiary)' }}>
                  <div style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)', marginBottom: '4px' }}>{isRu ? 'Юридический адрес' : 'Yuridik Manzil'}</div>
                  <strong style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-primary)' }}>{data.supplier.address || '—'}</strong>
                </div>
              </div>
            )}

            {activeTab === 'receipts' && (
              <div style={{ overflowX: 'auto', maxHeight: '400px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                {data.receipts.length === 0 ? (
                  <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
                    {isRu ? 'Закупки отсутствуют' : 'Xaridlar tarixi mavjud emas'}
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                        <th style={{ padding: '10px 14px' }}>{isRu ? '№ ДОКУМЕНТА' : 'HUJJAT №'}</th>
                        <th style={{ padding: '10px 14px' }}>{isRu ? 'ДАТА' : 'SANA'}</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>{isRu ? 'СУММА' : 'SUMMA'}</th>
                        <th style={{ padding: '10px 14px', textAlign: 'center' }}>{isRu ? 'СТАТУС' : 'HOLAT'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.receipts.map((r) => (
                        <tr key={r.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                          <td style={{ padding: '10px 14px', fontWeight: 'var(--font-bold)', fontFamily: 'var(--font-mono)' }}>{r.docNumber}</td>
                          <td style={{ padding: '10px 14px' }}>{formatDate(r.docDate, locale)}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 'var(--font-bold)' }} className="tabular-nums">
                            {formatCurrency(Number(r.totalAmount), locale)} {r.currency}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                            <Badge variant={r.status === 'POSTED' ? 'success' : 'neutral'}>{r.status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {activeTab === 'payments' && (
              <div style={{ overflowX: 'auto', maxHeight: '400px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                {data.payments.length === 0 ? (
                  <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
                    {isRu ? 'Платежи отсутствуют' : 'To\'lovlar tarixi mavjud emas'}
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                        <th style={{ padding: '10px 14px' }}>{isRu ? 'ДАТА' : 'SANA'}</th>
                        <th style={{ padding: '10px 14px' }}>{isRu ? 'СЧЁТ / касса' : 'SCHET / KASSA'}</th>
                        <th style={{ padding: '10px 14px' }}>{isRu ? 'КОММЕНТАРИЙ' : 'IZOH'}</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>{isRu ? 'ОПЛАЧЕНО' : 'TO‘LANGAN SUMMA'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.payments.map((p) => (
                        <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                          <td style={{ padding: '10px 14px' }}>{formatDate(p.transactionDate, locale)}</td>
                          <td style={{ padding: '10px 14px' }}>{typeof p.account?.name === 'object' ? (p.account?.name[locale] || p.account?.name?.uz) : (p.account?.name || (isRu ? 'Касса' : 'Kassa'))}</td>
                          <td style={{ padding: '10px 14px' }}>{p.comment || (isRu ? 'Оплата поставщику' : 'Yetkazib beruvchiga to\'lov')}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 'var(--font-bold)', color: 'var(--color-success-600)' }} className="tabular-nums">
                            {formatCurrency(Number(p.amount), locale)} {p.currency}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {activeTab === 'returns' && (
              <div style={{ overflowX: 'auto', maxHeight: '400px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                {data.returns.length === 0 ? (
                  <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
                    {isRu ? 'Возвраты отсутствуют' : 'Qaytarishlar mavjud emas'}
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                        <th style={{ padding: '10px 14px' }}>{isRu ? '№ ВОЗВРАТА' : 'QAYTARISH №'}</th>
                        <th style={{ padding: '10px 14px' }}>{isRu ? 'ДАТА' : 'SANA'}</th>
                        <th style={{ padding: '10px 14px' }}>{isRu ? 'ПРИЧИНА' : 'SABABI'}</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>{isRu ? 'СУММА' : 'SUMMA'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.returns.map((ret) => (
                        <tr key={ret.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                          <td style={{ padding: '10px 14px', fontWeight: 'var(--font-bold)', fontFamily: 'var(--font-mono)' }}>{ret.returnNumber}</td>
                          <td style={{ padding: '10px 14px' }}>{formatDate(ret.returnDate, locale)}</td>
                          <td style={{ padding: '10px 14px' }}>{ret.reason || '—'}</td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 'var(--font-bold)', color: 'var(--color-warning-700)' }} className="tabular-nums">
                            -{formatCurrency(Number(ret.totalAmount), locale)} {ret.currency}
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
