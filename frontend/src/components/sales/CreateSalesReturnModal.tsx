'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { DatePicker } from '@/components/ui/DatePicker';
import { formatCurrency } from '@/lib/utils';
import { SalesInvoice } from '@shared/types';
import { RotateCcw, AlertCircle } from 'lucide-react';

interface CreateSalesReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: SalesInvoice | null;
  onSuccess: () => void;
}

export function CreateSalesReturnModal({
  isOpen,
  onClose,
  invoice,
  onSuccess,
}: CreateSalesReturnModalProps) {
  const { token, company } = useAuth();
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('');
  const [returnItems, setReturnItems] = useState<{
    productId: string;
    name: string;
    maxQty: number;
    returnQty: number;
    unitPrice: number;
  }[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const getProductName = (name: any) => {
    if (!name) return '—';
    if (typeof name === 'string') return name;
    return name[locale] || name.ru || name.uz || Object.values(name)[0] || '—';
  };

  const REASON_PRESETS = isRu
    ? ['Возврат покупателя (не подошел)', 'Брак / дефект товара', 'Ошибка в заказе', 'Повреждение при доставке', 'Другое']
    : ['Mijoz qaytardi (mos kelmadi)', 'Brak / nuqsonli tovar', 'Buyurtmadagi xatolik', 'Yetkazib berishda shikastlangan', 'Boshqa'];

  useEffect(() => {
    if (invoice && invoice.items) {
      setReturnItems(
        invoice.items.map((i: any) => {
          const maxQty = Number(i.quantity);
          return {
            productId: i.productId,
            name: getProductName(i.product?.name || i.name),
            maxQty,
            returnQty: 0,
            unitPrice: Number(i.unitPrice),
          };
        })
      );
    }
  }, [invoice, locale]);

  if (!invoice) return null;

  const handleQtyChange = (index: number, qty: number) => {
    setReturnItems((prev) => {
      const updated = [...prev];
      const max = updated[index].maxQty;
      updated[index].returnQty = Math.max(0, Math.min(max, qty));
      return updated;
    });
  };

  const calculateReturnTotal = () => {
    return returnItems.reduce((sum, item) => sum + item.returnQty * item.unitPrice, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const itemsToReturn = returnItems
      .filter((i) => i.returnQty > 0)
      .map((i) => ({
        productId: i.productId,
        quantity: i.returnQty,
        unitPrice: i.unitPrice,
      }));

    if (itemsToReturn.length === 0) {
      setError(isRu ? 'Укажите количество для возврата хотя бы для одного товара' : 'Kamida bitta tovar qaytarish miqdorini kiriting');
      return;
    }

    setLoading(true);

    try {
      await apiFetch('/sales/returns', {
        method: 'POST',
        token: token || undefined,
        tenantId: company?.id,
        locale,
        body: JSON.stringify({
          invoiceId: invoice.id,
          counterpartyId: invoice.counterpartyId,
          warehouseId: invoice.warehouseId,
          returnDate,
          currency: invoice.currency,
          reason: reason.trim() || undefined,
          items: itemsToReturn,
        }),
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || (isRu ? 'Ошибка при оформлении возврата' : 'Qaytaruvni rasmiylashtirishda xatolik yuz berdi'));
    } finally {
      setLoading(false);
    }
  };

  const returnTotal = calculateReturnTotal();

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={isRu ? `Возврат товара от покупателя — ${invoice.invoiceNumber || (invoice as any).docNumber || ''}` : `Mijozdan tovar qaytarish — ${invoice.invoiceNumber || (invoice as any).docNumber || ''}`}
      description={isRu ? 'Оформление возврата по счет-фактуре' : 'Sotuv hujjati bo\'yicha tovar qaytarish'}
      icon={<RotateCcw size={20} />}
      size="lg"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {error && (
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius-md)',
              color: '#ef4444',
              fontSize: 'var(--text-sm)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
              {isRu ? 'Дата возврата' : 'Qaytarish sanasi'}
            </label>
            <DatePicker value={returnDate} onChange={(val) => setReturnDate(val)} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
              {isRu ? 'Причина возврата' : 'Qaytarish sababi'}
            </label>
            <Input
              placeholder={isRu ? 'Укажите причину...' : 'Sababni yozing...'}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        {/* Reason presets */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {REASON_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setReason(preset)}
              style={{
                fontSize: '11px',
                padding: '3px 8px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: reason === preset ? 'var(--color-primary-100)' : 'var(--color-bg-subtle)',
                color: reason === preset ? 'var(--color-primary-700)' : 'var(--color-text-secondary)',
                border: '1px solid var(--color-border)',
                cursor: 'pointer',
              }}
            >
              {preset}
            </button>
          ))}
        </div>

        {/* Return Items Table */}
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-subtle)' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                  {isRu ? 'ТОВАР' : 'TOVAR'}
                </th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                  {isRu ? 'ПРОДАНО' : 'SOTILGAN'}
                </th>
                <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', width: '130px' }}>
                  {isRu ? 'ВОЗВРАТ КОЛ-ВО' : 'QAYTARISH'}
                </th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                  {isRu ? 'ЦЕНА' : 'NARX'}
                </th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                  {isRu ? 'СУММА' : 'SUMMA'}
                </th>
              </tr>
            </thead>
            <tbody>
              {returnItems.map((item, index) => {
                const lineTotal = item.returnQty * item.unitPrice;
                return (
                  <tr key={item.productId} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 500 }}>{item.name}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--color-text-secondary)' }}>
                      {item.maxQty}
                    </td>
                    <td style={{ padding: '6px 12px', textAlign: 'center' }}>
                      <Input
                        type="number"
                        min={0}
                        max={item.maxQty}
                        step="any"
                        value={item.returnQty || ''}
                        onChange={(e) => handleQtyChange(index, parseFloat(e.target.value) || 0)}
                        style={{ textAlign: 'center', height: '32px', padding: '0 8px' }}
                      />
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }} className="tabular-nums">
                      {formatCurrency(item.unitPrice, locale, invoice.currency)}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }} className="tabular-nums">
                      {formatCurrency(lineTotal, locale, invoice.currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Total Banner */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            backgroundColor: 'var(--color-bg-subtle)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
          }}
        >
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
            {isRu ? 'Итоговая сумма возврата:' : 'Jami qaytariladigan summa:'}
          </span>
          <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: '#f59e0b' }} className="tabular-nums">
            {formatCurrency(returnTotal, locale, invoice.currency)}
          </span>
        </div>

        {/* Required fields indicator */}
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 'var(--text-xs)', color: '#ef4444', fontWeight: 600, paddingTop: '4px' }}>
          <span>* {isRu ? 'поля, обязательные для заполнения' : 'bilan belgilangan maydonlar to‘ldirilishi majburiy'}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', borderTop: '1px solid var(--color-border-light)', paddingTop: 'var(--space-3)' }}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            {isRu ? 'Отмена' : 'Bekor qilish'}
          </Button>
          <Button type="submit" disabled={loading || returnTotal <= 0} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <RotateCcw size={16} />
            {loading ? (isRu ? 'Оформление...' : 'Rasmiylashtirilmoqda...') : (isRu ? 'Оформить возврат' : 'Qaytaruvni rasmiylashtirish')}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}
