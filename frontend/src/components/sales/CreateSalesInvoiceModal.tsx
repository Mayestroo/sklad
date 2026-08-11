'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, SelectOption } from '@/components/ui/Select';
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

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Header form fields
  const [counterpartyId, setCounterpartyId] = useState(counterparties[0]?.id || '');
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || '');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [currency, setCurrency] = useState('UZS');
  const [contractNumber, setContractNumber] = useState('');
  const [comment, setComment] = useState('');
  const [postImmediately, setPostImmediately] = useState(false);

  // Item rows
  const [items, setItems] = useState<ItemRow[]>([]);

  // Stock levels cache (warehouseId+productId → qty)
  const [stockMap, setStockMap] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!token || !company) return;
    apiFetch<ProductOption[]>('/inventory/products', {
      token: token || undefined,
      tenantId: company.id,
    })
      .then(setProducts)
      .catch(console.error);
  }, [token, company]);

  // Reload stock when warehouse changes
  useEffect(() => {
    if (!token || !company || !warehouseId) return;
    apiFetch<any[]>(`/inventory/stock-levels?warehouseId=${warehouseId}`, {
      token: token || undefined,
      tenantId: company.id,
    })
      .then((levels) => {
        const map: Record<string, number> = {};
        levels.forEach((sl) => {
          map[sl.productId] = Number(sl.quantity);
        });
        setStockMap(map);
      })
      .catch(console.error);
  }, [warehouseId, token, company]);

  const getProductName = (p: ProductOption) =>
    typeof p.name === 'object' ? (p.name[locale] || p.name.uz || p.name.ru || '') : (p.name || '');

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { productId: '', quantity: 1, unitPrice: 0, discount: 0, vatRate: 12, _name: '', _costPrice: 0, _stock: 0 },
    ]);
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: keyof ItemRow, value: any) => {
    setItems((prev) => {
      const next = [...prev];
      if (field === 'productId') {
        const prod = products.find((p) => p.id === value);
        next[idx] = {
          ...next[idx],
          productId: value,
          unitPrice: prod ? Number(prod.salePrice || 0) : 0,
          _name: prod ? getProductName(prod) : '',
          _costPrice: prod ? Number(prod.costPrice || 0) : 0,
          _stock: stockMap[value] || 0,
        };
      } else {
        next[idx] = { ...next[idx], [field]: value };
      }
      return next;
    });
  };

  const calcLineTotal = (item: ItemRow) => {
    const sub = item.quantity * item.unitPrice;
    const afterDisc = Math.max(0, sub - item.discount);
    const vat = (afterDisc * item.vatRate) / 100;
    return afterDisc + vat;
  };

  const totalAmount = items.reduce((s, i) => s + calcLineTotal(i), 0);

  const handleSubmit = async () => {
    if (!token || !company) return;
    if (!counterpartyId) { setError('Mijozni tanlang'); return; }
    if (!warehouseId) { setError('Ombor tanlang'); return; }
    if (items.length === 0) { setError('Kamida bitta tovar qo\'shing'); return; }
    if (items.some((i) => !i.productId)) { setError('Barcha qatorlarda tovar tanlanishi shart'); return; }
    if (items.some((i) => i.quantity <= 0)) { setError('Miqdor noldan katta bo\'lishi shart'); return; }
    if (items.some((i) => i.unitPrice <= 0)) { setError('Sotuv narxi noldan katta bo\'lishi shart'); return; }

    // Warning if selling below cost
    const belowCostItems = items.filter((i) => i._costPrice > 0 && i.unitPrice < i._costPrice);
    if (belowCostItems.length > 0) {
      const names = belowCostItems.map((i) => i._name || i.productId).join(', ');
      if (!confirm(`⚠️ Quyidagi tovarlar tannarxidan past narxda sotilmoqda:\n${names}\n\nDavom ettirasizmi?`)) {
        return;
      }
    }

    setLoading(true);
    setError(null);
    try {
      await apiFetch('/sales/invoices', {
        method: 'POST',
        token: token || undefined,
        tenantId: company.id,
        body: JSON.stringify({
          counterpartyId,
          warehouseId,
          invoiceDate,
          currency,
          contractNumber: contractNumber || undefined,
          comment: comment || undefined,
          postImmediately,
          items: items.map((i) => ({
            productId: i.productId,
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice),
            discount: Number(i.discount),
            vatRate: Number(i.vatRate),
          })),
        }),
      });
      onCreated();
    } catch (err: any) {
      setError(err?.message || 'Xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  const counterpartyOptions: SelectOption[] = counterparties.map((c) => ({ value: c.id, label: c.name }));
  const warehouseOptions: SelectOption[] = warehouses.map((w) => ({
    value: w.id,
    label: typeof w.name === 'object' ? (w.name[locale] || w.name.uz || '') : w.name,
  }));
  const productOptions: SelectOption[] = [
    { value: '', label: '— Tovar tanlang —' },
    ...products.map((p) => ({ value: p.id, label: `${getProductName(p)} (${p.sku || '—'})` })),
  ];

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Yangi sotuv hujjati"
      size="xl"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {/* Header fields */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--space-3)' }}>
          <Select
            id="modal-counterparty-select"
            label="Mijoz *"
            value={counterpartyId}
            onChange={(val) => setCounterpartyId(val)}
            options={counterpartyOptions}
          />
          <Select
            id="modal-warehouse-select"
            label="Ombor *"
            value={warehouseId}
            onChange={(val) => setWarehouseId(val)}
            options={warehouseOptions}
          />
          <Input
            id="modal-invoice-date"
            label="Sana *"
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
          />
          <Select
            id="modal-currency-select"
            label="Valyuta"
            value={currency}
            onChange={(val) => setCurrency(val)}
            options={[
              { value: 'UZS', label: 'UZS (So\'m)' },
              { value: 'USD', label: 'USD (Dollar)' },
              { value: 'EUR', label: 'EUR (Evro)' },
            ]}
          />
          <Input
            id="modal-contract-number"
            label="Shartnoma raqami"
            value={contractNumber}
            onChange={(e) => setContractNumber(e.target.value)}
            placeholder="12345"
          />
          <Input
            id="modal-comment"
            label="Izoh"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Ixtiyoriy izoh..."
          />
        </div>

        {/* Items table */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ fontWeight: 600, fontSize: 'var(--text-base)', color: 'var(--color-text-primary)' }}>
              Tovarlar ro'yxati
            </h3>
            <Button id="add-item-btn" size="sm" variant="secondary" onClick={addItem}>
              <Plus size={14} style={{ marginRight: 4 }} /> Qo'shish
            </Button>
          </div>

          {items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)' }}>
              Tovar qo'shish uchun yuqoridagi "Qo'shish" tugmasini bosing
            </div>
          ) : (
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--color-bg-subtle)', borderBottom: '1px solid var(--color-border)' }}>
                    {['Tovar', 'Miqdor', 'Narx', 'Chegirma', 'QQS %', 'Jami', ''].map((h) => (
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
                          <select
                            id={`item-product-${idx}`}
                            value={item.productId}
                            onChange={(e) => updateItem(idx, 'productId', e.target.value)}
                            style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-input)', color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)' }}
                          >
                            {productOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          {item.productId && (
                            <div style={{ display: 'flex', gap: 8, marginTop: 3, fontSize: 11 }}>
                              {belowCost && (
                                <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: 2 }}>
                                  <AlertTriangle size={10} /> Tannarxdan past!
                                </span>
                              )}
                              {overStock && (
                                <span style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 2 }}>
                                  <AlertTriangle size={10} /> Ombor: {item._stock}
                                </span>
                              )}
                              {!belowCost && !overStock && item._stock > 0 && (
                                <span style={{ color: 'var(--color-text-secondary)' }}>Ombor: {item._stock}</span>
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
                              Tan.: {formatCurrency(item._costPrice, currency)}
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
                          {formatCurrency(lineTotal, currency)}
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
                      Jami summa:
                    </td>
                    <td colSpan={2} style={{ padding: '10px', fontWeight: 700, fontSize: 'var(--text-base)' }}>
                      {formatCurrency(totalAmount, currency)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Post immediately toggle */}
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}
        >
          <input
            id="post-immediately-checkbox"
            type="checkbox"
            checked={postImmediately}
            onChange={(e) => setPostImmediately(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: 'var(--color-primary-600)' }}
          />
          <div>
            <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>Darhol tasdiqlash</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
              Saqlash bilan birga ombor qoldig'ini ayirib, COGS hisoblanadi
            </div>
          </div>
        </label>

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
            Bekor qilish
          </Button>
          <Button id="submit-create-btn" onClick={handleSubmit} disabled={loading || items.length === 0}>
            {loading ? 'Saqlanmoqda...' : (postImmediately ? 'Saqlash va Tasdiqlash' : 'Saqlash (Qoralama)')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
