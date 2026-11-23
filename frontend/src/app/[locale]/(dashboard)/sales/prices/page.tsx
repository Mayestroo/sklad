'use client';

import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale, useTranslations } from 'next-intl';
import { FilterBar, useFilterState } from '@/components/ui/filters';
import { apiFetch } from '@/lib/api';
import { useApiQuery, useInvalidateApi } from '@/lib/query/useApiQuery';
import { LoadError } from '@/components/ui/LoadError';
import { formatPriceOrUnset, formatPercent, CURRENCY_OPTIONS, errorMessage, type LocalizedName } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { Drawer } from '@/components/ui/Drawer';
import { Badge } from '@/components/ui/Badge';
import { toast } from '@/context/ToastContext';
import { Plus, Tag, Edit2, Check, Trash2, X } from 'lucide-react';
import { useConfirm } from '@/context/ConfirmContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { matchesSearch } from '@/components/ui/SearchField';

interface PriceList {
  id: string;
  name: { uz: string; ru: string };
  currency: string;
  isDefault: boolean;
  isActive: boolean;
  prices?: { id: string; productId: string; price: number; product?: { id: string; name: LocalizedName; sku: string } }[];
}

interface Product {
  id: string;
  name: LocalizedName;
  sku: string;
  salePrice: number;
  /** null on legacy prices whose currency was never set (F8). */
  salePriceCurrency: 'USD' | 'UZS' | null;
  costPrice: number;
}

const FILTER_DEFAULTS = { show: '' };

