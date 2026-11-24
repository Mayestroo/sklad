'use client';

import { quantityWithUnit } from '@/lib/units';
import { QuantityInput } from '@/components/ui/QuantityInput';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, SelectOption } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { formatCurrency, formatPercent, errorMessage, type LocalizedName } from '@/lib/utils';
import { SalesInvoice } from '@shared/types';

/** GET /sales/invoices/:id/returnable-items */
interface ReturnableItemRow {
  productId: string;
  productName: LocalizedName;
  sku?: string;
  barcode?: string;
  unit?: string;
  soldQuantity: number | string;
  returnedQuantity: number | string;
  returnableQuantity: number | string;
  unitPrice: number | string;
  unitVatAmount?: number | string | null;
  /** Source line discount percentage, already applied in unitPrice. */
  discount?: number | string | null;
  vatRate?: number | string | null;
}
import { RotateCcw, AlertCircle, Barcode, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from '@/context/ToastContext';
import { localIsoDate } from '@/lib/date-range';

interface CreateSalesReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: SalesInvoice | null;
  onSuccess: () => void;
}

interface ReturnableItemState {
  productId: string;
  name: string;
  sku?: string;
  barcode?: string;
  unit?: string;
  soldQty: number;
  returnedQty: number;
  returnableQty: number;
  returnQty: number;
  unitPrice: number;
  unitVatAmount: number;
  discount: number;
  vatRate: number;
  isDefective: boolean;
}

interface WarehouseItem {
  id: string;
  name: LocalizedName;
  isDefect?: boolean;
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

