'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { RotateCcw, Building2, Package, ArrowUpRight } from 'lucide-react';
import { PurchaseReturn } from '@shared/types';

export default function ReturnsPage() {
  const { token, company } = useAuth();

  const [returns, setReturns] = useState<PurchaseReturn[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReturns = () => {
    if (!token || !company) return;
    setLoading(true);
    apiFetch<PurchaseReturn[]>('/purchases/returns', { token, tenantId: company.id })
      .then((res) => setReturns(res || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!token || !company) return;
    fetchReturns();
  }, [token, company]);

  const totalReturnedSum = returns.reduce((sum, r) => sum + Number(r.totalAmount), 0);

  const getProductName = (name: any) => {
    if (!name) return '—';
    if (typeof name === 'string') return name;
    return name.uz || name.ru || Object.values(name)[0] || '—';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            ↩️ Yetkazib Beruvchiga Tovarni Qaytarish (Purchase Returns)
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
            Yetkazib beruvchiga yuborilgan qaytarish hujjatlari, ombor qoldig&apos;i va qarzdorlikni kamaytirish tarixi
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-warning-50)', color: 'var(--color-warning-600)' }}>
            <RotateCcw size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>Jami Qaytarilgan Tovarlar Summasi</div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', color: 'var(--color-warning-700)' }} className="tabular-nums">
              {formatCurrency(totalReturnedSum, 'uz')} UZS
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
              {returns.length} ta qaytaruv operasiyasi
            </div>
          </div>
        </Card>
      </div>

      {/* Returns Table */}
      <Card>
        {loading ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            Yuklanmoqda...
          </div>
        ) : returns.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            <RotateCcw size={44} style={{ margin: '0 auto var(--space-2)', opacity: 0.4 }} />
            <div>Hozircha yetkazib beruvchiga qaytarish hujjatlari mavjud emas</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-xs)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-tertiary)' }}>
                  <th style={{ padding: '12px' }}>QAYTARISH № / SANA</th>
                  <th style={{ padding: '12px' }}>YETKAZIB BERUVCHI</th>
                  <th style={{ padding: '12px' }}>ASOSIY XARID HUJJATI</th>
                  <th style={{ padding: '12px' }}>OMBOR</th>
                  <th style={{ padding: '12px' }}>SABABI</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>SUMMA</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>HOLAT</th>
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
                        {formatDate(ret.returnDate, 'uz')}
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
                      {ret.reason || 'Sifatiga mos kelmadi'}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'var(--font-bold)', color: 'var(--color-danger-600)' }} className="tabular-nums">
                      -{formatCurrency(Number(ret.totalAmount), 'uz')} {ret.currency}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <Badge variant="warning">Qaytarilgan</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
