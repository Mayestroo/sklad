'use client';

import { quantityWithUnit } from '@/lib/units';
import { QuantityInput } from '@/components/ui/QuantityInput';
import { useState, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { DatePicker } from '@/components/ui/DatePicker';
import { Select } from '@/components/ui/Select';
import { PurchaseReceipt } from '@shared/types';
import { formatCurrency, formatUnitCost, errorMessage, type LocalizedName } from '@/lib/utils';
import { localIsoDate } from '@/lib/date-range';
import { toast } from '@/context/ToastContext';
import { Undo2 } from 'lucide-react';

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

  const [returnDate, setReturnDate] = useState(localIsoDate(new Date()));
  const [actNumber, setActNumber] = useState('');
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  // Only what the user typed is state (per receipt line); the rows are derived
  // from the receipt on every render, so a language switch or a reload of the
  // same receipt keeps the typed quantities and VAT. Another receipt starts
  // from zero.
  const receiptId = receipt?.id ?? null;
  const [typed, setTyped] = useState<{
    receiptId: string | null;
    qty: Record<number, number>;
    vat: Record<number, number>;
  }>({ receiptId, qty: {}, vat: {} });
  if (typed.receiptId !== receiptId) {
    setTyped({ receiptId, qty: {}, vat: {} });
  }

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const getProductName = (name: LocalizedName | null | undefined) => {
    if (!name) return '—';
    if (typeof name === 'string') return name;
    return name[locale] || name.ru || name.uz || Object.values(name)[0] || '—';
  };

  const REASON_PRESETS = isRu
    ? ['Брак / дефект товара', 'Отправлен не тот товар', 'Излишек товара', 'Поврежденный товар', 'Не соответствует заказу', 'Ошибка в документах', 'Другое']
    : ['Brak / nuqsonli tovar', 'Noto\'g\'ri tovar yuborilgan', 'Ortiqcha tovar', 'Shikastlangan tovar', 'Buyurtmaga mos emas', 'Hujjatdagi xato', 'Boshqa'];

  const returnItems = useMemo(
    () =>
      (receipt?.items ?? []).map((i, index) => {
        const unreturned = Math.max(0, Number(i.quantity) - Number(i.returnedQuantity || 0));
        // landedCost is already per unit (receipt currency): never divide it by the quantity.
        const landedUnit = Number(i.landedCost) > 0 ? Number(i.landedCost) : Number(i.unitPrice);
        return {
          productId: i.productId,
          productName: i.product?.name,
          unit: i.product?.unitOfMeasure,
          maxQty: unreturned,
          returnQty: typed.qty[index] ?? 0,
          unitPrice: Number(i.unitPrice),
          landedCost: landedUnit,
          vatRate: typed.vat[index] ?? Number(i.vatRate || 0),
        };
      }),
    [receipt, typed],
  );

  if (!receipt) return null;

  const handleQtyChange = (index: number, qty: number) => {
    const max = returnItems[index].maxQty;
    setTyped((prev) => ({ ...prev, qty: { ...prev.qty, [index]: Math.max(0, Math.min(max, qty)) } }));
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

      const label =
        targetStatus === 'POSTED'
          ? isRu ? 'Возврат поставщику проведён' : 'Yetkazib beruvchiga qaytarish tasdiqlandi'
          : targetStatus === 'UNDER_REVIEW'
            ? isRu ? 'Возврат отправлен на проверку' : 'Qaytarish tekshiruvga yuborildi'
            : isRu ? 'Черновик возврата сохранён' : 'Qaytarish qoralamasi saqlandi';
      toast.success(label);
      onSuccess();
      onClose();
    } catch (err) {
      setError(errorMessage(err) || (isRu ? 'Ошибка при оформлении возврата' : 'Qaytarishni rasmiylashtirishda xatolik'));
    } finally {
      setLoading(false);
    }
  };

  const returnTotal = calculateReturnTotal();
  const anyQty = returnItems.some((i) => i.returnQty > 0);
  const th: React.CSSProperties = { padding: '8px', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' };
  const returnAll = () =>
    setTyped((prev) => ({ ...prev, qty: Object.fromEntries(returnItems.map((item, i) => [i, item.maxQty])) }));

  return (
    <Modal icon={<Undo2 size={20} />}
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={isRu ? `Возврат поставщику по приходу ${receipt.docNumber}` : `${receipt.docNumber} kirim bo‘yicha yetkazib beruvchiga qaytarish`}
      onSubmitShortcut={() => void handleSubmit('POSTED')}
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap', width: '100%' }}>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            {isRu ? 'К возврату: ' : 'Qaytariladi: '}
            <strong className="tabular-nums" style={{ color: 'var(--color-text-primary)' }}>{formatCurrency(returnTotal, locale, receipt.currency)}</strong>
          </span>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <Button data-dialog-cancel variant="outline" onClick={onClose} disabled={loading}>
              {isRu ? 'Отмена' : 'Bekor qilish'}
            </Button>
            <Button variant="secondary" onClick={() => void handleSubmit('DRAFT')} disabled={loading}>
              {isRu ? 'Сохранить черновик' : 'Qoralama saqlash'}
            </Button>
            <Button variant="secondary" onClick={() => void handleSubmit('UNDER_REVIEW')} disabled={loading}>
              {isRu ? 'На проверку' : 'Tekshiruvga yuborish'}
            </Button>
            <Button variant="primary" onClick={() => void handleSubmit('POSTED')} loading={loading} loadingText={isRu ? 'Оформление…' : 'Rasmiylashtirilmoqda…'}>
              {isRu ? 'Провести возврат' : 'Qaytarishni tasdiqlash'}
            </Button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {error && (
          <div role="alert" className="doc-banner is-error">{error}</div>
        )}

        <dl style={{ padding: 'var(--space-3)', backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }}>
          <dt style={{ color: 'var(--color-text-secondary)' }}>{isRu ? 'Поставщик' : 'Yetkazib beruvchi'}</dt>
          <dd style={{ fontWeight: 'var(--font-medium)' }}>{receipt.counterparty?.name || '—'}</dd>
          <dt style={{ color: 'var(--color-text-secondary)' }}>{isRu ? 'Со склада' : 'Ombordan'}</dt>
          <dd>{getProductName(receipt.warehouse?.name)}</dd>
        </dl>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 'var(--space-3)' }}>
          <DatePicker label={isRu ? 'Дата возврата *' : 'Qaytarish sanasi *'} value={returnDate} onChange={(val) => setReturnDate(val)} />
          <Input label={isRu ? 'Номер акта возврата' : 'Qaytarish dalolatnomasi №'} value={actNumber} onChange={(e) => setActNumber(e.target.value)} placeholder={isRu ? 'напр. АКТ-001' : 'masalan, AKT-001'} />
          <Select
            label={isRu ? 'Причина' : 'Sabab'}
            value={reason}
            onChange={setReason}
            style={{ width: '100%' }}
            options={[{ value: '', label: isRu ? 'Не указана' : 'Ko‘rsatilmagan' }, ...REASON_PRESETS.map((preset) => ({ value: preset, label: preset }))]}
          />
        </div>

        <Input label={isRu ? 'Комментарий' : 'Izoh'} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={isRu ? 'что не так с товаром' : 'tovar bilan nima muammo'} />

        <section aria-labelledby="preturn-lines">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 'var(--space-2)' }}>
            <h3 id="preturn-lines" style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'Что возвращаем' : 'Nima qaytariladi'}</h3>
            <Button variant="ghost" size="sm" onClick={returnAll}>{isRu ? 'Вернуть всё' : 'Hammasini qaytarish'}</Button>
          </div>
          {!anyQty && (
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
              {isRu ? 'Укажите количество у товаров, которые возвращаете.' : 'Qaytariladigan tovarlarning miqdorini kiriting.'}
            </p>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table className="app-table-stack" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th scope="col" style={{ ...th, textAlign: 'left' }}>{isRu ? 'Товар' : 'Tovar'}</th>
                  <th scope="col" style={{ ...th, textAlign: 'right' }}>{isRu ? 'Можно вернуть' : 'Qaytarish mumkin'}</th>
                  <th scope="col" style={{ ...th, textAlign: 'right', width: 130 }}>{isRu ? 'Возврат' : 'Qaytariladi'}</th>
                  <th scope="col" style={{ ...th, textAlign: 'right' }}>{isRu ? 'Цена' : 'Narx'}</th>
                  <th scope="col" style={{ ...th, textAlign: 'right', width: 80 }}>{isRu ? 'НДС %' : 'QQS %'}</th>
                  <th scope="col" style={{ ...th, textAlign: 'right' }}>{isRu ? 'Сумма' : 'Summa'}</th>
                </tr>
              </thead>
              <tbody>
                {returnItems.map((item, idx) => {
                  const lineTotal = item.returnQty * item.unitPrice;
                  const vat = lineTotal * ((item.vatRate || 0) / 100);
                  const totalWithVat = lineTotal + vat;
                  const name = getProductName(item.productName);
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--color-border-light)', opacity: item.maxQty === 0 ? 0.6 : 1 }}>
                      <td data-primary style={{ padding: '8px', fontWeight: 'var(--font-medium)' }}>
                        <div>{name}</div>
                        {item.landedCost > item.unitPrice && (
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-normal)' }}>
                            {isRu ? `Себестоимость: ${formatUnitCost(item.landedCost, locale, receipt.currency)}` : `Tannarxi: ${formatUnitCost(item.landedCost, locale, receipt.currency)}`}
                          </div>
                        )}
                      </td>
                      <td data-label={isRu ? 'Можно вернуть' : 'Qaytarish mumkin'} style={{ padding: '8px', textAlign: 'right', color: 'var(--color-text-secondary)' }} className="tabular-nums">
                        {item.maxQty > 0 ? quantityWithUnit(item.maxQty, item.unit, locale) : isRu ? 'уже возвращено' : 'qaytarilgan'}
                      </td>
                      <td data-label={isRu ? 'Возврат' : 'Qaytariladi'} style={{ padding: '6px' }}>
                        <QuantityInput
                          unit={item.unit}
                          value={item.returnQty || ''}
                          max={item.maxQty}
                          disabled={item.maxQty === 0}
                          onValueChange={(value) => handleQtyChange(idx, Number(value) || 0)}
                          aria-label={isRu ? `Количество возврата: ${name}` : `Qaytarish miqdori: ${name}`}
                        />
                      </td>
                      <td data-label={isRu ? 'Цена' : 'Narx'} style={{ padding: '8px', textAlign: 'right', whiteSpace: 'nowrap' }} className="tabular-nums">{formatCurrency(item.unitPrice, locale, receipt.currency)}</td>
                      <td data-label={isRu ? 'НДС %' : 'QQS %'} style={{ padding: '6px', width: 80 }}>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          aria-label={isRu ? `НДС %: ${name}` : `QQS %: ${name}`}
                          value={item.vatRate}
                          onChange={(e) => {
                            const val = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
                            setTyped((prev) => ({ ...prev, vat: { ...prev.vat, [idx]: val } }));
                          }}
                          style={{ textAlign: 'right' }}
                        />
                      </td>
                      <td data-label={isRu ? 'Сумма' : 'Summa'} style={{ padding: '8px', textAlign: 'right', fontWeight: 'var(--font-semibold)', whiteSpace: 'nowrap' }} className="tabular-nums">
                        {formatCurrency(totalWithVat, locale, receipt.currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </Modal>
  );
}