  const [returnDate, setReturnDate] = useState(localIsoDate(new Date()));
  const [reason, setReason] = useState('');
  const [returnItems, setReturnItems] = useState<ReturnableItemState[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [defectWarehouseId, setDefectWarehouseId] = useState('');
  const [barcodeQuery, setBarcodeQuery] = useState('');
  const [barcodeFeedback, setBarcodeFeedback] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const getProductName = (name: LocalizedName | null | undefined) => {
    if (!name) return '—';
    if (typeof name === 'string') return name;
    return name[locale] || name.ru || name.uz || Object.values(name)[0] || '—';
  };

  const REASON_PRESETS = isRu
    ? ['Возврат покупателя (не подошел)', 'Брак / дефект товара', 'Ошибка в заказе', 'Повреждение при доставке', 'Другое']
    : ['Mijoz qaytardi (mos kelmadi)', 'Brak / nuqsonli tovar', 'Buyurtmadagi xatolik', 'Yetkazib berishda shikastlangan', 'Boshqa'];

  useEffect(() => {
    if (!token || !company) return;
    apiFetch<WarehouseItem[]>('/tenants/warehouses', {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then((res) => {
        const list = res || [];
        setWarehouses(list);
        // Only a warehouse marked as the defect one is preselected: defective goods
        // must never land in sellable stock because it happened to be first.
        const defectWh = list.find((w) => w.isDefect);
        if (defectWh) setDefectWarehouseId(defectWh.id);
      })
      .catch(() => setWarehouses([]));
  }, [token, company, locale]);

  useEffect(() => {
    if (!invoice || !token || !company || !isOpen) return;

    setFetchLoading(true);
    setError('');
    setLoadError(null);
    apiFetch<ReturnableItemRow[]>(`/sales/invoices/${invoice.id}/returnable-items`, {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then((items) => {
        setReturnItems(
          (items ?? []).map((i) => ({
            productId: i.productId,
            name: getProductName(i.productName),
            sku: i.sku,
            barcode: i.barcode,
            unit: i.unit,
            soldQty: Number(i.soldQuantity),
            returnedQty: Number(i.returnedQuantity),
            returnableQty: Number(i.returnableQuantity),
            returnQty: 0,
            unitPrice: Number(i.unitPrice),
            unitVatAmount: Number(i.unitVatAmount || 0),
            discount: Number(i.discount ?? 0),
            vatRate: Number(i.vatRate || 0),
            isDefective: false,
          })),
        );
      })
      .catch((err) => {
        // Never fall back to the invoice lines: they ignore earlier returns and
        // would offer quantities that can no longer be returned.
        setReturnItems([]);
        setLoadError(errorMessage(err) || (isRu ? 'Не удалось загрузить, что можно вернуть' : 'Qaytarish mumkin bo‘lgan miqdorlarni yuklab bo‘lmadi'));
      })
      .finally(() => setFetchLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice, isOpen, token, company, locale, reloadKey]);

  if (!invoice) return null;

  const handleQtyChange = (index: number, qty: number) => {
    // Immutable update: React may run the updater twice (strict mode).
    setReturnItems((prev) => prev.map((row, i) => (i === index ? { ...row, returnQty: Math.max(0, Math.min(row.returnableQty, qty)) } : row)));
  };

  const toggleDefective = (index: number) => {
    // Immutable update: a mutated row toggled twice under strict mode and never changed.
    setReturnItems((prev) => prev.map((row, i) => (i === index ? { ...row, isDefective: !row.isDefective } : row)));
  };

  const handleBarcodeScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeQuery.trim()) return;

    const trimmed = barcodeQuery.trim();
    const itemIndex = returnItems.findIndex(
      (item) => item.barcode === trimmed || item.sku?.toLowerCase() === trimmed.toLowerCase()
    );

    if (itemIndex === -1) {
      setBarcodeFeedback(isRu ? `Товар со штрихкодом "${trimmed}" не найден в накладной` : `"${trimmed}" shtrix-kodli tovar sotuv fakturasida topilmadi`);
      setTimeout(() => setBarcodeFeedback(null), 3000);
      setBarcodeQuery('');
      return;
    }

    const currentItem = returnItems[itemIndex];
    if (currentItem.returnQty >= currentItem.returnableQty) {
      setBarcodeFeedback(isRu ? `Достигнут лимит возврата для "${currentItem.name}" (${currentItem.returnableQty})` : `"${currentItem.name}" uchun qaytarish limiti (${currentItem.returnableQty}) to'ldi`);
      setTimeout(() => setBarcodeFeedback(null), 3000);
      setBarcodeQuery('');
      return;
    }

    handleQtyChange(itemIndex, currentItem.returnQty + 1);
    setBarcodeFeedback(isRu ? `Добавлено +1: ${currentItem.name}` : `+1 qo'shildi: ${currentItem.name}`);
    setTimeout(() => setBarcodeFeedback(null), 2500);
    setBarcodeQuery('');
  };

  const calculateReturnTotal = () => {
    return returnItems.reduce((sum, item) => sum + item.returnQty * (item.unitPrice + item.unitVatAmount), 0);
  };
  const returnVatTotal = returnItems.reduce((sum, item) => sum + item.returnQty * item.unitVatAmount, 0);

  const hasDefectiveItems = returnItems.some((i) => i.isDefective && i.returnQty > 0);

  const handleSubmit = async (submitStatus: 'DRAFT' | 'POSTED') => {
    setError('');

    const itemsToReturn = returnItems
      .filter((i) => i.returnQty > 0)
      .map((i) => ({
        productId: i.productId,
        quantity: i.returnQty,
        unitPrice: i.unitPrice + i.unitVatAmount,
        isDefective: i.isDefective,
      }));

    if (itemsToReturn.length === 0) {
      setError(isRu ? 'Укажите количество для возврата хотя бы для одного товара' : 'Kamida bitta tovar qaytarish miqdorini kiriting');
      return;
    }

    if (hasDefectiveItems && !defectWarehouseId) {
      setError(isRu ? 'Выберите склад брака для бракованных товаров' : 'Brak tovarlar uchun brak omborini tanlang');
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
          defectWarehouseId: hasDefectiveItems ? defectWarehouseId : undefined,
          returnDate,
          currency: invoice.currency,
          reason: reason.trim() || undefined,
          status: submitStatus,
          items: itemsToReturn,
        }),
      });

      toast.success(
        submitStatus === 'POSTED'
          ? isRu ? 'Возврат проведён: товар вернулся на склад, долг клиента уменьшен' : 'Qaytarish tasdiqlandi: tovar omborga qaytdi, mijoz qarzi kamaydi'
          : isRu ? 'Черновик возврата сохранён' : 'Qaytarish qoralamasi saqlandi',
      );
      onSuccess();
      onClose();
    } catch (err) {
      setError(errorMessage(err) || (isRu ? 'Ошибка при оформлении возврата' : 'Qaytaruvni rasmiylashtirishda xatolik yuz berdi'));
    } finally {
      setLoading(false);
    }
  };

  const returnTotal = calculateReturnTotal();

