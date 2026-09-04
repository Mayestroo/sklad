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
  const [actNumber, setActNumber] = useState('');
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [returnItems, setReturnItems] = useState<{ productId: string; name: string; maxQty: number; returnQty: number; unitPrice: number; landedCost: number; vatRate: number }[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const getProductName = (name: any) => {
    if (!name) return '—';
    if (typeof name === 'string') return name;
    return name[locale] || name.ru || name.uz || Object.values(name)[0] || '—';
  };

  const REASON_PRESETS = isRu
    ? ['Брак / дефект товара', 'Отправлен не тот товар', 'Излишек товара', 'Поврежденный товар', 'Не соответствует заказу', 'Ошибка в документах', 'Другое']
    : ['Brak / nuqsonli tovar', 'Noto\'g\'ri tovar yuborilgan', 'Ortiqcha tovar', 'Shikastlangan tovar', 'Buyurtmaga mos emas', 'Hujjatdagi xato', 'Boshqa'];

  useEffect(() => {
    if (receipt && receipt.items) {
      setReturnItems(
        receipt.items.map((i: any) => {
          const unreturned = Math.max(0, Number(i.quantity) - Number(i.returnedQuantity || 0));
          const landedUnit = Number(i.quantity) > 0 && Number(i.landedCost) > 0 ? Number(i.landedCost) / Number(i.quantity) : Number(i.unitPrice);
          return {
            productId: i.productId,
            name: getProductName(i.product?.name),
            maxQty: unreturned,
            returnQty: 0,
            unitPrice: Number(i.unitPrice),
            landedCost: landedUnit,
            vatRate: Number(i.vatRate || 0),
          };
        })
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
    return returnItems.reduce((sum, item) => {
      const lineTotal = item.returnQty * item.unitPrice;
      const vat = lineTotal * ((item.vatRate || 0) / 100);
      return sum + lineTotal + vat;
    }, 0);
  };

  const handleSubmit = async (targetStatus: 'DRAFT' | 'POSTED' | 'UNDER_REVIEW') => {
    setError('');

    const itemsToReturn = returnItems
      .filter((i) => i.returnQty > 0)
      .map((i) => {
        const lineTotal = i.returnQty * i.unitPrice;
        const vat = lineTotal * ((i.vatRate || 0) / 100);
        return {
          productId: i.productId,
          quantity: i.returnQty,
          unitPrice: i.unitPrice,
          vatRate: i.vatRate || 0,
          vatAmount: vat,
        };
      });

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
          actNumber: actNumber || undefined,
          counterpartyId: receipt.counterpartyId,
          warehouseId: receipt.warehouseId,
          returnDate: returnDate || undefined,
          currency: receipt.currency,
          reason: reason || undefined,
          comment: comment || undefined,
          status: targetStatus,
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: '700px', width: '100%' }}>
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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)' }}>
          <DatePicker
            label={isRu ? 'Дата возврата *' : 'Qaytarish Sanasi *'}
            value={returnDate}
            onChange={(val) => setReturnDate(val)}
          />
          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px', display: 'block' }}>
              {isRu ? 'Номер акта возврата' : 'Qaytarish dalolatnoma №'}
            </label>
            <Input
              value={actNumber}
              onChange={(e) => setActNumber(e.target.value)}
              placeholder={isRu ? 'Напр: АКТ-001' : 'Masalan: AKT-001'}
            />
          </div>
          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px', display: 'block' }}>
              {isRu ? 'Причина возврата' : 'Qaytarish Sababi'}
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-bg-surface)',
                fontSize: 'var(--text-sm)',
              }}
            >
              <option value="">{isRu ? '-- Выберите причину --' : '-- Sababni tanlang --'}</option>
              {REASON_PRESETS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px', display: 'block' }}>
            {isRu ? 'Примечание / Комментарий' : 'Izoh / Tavsif'}
          </label>
          <Input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={isRu ? 'Дополнительные пояснения к возврату...' : 'Qaytarish bo\'yicha qo\'shimcha izoh...'}
          />
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
                  <th style={{ padding: '8px', textAlign: 'right', width: '90px' }}>{isRu ? 'ДОСТУПНО' : 'MUMKIN'}</th>
                  <th style={{ padding: '8px', textAlign: 'right', width: '100px' }}>{isRu ? 'ВОЗВРАТ' : 'MIQDOR'}</th>
                  <th style={{ padding: '8px', textAlign: 'right', width: '110px' }}>{isRu ? 'ЦЕНА' : 'NARX'}</th>
                  <th style={{ padding: '8px', textAlign: 'right', width: '75px' }}>{isRu ? 'НДС %' : 'QQS %'}</th>
                  <th style={{ padding: '8px', textAlign: 'right', width: '120px' }}>{isRu ? 'ИТОГО' : 'JAMI'}</th>
                </tr>
              </thead>
              <tbody>
                {returnItems.map((item, idx) => {
                  const lineTotal = item.returnQty * item.unitPrice;
                  const vat = lineTotal * ((item.vatRate || 0) / 100);
                  const totalWithVat = lineTotal + vat;
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                      <td style={{ padding: '8px', fontWeight: 'var(--font-medium)' }}>
                        <div>{item.name}</div>
                        {item.landedCost > item.unitPrice && (
                          <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>
                            {isRu ? `Себестоимость: ${formatCurrency(item.landedCost, locale, receipt.currency)}` : `Tannarxi: ${formatCurrency(item.landedCost, locale, receipt.currency)}`}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-semibold)' }}>{item.maxQty}</td>
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
                      <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(item.unitPrice, locale, receipt.currency)}</td>
                      <td style={{ padding: '6px', width: '75px' }}>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={item.vatRate}
                          onChange={(e) => {
                            const val = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
                            setReturnItems((prev) => {
                              const updated = [...prev];
                              updated[idx].vatRate = val;
                              return updated;
                            });
                          }}
                          style={{ textAlign: 'right' }}
                        />
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'var(--font-bold)' }}>
                        {formatCurrency(totalWithVat, locale, receipt.currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-3)', backgroundColor: 'var(--color-warning-50)', borderRadius: 'var(--radius-md)' }}>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-warning-900)' }}>{isRu ? 'Общая сумма возврата (с НДС):' : 'Qaytariladigan Jami Summa (QQS bilan):'}</span>
          <strong style={{ fontSize: 'var(--text-lg)', color: 'var(--color-warning-900)' }}>
            {formatCurrency(returnTotal, locale, receipt.currency)}
          </strong>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {isRu ? 'Отмена' : 'Bekor qilish'}
          </Button>
          <Button variant="secondary" onClick={() => handleSubmit('DRAFT')} disabled={loading || returnTotal <= 0}>
            {loading ? (isRu ? 'Сохранение...' : 'Saqlanmoqda...') : (isRu ? 'Черновик' : 'Qoralama')}
          </Button>
          <Button variant="secondary" onClick={() => handleSubmit('UNDER_REVIEW')} disabled={loading || returnTotal <= 0}>
            {loading ? (isRu ? 'Сохранение...' : 'Saqlanmoqda...') : (isRu ? 'На проверку' : 'Tekshiruvga')}
          </Button>
          <Button variant="danger" onClick={() => handleSubmit('POSTED')} disabled={loading || returnTotal <= 0}>
            {loading ? (isRu ? 'Оформление...' : 'Rasmiylashtirilmoqda...') : (isRu ? 'Провести возврат' : 'Tasdiqlash va O\'tkazish')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
