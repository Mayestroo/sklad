'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Truck, Plus, FileText, Building2 } from 'lucide-react';
import { PurchaseOrder } from '@shared/types';

export default function PurchasesPage() {
  const tCommon = useTranslations('common');
  const locale = useLocale() as 'uz' | 'ru';
  const { token, company } = useAuth();

  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !company) return;
    setLoading(true);
    apiFetch<PurchaseOrder[]>('/sales/purchases', { token, tenantId: company.id, locale })
      .then(setPurchases)
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [token, company]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            Xaridlar va Yetkazib Beruvchilar Shartnomalari
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
            Yetkazib beruvchilardan tovarlarni omborga qabul qilish va to&apos;lovlar hisobi
          </p>
        </div>
      </div>

      <Card>
        {loading ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            {tCommon('loading')}
          </div>
        ) : purchases.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            <Truck size={40} style={{ margin: '0 auto var(--space-2)', opacity: 0.4 }} />
            <div>Xarid buyurtmalari mavjud emas</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>
                  <th style={{ padding: '12px' }}>BUYURTMA №</th>
                  <th style={{ padding: '12px' }}>YETKAZIB BERUVCHI</th>
                  <th style={{ padding: '12px' }}>SANA</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>UMUMIY SUMMA</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>HOLAT</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                    <td style={{ padding: '12px', fontWeight: 'var(--font-semibold)', fontFamily: 'var(--font-mono)' }}>{p.orderNumber}</td>
                    <td style={{ padding: '12px' }}>{p.counterparty?.name || '—'}</td>
                    <td style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>{formatDate(p.orderDate, locale)}</td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'var(--font-bold)' }} className="tabular-nums">
                      {formatCurrency(Number(p.totalAmount), locale)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}><Badge variant="success">Qabul qilingan</Badge></td>
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