  const defectWhOptions: SelectOption[] = warehouses.map((w) => ({
    value: w.id,
    label: typeof w.name === 'object' ? (w.name[locale] || w.name.ru || w.name.uz || '') : w.name,
  }));

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={isRu ? `Возврат товара от покупателя — ${invoice.invoiceNumber || (invoice as { docNumber?: string } | null | undefined)?.docNumber || ''}` : `Mijozdan tovar qaytarish — ${invoice.invoiceNumber || (invoice as { docNumber?: string } | null | undefined)?.docNumber || ''}`}
      description={isRu ? 'Вернуть можно не больше проданного минус уже возвращённое.' : 'Sotilgandan ortiq (oldin qaytarilganini ayirib) qaytarib bo‘lmaydi.'}
      icon={<RotateCcw size={20} />}
      size="lg"
      onSubmitShortcut={() => void handleSubmit('POSTED')}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', flexWrap: 'wrap', width: '100%' }}>
          <Button data-dialog-cancel type="button" variant="outline" onClick={onClose} disabled={loading}>
            {isRu ? 'Отмена' : 'Bekor qilish'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => void handleSubmit('DRAFT')} disabled={loading || fetchLoading || !!loadError}>
            {isRu ? 'Сохранить черновик' : 'Qoralama saqlash'}
          </Button>
          <Button type="button" onClick={() => void handleSubmit('POSTED')} loading={loading} loadingText={isRu ? 'Оформление…' : 'Rasmiylashtirilmoqda…'} disabled={fetchLoading || !!loadError}>
            <RotateCcw size={16} aria-hidden />
            {isRu ? 'Провести возврат' : 'Qaytarishni tasdiqlash'}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {error && (
          <div role="alert" className="doc-banner is-error" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={16} aria-hidden style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}
        {loadError && (
          <div role="alert" className="doc-banner is-error" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span>{loadError}</span>
            <Button size="sm" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>{isRu ? 'Повторить' : 'Qayta urinish'}</Button>
          </div>
        )}

        {/* Top Info Bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 'var(--space-3)' }}>
          <DatePicker label={isRu ? 'Дата возврата *' : 'Qaytarish sanasi *'} value={returnDate} onChange={(val) => setReturnDate(val)} />

          <Input
            label={isRu ? 'Причина возврата' : 'Qaytarish sababi'}
            placeholder={isRu ? 'или выберите ниже' : 'yoki quyidan tanlang'}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />

          {hasDefectiveItems && (
            <div>
              <Select
                id="defect-wh-select"
                label={isRu ? 'Склад брака *' : 'Brak ombori *'}
                value={defectWarehouseId}
                onChange={(val) => setDefectWarehouseId(val)}
                placeholder={isRu ? 'Выберите склад брака' : 'Brak omborini tanlang'}
                options={defectWhOptions}
              />
            </div>
          )}
        </div>

        {/* Reason presets */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {REASON_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-pressed={reason === preset}
              onClick={() => setReason(preset)}
              style={{
                fontSize: 'var(--text-xs)',
                minHeight: 28,
                padding: '4px 10px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: reason === preset ? 'var(--color-primary-100)' : 'var(--color-bg-tertiary)',
                color: reason === preset ? 'var(--color-primary-700)' : 'var(--color-text-secondary)',
                border: '1px solid var(--color-border)',
                cursor: 'pointer',
              }}
            >
              {preset}
            </button>
          ))}
        </div>

