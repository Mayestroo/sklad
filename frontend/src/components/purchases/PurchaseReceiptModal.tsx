'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, SelectOption } from '@/components/ui/Select';
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
  const { token, company } = useAuth();

  const [counterparties, setCounterparties] = useState<CounterpartyOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);

  const [counterpartyId, setCounterpartyId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [docDate, setDocDate] = useState(new Date().toISOString().split('T')[0]);
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

  const [items, setItems] = useState<ItemRow[]>([
    { productId: '', quantity: 1, unitPrice: 0, discount: 0, vatRate: 12 },
  ]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token || !company) return;

    // Load counterparties
    apiFetch<CounterpartyOption[]>('/sales/counterparties', { token, tenantId: company.id })
      .then((res) => {
        const suppliers = (res || []).filter((c) => c.type === 'SUPPLIER' || c.type === 'BOTH');
        setCounterparties(suppliers);
        if (suppliers.length > 0 && !counterpartyId) {
          setCounterpartyId(suppliers[0].id);
        }
      })
      .catch((err) => console.error(err));

    // Load warehouses
    apiFetch<WarehouseOption[]>('/inventory/warehouses', { token, tenantId: company.id })
      .then((res) => {
        setWarehouses(res || []);
        if (res && res.length > 0 && !warehouseId) {
          setWarehouseId(res[0].id);
        }
      })
      .catch((err) => console.error(err));

    // Load products
    apiFetch<ProductOption[]>('/inventory/products', { token, tenantId: company.id })
      .then((res) => setProducts(res || []))
      .catch((err) => console.error(err));
  }, [token, company]);

  useEffect(() => {
    if (initialData) {
      setCounterpartyId(initialData.counterpartyId);
      setWarehouseId(initialData.warehouseId);
      setDocDate(initialData.docDate ? initialData.docDate.split('T')[0] : '');
      setCurrency(initialData.currency || 'UZS');
      setExchangeRate(Number(initialData.exchangeRate) || 1);
      setContractNumber(initialData.contractNumber || '');
      setContractDate(initialData.contractDate ? initialData.contractDate.split('T')[0] : '');
      setComment(initialData.comment || '');
      setGtdNumber(initialData.gtdNumber || '');
      setGtdDate(initialData.gtdDate ? initialData.gtdDate.split('T')[0] : '');
      setCustomsPost(initialData.customsPost || '');
      if (initialData.gtdNumber) setShowGtd(true);

      if (initialData.items && initialData.items.length > 0) {
        setItems(
          initialData.items.map((i) => ({
            productId: i.productId,
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice),
            discount: Number(i.discount),
            vatRate: Number(i.vatRate),
          }))
        );
      }
    } else {
      setItems([{ productId: '', quantity: 1, unitPrice: 0, discount: 0, vatRate: 12 }]);
    }
  }, [initialData]);

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      { productId: '', quantity: 1, unitPrice: 0, discount: 0, vatRate: 12 },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof ItemRow, value: any) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };

      if (field === 'productId') {
        const prod = products.find((p) => p.id === value);
        if (prod && updated[index].unitPrice === 0) {
          updated[index].unitPrice = Number(prod.costPrice) || 0;
        }
      }
      return updated;
    });
  };

  const getProductName = (name: any) => {
    if (!name) return '';
    if (typeof name === 'string') return name;
    return name.uz || name.ru || Object.values(name)[0] || '';
  };

  const supplierOptions: SelectOption[] = [
    { value: '', label: '-- Yetkazib beruvchini tanlang --' },
    ...counterparties.map((c) => ({ value: c.id, label: c.name })),
  ];

  const warehouseOptions: SelectOption[] = [
    { value: '', label: '-- Omborni tanlang --' },
    ...warehouses.map((w) => ({ value: w.id, label: getProductName(w.name) })),
  ];

  const currencyOptions: SelectOption[] = [
    { value: 'UZS', label: 'UZS' },
    { value: 'USD', label: 'USD' },
    { value: 'EUR', label: 'EUR' },
  ];

  const productOptions: SelectOption[] = [
    { value: '', label: '-- Tovarni tanlang --' },
    ...products.map((p) => ({ value: p.id, label: `${getProductName(p.name)} (${p.sku})` })),
  ];

  const vatOptions: SelectOption[] = [
    { value: '0', label: '0%' },
    { value: '12', label: '12%' },
  ];

  // Calculations
  const calculateTotals = () => {
    let subtotal = 0;
    let discount = 0;
    let vat = 0;

    items.forEach((item) => {
      const lineSubtotal = item.quantity * item.unitPrice;
      const lineAfterDisc = Math.max(0, lineSubtotal - item.discount);
      const lineVat = (lineAfterDisc * item.vatRate) / 100;

      subtotal += lineSubtotal;
      discount += item.discount;
      vat += lineVat;
    });

    const grandTotal = subtotal - discount + vat;
    return { subtotal, discount, vat, grandTotal };
  };

  const totals = calculateTotals();

  const handleSubmit = async (shouldPost: boolean) => {
    setError('');

    if (!counterpartyId) {
      setError('Yetkazib beruvchini tanlang');
      return;
    }
    if (!warehouseId) {
      setError('Omborni tanlang');
      return;
    }

    const validItems = items.filter((i) => i.productId && i.quantity > 0);
    if (validItems.length === 0) {
      setError('Kamida bitta tovar va miqdorini kiriting');
      return;
    }

    setLoading(true);

    const payload = {
      counterpartyId,
      warehouseId,
      docDate: docDate || undefined,
      currency: currency || undefined,
      exchangeRate: Number(exchangeRate),
      contractNumber: contractNumber || undefined,
      contractDate: contractDate || undefined,
      comment: comment || undefined,
      gtdNumber: gtdNumber || undefined,
      gtdDate: gtdDate || undefined,
      customsPost: customsPost || undefined,
      postImmediately: shouldPost,
      items: validItems,
    };

    try {
      if (initialData) {
        await apiFetch(`/purchases/receipts/${initialData.id}`, {
          token: token || undefined,
          tenantId: company?.id || undefined,
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        if (shouldPost) {
          await apiFetch(`/purchases/receipts/${initialData.id}/post`, {
            token: token || undefined,
            tenantId: company?.id || undefined,
            method: 'POST',
          });
        }
      } else {
        await apiFetch('/purchases/receipts', {
          token: token || undefined,
          tenantId: company?.id || undefined,
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? `Xarid Hujjatini Tahrirlash: ${initialData.docNumber}` : 'Yangi Tovar Qabul Qilish Hujjati'}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: '900px', width: '100%' }}>
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

        {/* Header Form */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)' }}>
          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px', display: 'block' }}>
              Yetkazib beruvchi *
            </label>
            <Select
              options={supplierOptions}
              value={counterpartyId}
              onChange={(val) => setCounterpartyId(val)}
            />
          </div>

          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px', display: 'block' }}>
              Ombor *
            </label>
            <Select
              options={warehouseOptions}
              value={warehouseId}
              onChange={(val) => setWarehouseId(val)}
            />
          </div>

          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px', display: 'block' }}>
              Hujjat sanasi
            </label>
            <Input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
          </div>

          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px', display: 'block' }}>
              Valyuta va kurs
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Select
                options={currencyOptions}
                value={currency}
                onChange={(val) => setCurrency(val)}
                style={{ width: '90px' }}
              />
              <Input
                type="number"
                step="0.0001"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(parseFloat(e.target.value) || 1)}
                placeholder="Kurs"
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px', display: 'block' }}>
              Shartnoma №
            </label>
            <Input value={contractNumber} onChange={(e) => setContractNumber(e.target.value)} placeholder="Masalan: SH-102" />
          </div>

          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px', display: 'block' }}>
              Shartnoma sanasi
            </label>
            <Input type="date" value={contractDate} onChange={(e) => setContractDate(e.target.value)} />
          </div>
        </div>

        {/* Collapsible GTD Import Panel */}
        <div style={{ border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
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
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FileText size={16} /> Import / GTD Ma&apos;lumotlarini biriktirish
            </span>
            {showGtd ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showGtd && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
              <div>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>GTD Hujjat №</label>
                <Input value={gtdNumber} onChange={(e) => setGtdNumber(e.target.value)} placeholder="00000/00.00.00/0000000" />
              </div>
              <div>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>GTD Sanasi</label>
                <Input type="date" value={gtdDate} onChange={(e) => setGtdDate(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>Bojxona Posti</label>
                <Input value={customsPost} onChange={(e) => setCustomsPost(e.target.value)} placeholder="Masalan: Toshkent-Aero GTD" />
              </div>
            </div>
          )}
        </div>

        {/* Items Table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-sm)' }}>Xarid Tarkibi (Tovarlar)</h4>
            <Button size="sm" variant="secondary" onClick={handleAddItem}>
              <Plus size={14} style={{ marginRight: '4px' }} /> Tovar qo&apos;shish
            </Button>
          </div>

          <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '8px', textAlign: 'left', minWidth: '220px' }}>TOVAR / SKU</th>
                  <th style={{ padding: '8px', textAlign: 'right', width: '100px' }}>MIQDOR</th>
                  <th style={{ padding: '8px', textAlign: 'right', width: '120px' }}>NARXI ({currency})</th>
                  <th style={{ padding: '8px', textAlign: 'right', width: '100px' }}>CHEGIRMA</th>
                  <th style={{ padding: '8px', textAlign: 'right', width: '90px' }}>QQS %</th>
                  <th style={{ padding: '8px', textAlign: 'right', width: '140px' }}>JAMI SUMMA</th>
                  <th style={{ padding: '8px', width: '40px' }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const lineTotal = Math.max(0, item.quantity * item.unitPrice - item.discount) * (1 + item.vatRate / 100);
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
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
                      <td style={{ padding: '6px', textAlign: 'right', fontWeight: 'var(--font-semibold)' }} className="tabular-nums">
                        {lineTotal.toLocaleString()}
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
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px', display: 'block' }}>
            Izoh / Izohlar
          </label>
          <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Xarid bo'yicha qo'shimcha izoh..." />
        </div>

        {/* Totals Summary Card */}
        <div
          style={{
            padding: 'var(--space-4)',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-bg-secondary)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 'var(--text-sm)',
          }}
        >
          <div style={{ display: 'flex', gap: 'var(--space-6)' }}>
            <div>
              <span style={{ color: 'var(--color-text-tertiary)' }}>Subtotal: </span>
              <strong>{totals.subtotal.toLocaleString()} {currency}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-tertiary)' }}>Chegirma: </span>
              <strong>{totals.discount.toLocaleString()} {currency}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-tertiary)' }}>QQS: </span>
              <strong>{totals.vat.toLocaleString()} {currency}</strong>
            </div>
          </div>
          <div>
            <span style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-secondary)', marginRight: '8px' }}>Jami Qiymat:</span>
            <strong style={{ fontSize: 'var(--text-xl)', color: 'var(--color-primary-600)' }} className="tabular-nums">
              {totals.grandTotal.toLocaleString()} {currency}
            </strong>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Bekor qilish
          </Button>
          <Button variant="outline" onClick={() => handleSubmit(false)} disabled={loading}>
            Qoralama sifatida saqlash
          </Button>
          <Button onClick={() => handleSubmit(true)} disabled={loading}>
            {loading ? 'Saqlanmoqda...' : 'Tasdiqlab Omborga Kirim Qilish'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
