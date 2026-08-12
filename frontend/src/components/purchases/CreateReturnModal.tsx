'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { DatePicker } from '@/components/ui/DatePicker';
import { PurchaseReceipt } from '@shared/types';
import { formatCurrency } from '@/lib/utils';

interface CreateReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  receipt: PurchaseReceipt | null;
  onSuccess: () => void;
}

export function CreateReturnModal({
  isOpen,
  onClose,
  receipt,
  onSuccess,
}: CreateReturnModalProps) {
  const { token, company } = useAuth();
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('');
  const [returnItems, setReturnItems] = useState<{ productId: string; name: string; maxQty: number; returnQty: number; unitPrice: number }[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const getProductName = (name: any) => {
    if (!name) return '—';
    if (typeof name === 'string') return name;
    return name[locale] || name.ru || name.uz || Object.values(name)[0] || '—';
  };

  useEffect(() => {
    if (receipt && receipt.items) {
      setReturnItems(
        receipt.items.map((i) => ({
          productId: i.productId,
          name: getProductName(i.product?.name),
          maxQty: Number(i.quantity),
          returnQty: 0,
          unitPrice: Number(i.unitPrice),
        }))
      );
    }
  }, [receipt, locale]);

  if (!receipt) return null;

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

  const handleSubmit = async () => {
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
      await apiFetch('/purchases/returns', {
        token: token || undefined,
        tenantId: company?.id || undefined,
        locale,
        method: 'POST',
        body: JSON.stringify({
          receiptId: receipt.id,
          counterpartyId: receipt.counterpartyId,
          warehouseId: receipt.warehouseId,
          returnDate: returnDate || undefined,
          currency: receipt.currency,
          reason: reason || undefined,
          items: itemsToReturn,
        }),
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || (isRu ? 'Ошибка при оформлении возврата' : 'Qaytarishni rasmiylashtirishda xatolik'));
    } finally {
      setLoading(false);
    }
  };

  const returnTotal = calculateReturnTotal();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${isRu ? 'Возврат товара поставщику: Документ №' : 'Yetkazib Beruvchiga Tovarni Qaytarish:'} ${receipt.docNumber}`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: '650px', width: '100%' }}>
        {error && (
          <div
            style={{
              padding: 'var(--space-3)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-danger-50)',
              color: 'var(--color-danger-700)',
              fontSize: 'var(--text-sm)',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ padding: 'var(--space-3)', backgroundColor: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)' }}>
          <div><strong>{isRu ? 'Поставщик:' : 'Yetkazib beruvchi:'}</strong> {receipt.counterparty?.name}</div>
          <div><strong>{isRu ? 'Склад:' : 'Ombor:'}</strong> {getProductName(receipt.warehouse?.name)}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 'var(--space-3)' }}>
          <DatePicker
            label={isRu ? 'Дата возврата *' : 'Qaytarish Sanasi *'}
            value={returnDate}
            onChange={(val) => setReturnDate(val)}
          />
          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px', display: 'block' }}>
              {isRu ? 'Причина возврата' : 'Qaytarish Sababi'}
            </label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={isRu ? 'Например: Брак, дефект или нарушение договора' : 'Masalan: Brak, Yaroqsiz tovar yoki shartnoma buzilishi'} />
          </div>
        </div>

        <div>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: 'var(--space-2)', display: 'block' }}>
            {isRu ? 'Возвращаемое количество' : 'Qaytariladigan Miqdorlar'}
          </label>
          <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '8px', textAlign: 'left' }}>{isRu ? 'ТОВАР' : 'TOVAR'}</th>
                  <th style={{ padding: '8px', textAlign: 'right', width: '100px' }}>{isRu ? 'ПРИНЯТО' : 'QABUL MIQDORI'}</th>
                  <th style={{ padding: '8px', textAlign: 'right', width: '110px' }}>{isRu ? 'ВОЗВРАТ' : 'QAYTARISH MIQDORI'}</th>
                  <th style={{ padding: '8px', textAlign: 'right', width: '120px' }}>{isRu ? 'ЦЕНА ЗАКУПКИ' : 'XARID NARXI'}</th>
                  <th style={{ padding: '8px', textAlign: 'right', width: '130px' }}>{isRu ? 'СУММА' : 'SUMMA'}</th>
                </tr>
              </thead>
              <tbody>
                {returnItems.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                    <td style={{ padding: '8px', fontWeight: 'var(--font-medium)' }}>{item.name}</td>
                    <td style={{ padding: '8px', textAlign: 'right', color: 'var(--color-text-secondary)' }}>{item.maxQty}</td>
                    <td style={{ padding: '6px' }}>
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        max={item.maxQty}
                        value={item.returnQty}
                        onChange={(e) => handleQtyChange(idx, parseFloat(e.target.value) || 0)}
                        style={{ textAlign: 'right', fontWeight: 'var(--font-semibold)' }}
                      />
                    </td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(item.unitPrice, locale)} {receipt.currency}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'var(--font-bold)' }}>
                      {formatCurrency(item.returnQty * item.unitPrice, locale)} {receipt.currency}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-3)', backgroundColor: 'var(--color-warning-50)', borderRadius: 'var(--radius-md)' }}>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-warning-900)' }}>{isRu ? 'Общая сумма возврата (уменьшит долг):' : 'Qaytariladigan Jami Summa (Qarzimiz kamayadi):'}</span>
          <strong style={{ fontSize: 'var(--text-lg)', color: 'var(--color-warning-900)' }}>
            {formatCurrency(returnTotal, locale)} {receipt.currency}
          </strong>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {isRu ? 'Отмена' : 'Bekor qilish'}
          </Button>
          <Button variant="danger" onClick={handleSubmit} disabled={loading || returnTotal <= 0}>
            {loading ? (isRu ? 'Оформление...' : 'Rasmiylashtirilmoqda...') : (isRu ? 'Подтвердить возврат' : 'Qaytarishni Tasdiqlash')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
