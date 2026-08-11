'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select, SelectOption } from '@/components/ui/Select';
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

  const [returns, setReturns] = useState<SalesReturnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // References
  const [counterparties, setCounterparties] = useState<CounterpartyItem[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);

  // Form
  const [counterpartyId, setCounterpartyId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('');
  const [items, setItems] = useState<ItemRow[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  const fetchReturns = () => {
    if (!token || !company) return;
    setLoading(true);
    apiFetch<SalesReturnRow[]>('/sales/returns', {
      token: token || undefined,
      tenantId: company.id,
    })
      .then(setReturns)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const fetchRefs = () => {
    if (!token || !company) return;
    Promise.all([
      apiFetch<CounterpartyItem[]>('/counterparties?type=CUSTOMER', { token: token || undefined, tenantId: company.id }).catch(() => []),
      apiFetch<WarehouseItem[]>('/inventory/warehouses', { token: token || undefined, tenantId: company.id }).catch(() => []),
      apiFetch<ProductItem[]>('/inventory/products', { token: token || undefined, tenantId: company.id }).catch(() => []),
      apiFetch<InvoiceItem[]>('/sales/invoices?status=POSTED', { token: token || undefined, tenantId: company.id }).catch(() => []),
    ]).then(([cp, wh, pr, inv]) => {
      setCounterparties(cp as CounterpartyItem[]);
      setWarehouses(wh as WarehouseItem[]);
      setProducts(pr as ProductItem[]);
      setInvoices(inv as InvoiceItem[]);
      if (cp.length > 0) setCounterpartyId((cp[0] as CounterpartyItem).id);
      if (wh.length > 0) setWarehouseId((wh[0] as WarehouseItem).id);
    });
  };

  useEffect(() => {
    fetchReturns();
    fetchRefs();
  }, [token, company]);

  const getProductName = (p: ProductItem) =>
    typeof p.name === 'object' ? (p.name[locale] || p.name.uz || p.name.ru || '') : (p.name || '');

  const addItem = () => setItems((prev) => [...prev, { productId: '', quantity: 1, unitPrice: 0, _name: '' }]);
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
    if (!counterpartyId) { setFormError('Mijozni tanlang'); return; }
    if (!warehouseId) { setFormError('Ombor tanlang'); return; }
    if (items.length === 0) { setFormError('Kamida bitta tovar qo\'shing'); return; }
    if (items.some((i) => !i.productId)) { setFormError('Barcha qatorlarda tovar tanlanishi shart'); return; }
    setFormLoading(true);
    setFormError(null);
    try {
      await apiFetch('/sales/returns', {
        method: 'POST',
        token: token || undefined,
        tenantId: company.id,
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
      setFormError(err?.message || 'Xatolik yuz berdi');
    } finally {
      setFormLoading(false);
    }
  };

  const cpOptions: SelectOption[] = counterparties.map((c) => ({ value: c.id, label: c.name }));
  const whOptions: SelectOption[] = warehouses.map((w) => ({
    value: w.id,
    label: typeof w.name === 'object' ? (w.name[locale] || w.name.uz || '') : w.name,
  }));
  const productOptions: SelectOption[] = [
    { value: '', label: '— Tovar tanlang —' },
    ...products.map((p) => ({ value: p.id, label: getProductName(p) })),
  ];
  const filteredInvoices = invoiceId
    ? invoices
    : invoices.filter((inv) => !counterpartyId || inv.counterpartyId === counterpartyId);
  const invoiceOptions: SelectOption[] = [
    { value: '', label: '— Hujjatsiz qaytarish —' },
    ...invoices.map((inv) => ({ value: inv.id, label: `${inv.invoiceNumber}` })),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Mijozdan qaytarish
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 4 }}>
            Tovarlar qaytarilganda ombor qoldig'i tiklanadi va mijoz qarzi kamayadi
          </p>
        </div>
        <Button id="create-return-btn" onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={16} /> Yangi qaytarish
        </Button>
      </div>

      {/* Table */}
      <Card>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                {['Hujjat №', 'Sana', 'Mijoz', 'Asl sotuv', 'Summa', 'Sabab', 'Yaratuvchi'].map((h) => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)' }}>Yuklanmoqda...</td></tr>
              ) : returns.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)' }}>
                    <RotateCcw size={36} style={{ margin: '0 auto 10px', opacity: 0.3, display: 'block' }} />
                    Qaytarish hujjatlari topilmadi
                  </td>
                </tr>
              ) : (
                returns.map((ret) => (
                  <tr key={ret.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 600, fontSize: 'var(--text-sm)' }}>{ret.returnNumber}</td>
                    <td style={{ padding: '12px 14px', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{formatDate(ret.returnDate)}</td>
                    <td style={{ padding: '12px 14px', fontSize: 'var(--text-sm)' }}>{ret.counterparty?.name || '—'}</td>
                    <td style={{ padding: '12px 14px', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{ret.invoice?.invoiceNumber || '—'}</td>
                    <td style={{ padding: '12px 14px', fontWeight: 600, fontSize: 'var(--text-sm)' }}>{formatCurrency(Number(ret.totalAmount), ret.currency || 'UZS')}</td>
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

      {/* Create Modal */}
      {showModal && (
        <Modal isOpen={true} onClose={() => setShowModal(false)} title="Yangi qaytarish hujjati" size="xl">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--space-3)' }}>
              <Select id="ret-counterparty" label="Mijoz *" value={counterpartyId} onChange={(val) => setCounterpartyId(val)} options={cpOptions} />
              <Select id="ret-warehouse" label="Ombor *" value={warehouseId} onChange={(val) => setWarehouseId(val)} options={whOptions} />
              <Select id="ret-invoice" label="Asl sotuv hujjati" value={invoiceId} onChange={(val) => setInvoiceId(val)} options={invoiceOptions} />
              <Input id="ret-date" label="Sana *" type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
              <Input id="ret-reason" label="Qaytarish sababi" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Mas. Sifatsiz tovar" />
            </div>

            {/* Items */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <strong>Qaytariladigan tovarlar</strong>
                <Button id="ret-add-item-btn" size="sm" variant="secondary" onClick={addItem}><Plus size={13} /> Qo'shish</Button>
              </div>
              {items.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
                  Qaytariladigan tovarlarni qo'shing
                </div>
              ) : (
                <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--color-bg-subtle)' }}>
                        {['Tovar', 'Miqdor', 'Narx', 'Jami', ''].map((h) => (
                          <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                          <td style={{ padding: '6px 10px' }}>
                            <select
                              id={`ret-product-${idx}`}
                              value={item.productId}
                              onChange={(e) => updateItem(idx, 'productId', e.target.value)}
                              style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-input)', color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)' }}
                            >
                              {productOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </td>
                          <td style={{ padding: '6px 8px', width: 80 }}>
                            <input id={`ret-qty-${idx}`} type="number" min={1} value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))} style={{ width: '100%', padding: '5px 6px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-input)', color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)' }} />
                          </td>
                          <td style={{ padding: '6px 8px', width: 110 }}>
                            <input id={`ret-price-${idx}`} type="number" min={0} value={item.unitPrice} onChange={(e) => updateItem(idx, 'unitPrice', Number(e.target.value))} style={{ width: '100%', padding: '5px 6px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-input)', color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)' }} />
                          </td>
                          <td style={{ padding: '6px 10px', fontSize: 'var(--text-sm)', fontWeight: 600 }}>{formatCurrency(item.quantity * item.unitPrice, 'UZS')}</td>
                          <td style={{ padding: '6px 8px' }}>
                            <button id={`ret-remove-${idx}`} onClick={() => removeItem(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={14} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: 'var(--color-bg-subtle)', borderTop: '2px solid var(--color-border)' }}>
                        <td colSpan={3} style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>Jami qaytarish:</td>
                        <td colSpan={2} style={{ padding: '8px 10px', fontWeight: 700 }}>{formatCurrency(totalAmount, 'UZS')}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {formError && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: 'var(--radius-md)', padding: '10px 14px', color: '#ef4444', fontSize: 'var(--text-sm)', display: 'flex', gap: 8 }}>
                <AlertTriangle size={16} /> {formError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--color-border-light)' }}>
              <Button id="ret-cancel-btn" variant="secondary" onClick={() => setShowModal(false)} disabled={formLoading}>Bekor qilish</Button>
              <Button id="ret-submit-btn" onClick={handleSubmit} disabled={formLoading || items.length === 0}>
                {formLoading ? 'Saqlanmoqda...' : 'Qaytarishni rasmiylashtirish'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
