'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { formatCurrency, CURRENCY_OPTIONS } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, SelectOption } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { Checkbox } from '@/components/ui/Checkbox';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';

interface CounterpartyOption {
  id: string;
  name: string;
}
interface WarehouseOption {
  id: string;
  name: any;
}
interface ProductOption {
  id: string;
  name: any;
  sku: string;
  salePrice: number;
  costPrice: number;
  unitOfMeasure: string;
}
interface ItemRow {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  vatRate: number;
  // UI-only
  _name: string;
  _costPrice: number;
  _stock: number;
}

interface CreateSalesInvoiceModalProps {
  onClose: () => void;
  onCreated: () => void;
  counterparties: CounterpartyOption[];
  warehouses: WarehouseOption[];
}

export function CreateSalesInvoiceModal({
  onClose,
  onCreated,
  counterparties,
  warehouses,
}: CreateSalesInvoiceModalProps) {
  const { token, company } = useAuth();
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Header fields
  const [counterpartyId, setCounterpartyId] = useState(counterparties[0]?.id || '');
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || '');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [currency, setCurrency] = useState('UZS');
  const [contractNumber, setContractNumber] = useState('');
  const [comment, setComment] = useState('');
  const [postImmediately, setPostImmediately] = useState(true);

  // Line items
  const [items, setItems] = useState<ItemRow[]>([]);

  // Fetch catalog products
  useEffect(() => {
    if (!token || !company) return;
    apiFetch<ProductOption[]>('/inventory/products', {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then((res) => setProducts(res || []))
      .catch(console.error);
  }, [token, company, locale]);

  // Fetch stock levels when warehouse changes
  useEffect(() => {
    if (!token || !company || !warehouseId) return;
    apiFetch<any[]>(`/inventory/stock-levels?warehouseId=${warehouseId}`, {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then((stockList) => {
        const stockMap = new Map<string, number>();
        (stockList || []).forEach((s) => stockMap.set(s.productId, Number(s.quantity || 0)));

        setItems((prev) =>
          prev.map((row) => ({
            ...row,
            _stock: stockMap.get(row.productId) ?? 0,
          }))
        );
      })
      .catch(console.error);
  }, [warehouseId, token, company, locale]);

  const getProductName = (p: ProductOption) => {
    if (!p.name) return '';
    return typeof p.name === 'object' ? (p.name[locale] || p.name.uz || p.name.ru || '') : p.name;
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        productId: '',
        quantity: 1,
        unitPrice: 0,
        discount: 0,
        vatRate: 0,
        _name: '',
        _costPrice: 0,
        _stock: 0,
      },
    ]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof ItemRow, value: any) => {
    setItems((prev) => {
      const next = [...prev];
      const row = { ...next[index], [field]: value };

      if (field === 'productId') {
        const prod = products.find((p) => p.id === value);
        if (prod) {
          row._name = getProductName(prod);
          row._costPrice = Number(prod.costPrice || 0);
          row.unitPrice = Number(prod.salePrice || 0);
        }
      }

      next[index] = row;
      return next;
    });
  };

  const calcLineTotal = (item: ItemRow) => {
    const base = item.quantity * item.unitPrice - item.discount;
    const withVat = base * (1 + item.vatRate / 100);
    return Math.max(0, withVat);
  };

  const totalAmount = items.reduce((sum, item) => sum + calcLineTotal(item), 0);

  const handleSubmit = async () => {
    if (!counterpartyId) {
      setError(isRu ? 'Выберите клиента' : 'Mijozni tanlang');
      return;
    }
    if (!warehouseId) {
      setError(isRu ? 'Выберите склад' : 'Omborni tanlang');
      return;
    }
    if (items.length === 0) {
      setError(isRu ? 'Добавьте хотя бы один товар' : 'Kamida bitta tovar qo\'shing');
      return;
    }
    for (const item of items) {
      if (!item.productId) {
        setError(isRu ? 'Выберите товар во всех строках' : 'Barcha qatorlarda tovar tanlanishi shart');
        return;
      }
      if (item.quantity <= 0) {
        setError(isRu ? 'Количество товара должно быть больше 0' : 'Tovar miqdori 0 dan katta bo\'lishi kerak');
        return;
      }
    }

    setLoading(true);
    setError(null);

    const payload = {
      counterpartyId,
      warehouseId,
      invoiceDate,
      currency,
      contractNumber: contractNumber || undefined,
      comment: comment || undefined,
      items: items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discount: i.discount,
        vatRate: i.vatRate,
      })),
    };

    try {
      const created = await apiFetch<any>('/sales/invoices', {
        method: 'POST',
        token: token || undefined,
        tenantId: company?.id,
        locale,
        body: JSON.stringify(payload),
      });

      if (postImmediately && created && created.id) {
        await apiFetch(`/sales/invoices/${created.id}/post`, {
          method: 'POST',
          token: token || undefined,
          tenantId: company?.id,
          locale,
        });
      }

      onCreated();
    } catch (err: any) {
      setError(err?.message || (isRu ? 'Ошибка сохранения' : 'Saqlashda xato yuz berdi'));
    } finally {
      setLoading(false);
    }
  };

  const counterpartyOptions: SelectOption[] = counterparties.map((c) => ({
    value: c.id,
    label: c.name,
  }));
  const warehouseOptions: SelectOption[] = warehouses.map((w) => ({
    value: w.id,
    label: typeof w.name === 'object' ? (w.name[locale] || w.name.uz || '') : w.name,
  }));
  const productOptions: SelectOption[] = [
    { value: '', label: isRu ? '— Выберите товар —' : '— Tovar tanlang —' },
    ...products.map((p) => ({ value: p.id, label: `${getProductName(p)} (${p.sku || '—'})` })),
  ];

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={isRu ? 'Новый документ продажи' : 'Yangi sotuv hujjati'}
      size="2xl"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {/* Header fields */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--space-3)' }}>
          <Select
            id="modal-counterparty-select"
            label={isRu ? 'Клиент *' : 'Mijoz *'}
            value={counterpartyId}
            onChange={(val) => setCounterpartyId(val)}
            options={counterpartyOptions}
          />
          <Select
            id="modal-warehouse-select"
            label={isRu ? 'Склад *' : 'Ombor *'}
            value={warehouseId}
            onChange={(val) => setWarehouseId(val)}
            options={warehouseOptions}
          />
          <DatePicker
            label={isRu ? 'Дата *' : 'Sana *'}
            value={invoiceDate}
            onChange={(val) => setInvoiceDate(val)}
          />
          <Select
            id="modal-currency-select"
            label={isRu ? 'Валюта' : 'Valyuta'}
            value={currency}
            onChange={(val) => setCurrency(val)}
            options={[
              { value: 'UZS', label: 'UZS' },
              { value: 'USD', label: 'USD' },
              { value: 'EUR', label: 'EUR' },
            ]}
          />
          <Input
            id="modal-contract-number"
            label={isRu ? '№ Договора' : 'Shartnoma raqami'}
            value={contractNumber}
            onChange={(e) => setContractNumber(e.target.value)}
            placeholder="12345"
          />
          <Input
            id="modal-comment"
            label={isRu ? 'Комментарий' : 'Izoh'}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={isRu ? 'Необязательный комментарий...' : 'Ixtiyoriy izoh...'}
          />
        </div>

        {/* Items table */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ fontWeight: 600, fontSize: 'var(--text-base)', color: 'var(--color-text-primary)' }}>
              {isRu ? 'Список товаров' : 'Tovarlar ro\'yxati'}
            </h3>
            <Button id="add-item-btn" size="sm" variant="secondary" onClick={addItem}>
              <Plus size={14} style={{ marginRight: 4 }} /> {isRu ? 'Добавить' : 'Qo\'shish'}
            </Button>
          </div>

          {items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)' }}>
              {isRu ? 'Нажмите "Добавить" выше, чтобы добавить товар' : 'Tovar qo\'shish uchun yuqoridagi "Qo\'shish" tugmasini bosing'}
            </div>
          ) : (
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflowX: 'auto', minHeight: '260px', paddingBottom: '100px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--color-bg-subtle)', borderBottom: '1px solid var(--color-border)' }}>
                    {(isRu
                      ? ['Товар', 'Кол-во', 'Цена', 'Скидка', 'НДС %', 'Итого', '']
                      : ['Tovar', 'Miqdor', 'Narx', 'Chegirma', 'QQS %', 'Jami', '']
                    ).map((h) => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const lineTotal = calcLineTotal(item);
                    const belowCost = item._costPrice > 0 && item.unitPrice < item._costPrice;
                    const overStock = item._stock < item.quantity && item._stock >= 0;

                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--color-border-light)', background: belowCost ? 'rgba(239,68,68,0.04)' : '' }}>
                        <td style={{ padding: '6px 10px', minWidth: 200 }}>
                          <Select
                            id={`item-product-${idx}`}
                            value={item.productId}
                            onChange={(val) => updateItem(idx, 'productId', val)}
                            options={productOptions}
                            size="sm"
                          />
                          {item.productId && (
                            <div style={{ display: 'flex', gap: 8, marginTop: 3, fontSize: 11 }}>
                              {belowCost && (
                                <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: 2 }}>
                                  <AlertTriangle size={10} /> {isRu ? 'Ниже себестоимости!' : 'Tannarxdan past!'}
                                </span>
                              )}
                              {overStock && (
                                <span style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 2 }}>
                                  <AlertTriangle size={10} /> {isRu ? 'Склад:' : 'Ombor:'} {item._stock}
                                </span>
                              )}
                              {!belowCost && !overStock && item._stock > 0 && (
                                <span style={{ color: 'var(--color-text-secondary)' }}>{isRu ? 'Склад:' : 'Ombor:'} {item._stock}</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '6px 8px', width: 80 }}>
                          <input
                            id={`item-qty-${idx}`}
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))}
                            style={{ width: '100%', padding: '5px 6px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-input)', color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)' }}
                          />
                        </td>
                        <td style={{ padding: '6px 8px', width: 110 }}>
                          <input
                            id={`item-price-${idx}`}
                            type="number"
                            min={0}
                            value={item.unitPrice}
                            onChange={(e) => updateItem(idx, 'unitPrice', Number(e.target.value))}
                            style={{ width: '100%', padding: '5px 6px', border: `1px solid ${belowCost ? '#ef4444' : 'var(--color-border)'}`, borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-input)', color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)' }}
                          />
                          {item._costPrice > 0 && (
                            <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                              {isRu ? 'Себест.:' : 'Tan.:'} {formatCurrency(item._costPrice, locale)}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '6px 8px', width: 90 }}>
                          <input
                            id={`item-discount-${idx}`}
                            type="number"
                            min={0}
                            value={item.discount}
                            onChange={(e) => updateItem(idx, 'discount', Number(e.target.value))}
                            style={{ width: '100%', padding: '5px 6px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-input)', color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)' }}
                          />
                        </td>
                        <td style={{ padding: '6px 8px', width: 70 }}>
                          <input
                            id={`item-vat-${idx}`}
                            type="number"
                            min={0}
                            max={100}
                            value={item.vatRate}
                            onChange={(e) => updateItem(idx, 'vatRate', Number(e.target.value))}
                            style={{ width: '100%', padding: '5px 6px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-input)', color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)' }}
                          />
                        </td>
                        <td style={{ padding: '6px 10px', width: 120, fontWeight: 600, fontSize: 'var(--text-sm)', whiteSpace: 'nowrap' }}>
                          {formatCurrency(lineTotal, locale)}
                        </td>
                        <td style={{ padding: '6px 8px', width: 40 }}>
                          <button
                            id={`remove-item-${idx}`}
                            onClick={() => removeItem(idx)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--color-bg-subtle)', borderTop: '2px solid var(--color-border)' }}>
                    <td colSpan={5} style={{ padding: '10px', textAlign: 'right', fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                      {isRu ? 'Итоговая сумма:' : 'Jami summa:'}
                    </td>
                    <td colSpan={2} style={{ padding: '10px', fontWeight: 700, fontSize: 'var(--text-base)' }}>
                      {formatCurrency(totalAmount, locale)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Post immediately toggle */}
        <Checkbox
          id="post-immediately-checkbox"
          checked={postImmediately}
          onChange={(e) => setPostImmediately(e.target.checked)}
          label={isRu ? 'Провести сразу' : 'Darhol tasdiqlash'}
          description={isRu ? 'При сохранении сразу списать со склада и рассчитать COGS' : 'Saqlash bilan birga ombor qoldig\'ini ayirib, COGS hisoblanadi'}
        />

        {/* Error */}
        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: 'var(--radius-md)', padding: '10px 14px', color: '#ef4444', fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--color-border-light)' }}>
          <Button id="cancel-create-btn" variant="secondary" onClick={onClose} disabled={loading}>
            {isRu ? 'Отмена' : 'Bekor qilish'}
          </Button>
          <Button id="submit-create-btn" onClick={handleSubmit} disabled={loading || items.length === 0}>
            {loading ? (isRu ? 'Сохранение...' : 'Saqlanmoqda...') : (postImmediately ? (isRu ? 'Сохранить и провести' : 'Saqlash va Tasdiqlash') : (isRu ? 'Сохранить (Черновик)' : 'Saqlash (Qoralama)'))}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
