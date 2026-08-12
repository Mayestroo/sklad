'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, SelectOption } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { Plus, Trash2, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { PurchaseReceipt } from '@shared/types';

interface CounterpartyOption {
  id: string;
  name: string;
  type: string;
}

interface WarehouseOption {
  id: string;
  name: any;
}

interface ProductOption {
  id: string;
  name: any;
  sku: string;
  costPrice: number;
  unitOfMeasure: string;
}

interface ItemRow {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  vatRate: number;
}

interface PurchaseReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: PurchaseReceipt | null;
}

export function PurchaseReceiptModal({
  isOpen,
  onClose,
  onSuccess,
  initialData,
}: PurchaseReceiptModalProps) {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token, company } = useAuth();

  const [counterparties, setCounterparties] = useState<CounterpartyOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);

  const [counterpartyId, setCounterpartyId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [docDate, setDocDate] = useState(new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState('UZS');
  const [exchangeRate, setExchangeRate] = useState(1);
  const [contractNumber, setContractNumber] = useState('');
  const [contractDate, setContractDate] = useState('');
  const [comment, setComment] = useState('');

  // GTD fields
  const [showGtd, setShowGtd] = useState(false);
  const [gtdNumber, setGtdNumber] = useState('');
  const [gtdDate, setGtdDate] = useState('');
  const [customsPost, setCustomsPost] = useState('');

  // Items
  const [items, setItems] = useState<ItemRow[]>([
    { productId: '', quantity: 1, unitPrice: 0, discount: 0, vatRate: 0 },
  ]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize data if editing
  useEffect(() => {
    if (initialData) {
      setCounterpartyId(initialData.counterpartyId);
      setWarehouseId(initialData.warehouseId);
      setDocDate(initialData.docDate ? initialData.docDate.slice(0, 10) : new Date().toISOString().slice(0, 10));
      setCurrency(initialData.currency || 'UZS');
      setExchangeRate(Number(initialData.exchangeRate) || 1);
      setContractNumber(initialData.contractNumber || '');
      setContractDate(initialData.contractDate ? initialData.contractDate.slice(0, 10) : '');
      setComment(initialData.comment || '');
      setGtdNumber(initialData.gtdNumber || '');
      setGtdDate(initialData.gtdDate ? initialData.gtdDate.slice(0, 10) : '');
      setCustomsPost(initialData.customsPost || '');

      if (initialData.gtdNumber || initialData.customsPost) {
        setShowGtd(true);
      }

      if (initialData.items && initialData.items.length > 0) {
        setItems(
          initialData.items.map((i) => ({
            productId: i.productId,
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice),
            discount: Number(i.discount) || 0,
            vatRate: Number(i.vatRate) || 0,
          }))
        );
      }
    }
  }, [initialData]);

  // Load dropdown lists
  useEffect(() => {
    if (!token || !company) return;

    // Load suppliers
    apiFetch<CounterpartyOption[]>('/sales/counterparties', { token, tenantId: company.id, locale })
      .then((res) => {
        const suppliers = (res || []).filter((c) => c.type === 'SUPPLIER' || c.type === 'BOTH');
        setCounterparties(suppliers);
        if (suppliers.length > 0 && !counterpartyId && !initialData) {
          setCounterpartyId(suppliers[0].id);
        }
      })
      .catch((err) => console.error(err));

    // Load warehouses
    apiFetch<WarehouseOption[]>('/tenants/warehouses', { token, tenantId: company.id, locale })
      .then((res) => {
        setWarehouses(res || []);
        if (res && res.length > 0 && !warehouseId && !initialData) {
          setWarehouseId(res[0].id);
        }
      })
      .catch((err) => console.error(err));

    // Load products
    apiFetch<ProductOption[]>('/inventory/products', { token, tenantId: company.id, locale })
      .then((res) => setProducts(res || []))
      .catch((err) => console.error(err));
  }, [token, company, locale]);

  const getProductName = (name: any) => {
    if (!name) return '—';
    if (typeof name === 'string') return name;
    return name[locale] || name.ru || name.uz || Object.values(name)[0] || '—';
  };

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      { productId: products.length > 0 ? products[0].id : '', quantity: 1, unitPrice: 0, discount: 0, vatRate: 0 },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof ItemRow, value: any) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };

      // Auto-fill cost price if product changes
      if (field === 'productId') {
        const p = products.find((prod) => prod.id === value);
        if (p) {
          next[index].unitPrice = Number(p.costPrice) || 0;
        }
      }

      return next;
    });
  };

  const calculateTotals = () => {
    let subtotal = 0;
    let discountTotal = 0;
    let vatTotal = 0;

    items.forEach((item) => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unitPrice) || 0;
      const disc = Number(item.discount) || 0;
      const vatR = Number(item.vatRate) || 0;

      const lineSubtotal = qty * price;
      const lineAfterDiscount = Math.max(0, lineSubtotal - disc);
      const lineVat = lineAfterDiscount * (vatR / 100);

      subtotal += lineSubtotal;
      discountTotal += disc;
      vatTotal += lineVat;
    });

    const grandTotal = Math.max(0, subtotal - discountTotal) + vatTotal;
    return { subtotal, discount: discountTotal, vat: vatTotal, grandTotal };
  };

  const totals = calculateTotals();

  const handleSubmit = async (shouldPost: boolean) => {
    if (!token || !company) return;
    if (!counterpartyId) {
      setError(isRu ? 'Выберите поставщика' : 'Yetkazib beruvchini tanlang');
      return;
    }
    if (!warehouseId) {
      setError(isRu ? 'Выберите склад' : 'Omborni tanlang');
      return;
    }
    if (items.some((i) => !i.productId || i.quantity <= 0)) {
      setError(isRu ? 'Выберите товар и укажите правильное количество во всех строках' : 'Barcha qatorlarda tovar tanlanishi va miqdor kiritilishi shart');
      return;
    }

    setLoading(true);
    setError(null);

    const payload = {
      counterpartyId,
      warehouseId,
      docDate,
      currency,
      exchangeRate,
      contractNumber: contractNumber || undefined,
      contractDate: contractDate || undefined,
      comment: comment || undefined,
      gtdNumber: gtdNumber || undefined,
      gtdDate: gtdDate || undefined,
      customsPost: customsPost || undefined,
      items: items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discount: i.discount,
        vatRate: i.vatRate,
      })),
    };

    try {
      if (initialData) {
        // Edit existing receipt
        await apiFetch(`/purchases/receipts/${initialData.id}`, {
          method: 'PATCH',
          token,
          tenantId: company.id,
          locale,
          body: JSON.stringify(payload),
        });

        if (shouldPost) {
          await apiFetch(`/purchases/receipts/${initialData.id}/post`, {
            method: 'POST',
            token,
            tenantId: company.id,
            locale,
          });
        }
      } else {
        // Create new receipt
        const created = await apiFetch<PurchaseReceipt>('/purchases/receipts', {
          method: 'POST',
          token,
          tenantId: company.id,
          locale,
          body: JSON.stringify(payload),
        });

        if (shouldPost && created && created.id) {
          await apiFetch(`/purchases/receipts/${created.id}/post`, {
            method: 'POST',
            token,
            tenantId: company.id,
            locale,
          });
        }
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || (isRu ? 'Ошибка сохранения документа' : 'Hujjatni saqlashda xatolik yuz berdi'));
    } finally {
      setLoading(false);
    }
  };

  const supplierOptions: SelectOption[] = counterparties.map((c) => ({
    value: c.id,
    label: c.name,
  }));

  const warehouseOptions: SelectOption[] = warehouses.map((w) => ({
    value: w.id,
    label: getProductName(w.name),
  }));

  const productOptions: SelectOption[] = products.map((p) => ({
    value: p.id,
    label: `${getProductName(p.name)} (${p.sku || 'SKU yo\'q'})`,
  }));

  const currencyOptions: SelectOption[] = [
    { value: 'UZS', label: 'UZS' },
    { value: 'USD', label: 'USD' },
    { value: 'EUR', label: 'EUR' },
    { value: 'RUB', label: 'RUB' },
  ];

  const vatOptions: SelectOption[] = [
    { value: '0', label: '0%' },
    { value: '12', label: '12%' },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? `${isRu ? 'Редактирование приходного документа:' : 'Xarid Hujjatini Tahrirlash:'} ${initialData.docNumber}` : (isRu ? 'Новый приходный документ' : 'Yangi Tovar Qabul Qilish Hujjati')}
      size="3xl"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', width: '100%' }}>
        {error && (
          <div
            style={{
              padding: 'var(--space-3)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-danger-50)',
              color: 'var(--color-danger-700)',
              fontSize: 'var(--text-sm)',
              border: '1px solid var(--color-danger-200)',
            }}
          >
            {error}
          </div>
        )}

        {/* Header Form Card */}
        <div style={{ padding: 'var(--space-4)', backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)', marginBottom: '6px', display: 'block' }}>
              {isRu ? 'Поставщик *' : 'Yetkazib beruvchi *'}
            </label>
            <Select
              options={supplierOptions}
              value={counterpartyId}
              onChange={(val) => setCounterpartyId(val)}
            />
          </div>

          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)', marginBottom: '6px', display: 'block' }}>
              {isRu ? 'Склад *' : 'Ombor *'}
            </label>
            <Select
              options={warehouseOptions}
              value={warehouseId}
              onChange={(val) => setWarehouseId(val)}
            />
          </div>

          <DatePicker
            label={isRu ? 'Дата документа' : 'Hujjat sanasi'}
            value={docDate}
            onChange={(val) => setDocDate(val)}
          />

          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)', marginBottom: '6px', display: 'block' }}>
              {isRu ? 'Валюта и курс' : 'Valyuta va kurs'}
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Select
                options={currencyOptions}
                value={currency}
                onChange={(val) => setCurrency(val)}
                style={{ width: '95px' }}
              />
              <Input
                type="number"
                step="0.0001"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(parseFloat(e.target.value) || 1)}
                placeholder={isRu ? 'Курс' : 'Kurs'}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)', marginBottom: '6px', display: 'block' }}>
              {isRu ? 'Договор №' : 'Shartnoma №'}
            </label>
            <Input value={contractNumber} onChange={(e) => setContractNumber(e.target.value)} placeholder={isRu ? 'Например: ДГ-102' : 'Masalan: SH-102'} />
          </div>

          <DatePicker
            label={isRu ? 'Дата договора' : 'Shartnoma sanasi'}
            value={contractDate}
            onChange={(val) => setContractDate(val)}
          />
        </div>

        {/* Collapsible GTD Import Panel */}
        <div style={{ border: '1px border var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-3)' }}>
          <button
            type="button"
            onClick={() => setShowGtd(!showGtd)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 'var(--font-semibold)',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-primary-600)',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={16} /> {isRu ? 'Привязать данные Импорта / ГТД' : 'Import / GTD Ma\'lumotlarini biriktirish'}
            </span>
            {showGtd ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showGtd && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-3)', marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-border-light)' }}>
              <div>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)', marginBottom: '4px', display: 'block' }}>{isRu ? '№ ГТД' : 'GTD Hujjat №'}</label>
                <Input value={gtdNumber} onChange={(e) => setGtdNumber(e.target.value)} placeholder="00000/00.00.00/0000000" />
              </div>
              <DatePicker
                label={isRu ? 'Дата ГТД' : 'GTD Sanasi'}
                value={gtdDate}
                onChange={(val) => setGtdDate(val)}
              />
              <div>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)', marginBottom: '4px', display: 'block' }}>{isRu ? 'Таможенный пост' : 'Bojxona Posti'}</label>
                <Input value={customsPost} onChange={(e) => setCustomsPost(e.target.value)} placeholder={isRu ? 'Например: Ташкент-Аэро ГТД' : 'Masalan: Toshkent-Aero GTD'} />
              </div>
            </div>
          )}
        </div>

        {/* Items Table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-base)', color: 'var(--color-text-primary)' }}>{isRu ? 'Состав закупки (Товары)' : 'Xarid Tarkibi (Tovarlar)'}</h4>
            <Button size="sm" variant="secondary" onClick={handleAddItem}>
              <Plus size={15} style={{ marginRight: '4px' }} /> {isRu ? 'Добавить товар' : 'Tovar qo\'shish'}
            </Button>
          </div>

          <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', minHeight: '220px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '10px 8px', textAlign: 'center', width: '40px', color: 'var(--color-text-tertiary)' }}>#</th>
                  <th style={{ padding: '10px 8px', textAlign: 'left', minWidth: '340px' }}>{isRu ? 'ТОВАР / SKU' : 'TOVAR / SKU'}</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right', width: '110px' }}>{isRu ? 'КОЛ-ВО' : 'MIQDOR'}</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right', width: '130px' }}>{isRu ? 'ЦЕНА' : 'NARXI'} ({currency})</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right', width: '110px' }}>{isRu ? 'СКИДКА' : 'CHEGIRMA'}</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right', width: '95px' }}>{isRu ? 'НДС %' : 'QQS %'}</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right', width: '150px' }}>{isRu ? 'ОБЩАЯ СУММА' : 'JAMI SUMMA'}</th>
                  <th style={{ padding: '10px 8px', width: '40px' }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const lineTotal = Math.max(0, item.quantity * item.unitPrice - item.discount) * (1 + item.vatRate / 100);
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                      <td style={{ padding: '6px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontWeight: 'var(--font-medium)' }}>
                        {idx + 1}
                      </td>
                      <td style={{ padding: '6px' }}>
                        <Select
                          options={productOptions}
                          value={item.productId}
                          onChange={(val) => handleItemChange(idx, 'productId', val)}
                        />
                      </td>
                      <td style={{ padding: '6px' }}>
                        <Input
                          type="number"
                          step="0.001"
                          min="0.001"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(idx, 'quantity', parseFloat(e.target.value) || 0)}
                          style={{ textAlign: 'right' }}
                        />
                      </td>
                      <td style={{ padding: '6px' }}>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.unitPrice}
                          onChange={(e) => handleItemChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                          style={{ textAlign: 'right' }}
                        />
                      </td>
                      <td style={{ padding: '6px' }}>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.discount}
                          onChange={(e) => handleItemChange(idx, 'discount', parseFloat(e.target.value) || 0)}
                          style={{ textAlign: 'right' }}
                        />
                      </td>
                      <td style={{ padding: '6px' }}>
                        <Select
                          options={vatOptions}
                          value={item.vatRate.toString()}
                          onChange={(val) => handleItemChange(idx, 'vatRate', parseFloat(val) || 0)}
                        />
                      </td>
                      <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-xs)' }} className="tabular-nums">
                        {lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
                      </td>
                      <td style={{ padding: '6px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          disabled={items.length <= 1}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger-600)', opacity: items.length <= 1 ? 0.3 : 1 }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Comment */}
        <div>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)', marginBottom: '4px', display: 'block' }}>
            {isRu ? 'Комментарий / Примечания' : 'Izoh / Izohlar'}
          </label>
          <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder={isRu ? 'Дополнительные примечания к закупке...' : 'Xarid bo\'yicha qo\'shimcha izoh...'} />
        </div>

        {/* Totals Summary Card */}
        <div
          style={{
            padding: 'var(--space-4)',
            borderRadius: 'var(--radius-lg)',
            backgroundColor: 'var(--color-bg-tertiary)',
            border: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 'var(--text-sm)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', gap: 'var(--space-6)' }}>
            <div>
              <span style={{ color: 'var(--color-text-tertiary)' }}>{isRu ? 'Подытог:' : 'Subtotal:'} </span>
              <strong>{totals.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-tertiary)' }}>{isRu ? 'Скидка:' : 'Chegirma:'} </span>
              <strong style={{ color: 'var(--color-danger-600)' }}>-{totals.discount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-tertiary)' }}>{isRu ? 'НДС:' : 'QQS:'} </span>
              <strong>+{totals.vat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}</strong>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)' }}>{isRu ? 'Общая стоимость:' : 'Jami Qiymat:'}</span>
            <span
              style={{
                fontSize: 'var(--text-xl)',
                fontWeight: 'var(--font-bold)',
                color: 'var(--color-primary-600)',
                backgroundColor: 'var(--color-primary-50)',
                padding: '4px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-primary-200)',
              }}
              className="tabular-nums"
            >
              {totals.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {isRu ? 'Отмена' : 'Bekor qilish'}
          </Button>
          <Button variant="outline" onClick={() => handleSubmit(false)} disabled={loading}>
            {isRu ? 'Сохранить как черновик' : 'Qoralama sifatida saqlash'}
          </Button>
          <Button onClick={() => handleSubmit(true)} disabled={loading}>
            {loading ? (isRu ? 'Сохранение...' : 'Saqlanmoqda...') : (isRu ? 'Провести и оприходовать на склад' : 'Tasdiqlab Omborga Kirim Qilish')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