export default function PricesPage() {
  const { token, company } = useAuth();
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  const invalidateApi = useInvalidateApi();
  const priceListsQuery = useApiQuery<PriceList[]>('/sales/price-lists');
  const productsQuery = useApiQuery<Product[]>('/inventory/products');
  const priceLists = priceListsQuery.data ?? [];
  const products = productsQuery.data ?? [];
  const loadFailed = priceListsQuery.isError || productsQuery.isError;
  const retryLoad = () => {
    if (priceListsQuery.isError) void priceListsQuery.refetch();
    if (productsQuery.isError) void productsQuery.refetch();
  };
  // The list chosen earlier in this browser session, if any.
  const [selectedPLId, setSelectedPLId] = useState<string | null>(() => {
    try {
      return typeof window === 'undefined' ? null : sessionStorage.getItem('sklad_selected_price_list_id');
    } catch {
      return null;
    }
  });

  const [showCreatePL, setShowCreatePL] = useState(false);
  const [newPLNameUz, setNewPLNameUz] = useState('');
  const [newPLNameRu, setNewPLNameRu] = useState('');
  const [newPLCurrency, setNewPLCurrency] = useState('');
  const [newPLDefault, setNewPLDefault] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);

  // Edit Price List state
  const [showEditPL, setShowEditPL] = useState(false);
  const [editPLNameUz, setEditPLNameUz] = useState('');
  const [editPLNameRu, setEditPLNameRu] = useState('');
  const [editPLCurrency, setEditPLCurrency] = useState('');
  const [editPLDefault, setEditPLDefault] = useState(false);
  const [editLoading, setEditLoading] = useState(false);

  const confirm = useConfirm();
  // Search and the priced filter of the open price list live in the URL and are remembered per user.
  const lf = useFilterState('prices.lines', FILTER_DEFAULTS);
  const productSearch = lf.search;
  const pricedMode = lf.values.show;
  const [rowLimit, setRowLimit] = useState(100);
  const tpr = useTranslations('rd.prices');

  // Inline price editing
  const [editingPrices, setEditingPrices] = useState<Record<string, number>>({});
  const [savingPrice, setSavingPrice] = useState<string | null>(null);

  const selectPriceList = (id: string) => {
    setSelectedPLId(id);
    try {
      sessionStorage.setItem('sklad_selected_price_list_id', id);
    } catch {
      // storage unavailable (private mode): the choice lasts for this visit
    }
  };

  // A chosen list that no longer exists falls back to the default list.
  const selectedPL =
    priceLists.find((pl) => pl.id === selectedPLId) ||
    priceLists.find((pl) => pl.isDefault) ||
    priceLists[0] ||
    null;

  const getProductName = (p: Product) =>
    typeof p.name === 'object' ? (p.name[locale] || p.name.ru || p.name.uz || '') : (p.name || '');


  const handleCreatePL = async () => {
    if (!token || !company || !newPLNameUz) return;
    if (!newPLCurrency) {
      toast.error(isRu ? 'Пожалуйста, выберите валюту' : 'Iltimos, valyutani tanlang');
      return;
    }
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
      toast.success(isRu ? 'Прайс-лист создан' : 'Narx jadvali yaratildi');
      void invalidateApi('/sales/price-lists');
      if (created) selectPriceList(created.id);
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Ошибка создания прайс-листа' : 'Narx jadvalini yaratishda xatolik'));
    } finally {
      setCreateLoading(false);
    }
  };

  const handleOpenEditPL = (pl: PriceList) => {
    setEditPLNameUz(typeof pl.name === 'object' ? (pl.name.uz || pl.name.ru || '') : pl.name || '');
    setEditPLNameRu(typeof pl.name === 'object' ? (pl.name.ru || pl.name.uz || '') : pl.name || '');
    setEditPLCurrency(pl.currency || '');
    setEditPLDefault(Boolean(pl.isDefault));
    setShowEditPL(true);
  };

  const handleSaveEditPL = async () => {
    if (!selectedPL || !token || !company || !editPLNameUz) return;
    if (!editPLCurrency) {
      toast.error(isRu ? 'Пожалуйста, выберите валюту' : 'Iltimos, valyutani tanlang');
      return;
    }
    setEditLoading(true);
    try {
      await apiFetch(`/sales/price-lists/${selectedPL.id}`, {
        method: 'PATCH',
        token: token || undefined,
        tenantId: company.id,
        locale,
        body: JSON.stringify({
          name: { uz: editPLNameUz, ru: editPLNameRu || editPLNameUz },
          currency: editPLCurrency,
          isDefault: editPLDefault,
        }),
      });
      setShowEditPL(false);
      toast.success(isRu ? 'Прайс-лист сохранён' : 'Narx jadvali saqlandi');
      void invalidateApi('/sales/price-lists');
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Ошибка обновления прайс-листа' : 'Narx jadvalini tahrirlashda xatolik'));
    } finally {
      setEditLoading(false);
    }
  };

  const plNameOf = (pl: PriceList) => (typeof pl.name === 'object' ? pl.name[locale] || pl.name.ru || pl.name.uz : pl.name);

  const handleDeletePL = async (pl: PriceList) => {
    if (!token || !company) return;
    const ok = await confirm({
      title: isRu ? 'Удалить прайс-лист?' : 'Narx jadvali o‘chirilsinmi?',
      description: isRu
        ? `Прайс-лист «${plNameOf(pl)}» и все цены в нём будут удалены. Уже проведённые продажи не изменятся.`
        : `«${plNameOf(pl)}» narx jadvali va undagi barcha narxlar o‘chiriladi. Tasdiqlangan sotuvlar o‘zgarmaydi.`,
      variant: 'danger',
      confirmText: isRu ? 'Удалить' : 'O‘chirish',
      cancelText: isRu ? 'Отмена' : 'Bekor qilish',
    });
    if (!ok) return;
    try {
      await apiFetch(`/sales/price-lists/${pl.id}`, { method: 'DELETE', token, tenantId: company.id, locale });
      toast.success(isRu ? `Прайс-лист «${plNameOf(pl)}» удалён` : `«${plNameOf(pl)}» o‘chirildi`);
      void invalidateApi('/sales/price-lists');
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Не удалось удалить прайс-лист' : 'Narx jadvalini o‘chirib bo‘lmadi'));
    }
  };

  const cancelEdit = (productId: string) =>
    setEditingPrices((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });

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
    const targetPLId = selectedPL.id;
    setSavingPrice(productId);

    try {
      await apiFetch(`/sales/price-lists/${targetPLId}/items`, {
        method: 'POST',
        token: token || undefined,
        tenantId: company.id,
        locale,
        body: JSON.stringify({
          productId,
          price: Number(priceVal),
        }),
      });

      // Reload the lists before leaving edit mode, so the row shows the saved
      // price and never flashes the old one.
      await invalidateApi('/sales/price-lists');

      setEditingPrices((prev) => {
        const next = { ...prev };
        delete next[productId];
        return next;
      });

      toast.success(isRu ? 'Цена сохранена' : 'Narx saqlandi');
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Ошибка сохранения цены' : 'Narxni saqlashda xatolik'));
    } finally {
      setSavingPrice(null);
    }
  };

  const visibleProducts = products.filter(
    (p) => (!pricedMode || (pricedMode === 'priced') === getPriceForProduct(p.id) > 0) && matchesSearch(productSearch, ...(typeof p.name === 'object' ? [p.name.uz, p.name.ru] : [p.name]), p.sku),
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ marginBottom: 'calc(-1 * var(--space-5))' }}>
        <PageHeader
          title={isRu ? 'Прайс-листы' : 'Narx jadvallari'}
          subtitle={isRu ? 'Разные цены для разных клиентов (розница, опт, дилеры). Цена из прайс-листа подставляется в продажу.' : 'Turli mijozlar uchun turli narxlar (chakana, ulgurji, diler). Jadvaldagi narx sotuvga o‘zi qo‘yiladi.'}
          actions={
            <Button id="create-price-list-btn" onClick={() => setShowCreatePL(true)}>
              <Plus size={16} aria-hidden /> {isRu ? 'Новый прайс-лист' : 'Yangi narx jadvali'}
            </Button>
          }
        />
      </div>

      {loadFailed && (
        <Card>
          <LoadError
            error={priceListsQuery.error ?? productsQuery.error}
            onRetry={retryLoad}
            retrying={priceListsQuery.isFetching || productsQuery.isFetching}
          />
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: priceLists.length > 0 ? 'var(--ux-split-side)' : 'minmax(0, 1fr)', gap: 'var(--space-5)', alignItems: 'start' }}>
        {/* Price list tabs (hidden until there is a list: the empty state on the right says what to do) */}
        {(priceLists.length > 0 || priceListsQuery.isPending) && (
        <Card style={{ padding: 'var(--space-3)' }}>
          <h2 style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8, padding: '0 4px' }}>
            {isRu ? 'Прайс-листы' : 'Narx jadvallari'}
          </h2>
          {priceLists.length === 0 ? (
            priceListsQuery.isPending ? (
              <SkeletonRows rows={3} columns={1} />
            ) : (
              <p style={{ padding: '8px 4px', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
                {isRu ? 'Пока нет ни одного прайс-листа.' : 'Hozircha narx jadvali yo‘q.'}
              </p>
            )
          ) : (
            priceLists.map((pl) => {
              const isActive = selectedPL?.id === pl.id;
              const plName = typeof pl.name === 'object' ? (pl.name[locale] || pl.name.ru || pl.name.uz) : pl.name;
              return (
                <button
                  key={pl.id}
                  id={`pl-tab-${pl.id}`}
                  type="button"
                  aria-current={isActive ? 'true' : undefined}
                  onClick={() => selectPriceList(pl.id)}
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
                  <Tag size={14} aria-hidden />
                  <div>
                    <div>{plName}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: isActive ? 'var(--color-primary-700)' : 'var(--color-text-secondary)', marginTop: 2 }}>
                      {pl.currency} {pl.isDefault ? (isRu ? '• Основной' : '• Asosiy') : ''}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </Card>
        )}

        {/* Products price table */}
        <Card>
          {!selectedPL ? (
            priceListsQuery.isPending ? (
              <SkeletonRows rows={6} columns={4} />
            ) : (
              <EmptyState
                icon={Tag}
                title={isRu ? 'Прайс-листов пока нет' : 'Hozircha narx jadvallari yo‘q'}
                description={isRu ? 'Создайте прайс-лист, например «Опт», и укажите в нём цены товаров.' : 'Narx jadvalini yarating, masalan «Ulgurji», va unda tovar narxlarini kiriting.'}
                action={
                  <Button onClick={() => setShowCreatePL(true)}>
                    <Plus size={16} aria-hidden /> {isRu ? 'Новый прайс-лист' : 'Yangi narx jadvali'}
                  </Button>
                }
              />
            )
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <h3 style={{ fontWeight: 600, fontSize: 'var(--text-lg)', margin: 0 }}>
                    {typeof selectedPL.name === 'object' ? (selectedPL.name[locale] || selectedPL.name.ru || selectedPL.name.uz) : selectedPL.name}
                  </h3>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                    {selectedPL.currency}{selectedPL.isDefault ? (isRu ? ' · основной' : ' · asosiy') : ''} · {isRu ? `цены у ${selectedPL.prices?.length ?? 0} из ${products.length} товаров` : `${products.length} ta tovardan ${selectedPL.prices?.length ?? 0} tasiga narx qo‘yilgan`}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleOpenEditPL(selectedPL)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <Edit2 size={14} aria-hidden /> {isRu ? 'Изменить' : 'Tahrirlash'}
                  </Button>
                  {!selectedPL.isDefault && (
                    <Button
                      size="sm"
                      variant="danger-outline"
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                      onClick={() => void handleDeletePL(selectedPL)}
                    >
                      <Trash2 size={14} aria-hidden /> {isRu ? 'Удалить' : 'O‘chirish'}
                    </Button>
                  )}
                </div>
              </div>
              {products.length > 0 && (
                <div style={{ padding: 'var(--space-3) var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', borderBottom: '1px solid var(--color-border-light)' }}>
                  <FilterBar
                    state={lf}
                    defs={[
                      {
                        key: 'show',
                        kind: 'segmented',
                        label: tpr('show'),
                        options: [
                          { value: 'priced', label: tpr('priced'), count: selectedPL.prices?.length ?? 0 },
                          { value: 'unpriced', label: tpr('unpriced'), count: Math.max(0, products.length - (selectedPL.prices?.length ?? 0)) },
                        ],
                      },
                    ]}
                    searchPlaceholder={isRu ? 'Товар или артикул' : 'Tovar yoki artikul'}
                    resultCount={visibleProducts.length}
                  />
                  <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
                  {Object.keys(editingPrices).length > 0 && (
                    <span className="rd-active-filter" style={{ paddingRight: 10 }}>{tpr('unsaved', { count: Object.keys(editingPrices).length })}</span>
                  )}
                  <span className="rd-sub" style={{ marginLeft: 'auto', marginTop: 0 }}>{tpr('keysHint')}</span>
                  </div>
                </div>
              )}
              <table className="app-table-stack" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                    {[
                      isRu ? 'Товар' : 'Tovar',
                      isRu ? 'Артикул' : 'Artikul',
                      isRu ? 'Базовая цена' : 'Asosiy narx',
                      isRu ? 'Цена в прайсе' : 'Jadvaldagi narx',
                      isRu ? 'Разница' : 'Farq',
                    ].map((h) => (
                      <th key={h} scope="col" style={{ padding: '10px 14px', textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                        {h}
                      </th>
                    ))}
                    <th scope="col"><span className="sr-only">{isRu ? 'Действия' : 'Amallar'}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {products.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
                        {productsQuery.isPending
                          ? isRu ? 'Загрузка...' : 'Yuklanmoqda...'
                          : isRu
                          ? 'Товаров пока нет. Добавьте товары в разделе «Товары», затем задайте им цены здесь.'
                          : 'Hozircha tovarlar yo‘q. Avval «Tovarlar» bo‘limida tovar qo‘shing, so‘ng bu yerda narx belgilang.'}
                      </td>
                    </tr>
                  )}
                  {products.length > 0 && visibleProducts.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                        {isRu ? 'Ничего не найдено. Измените поиск или фильтр.' : 'Hech narsa topilmadi. Qidiruv yoki filtrni o‘zgartiring.'}
                      </td>
                    </tr>
                  )}
                  {visibleProducts.slice(0, rowLimit).map((prod, rowIndex) => {
                    const listPrice = getPriceForProduct(prod.id);
                    const basePrice = Number(prod.salePrice || 0);
                    const isEditing = prod.id in editingPrices;
                    void startEdit;
                    const isSaving = savingPrice === prod.id;

                    // A discount compares two prices in the same currency only (ADR 0023).
                    const sameCurrency = prod.salePriceCurrency === selectedPL?.currency;
                    let discountBadge = null;
                    if (listPrice > 0 && basePrice > 0 && sameCurrency) {
                      if (listPrice < basePrice) {
                        const disc = formatPercent(((basePrice - listPrice) / basePrice) * 100);
                        discountBadge = <Badge variant="success">-{disc} {isRu ? 'скидка' : 'chegirma'}</Badge>;
                      } else if (listPrice > basePrice) {
                        const markup = formatPercent(((listPrice - basePrice) / basePrice) * 100);
                        discountBadge = <Badge variant="warning">+{markup} {isRu ? 'наценка' : 'ustama'}</Badge>;
                      } else {
                        discountBadge = <Badge variant="neutral">0%</Badge>;
                      }
                    }

                    return (
                      <tr key={prod.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                        <td data-primary style={{ padding: '10px 14px', fontWeight: 500 }}>{getProductName(prod)}</td>
                        <td data-label={isRu ? 'Артикул' : 'Artikul'} style={{ padding: '10px 14px', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{prod.sku || '—'}</td>
                        <td data-label={isRu ? 'Базовая цена' : 'Asosiy narx'} style={{ padding: '10px 14px' }} className="tabular-nums">
                          {formatPriceOrUnset(basePrice, locale, prod.salePriceCurrency)}
                        </td>
                        <td data-label={isRu ? 'Цена в прайсе' : 'Jadvaldagi narx'} style={{ padding: '6px 14px' }} className="tabular-nums">
                          {/* Spreadsheet-style: the price is always editable; Enter saves and moves down, Esc undoes */}
                          <div
                            data-price-row={rowIndex}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                e.stopPropagation();
                                cancelEdit(prod.id);
                              }
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                if (isEditing) void handleSavePrice(prod.id);
                                const next = document.querySelector<HTMLInputElement>(`[data-price-row="${rowIndex + 1}"] input`);
                                next?.focus();
                                next?.select();
                              }
                            }}
                          >
                          <CurrencyInput
                            id={`price-input-${prod.id}`}
                            aria-label={isRu ? `Цена: ${getProductName(prod)}` : `Narx: ${getProductName(prod)}`}
                            value={isEditing ? editingPrices[prod.id] ?? '' : listPrice > 0 ? listPrice : ''}
                            decimals={2}
                            placeholder="—"
                            onChange={(value) => setEditingPrices((prev) => ({ ...prev, [prod.id]: value }))}
                            style={{ width: 150, borderColor: isEditing ? 'var(--color-warning-600)' : undefined }}
                          />
                          </div>
                        </td>
                        <td data-label={isRu ? 'Разница' : 'Farq'} style={{ padding: '10px 14px' }}>
                          {discountBadge || <span style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>—</span>}
                        </td>
                        <td style={{ padding: '6px 14px', textAlign: 'right' }}>
                          {isEditing ? (
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <Button id={`save-price-${prod.id}`} size="sm" onClick={() => void handleSavePrice(prod.id)} loading={isSaving} loadingText={isRu ? 'Сохранение…' : 'Saqlanmoqda…'}>
                                <Check size={13} aria-hidden /> {isRu ? 'Сохранить' : 'Saqlash'}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => cancelEdit(prod.id)} aria-label={isRu ? 'Отменить' : 'Bekor qilish'} title={isRu ? 'Отменить (Esc)' : 'Bekor qilish (Esc)'}>
                                <X size={14} aria-hidden />
                              </Button>
                            </div>
                          ) : listPrice <= 0 && basePrice > 0 && sameCurrency ? (
                            <button type="button" className="rd-linkbtn" onClick={() => setEditingPrices((prev) => ({ ...prev, [prod.id]: basePrice }))}>
                              {tpr('useBase')}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {visibleProducts.length > rowLimit && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-3)', borderTop: '1px solid var(--color-border-light)' }}>
                  <Button variant="secondary" size="sm" onClick={() => setRowLimit((n) => n + 200)}>
                    {tpr('showMore', { shown: rowLimit, total: visibleProducts.length })}
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Create Price List Side Drawer Panel */}
      <Drawer
        isOpen={showCreatePL}
        onClose={() => setShowCreatePL(false)}
        title={isRu ? 'Новый прайс-лист' : 'Yangi narx jadvali'}
        description={isRu ? 'Создание новой категории цен (розница, опт, дилерские)' : 'Yangi narx toifasini yaratish (chakana, ulgurji, dilerlik)'}
        icon={<Tag size={20} />}
        size="md"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', width: '100%' }}>
            <Button id="cancel-pl-btn" variant="secondary" onClick={() => setShowCreatePL(false)} disabled={createLoading}>
              {isRu ? 'Отмена' : 'Bekor qilish'}
            </Button>
            <Button id="submit-pl-btn" onClick={handleCreatePL} disabled={!newPLNameUz} loading={createLoading} loadingText={isRu ? 'Сохранение…' : 'Saqlanmoqda…'}>
              {isRu ? 'Создать' : 'Yaratish'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Input
            id="pl-name-uz"
            label={isRu ? 'Название (по-узбекски) *' : 'Nomi (o‘zbekcha) *'}
            value={newPLNameUz}
            onChange={(e) => setNewPLNameUz(e.target.value)}
            placeholder={isRu ? 'Напр. Розница / Оптовая' : 'Mas. Chakana / Ulgurji narxlar'}
          />
          <Input
            id="pl-name-ru"
            label={isRu ? 'Название (по-русски)' : 'Nomi (ruscha)'}
            value={newPLNameRu}
            onChange={(e) => setNewPLNameRu(e.target.value)}
            placeholder={isRu ? 'Напр. Розничные цены' : 'Mas. Розничные цены'}
          />
          <Select
            id="pl-currency"
            label={isRu ? 'Валюта *' : 'Valyuta *'}
            value={newPLCurrency}
            placeholder={isRu ? 'Валюта' : 'Valyuta'}
            onChange={(val) => setNewPLCurrency(val)}
            options={CURRENCY_OPTIONS}
          />
          <Checkbox
            id="pl-is-default"
            checked={newPLDefault}
            onChange={(e) => setNewPLDefault(e.target.checked)}
            label={isRu ? 'Основной прайс-лист' : 'Asosiy narx jadvali'}
            description={isRu ? 'Подставляется в продажу, если у клиента нет своего прайс-листа.' : 'Mijozning o‘z jadvali bo‘lmasa, sotuvga shu qo‘yiladi.'}
          />
        </div>
      </Drawer>

      {/* Edit Price List Side Drawer Panel */}
      <Drawer
        isOpen={showEditPL}
        onClose={() => setShowEditPL(false)}
        title={isRu ? 'Редактирование прайс-листа' : 'Narx jadvalini tahrirlash'}
        description={isRu ? 'Изменение параметров прайс-листа' : 'Narx jadvali parametrlarini o\'zgartirish'}
        icon={<Tag size={20} />}
        size="md"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', width: '100%' }}>
            <Button variant="secondary" onClick={() => setShowEditPL(false)} disabled={editLoading}>
              {isRu ? 'Отмена' : 'Bekor qilish'}
            </Button>
            <Button onClick={handleSaveEditPL} disabled={!editPLNameUz} loading={editLoading} loadingText={isRu ? 'Сохранение…' : 'Saqlanmoqda…'}>
              {isRu ? 'Сохранить' : 'Saqlash'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Input
            id="edit-pl-name-uz"
            label={isRu ? 'Название (по-узбекски) *' : 'Nomi (o‘zbekcha) *'}
            value={editPLNameUz}
            onChange={(e) => setEditPLNameUz(e.target.value)}
            placeholder={isRu ? 'Напр. Розница / Оптовая' : 'Mas. Chakana / Ulgurji narxlar'}
          />
          <Input
            id="edit-pl-name-ru"
            label={isRu ? 'Название (по-русски)' : 'Nomi (ruscha)'}
            value={editPLNameRu}
            onChange={(e) => setEditPLNameRu(e.target.value)}
            placeholder={isRu ? 'Напр. Розничные цены' : 'Mas. Розничные цены'}
          />
          <Select
            id="edit-pl-currency"
            label={isRu ? 'Валюта *' : 'Valyuta *'}
            value={editPLCurrency}
            placeholder={isRu ? 'Валюта' : 'Valyuta'}
            onChange={(val) => setEditPLCurrency(val)}
            options={CURRENCY_OPTIONS}
          />
          <Checkbox
            id="edit-pl-is-default"
            checked={editPLDefault}
            onChange={(e) => setEditPLDefault(e.target.checked)}
            label={isRu ? 'Основной прайс-лист' : 'Asosiy narx jadvali'}
            description={isRu ? 'Подставляется в продажу, если у клиента нет своего прайс-листа.' : 'Mijozning o‘z jadvali bo‘lmasa, sotuvga shu qo‘yiladi.'}
          />
        </div>
      </Drawer>

    </div>
  );
}
