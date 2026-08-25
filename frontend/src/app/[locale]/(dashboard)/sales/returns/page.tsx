'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { Select, SelectOption } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { RotateCcw, Plus, Trash2, AlertTriangle } from 'lucide-react';

interface SalesReturnRow {
  id: string;
  returnNumber: string;
  returnDate: string;
  counterparty?: { name: string };
  warehouse?: { name: any };
  invoice?: { invoiceNumber: string };
  totalAmount: number;
  currency: string;
  reason?: string;
  status: string;
  items?: any[];
  createdBy?: { firstName: string; lastName: string };
}

interface CounterpartyItem {
  id: string;
  name: string;
}
interface WarehouseItem {
  id: string;
  name: any;
}
interface ProductItem {
  id: string;
  name: any;
  salePrice: number;
  sku: string;
}
interface InvoiceItem {
  id: string;
  invoiceNumber: string;
  counterpartyId: string;
  totalAmount: number;
}

interface ItemRow {
  productId: string;
  quantity: number;
  unitPrice: number;
  _name: string;
}

export default function SalesReturnsPage() {
  const { token, company } = useAuth();
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  const [returns, setReturns] = useState<SalesReturnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [counterparties, setCounterparties] = useState<CounterpartyItem[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);

  // Create Modal state
  const [showModal, setShowModal] = useState(false);
  const [counterpartyId, setCounterpartyId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [returnDate, setReturnDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [items, setItems] = useState<ItemRow[]>([]);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchReturns = () => {
    if (!token || !company) return;
    setLoading(true);
    apiFetch<SalesReturnRow[]>('/sales/returns', { token: token || undefined, tenantId: company.id, locale })
      .then((res) => setReturns(res || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!token || !company) return;
    fetchReturns();
    apiFetch<CounterpartyItem[]>('/sales/counterparties', { token: token || undefined, tenantId: company.id, locale })
      .then((res) => setCounterparties(res || []))
      .catch(console.error);
    apiFetch<WarehouseItem[]>('/tenants/warehouses', { token: token || undefined, tenantId: company.id, locale })
      .then((res) => setWarehouses(res || []))
      .catch(console.error);
    apiFetch<ProductItem[]>('/inventory/products', { token: token || undefined, tenantId: company.id, locale })
      .then((res) => setProducts(res || []))
      .catch(console.error);
    apiFetch<InvoiceItem[]>('/sales/invoices?status=POSTED', { token: token || undefined, tenantId: company.id, locale })
      .then((res) => setInvoices(res || []))
      .catch(console.error);
  }, [token, company, locale]);

  const getProductName = (p: ProductItem) => {
    if (!p.name) return '—';
    if (typeof p.name === 'string') return p.name;
    return p.name[locale] || p.name.ru || p.name.uz || '—';
  };

  const addItem = () => {
    setItems((prev) => [...prev, { productId: '', quantity: 1, unitPrice: 0, _name: '' }]);
  };

  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof ItemRow, val: any) => {
    setItems((prev) => {
      const next = [...prev];
      if (field === 'productId') {
        const p = products.find((pr) => pr.id === val);
        next[idx] = { ...next[idx], productId: val, unitPrice: p ? Number(p.salePrice || 0) : 0, _name: p ? getProductName(p) : '' };
      } else {
        next[idx] = { ...next[idx], [field]: val };
      }
      return next;
    });
  };

  const totalAmount = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  const handleSubmit = async () => {
    if (!token || !company) return;
    if (!counterpartyId) { setFormError(isRu ? 'Выберите клиента' : 'Mijozni tanlang'); return; }
    if (!warehouseId) { setFormError(isRu ? 'Выберите склад' : 'Ombor tanlang'); return; }
    if (items.length === 0) { setFormError(isRu ? 'Добавьте хотя бы один товар' : 'Kamida bitta tovar qo\'shing'); return; }
    if (items.some((i) => !i.productId)) { setFormError(isRu ? 'Выберите товар во всех строках' : 'Barcha qatorlarda tovar tanlanishi shart'); return; }
    setFormLoading(true);
    setFormError(null);
    try {
      await apiFetch('/sales/returns', {
        method: 'POST',
        token: token || undefined,
        tenantId: company.id,
        locale,
        body: JSON.stringify({
          counterpartyId,
          warehouseId,
          invoiceId: invoiceId || undefined,
          returnDate,
          reason: reason || undefined,
          currency: 'UZS',
          items: items.map((i) => ({
            productId: i.productId,
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice),
          })),
        }),
      });
      setShowModal(false);
      setItems([]);
      setReason('');
      fetchReturns();
    } catch (err: any) {
      setFormError(err?.message || (isRu ? 'Произошла ошибка' : 'Xatolik yuz berdi'));
    } finally {
      setFormLoading(false);
    }
  };

  const cpOptions: SelectOption[] = counterparties.map((c) => ({ value: c.id, label: c.name }));
  const whOptions: SelectOption[] = warehouses.map((w) => ({
    value: w.id,
    label: typeof w.name === 'object' ? (w.name[locale] || w.name.ru || w.name.uz || '') : w.name,
  }));
  const productOptions: SelectOption[] = [
    { value: '', label: isRu ? '— Выберите товар —' : '— Tovar tanlang —' },
    ...products.map((p) => ({ value: p.id, label: getProductName(p) })),
  ];
  const invoiceOptions: SelectOption[] = [
    { value: '', label: isRu ? '— Без документа продажи —' : '— Hujjatsiz qaytarish —' },
    ...invoices.map((inv) => ({ value: inv.id, label: `${inv.invoiceNumber}` })),
  ];

  const tableHeaders = [
    isRu ? '№ Документа' : 'Hujjat №',
    isRu ? 'Дата' : 'Sana',
    isRu ? 'Клиент' : 'Mijoz',
    isRu ? 'Исходная продажа' : 'Asl sotuv',
    isRu ? 'Сумма' : 'Summa',
    isRu ? 'Причина' : 'Sabab',
    isRu ? 'Создатель' : 'Yaratuvchi',
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {isRu ? 'Возврат от покупателя' : 'Mijozdan qaytarish'}
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 4 }}>
            {isRu ? 'При возврате товаров восстанавливаются остатки на складе и уменьшается долг клиента' : 'Tovarlar qaytarilganda ombor qoldig\'i tiklanadi va mijoz qarzi kamayadi'}
          </p>
        </div>
        <Button id="create-return-btn" onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={16} /> {isRu ? 'Новый возврат' : 'Yangi qaytarish'}
        </Button>
      </div>

      {/* Table */}
      <Card>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                {tableHeaders.map((h) => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)' }}>{isRu ? 'Загрузка...' : 'Yuklanmoqda...'}</td></tr>
              ) : returns.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)' }}>
                    <RotateCcw size={36} style={{ margin: '0 auto 10px', opacity: 0.3, display: 'block' }} />
                    {isRu ? 'Документы возврата от покупателя отсутствуют' : 'Qaytarish hujjatlari topilmadi'}
                  </td>
                </tr>
              ) : (
                returns.map((ret) => (
                  <tr key={ret.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 600, fontSize: 'var(--text-sm)' }}>{ret.returnNumber}</td>
                    <td style={{ padding: '12px 14px', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{formatDate(ret.returnDate, locale)}</td>
                    <td style={{ padding: '12px 14px', fontSize: 'var(--text-sm)' }}>{ret.counterparty?.name || '—'}</td>
                    <td style={{ padding: '12px 14px', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{ret.invoice?.invoiceNumber || '—'}</td>
                    <td style={{ padding: '12px 14px', fontWeight: 600, fontSize: 'var(--text-sm)' }}>{formatCurrency(Number(ret.totalAmount), locale)}</td>
                    <td style={{ padding: '12px 14px', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{ret.reason || '—'}</td>
                    <td style={{ padding: '12px 14px', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                      {ret.createdBy ? `${ret.createdBy.firstName} ${ret.createdBy.lastName}` : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create Return Side Drawer Panel */}
      <Drawer
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={isRu ? 'Новый документ возврата' : 'Yangi qaytarish hujjati'}
        description={isRu ? 'Оформление возврата товаров на склад от покупателя' : 'Mijozdan tovarlarni omborga qaytarishni rasmiylashtirish'}
        icon={<RotateCcw size={20} />}
        size="lg"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', width: '100%' }}>
            <Button id="ret-cancel-btn" variant="secondary" onClick={() => setShowModal(false)} disabled={formLoading}>
              {isRu ? 'Отмена' : 'Bekor qilish'}
            </Button>
            <Button id="ret-submit-btn" onClick={handleSubmit} disabled={formLoading || items.length === 0} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <RotateCcw size={16} />
              {formLoading ? (isRu ? 'Сохранение...' : 'Saqlanmoqda...') : (isRu ? 'Оформить возврат' : 'Qaytarishni rasmiylashtirish')}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-3)' }}>
            <Select id="ret-counterparty" label={isRu ? 'Клиент *' : 'Mijoz *'} value={counterpartyId} onChange={(val) => setCounterpartyId(val)} options={cpOptions} />
            <Select id="ret-warehouse" label={isRu ? 'Склад *' : 'Ombor *'} value={warehouseId} onChange={(val) => setWarehouseId(val)} options={whOptions} />
            <Select id="ret-invoice" label={isRu ? 'Документ продажи' : 'Asl sotuv hujjati'} value={invoiceId} onChange={(val) => setInvoiceId(val)} options={invoiceOptions} />
            <DatePicker label={isRu ? 'Дата *' : 'Sana *'} value={returnDate} onChange={(val) => setReturnDate(val)} />
          </div>
          <Input id="ret-reason" label={isRu ? 'Причина возврата' : 'Qaytarish sababi'} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={isRu ? 'Напр. Бракованный товар' : 'Mas. Sifatsiz tovar'} />

          {/* Items */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong style={{ fontSize: 'var(--text-sm)' }}>{isRu ? 'Возвращаемые товары' : 'Qaytariladigan tovarlar'}</strong>
              <Button id="ret-add-item-btn" size="sm" variant="secondary" onClick={addItem}><Plus size={13} /> {isRu ? 'Добавить' : 'Qo\'shish'}</Button>
            </div>
            {items.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', background: 'var(--color-bg-subtle)' }}>
                {isRu ? 'Добавьте возвращаемые товары' : 'Qaytariladigan tovarlarni qo\'shing'}
              </div>
            ) : (
              <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--color-bg-subtle)' }}>
                      {[isRu ? 'Товар' : 'Tovar', isRu ? 'Количество' : 'Miqdor', isRu ? 'Цена' : 'Narx', isRu ? 'Итого' : 'Jami', ''].map((h) => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                        <td style={{ padding: '6px 10px' }}>
                          <Select
                            id={`ret-product-${idx}`}
                            value={item.productId}
                            onChange={(val) => updateItem(idx, 'productId', val)}
                            options={productOptions}
                            size="sm"
                          />
                        </td>
                        <td style={{ padding: '6px 8px', width: 80 }}>
                          <input id={`ret-qty-${idx}`} type="number" min={1} value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))} style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-input)', color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)' }} />
                        </td>
                        <td style={{ padding: '6px 8px', width: 110 }}>
                          <input id={`ret-price-${idx}`} type="number" min={0} value={item.unitPrice} onChange={(e) => updateItem(idx, 'unitPrice', Number(e.target.value))} style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-input)', color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)' }} />
                        </td>
                        <td style={{ padding: '6px 10px', fontSize: 'var(--text-sm)', fontWeight: 600 }}>{formatCurrency(item.quantity * item.unitPrice, locale)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'center', width: 40 }}>
                          <button id={`ret-remove-${idx}`} onClick={() => removeItem(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={15} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--color-bg-subtle)', borderTop: '2px solid var(--color-border)' }}>
                      <td colSpan={3} style={{ padding: '10px', textAlign: 'right', fontWeight: 600, fontSize: 'var(--text-sm)' }}>{isRu ? 'Итого возврат:' : 'Jami qaytarish:'}</td>
                      <td colSpan={2} style={{ padding: '10px', fontWeight: 700, fontSize: 'var(--text-base)', color: '#f59e0b' }}>{formatCurrency(totalAmount, locale)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {formError && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: 'var(--radius-md)', padding: '10px 14px', color: '#ef4444', fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={16} /> {formError}
            </div>
          )}
        </div>
      </Drawer>
    </div>
  );
}