        {/* Barcode Scanner Fast Input */}
        <form onSubmit={handleBarcodeScan} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-bg-tertiary)', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
          <Barcode size={20} aria-hidden style={{ color: 'var(--color-text-secondary)' }} />
          <input
            ref={barcodeInputRef}
            type="text"
            value={barcodeQuery}
            onChange={(e) => setBarcodeQuery(e.target.value)}
            aria-label={isRu ? 'Штрихкод или артикул (+1 к возврату)' : 'Shtrix-kod yoki artikul (qaytarishga +1)'}
            placeholder={isRu ? 'Сканируйте штрих-код или введите артикул товара (+1)...' : 'Shtrix-kod skaner qiling yoki SKU kiriting (+1)...'}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-primary)',
            }}
          />
          <Button type="submit" size="sm" variant="secondary">
            {isRu ? 'Добавить' : 'Qo\'shish'}
          </Button>
        </form>

        {barcodeFeedback && (
          <div role="status" style={{ fontSize: 'var(--text-sm)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', background: barcodeFeedback.includes('+1') ? 'var(--color-success-50)' : 'var(--color-error-50)', color: barcodeFeedback.includes('+1') ? 'var(--color-success-700)' : 'var(--color-error-700)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {barcodeFeedback.includes('+1') ? <CheckCircle2 size={14} aria-hidden /> : <AlertTriangle size={14} aria-hidden />}
            <span>{barcodeFeedback}</span>
          </div>
        )}

        {/* Return Items Table */}
        <div role="region" tabIndex={0} aria-label={isRu ? 'Товары накладной' : 'Hujjat tovarlari'} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflowX: 'auto' }}>
          <table className="app-table-stack" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                  {isRu ? 'Товар' : 'Tovar'}
                </th>
                <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                  {isRu ? 'Брак' : 'Brak'}
                </th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                  {isRu ? 'Продано / можно вернуть' : 'Sotilgan / qaytarish mumkin'}
                </th>
                <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', width: '130px' }}>
                  {isRu ? 'Возврат' : 'Qaytariladi'}
                </th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                  {isRu ? 'Цена' : 'Narx'}
                </th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                  {isRu ? 'НДС' : 'QQS'}
                </th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                  {isRu ? 'Сумма' : 'Summa'}
                </th>
              </tr>
            </thead>
            <tbody>
              {fetchLoading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 30, color: 'var(--color-text-secondary)' }}>
                    {isRu ? 'Загрузка остатков продаж...' : 'Sotuv qoldiqlari yuklanmoqda...'}
                  </td>
                </tr>
              ) : returnItems.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 30, color: 'var(--color-text-secondary)' }}>
                    {loadError ? '—' : isRu ? 'В этой продаже нет товаров' : 'Bu sotuvda tovarlar yo‘q'}
                  </td>
                </tr>
              ) : (
                returnItems.map((item, index) => {
                  const lineVat = item.returnQty * item.unitVatAmount;
                  const lineTotal = item.returnQty * (item.unitPrice + item.unitVatAmount);
                  const isExhausted = item.returnableQty <= 0;

                  return (
                    <tr
                      key={item.productId}
                      style={{
                        borderBottom: '1px solid var(--color-border-light)',
                        opacity: isExhausted ? 0.6 : 1,
                        backgroundColor: item.isDefective ? 'var(--color-error-50)' : undefined,
                      }}
                    >
                      <td data-primary style={{ padding: '8px 12px' }}>
                        <div style={{ fontWeight: 500 }}>{item.name}</div>
                        {(item.sku || item.barcode) && (
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 400 }}>
                            {[item.sku, item.barcode].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </td>
                      <td data-label={isRu ? 'Брак' : 'Brak'} style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          aria-label={isRu ? `Брак: ${item.name}` : `Brak: ${item.name}`}
                          checked={item.isDefective}
                          onChange={() => toggleDefective(index)}
                          disabled={isExhausted}
                          style={{ cursor: 'pointer' }}
                        />
                      </td>
                      <td data-label={isRu ? 'Продано / можно вернуть' : 'Sotilgan / qaytarish mumkin'} style={{ padding: '8px 12px', textAlign: 'right' }} className="tabular-nums">
                        <div>{quantityWithUnit(item.soldQty, item.unit, locale)}</div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                          {item.returnableQty > 0
                            ? (isRu ? 'можно: ' : 'mumkin: ') + quantityWithUnit(item.returnableQty, item.unit, locale)
                            : isRu ? 'всё уже возвращено' : 'hammasi qaytarilgan'}
                        </div>
                      </td>
                      <td data-label={isRu ? 'Возврат' : 'Qaytariladi'} style={{ padding: '6px 12px', textAlign: 'center' }}>
                        <QuantityInput
                          unit={item.unit}
                          value={item.returnQty || ''}
                          max={item.returnableQty}
                          disabled={isExhausted}
                          onValueChange={(value) => handleQtyChange(index, Number(value) || 0)}
                          aria-label={isRu ? `Количество возврата: ${item.name}` : `Qaytarish miqdori: ${item.name}`}
                          invalid={item.returnQty > item.returnableQty}
                        />
                      </td>
                      <td data-label={isRu ? 'Цена' : 'Narx'} style={{ padding: '8px 12px', textAlign: 'right' }} className="tabular-nums">
                        {formatCurrency(item.unitPrice, locale, invoice.currency)}
                        {item.discount > 0 && (
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>-{formatPercent(item.discount)}</div>
                        )}
                      </td>
                      <td data-label={isRu ? 'НДС' : 'QQS'} style={{ padding: '8px 12px', textAlign: 'right' }} className="tabular-nums">
                        <div>{formatCurrency(lineVat, locale, invoice.currency)}</div>
                        <small style={{ color: 'var(--color-text-secondary)' }}>{item.vatRate}%</small>
                      </td>
                      <td data-label={isRu ? 'Сумма' : 'Summa'} style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }} className="tabular-nums">
                        {formatCurrency(lineTotal, locale, invoice.currency)}
                      </td>
                    </tr>
                  );
                })
              )}
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
            backgroundColor: 'var(--color-bg-tertiary)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
          }}
        >
          <div>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
              {isRu ? 'Итоговая сумма возврата:' : 'Jami qaytariladigan summa:'}
            </div>
            {returnVatTotal > 0 && (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 3 }}>
                {isRu ? 'В том числе НДС:' : 'Shundan QQS:'} {formatCurrency(returnVatTotal, locale, invoice.currency)}
              </div>
            )}
            {hasDefectiveItems && (
              <div style={{ fontSize: '12px', color: 'var(--color-error-700)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <AlertCircle size={13} />
                <span>{isRu ? 'Бракованные товары будут направлены на склад брака' : 'Brak tovarlar alohida brak omboriga kirim qilinadi'}</span>
              </div>
            )}
          </div>
          <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-text-primary)' }} className="tabular-nums">
            {formatCurrency(returnTotal, locale, invoice.currency)}
          </span>
        </div>

      </div>
    </Drawer>
  );
}
