'use client';

import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  TrendingUp,
  TrendingDown,
  CheckCircle,
  XCircle,
  Printer,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import { SalesInvoice } from '@shared/types';

interface SalesInvoiceDetailModalProps {
  invoice: SalesInvoice;
  onClose: () => void;
  onAction: () => void;
}

const statusBadgeVariant: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  DRAFT: 'warning',
  POSTED: 'success',
  CANCELLED: 'error',
};

const paymentBadgeVariant: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  UNPAID: 'error',
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
};

export function SalesInvoiceDetailModal({
  invoice,
  onClose,
  onAction,
}: SalesInvoiceDetailModalProps) {
  const { token, company } = useAuth();
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  const grossProfit = Number(invoice.grossProfit || 0);
  const totalAmount = Number(invoice.totalAmount || 0);
  const paidAmount = Number(invoice.paidAmount || 0);
  const totalCogs = Number(invoice.totalCogs || 0);
  const margin = totalAmount > 0 ? ((grossProfit / totalAmount) * 100).toFixed(1) : '0.0';

  const handlePost = async () => {
    if (!token || !company) return;
    try {
      await apiFetch(`/sales/invoices/${invoice.id}/post`, {
        method: 'POST',
        token: token || undefined,
        tenantId: company.id,
        locale,
      });
      onAction();
    } catch (err: any) {
      alert(err?.message || (isRu ? 'Ошибка проведения' : 'Tasdiqlashda xato'));
    }
  };

  const handleUnpost = async () => {
    if (!token || !company) return;
    if (!confirm(isRu ? 'Отменить проведение документа? Остатки товаров вернутся на склад.' : 'Hujjatni bekor qilmoqchimisiz? Ombor qoldig\'i tiklanadi.')) return;
    try {
      await apiFetch(`/sales/invoices/${invoice.id}/unpost`, {
        method: 'POST',
        token: token || undefined,
        tenantId: company.id,
        locale,
      });
      onAction();
    } catch (err: any) {
      alert(err?.message || (isRu ? 'Ошибка отмены' : 'Bekor qilishda xato'));
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const counterpartyData = (invoice as any).counterparty;
  const warehouseData = (invoice as any).warehouse;
  const createdByData = (invoice as any).createdBy;
  const itemsData = (invoice as any).items || [];

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={`${isRu ? 'Продажа №' : 'Sotuv №'} ${invoice.invoiceNumber}`}
      size="xl"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        {/* Status row */}
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
          <Badge variant={statusBadgeVariant[invoice.status] || 'default'}>
            {invoice.status === 'DRAFT' ? (isRu ? 'Черновик' : 'Qoralama') : invoice.status === 'POSTED' ? (isRu ? 'Проведён' : 'Tasdiqlangan') : (isRu ? 'Отменён' : 'Bekor qilingan')}
          </Badge>
          <Badge variant={paymentBadgeVariant[invoice.paymentStatus] || 'default'}>
            {invoice.paymentStatus === 'UNPAID' ? (isRu ? 'Не оплачен' : 'To\'lanmagan') : invoice.paymentStatus === 'PARTIALLY_PAID' ? (isRu ? 'Частично оплачен' : 'Qisman to\'langan') : (isRu ? 'Оплачен' : 'To\'langan')}
          </Badge>
          {invoice.returnStatus && invoice.returnStatus !== 'NONE' && (
            <Badge variant="warning">
              {invoice.returnStatus === 'PARTIALLY_RETURNED' ? (isRu ? 'Частичный возврат' : 'Qisman qaytarilgan') : (isRu ? 'Полный возврат' : 'To\'liq qaytarilgan')}
            </Badge>
          )}
        </div>

        {/* Meta info */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--space-3)' }}>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 4 }}>{isRu ? 'Клиент' : 'Mijoz'}</div>
            <div style={{ fontWeight: 600 }}>{counterpartyData?.name || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 4 }}>{isRu ? 'Склад' : 'Ombor'}</div>
            <div style={{ fontWeight: 600 }}>
              {warehouseData
                ? typeof warehouseData.name === 'object'
                  ? (warehouseData.name[locale] || warehouseData.name.uz || '—')
                  : warehouseData.name
                : '—'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 4 }}>{isRu ? 'Дата' : 'Sana'}</div>
            <div style={{ fontWeight: 600 }}>{formatDate(invoice.invoiceDate, locale)}</div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 4 }}>{isRu ? 'Валюта' : 'Valyuta'}</div>
            <div style={{ fontWeight: 600 }}>{invoice.currency}</div>
          </div>
          {invoice.contractNumber && (
            <div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 4 }}>{isRu ? '№ Договора' : 'Shartnoma №'}</div>
              <div style={{ fontWeight: 600 }}>{invoice.contractNumber}</div>
            </div>
          )}
          {createdByData && (
            <div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 4 }}>{isRu ? 'Создатель' : 'Yaratuvchi'}</div>
              <div style={{ fontWeight: 600 }}>{createdByData.firstName} {createdByData.lastName}</div>
            </div>
          )}
        </div>

        {/* Financial summary */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 'var(--space-3)',
          background: 'var(--color-bg-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-4)',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{isRu ? 'Общая сумма' : 'Jami summa'}</div>
            <div style={{ fontWeight: 700, fontSize: 'var(--text-lg)', marginTop: 4 }}>{formatCurrency(totalAmount, locale, invoice.currency)}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{isRu ? 'Оплачено' : 'To\'langan'}</div>
            <div style={{ fontWeight: 700, fontSize: 'var(--text-lg)', marginTop: 4, color: '#10b981' }}>{formatCurrency(paidAmount, locale, invoice.currency)}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{isRu ? 'Остаток долга' : 'Qoldiq qarz'}</div>
            <div style={{ fontWeight: 700, fontSize: 'var(--text-lg)', marginTop: 4, color: '#f59e0b' }}>{formatCurrency(totalAmount - paidAmount, locale, invoice.currency)}</div>
          </div>
          {invoice.status === 'POSTED' && (
            <>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{isRu ? 'COGS (себестоимость)' : 'COGS (tannarx)'}</div>
                <div style={{ fontWeight: 700, fontSize: 'var(--text-lg)', marginTop: 4, color: 'var(--color-text-secondary)' }}>{formatCurrency(totalCogs, locale, invoice.currency)}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{isRu ? 'Валовая прибыль' : 'Yalpi foyda'}</div>
                <div style={{ fontWeight: 700, fontSize: 'var(--text-lg)', marginTop: 4, color: grossProfit >= 0 ? '#10b981' : '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  {grossProfit >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  {formatCurrency(grossProfit, locale, invoice.currency)}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 2 }}>{isRu ? 'Маржа:' : 'Marja:'} {margin}%</div>
              </div>
            </>
          )}
        </div>

        {/* Items table */}
        {itemsData.length > 0 && (
          <div>
            <h3 style={{ fontWeight: 600, marginBottom: 10, fontSize: 'var(--text-base)' }}>{isRu ? 'Товары' : 'Tovarlar'}</h3>
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--color-bg-subtle)' }}>
                    {(isRu
                      ? ['Товар', 'Кол-во', 'Цена', 'НДС%', 'Итого', ...(invoice.status === 'POSTED' ? ['Себестоимость', 'Прибыль', ''] : [])]
                      : ['Tovar', 'Miqdor', 'Narx', 'QQS%', 'Jami', ...(invoice.status === 'POSTED' ? ['Tannarx', 'Foyda', ''] : [])]
                    ).map((h) => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--color-border)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {itemsData.map((item: any, idx: number) => {
                    const productName = item.product
                      ? (typeof item.product.name === 'object' ? (item.product.name[locale] || item.product.name.uz) : item.product.name)
                      : '—';
                    const lineGrossProfit = Number(item.lineGrossProfit || 0);
                    const isBelowCost = item.isBelowCost;

                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--color-border-light)', background: isBelowCost ? 'rgba(239,68,68,0.04)' : '' }}>
                        <td style={{ padding: '10px 12px', fontSize: 'var(--text-sm)' }}>
                          {productName}
                          {isBelowCost && (
                            <span style={{ marginLeft: 6, color: '#ef4444', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                              <AlertTriangle size={10} /> {isRu ? 'Ниже себестоимости' : 'Tannarxdan past'}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 'var(--text-sm)' }}>{Number(item.quantity)}</td>
                        <td style={{ padding: '10px 12px', fontSize: 'var(--text-sm)' }}>{formatCurrency(Number(item.unitPrice), locale, invoice.currency)}</td>
                        <td style={{ padding: '10px 12px', fontSize: 'var(--text-sm)' }}>{Number(item.vatRate)}%</td>
                        <td style={{ padding: '10px 12px', fontSize: 'var(--text-sm)', fontWeight: 600 }}>{formatCurrency(Number(item.totalPrice), locale, invoice.currency)}</td>
                        {invoice.status === 'POSTED' && (
                          <>
                            <td style={{ padding: '10px 12px', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                              {formatCurrency(Number(item.lineCogs || 0), locale, invoice.currency)}
                            </td>
                            <td style={{ padding: '10px 12px', fontSize: 'var(--text-sm)', fontWeight: 600, color: lineGrossProfit >= 0 ? '#10b981' : '#ef4444' }}>
                              {formatCurrency(lineGrossProfit, locale, invoice.currency)}
                            </td>
                            <td style={{ padding: '10px 12px', fontSize: 11, color: 'var(--color-text-secondary)' }}>
                              {totalAmount > 0 ? `${((Number(item.totalPrice) / totalAmount) * 100).toFixed(1)}%` : ''}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Comment */}
        {invoice.comment && (
          <div style={{ background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            <strong>{isRu ? 'Комментарий:' : 'Izoh:'}</strong> {invoice.comment}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--color-border-light)', flexWrap: 'wrap' }}>
          <Button id="print-invoice-btn" variant="secondary" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Printer size={14} /> {isRu ? 'Печать' : 'Chop etish'}
          </Button>

          {invoice.status === 'DRAFT' && (
            <Button
              id="post-from-detail-btn"
              onClick={handlePost}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                backgroundColor: 'var(--color-success-50)',
                color: 'var(--color-success-600)',
                border: '1px solid var(--color-success-100)',
              }}
            >
              <CheckCircle size={14} /> {isRu ? 'Провести' : 'Tasdiqlash'}
            </Button>
          )}

          {invoice.status === 'POSTED' && invoice.paymentStatus === 'UNPAID' && (
            <Button
              id="unpost-from-detail-btn"
              variant="secondary"
              onClick={handleUnpost}
              style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#f59e0b' }}
            >
              <XCircle size={14} /> {isRu ? 'Отменить проведение' : 'Tasdiqlashni bekor qilish'}
            </Button>
          )}

          <Button id="close-detail-btn" variant="secondary" onClick={onClose}>
            {isRu ? 'Закрыть' : 'Yopish'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
