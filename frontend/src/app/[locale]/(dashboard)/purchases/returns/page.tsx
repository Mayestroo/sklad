'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { RotateCcw, Building2, Package, ArrowUpRight } from 'lucide-react';
import { PurchaseReturn } from '@shared/types';

export default function ReturnsPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token, company } = useAuth();

  const [returns, setReturns] = useState<PurchaseReturn[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReturns = () => {
    if (!token || !company) return;
    setLoading(true);
    apiFetch<PurchaseReturn[]>('/purchases/returns', { token, tenantId: company.id, locale })
      .then((res) => setReturns(res || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!token || !company) return;
    fetchReturns();
  }, [token, company, locale]);

  const totalReturnedSum = returns.reduce((sum, r) => sum + Number(r.totalAmount), 0);

  const getProductName = (name: any) => {
    if (!name) return '—';
    if (typeof name === 'string') return name;
    return name[locale] || name.ru || name.uz || Object.values(name)[0] || '—';
  };

  const [activeTab, setActiveTab] = useState<'LIST' | 'ANALYTICS'>('LIST');

  const handleExportCsv = () => {
    if (returns.length === 0) return;
    const headers = [
      isRu ? 'Номер' : 'Raqami',
      isRu ? 'Дата' : 'Sana',
      isRu ? 'Поставщик' : 'Yetkazib beruvchi',
      isRu ? 'Документ закупки' : 'Xarid hujjati',
      isRu ? 'Склад' : 'Ombor',
      isRu ? 'Причина' : 'Sababi',
      isRu ? 'Сумма' : 'Summa',
      isRu ? 'Статус' : 'Status',
    ];

    const rows = returns.map((r) => [
      r.returnNumber,
      formatDate(r.returnDate, locale),
      `"${r.counterparty?.name || ''}"`,
      r.receipt?.docNumber || '',
      `"${getProductName(r.warehouse?.name)}"`,
      `"${r.reason || ''}"`,
      Number(r.totalAmount),
      r.status,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `purchase_returns_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Group returns by reason for analytics
  const reasonBreakdown: Record<string, number> = {};
  returns.forEach((r) => {
    const key = r.reason || (isRu ? 'Другое / Не указано' : 'Boshqa / Ko\'rsatilmadi');
    reasonBreakdown[key] = (reasonBreakdown[key] || 0) + Number(r.totalAmount);
  });

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return <Badge variant="neutral">{isRu ? 'Черновик' : 'Qoralama'}</Badge>;
      case 'UNDER_REVIEW':
        return <Badge variant="warning">{isRu ? 'На проверке' : 'Tekshiruvda'}</Badge>;
      case 'POSTED':
        return <Badge variant="success">{isRu ? 'Проведено' : 'Tasdiqlangan'}</Badge>;
      case 'CANCELLED':
        return <Badge variant="error">{isRu ? 'Отменено' : 'Bekor qilingan'}</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            {isRu ? 'Возврат Товаров Поставщику (Purchase Returns)' : 'Yetkazib Beruvchiga Tovarni Qaytarish (Purchase Returns)'}
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
            {isRu ? 'Документы возврата поставщику, история списания остатков и уменьшения задолженности' : 'Yetkazib beruvchiga yuborilgan qaytarish hujjatlari, ombor qoldig‘i va qarzdorlikni kamaytirish tarixi'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button
            onClick={() => setActiveTab('LIST')}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-md)',
              fontWeight: 'var(--font-semibold)',
              fontSize: 'var(--text-xs)',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: activeTab === 'LIST' ? 'var(--color-primary-600)' : 'var(--color-bg-secondary)',
              color: activeTab === 'LIST' ? '#fff' : 'var(--color-text-secondary)',
            }}
          >
            {isRu ? 'Список возвратов' : 'Qaytarishlar Ro\'yxati'}
          </button>
          <button
            onClick={() => setActiveTab('ANALYTICS')}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-md)',
              fontWeight: 'var(--font-semibold)',
              fontSize: 'var(--text-xs)',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: activeTab === 'ANALYTICS' ? 'var(--color-primary-600)' : 'var(--color-bg-secondary)',
              color: activeTab === 'ANALYTICS' ? '#fff' : 'var(--color-text-secondary)',
            }}
          >
            {isRu ? 'Аналитика и отчёт' : 'Tahlil va Hisobot'}
          </button>
          <button
            onClick={handleExportCsv}
            disabled={returns.length === 0}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-md)',
              fontWeight: 'var(--font-semibold)',
              fontSize: 'var(--text-xs)',
              border: '1px solid var(--color-border)',
              cursor: returns.length === 0 ? 'not-allowed' : 'pointer',
              backgroundColor: 'var(--color-bg-surface)',
              color: 'var(--color-text-primary)',
            }}
          >
            {isRu ? 'Экспорт в Excel (CSV)' : 'Excel (CSV) Eksport'}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-warning-50)', color: 'var(--color-warning-600)' }}>
            <RotateCcw size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Общая сумма возвратов' : 'Jami Qaytarilgan Tovarlar Summasi'}</div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', color: 'var(--color-warning-700)' }} className="tabular-nums">
              {formatCurrency(totalReturnedSum, locale)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
              {returns.length} {isRu ? 'операций возврата' : 'ta qaytaruv operasiyasi'}
            </div>
          </div>
        </Card>
      </div>

      {activeTab === 'ANALYTICS' ? (
        <Card style={{ padding: 'var(--space-6)' }}>
          <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-4)' }}>
            {isRu ? 'Аналитика причин возврата товара' : 'Tovar Qaytarilish Sabablari Tahlili'}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
            {Object.entries(reasonBreakdown).map(([reasonName, sum]) => {
              const percentage = totalReturnedSum > 0 ? ((sum / totalReturnedSum) * 100).toFixed(1) : '0';
              return (
                <div
                  key={reasonName}
                  style={{
                    padding: 'var(--space-4)',
                    border: '1px solid var(--color-border-light)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-bg-secondary)',
                  }}
                >
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-medium)' }}>{reasonName}</div>
                  <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', color: 'var(--color-warning-700)', marginTop: '4px' }}>
                    {formatCurrency(sum, locale)} ({percentage}%)
                  </div>
                  <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--color-border)', borderRadius: '3px', marginTop: '8px', overflow: 'hidden' }}>
                    <div style={{ width: `${percentage}%`, height: '100%', backgroundColor: 'var(--color-warning-500)' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        /* Returns Table */
        <Card>
          {loading ? (
            <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
              {isRu ? 'Загрузка...' : 'Yuklanmoqda...'}
            </div>
          ) : returns.length === 0 ? (
            <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
              <RotateCcw size={44} style={{ margin: '0 auto var(--space-2)', opacity: 0.4 }} />
              <div>{isRu ? 'Документы возврата отсутствуют' : 'Hozircha yetkazib beruvchiga qaytarish hujjatlari mavjud emas'}</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-xs)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-tertiary)' }}>
                    <th style={{ padding: '12px' }}>{isRu ? '№ ВОЗВРАТА / ДАТА' : 'QAYTARISH № / SANA'}</th>
                    <th style={{ padding: '12px' }}>{isRu ? 'ПОСТАВЩИК' : 'YETKAZIB BERUVCHI'}</th>
                    <th style={{ padding: '12px' }}>{isRu ? 'ОСНОВНОЙ ДОКУМЕНТ' : 'ASOSIY XARID HUJJATI'}</th>
                    <th style={{ padding: '12px' }}>{isRu ? 'СКЛАД' : 'OMBOR'}</th>
                    <th style={{ padding: '12px' }}>{isRu ? 'ПРИЧИНА' : 'SABABI'}</th>
                    <th style={{ padding: '12px', textAlign: 'right' }}>{isRu ? 'СУММА' : 'SUMMA'}</th>
                    <th style={{ padding: '12px', textAlign: 'center' }}>{isRu ? 'СТАТУС' : 'HOLAT'}</th>
                    <th style={{ padding: '12px', textAlign: 'center' }}>{isRu ? 'ДЕЙСТВИЯ' : 'HARAKATLAR'}</th>
                  </tr>
                </thead>
                <tbody>
                  {returns.map((ret) => (
                    <tr key={ret.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                      <td style={{ padding: '12px' }}>
                        <div style={{ fontWeight: 'var(--font-bold)', fontFamily: 'var(--font-mono)', color: 'var(--color-warning-700)' }}>
                          {ret.returnNumber}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                          {formatDate(ret.returnDate, locale)}
                        </div>
                      </td>
                      <td style={{ padding: '12px', fontWeight: 'var(--font-medium)' }}>
                        {ret.counterparty?.name || '—'}
                      </td>
                      <td style={{ padding: '12px', fontFamily: 'var(--font-mono)' }}>
                        {ret.receipt ? ret.receipt.docNumber : '—'}
                      </td>
                      <td style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>
                        {getProductName(ret.warehouse?.name)}
                      </td>
                      <td style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>
                        {ret.reason || (isRu ? 'Ненадлежащее качество' : 'Sifatiga mos kelmadi')}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'var(--font-bold)', color: 'var(--color-danger-600)' }} className="tabular-nums">
                        -{formatCurrency(Number(ret.totalAmount), locale, ret.currency)}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        {renderStatusBadge(ret.status)}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        {ret.status === 'POSTED' && (
                          <a
                            href={`/${locale}/finance?supplierId=${ret.counterpartyId}&refundAmount=${ret.totalAmount}`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 8px',
                              borderRadius: 'var(--radius-sm)',
                              backgroundColor: 'var(--color-success-50)',
                              color: 'var(--color-success-700)',
                              fontSize: '11px',
                              fontWeight: 'var(--font-semibold)',
                              textDecoration: 'none',
                            }}
                          >
                            {isRu ? 'Pul qaytdi (Moliya)' : 'Pul qaytdi (Moliya)'} <ArrowUpRight size={12} />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
