'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, SelectOption } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { formatCurrency } from '@/lib/utils';
import { SalesInvoice } from '@shared/types';
import { RotateCcw, AlertCircle, Barcode, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

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
  isDefective: boolean;
}

interface WarehouseItem {
  id: string;
  name: any;
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

  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('');
  const [returnItems, setReturnItems] = useState<ReturnableItemState[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [defectWarehouseId, setDefectWarehouseId] = useState('');
  const [barcodeQuery, setBarcodeQuery] = useState('');
  const [barcodeFeedback, setBarcodeFeedback] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [error, setError] = useState('');

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const getProductName = (name: any) => {
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
        const defectWh = list.find((w) => w.isDefect || (typeof w.name === 'string' && w.name.toLowerCase().includes('brak')));
        if (defectWh) setDefectWarehouseId(defectWh.id);
        else if (list.length > 0) setDefectWarehouseId(list[0].id);
      })
      .catch(console.error);
  }, [token, company, locale]);

  useEffect(() => {
    if (!invoice || !token || !company || !isOpen) return;

    setFetchLoading(true);
    setError('');
    apiFetch<any[]>(`/sales/invoices/${invoice.id}/returnable-items`, {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then((items) => {
        if (items && items.length > 0) {
          setReturnItems(
            items.map((i: any) => ({
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
              isDefective: false,
            }))
          );
        } else if (invoice.items) {
          setReturnItems(
            invoice.items.map((i: any) => ({
              productId: i.productId,
              name: getProductName(i.product?.name || i.name),
              sku: i.product?.sku,
              barcode: i.product?.barcode,
              unit: i.product?.unitOfMeasure,
              soldQty: Number(i.quantity),
              returnedQty: 0,
              returnableQty: Number(i.quantity),
              returnQty: 0,
              unitPrice: Number(i.unitPrice),
              isDefective: false,
            }))
          );
        }
      })
      .catch(() => {
        if (invoice.items) {
          setReturnItems(
            invoice.items.map((i: any) => ({
              productId: i.productId,
              name: getProductName(i.product?.name || i.name),
              sku: i.product?.sku,
              barcode: i.product?.barcode,
              unit: i.product?.unitOfMeasure,
              soldQty: Number(i.quantity),
              returnedQty: 0,
              returnableQty: Number(i.quantity),
              returnQty: 0,
              unitPrice: Number(i.unitPrice),
              isDefective: false,
            }))
          );
        }
      })
      .finally(() => setFetchLoading(false));
  }, [invoice, isOpen, token, company, locale]);

  if (!invoice) return null;

  const handleQtyChange = (index: number, qty: number) => {
    setReturnItems((prev) => {
      const updated = [...prev];
      const max = updated[index].returnableQty;
      updated[index].returnQty = Math.max(0, Math.min(max, qty));
      return updated;
    });
  };

  const toggleDefective = (index: number) => {
    setReturnItems((prev) => {
      const updated = [...prev];
      updated[index].isDefective = !updated[index].isDefective;
      return updated;
    });
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
    return returnItems.reduce((sum, item) => sum + item.returnQty * item.unitPrice, 0);
  };

  const hasDefectiveItems = returnItems.some((i) => i.isDefective && i.returnQty > 0);

  const handleSubmit = async (submitStatus: 'DRAFT' | 'POSTED') => {
    setError('');

    const itemsToReturn = returnItems
      .filter((i) => i.returnQty > 0)
      .map((i) => ({
        productId: i.productId,
        quantity: i.returnQty,
        unitPrice: i.unitPrice,
        isDefective: i.isDefective,
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
          defectWarehouseId: hasDefectiveItems ? defectWarehouseId : undefined,
          returnDate,
          currency: invoice.currency,
          reason: reason.trim() || undefined,
          status: submitStatus,
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

  const defectWhOptions: SelectOption[] = warehouses.map((w) => ({
    value: w.id,
    label: typeof w.name === 'object' ? (w.name[locale] || w.name.ru || w.name.uz || '') : w.name,
  }));

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={isRu ? `Возврат товара от покупателя — ${invoice.invoiceNumber || (invoice as any).docNumber || ''}` : `Mijozdan tovar qaytarish — ${invoice.invoiceNumber || (invoice as any).docNumber || ''}`}
      description={isRu ? 'Оформление возврата по счет-фактуре с защитой от перерасхода' : 'Sotuv hujjati bo\'yicha tovar qaytarish (qoldiq chegarasi bilan)'}
      icon={<RotateCcw size={20} />}
      size="lg"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
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

        {/* Top Info Bar */}
        <div style={{ display: 'grid', gridTemplateColumns: hasDefectiveItems ? '1fr 1fr 1fr' : '1fr 1fr', gap: 'var(--space-3)' }}>
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

          {hasDefectiveItems && (
            <div>
              <Select
                id="defect-wh-select"
                label={isRu ? 'Склад брака *' : 'Brak ombori *'}
                value={defectWarehouseId}
                onChange={(val) => setDefectWarehouseId(val)}
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

        {/* Barcode Scanner Fast Input */}
        <form onSubmit={handleBarcodeScan} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-bg-subtle)', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
          <Barcode size={20} style={{ color: 'var(--color-text-secondary)' }} />
          <input
            ref={barcodeInputRef}
            type="text"
            value={barcodeQuery}
            onChange={(e) => setBarcodeQuery(e.target.value)}
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
          <div style={{ fontSize: 'var(--text-xs)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', background: barcodeFeedback.includes('+1') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: barcodeFeedback.includes('+1') ? '#10b981' : '#ef4444', display: 'flex', alignItems: 'center', gap: 6 }}>
            {barcodeFeedback.includes('+1') ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            <span>{barcodeFeedback}</span>
          </div>
        )}

        {/* Return Items Table */}
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-subtle)' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                  {isRu ? 'ТОВАР' : 'TOVAR'}
                </th>
                <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                  {isRu ? 'БРАК?' : 'BRAK?'}
                </th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                  {isRu ? 'ПРОДАНО / ДОСТУПНО' : 'SOTILGAN / QOLDIQ'}
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
              {fetchLoading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 30, color: 'var(--color-text-secondary)' }}>
                    {isRu ? 'Загрузка остатков продаж...' : 'Sotuv qoldiqlari yuklanmoqda...'}
                  </td>
                </tr>
              ) : returnItems.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 30, color: 'var(--color-text-secondary)' }}>
                    {isRu ? 'В данной накладной нет товаров' : 'Ushbu fakturada tovarlar mavjud emas'}
                  </td>
                </tr>
              ) : (
                returnItems.map((item, index) => {
                  const lineTotal = item.returnQty * item.unitPrice;
                  const isExhausted = item.returnableQty <= 0;

                  return (
                    <tr
                      key={item.productId}
                      style={{
                        borderBottom: '1px solid var(--color-border-light)',
                        opacity: isExhausted ? 0.6 : 1,
                        backgroundColor: item.isDefective ? 'rgba(239, 68, 68, 0.04)' : undefined,
                      }}
                    >
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ fontWeight: 500 }}>{item.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                          {item.sku ? `SKU: ${item.sku}` : ''} {item.barcode ? `| ${item.barcode}` : ''}
                        </div>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={item.isDefective}
                          onChange={() => toggleDefective(index)}
                          disabled={isExhausted}
                          style={{ cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        <div>{item.soldQty}</div>
                        <div style={{ fontSize: '11px', color: item.returnableQty > 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                          max: {item.returnableQty}
                        </div>
                      </td>
                      <td style={{ padding: '6px 12px', textAlign: 'center' }}>
                        <Input
                          type="number"
                          min={0}
                          max={item.returnableQty}
                          step="any"
                          disabled={isExhausted}
                          value={item.returnQty || ''}
                          onChange={(e) => handleQtyChange(index, parseFloat(e.target.value) || 0)}
                          style={{
                            textAlign: 'center',
                            height: '32px',
                            padding: '0 8px',
                            borderColor: item.returnQty > item.returnableQty ? '#ef4444' : undefined,
                          }}
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
            backgroundColor: 'var(--color-bg-subtle)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
          }}
        >
          <div>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
              {isRu ? 'Итоговая сумма возврата:' : 'Jami qaytariladigan summa:'}
            </div>
            {hasDefectiveItems && (
              <div style={{ fontSize: '12px', color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <AlertCircle size={13} />
                <span>{isRu ? 'Бракованные товары будут направлены на склад брака' : 'Brak tovarlar alohida brak omboriga kirim qilinadi'}</span>
              </div>
            )}
          </div>
          <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: '#f59e0b' }} className="tabular-nums">
            {formatCurrency(returnTotal, locale, invoice.currency)}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', borderTop: '1px solid var(--color-border-light)', paddingTop: 'var(--space-3)' }}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            {isRu ? 'Отмена' : 'Bekor qilish'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleSubmit('DRAFT')}
            disabled={loading || returnTotal <= 0}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <ShieldCheck size={16} />
            {loading ? (isRu ? 'Сохранение...' : 'Saqlanmoqda...') : (isRu ? 'Сохранить как черновик' : 'Qoralama sifatida saqlash')}
          </Button>
          <Button
            type="button"
            onClick={() => handleSubmit('POSTED')}
            disabled={loading || returnTotal <= 0}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RotateCcw size={16} />
            {loading ? (isRu ? 'Оформление...' : 'Rasmiylashtirilmoqda...') : (isRu ? 'Подтвердить и провести' : 'Tasdiqlash va kirim qilish')}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
