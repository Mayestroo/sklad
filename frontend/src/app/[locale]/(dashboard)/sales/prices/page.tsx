'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
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
  const isRu = locale === 'ru';

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
    typeof p.name === 'object' ? (p.name[locale] || p.name.ru || p.name.uz || '') : (p.name || '');

  const fetchData = () => {
    if (!token || !company) return;
    setLoading(true);
    Promise.all([
      apiFetch<PriceList[]>('/sales/price-lists', { token: token || undefined, tenantId: company.id, locale }),
      apiFetch<Product[]>('/inventory/products', { token: token || undefined, tenantId: company.id, locale }),
    ])
      .then(([pls, prods]) => {
        setPriceLists(pls || []);
        setProducts(prods || []);
        if (pls && pls.length > 0 && !selectedPL) {
          setSelectedPL(pls[0]);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [token, company, locale]);

  const handleCreatePL = async () => {
    if (!token || !company || !newPLNameUz) return;
    setCreateLoading(true);
    try {
      const created = await apiFetch<PriceList>('/sales/price-lists', {
        method: 'POST',
        token: token || undefined,
        tenantId: company.id,
        locale,
        body: JSON.stringify({
          name: { uz: newPLNameUz, ru: newPLNameRu || newPLNameUz },
          currency: newPLCurrency,
          isDefault: newPLDefault,
        }),
      });
      setShowCreatePL(false);
      setNewPLNameUz('');
      setNewPLNameRu('');
      setNewPLDefault(false);
      fetchData();
      if (created) setSelectedPL(created);
    } catch (err: any) {
      alert(err?.message || (isRu ? 'Ошибка создания прайс-листа' : 'Narx jadvalini yaratishda xatolik'));
    } finally {
      setCreateLoading(false);
    }
  };

  const getPriceForProduct = (productId: string): number => {
    if (!selectedPL || !selectedPL.prices) return 0;
    const item = selectedPL.prices.find((p) => p.productId === productId);
    return item ? Number(item.price) : 0;
  };

  const startEdit = (productId: string) => {
    const currentPrice = getPriceForProduct(productId);
    const prod = products.find((p) => p.id === productId);
    setEditingPrices((prev) => ({
      ...prev,
      [productId]: currentPrice > 0 ? currentPrice : Number(prod?.salePrice || 0),
    }));
  };

  const handleSavePrice = async (productId: string) => {
    if (!selectedPL || !token || !company) return;
    const priceVal = editingPrices[productId];
    if (priceVal === undefined) return;
    setSavingPrice(productId);

    try {
      await apiFetch(`/sales/price-lists/${selectedPL.id}/items`, {
        method: 'POST',
        token: token || undefined,
        tenantId: company.id,
        locale,
        body: JSON.stringify({
          productId,
          price: Number(priceVal),
        }),
      });
      setEditingPrices((prev) => {
        const next = { ...prev };
        delete next[productId];
        return next;
      });
      fetchData();
    } catch (err: any) {
      alert(err?.message || (isRu ? 'Ошибка сохранения цены' : 'Narxni saqlashda xatolik'));
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
            {isRu ? 'Цены и прайс-листы' : 'Narxlar va chegirmalar'}
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 4 }}>
            {isRu ? 'Управление прайс-листами для различных групп клиентов' : 'Har bir mijoz guruhi uchun alohida narx jadvalini boshqaring'}
          </p>
        </div>
        <Button id="create-price-list-btn" onClick={() => setShowCreatePL(true)} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={16} /> {isRu ? 'Новый прайс-лист' : 'Yangi narx jadvali'}
        </Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 'var(--space-5)', alignItems: 'start' }}>
        {/* Price list tabs */}
        <Card style={{ padding: 'var(--space-3)' }}>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            {isRu ? 'Прайс-листы' : 'Narx jadvallari'}
          </div>
          {priceLists.length === 0 ? (
            <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
              {isRu ? 'Прайс-листы отсутствуют' : 'Narx jadvali yo\'q'}
            </div>
          ) : (
            priceLists.map((pl) => {
              const isActive = selectedPL?.id === pl.id;
              const plName = typeof pl.name === 'object' ? (pl.name[locale] || pl.name.ru || pl.name.uz) : pl.name;
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
                      {pl.currency} {pl.isDefault ? (isRu ? '• Основной' : '• Asosiy') : ''}
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
              {isRu ? 'Выберите прайс-лист' : 'Narx jadvalini tanlang'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontWeight: 600 }}>
                  {typeof selectedPL.name === 'object' ? (selectedPL.name[locale] || selectedPL.name.ru || selectedPL.name.uz) : selectedPL.name}
                </h3>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                  {selectedPL.currency} • {products.length} {isRu ? 'товаров' : 'ta tovar'}
                </span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                    {[isRu ? 'Товар' : 'Tovar', 'SKU', isRu ? 'Базовая цена' : 'Asosiy narx', isRu ? 'Цена в прайсе' : 'Jadval narxi', ''].map((h) => (
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
                          {formatCurrency(Number(prod.salePrice || 0), locale)}
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
                              {listPrice > 0 ? formatCurrency(listPrice, locale) : '—'}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {isEditing ? (
                            <button
                              id={`save-price-${prod.id}`}
                              onClick={() => handleSavePrice(prod.id)}
                              disabled={isSaving}
                              style={{
                                background: 'var(--color-success-50)',
                                color: 'var(--color-success-600)',
                                border: '1px solid var(--color-success-100)',
                                borderRadius: 'var(--radius-sm)',
                                padding: '5px 10px',
                                cursor: 'pointer',
                                fontSize: 'var(--text-sm)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <Check size={13} /> {isSaving ? '...' : (isRu ? 'Сохранить' : 'Saqlash')}
                            </button>
                          ) : (
                            <button
                              id={`edit-price-${prod.id}`}
                              onClick={() => startEdit(prod.id)}
                              style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '5px 10px', cursor: 'pointer', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}
                            >
                              <Edit3 size={12} /> {isRu ? 'Указать цену' : 'Narx kiritish'}
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
        <Modal isOpen={true} onClose={() => setShowCreatePL(false)} title={isRu ? 'Новый прайс-лист' : 'Yangi narx jadvali'} size="md">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Input id="pl-name-uz" label={isRu ? 'Название (Узбекский) *' : 'Nomi (O\'zbekcha) *'} value={newPLNameUz} onChange={(e) => setNewPLNameUz(e.target.value)} placeholder={isRu ? 'Напр. Розница' : 'Mas. Chakana narxlar'} />
            <Input id="pl-name-ru" label={isRu ? 'Название (Русский)' : 'Nomi (Ruscha)'} value={newPLNameRu} onChange={(e) => setNewPLNameRu(e.target.value)} placeholder={isRu ? 'Напр. Розничные цены' : 'Mas. Розничные цены'} />
            <Select
              id="pl-currency"
              label={isRu ? 'Валюта' : 'Valyuta'}
              value={newPLCurrency}
              onChange={(val) => setNewPLCurrency(val)}
              options={[
                { value: 'UZS', label: 'UZS' },
                { value: 'USD', label: 'USD' },
                { value: 'EUR', label: 'EUR' },
              ]}
            />
            <Checkbox
              id="pl-is-default"
              checked={newPLDefault}
              onChange={(e) => setNewPLDefault(e.target.checked)}
              label={isRu ? 'Установить как основной прайс-лист' : 'Asosiy narx jadvali sifatida belgilash'}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--color-border-light)' }}>
              <Button id="cancel-pl-btn" variant="secondary" onClick={() => setShowCreatePL(false)} disabled={createLoading}>{isRu ? 'Отмена' : 'Bekor qilish'}</Button>
              <Button id="submit-pl-btn" onClick={handleCreatePL} disabled={createLoading || !newPLNameUz}>
                {createLoading ? (isRu ? 'Сохранение...' : 'Saqlanmoqda...') : (isRu ? 'Сохранить' : 'Saqlash')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
