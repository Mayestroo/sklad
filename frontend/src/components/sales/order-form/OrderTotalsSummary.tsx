'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { FileText } from 'lucide-react';

export interface OrderCalculations {
  grandTotal: number;
  paid: number;
  remaining: number;
  minRequired: number;
  minNeededForDispatch: number;
}

export interface OrderTotalsSummaryProps {
  locale: 'uz' | 'ru';
  currency: string;
  calculations: OrderCalculations;
  paymentCondition: 'PREPAID_100' | 'PARTIAL' | 'CREDIT';
  requiredPaymentPercent: number;
  salesInvoices?: any[];
}

export function OrderTotalsSummary({
  locale,
  currency,
  calculations,
  paymentCondition,
  requiredPaymentPercent,
  salesInvoices,
}: OrderTotalsSummaryProps) {
  const isRu = locale === 'ru';

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', fontSize: 'var(--text-xs)', color: '#ef4444', fontWeight: 600, padding: 'var(--space-2) 0' }}>
        <span>* {isRu ? 'поля, обязательные для заполнения' : 'bilan belgilangan maydonlar to‘ldirilishi majburiy'}</span>
      </div>

      <Card style={{ padding: 'var(--space-6)', width: '100%', maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }} aria-live="polite">
        <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)', borderBottom: '1px solid var(--color-border-light)', paddingBottom: 'var(--space-2)' }}>
          {isRu ? 'Финансовый итог' : 'Buyurtma Hisobi'}
        </h3>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          <span>{isRu ? 'Сумма заказа:' : 'Buyurtma summasi:'}</span>
          <span className="tabular-nums font-medium">{formatCurrency(calculations.grandTotal, locale, currency)}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', color: '#10b981' }}>
          <span>{isRu ? 'Оплачено (Аванс):' : 'To‘langan (Avans):'}</span>
          <span className="tabular-nums font-medium">{formatCurrency(calculations.paid, locale, currency)}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-3)', marginTop: 'var(--space-1)' }}>
          <span>{isRu ? 'ОСТАТОК К ОПЛАТЕ:' : 'QOLDIQ TO‘LOV:'}</span>
          <span className="tabular-nums" style={{ color: calculations.remaining > 0 ? '#ef4444' : '#10b981' }}>
            {formatCurrency(calculations.remaining, locale, currency)}
          </span>
        </div>

        {/* Dispatch Gate Widget */}
        <div style={{ padding: '12px', backgroundColor: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginTop: 'var(--space-2)' }}>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
            {isRu ? 'Условие отгрузки (Dispatch Gate)' : 'Jo‘natish talabi (Dispatch Gate)'}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-primary)' }}>
            {paymentCondition === 'PREPAID_100' && (isRu ? 'Требуется 100% оплата' : '100% to‘lov talab qilinadi')}
            {paymentCondition === 'PARTIAL' && (isRu ? `Требуется минимум ${requiredPaymentPercent}% (${formatCurrency(calculations.minRequired, locale, currency)})` : `Min. ${requiredPaymentPercent}% to‘lov talab qilinadi (${formatCurrency(calculations.minRequired, locale, currency)})`)}
            {paymentCondition === 'CREDIT' && (isRu ? 'Кредит / Nasiya (Отгрузка без предоплаты)' : 'Nasiya / Kredit (Avanssiz jo‘natish ruxsat etilgan)')}
          </div>

          {calculations.minNeededForDispatch > 0 && paymentCondition !== 'CREDIT' ? (
            <div style={{ fontSize: '11px', color: '#ef4444', marginTop: 4, fontWeight: 600 }}>
              {isRu ? `Необходимо оплатить еще: ${formatCurrency(calculations.minNeededForDispatch, locale, currency)}` : `Jo‘natish uchun yana to‘lanishi kerak: ${formatCurrency(calculations.minNeededForDispatch, locale, currency)}`}
            </div>
          ) : (
            <div style={{ fontSize: '11px', color: '#10b981', marginTop: 4, fontWeight: 600 }}>
              {isRu ? 'Условие для отгрузки выполнено' : 'Jo‘natish sharti bajarilgan'}
            </div>
          )}
        </div>

        {/* Linked Dispatches / Sales Invoices */}
        {salesInvoices && salesInvoices.length > 0 && (
          <div style={{ padding: '12px', backgroundColor: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginTop: 'var(--space-3)' }}>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FileText size={14} />
              {isRu ? 'Накладные отгрузки' : 'Chiqim fakturalari'} ({salesInvoices.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {salesInvoices.map((inv: any) => (
                <div
                  key={inv.id}
                  style={{
                    padding: '8px 10px',
                    backgroundColor: 'var(--color-bg-primary)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border-light)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: 'var(--text-xs)',
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{inv.invoiceNumber}</span>
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: '11px' }}>
                      {formatDate(inv.createdAt, locale)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 600 }} className="tabular-nums">
                      {formatCurrency(Number(inv.totalAmount), locale, currency)}
                    </div>
                    <Badge variant="success">
                      {inv.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
