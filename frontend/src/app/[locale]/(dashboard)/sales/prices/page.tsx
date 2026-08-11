'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Plus, Tag, Edit3, Check } from 'lucide-react';

interface PriceList {
  id: string;
  name: { uz: string; ru: string };
  currency: string;
  isDefault: boolean;
  isActive: boolean;
  prices?: { id: string; productId: string; price: number; product?: { id: string; name: any; sku: string } }[];
}

interface Product {
  id: string;
  name: any;
  sku: string;
  salePrice: number;
  costPrice: number;
}

export default function PricesPage() {
  const { token, company } = useAuth();
  const locale = useLocale() as 'uz' | 'ru';

  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPL, setSelectedPL] = useState<PriceList | null>(null);

  const [showCreatePL, setShowCreatePL] = useState(false);
  const [newPLNameUz, setNewPLNameUz] = useState('');
  const [newPLNameRu, setNewPLNameRu] = useState('');
  const [newPLCurrency, setNewPLCurrency] = useState('UZS');
  const [newPLDefault, setNewPLDefault] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);

  // Inline price editing
  const [editingPrices, setEditingPrices] = useState<Record<string, number>>({});
  const [savingPrice, setSavingPrice] = useState<string | null>(null);

  const getProductName = (p: Product) =>
    typeof p.name === 'object' ? (p.name[locale] || p.name.uz || '') : (p.name || '');

  const fetchData = () => {
    if (!token || !company) return;
    setLoading(true);
    Promise.all([
      apiFetch<PriceList[]>('/sales/price-lists', { token: token || undefined, tenantId: company.id }),
      apiFetch<Product[]>('/inventory/products', { token: token || undefined, tenantId: company.id }),
    ])
      .then(([pl, pr]) => {
        setPriceLists(pl);
        setProducts(pr);
        if (pl.length > 0 && !selectedPL) setSelectedPL(pl[0]);
        else if (pl.length > 0 && selectedPL) {
          const updated = pl.find((p) => p.id === selectedPL.id);
          if (updated) setSelectedPL(updated);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [token, company]);

  const handleCreatePL = async () => {
    if (!token || !company || !newPLNameUz) return;
    setCreateLoading(true);
    try {
      await apiFetch('/sales/price-lists', {
        method: 'POST',
        token: token || undefined,
        tenantId: company.id,
        body: JSON.stringify({ name: { uz: newPLNameUz, ru: newPLNameRu || newPLNameUz }, currency: newPLCurrency, isDefault: newPLDefault }),
      });
      setShowCreatePL(false);
      setNewPLNameUz('');
      setNewPLNameRu('');
      fetchData();
    } catch (err: any) {
      alert(err?.message || 'Xatolik');
    } finally {
      setCreateLoading(false);
    }
  };

  const getPriceForProduct = (productId: string) => {
    if (!selectedPL) return 0;
    const entry = selectedPL.prices?.find((p) => p.productId === productId);
    return entry ? entry.price : 0;
  };

  const startEdit = (productId: string) => {
    const current = getPriceForProduct(productId);
    setEditingPrices((prev) => ({ ...prev, [productId]: current }));
  };

  const handleSavePrice = async (productId: string) => {
    if (!token || !company || !selectedPL) return;
    const price = editingPrices[productId];
    if (price === undefined) return;
    setSavingPrice(productId);
    try {
      await apiFetch(`/sales/price-lists/${selectedPL.id}/prices/${productId}`, {
        method: 'POST',
        token: token || undefined,
        tenantId: company.id,
        body: JSON.stringify({ price }),
      });
      setEditingPrices((prev) => {
        const next = { ...prev };
        delete next[productId];
        return next;
      });
      fetchData();
    } catch (err: any) {
      alert(err?.message || 'Narxni saqlashda xatolik');
    } finally {
      setSavingPrice(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Narxlar va chegirmalar
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 4 }}>
            Har bir mijoz guruhi uchun alohida narx jadvalini boshqaring
          </p>
        </div>
        <Button id="create-price-list-btn" onClick={() => setShowCreatePL(true)} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={16} /> Yangi narx jadvali
        </Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 'var(--space-5)', alignItems: 'start' }}>
        {/* Price list tabs */}
        <Card style={{ padding: 'var(--space-3)' }}>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Narx jadvallari
          </div>
          {priceLists.length === 0 ? (
            <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
              Narx jadvali yo'q
            </div>
          ) : (
            priceLists.map((pl) => {
              const isActive = selectedPL?.id === pl.id;
              const plName = typeof pl.name === 'object' ? (pl.name[locale] || pl.name.uz) : pl.name;
              return (
                <button
                  key={pl.id}
                  id={`pl-tab-${pl.id}`}
                  onClick={() => setSelectedPL(pl)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: 'none',
                    background: isActive ? 'var(--color-primary-50)' : 'transparent',
                    color: isActive ? 'var(--color-primary-700)' : 'var(--color-text-primary)',
                    fontWeight: isActive ? 600 : 400,
                    cursor: 'pointer',
                    marginBottom: 4,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 'var(--text-sm)',
                  }}
                >
                  <Tag size={14} />
                  <div>
                    <div>{plName}</div>
                    <div style={{ fontSize: 11, color: isActive ? 'var(--color-primary-500)' : 'var(--color-text-secondary)', marginTop: 2 }}>
                      {pl.currency} {pl.isDefault ? '• Asosiy' : ''}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </Card>

        {/* Products price table */}
        <Card>
          {!selectedPL ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
              Narx jadvalini tanlang
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontWeight: 600 }}>
                  {typeof selectedPL.name === 'object' ? (selectedPL.name[locale] || selectedPL.name.uz) : selectedPL.name}
                </h3>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                  {selectedPL.currency} • {products.length} ta tovar
                </span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                    {['Tovar', 'SKU', 'Asosiy narx', 'Jadval narxi', ''].map((h) => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {products.map((prod) => {
                    const listPrice = getPriceForProduct(prod.id);
                    const isEditing = prod.id in editingPrices;
                    const isSaving = savingPrice === prod.id;

                    return (
                      <tr key={prod.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                        <td style={{ padding: '10px 14px', fontSize: 'var(--text-sm)', fontWeight: 500 }}>{getProductName(prod)}</td>
                        <td style={{ padding: '10px 14px', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{prod.sku || '—'}</td>
                        <td style={{ padding: '10px 14px', fontSize: 'var(--text-sm)' }}>
                          {formatCurrency(Number(prod.salePrice || 0), selectedPL.currency)}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {isEditing ? (
                            <input
                              id={`price-input-${prod.id}`}
                              type="number"
                              min={0}
                              value={editingPrices[prod.id]}
                              onChange={(e) => setEditingPrices((prev) => ({ ...prev, [prod.id]: Number(e.target.value) }))}
                              style={{ width: 120, padding: '5px 8px', border: '1px solid var(--color-primary-400)', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-input)', color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)' }}
                              autoFocus
                            />
                          ) : (
                            <span style={{ fontWeight: listPrice > 0 ? 600 : 400, color: listPrice > 0 ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>
                              {listPrice > 0 ? formatCurrency(listPrice, selectedPL.currency) : '—'}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {isEditing ? (
                            <button
                              id={`save-price-${prod.id}`}
                              onClick={() => handleSavePrice(prod.id)}
                              disabled={isSaving}
                              style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', padding: '5px 10px', cursor: 'pointer', fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', gap: 4 }}
                            >
                              <Check size={13} /> {isSaving ? '...' : 'Saqlash'}
                            </button>
                          ) : (
                            <button
                              id={`edit-price-${prod.id}`}
                              onClick={() => startEdit(prod.id)}
                              style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '5px 10px', cursor: 'pointer', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}
                            >
                              <Edit3 size={12} /> Narx kiritish
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Create Price List Modal */}
      {showCreatePL && (
        <Modal isOpen={true} onClose={() => setShowCreatePL(false)} title="Yangi narx jadvali" size="md">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Input id="pl-name-uz" label="Nomi (O'zbekcha) *" value={newPLNameUz} onChange={(e) => setNewPLNameUz(e.target.value)} placeholder="Mas. Chakana narxlar" />
            <Input id="pl-name-ru" label="Nomi (Ruscha)" value={newPLNameRu} onChange={(e) => setNewPLNameRu(e.target.value)} placeholder="Mas. Розничные цены" />
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 500, marginBottom: 6 }}>Valyuta</label>
              <select
                id="pl-currency"
                value={newPLCurrency}
                onChange={(e) => setNewPLCurrency(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-input)', color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)' }}
              >
                <option value="UZS">UZS (So'm)</option>
                <option value="USD">USD (Dollar)</option>
                <option value="EUR">EUR (Evro)</option>
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input id="pl-is-default" type="checkbox" checked={newPLDefault} onChange={(e) => setNewPLDefault(e.target.checked)} style={{ width: 16, height: 16 }} />
              <span style={{ fontSize: 'var(--text-sm)' }}>Asosiy narx jadvali sifatida belgilash</span>
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--color-border-light)' }}>
              <Button id="cancel-pl-btn" variant="secondary" onClick={() => setShowCreatePL(false)} disabled={createLoading}>Bekor qilish</Button>
              <Button id="submit-pl-btn" onClick={handleCreatePL} disabled={createLoading || !newPLNameUz}>
                {createLoading ? 'Saqlanmoqda...' : 'Saqlash'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
