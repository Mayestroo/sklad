'use client';

import { useState, useMemo } from 'react';
import { usePersistentState } from '@/lib/usePersistentState';
import { useLocale, useTranslations } from 'next-intl';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ActionsMenu } from '@/components/production/ActionsMenu';
import { ColumnChooser, FilterBar, useFilterState, type FilterDef } from '@/components/ui/filters';
import { StatCard, StatCardGrid } from '@/components/ui/stats/StatCard';
import { DataTable, type Column, type SortState } from '@/components/ui/list/DataTable';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { LoadError } from '@/components/ui/LoadError';
import { formatCurrency, formatPercent, formatPriceOrUnset, errorMessage } from '@/lib/utils';
import { catalogMarkupPercent } from '@/lib/inventory-cost';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import {
  Package,
  Plus,
  QrCode,
  Tag,
  Edit2,
  Trash2,
  Zap,
} from 'lucide-react';
import { Product, Category } from '@shared/types';
import { CreateProductDrawer } from '@/components/products/CreateProductDrawer';
import { toast } from '@/context/ToastContext';
import { unitLabel } from '@/lib/units';
import { productTypeLabel, productTypeOptions, semiFinishedLabel } from '@/lib/product-types';

/** Product name in the UI language (falls back to the other language). */
function productName(p: Product, locale: 'uz' | 'ru'): string {
  if (!p.name) return '—';
  if (typeof p.name === 'string') return p.name;
  return p.name[locale] || p.name.ru || p.name.uz || '—';
}

const FILTER_DEFAULTS = { type: '', categoryId: '', status: '', stock: '' };

export default function ProductsPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const tIn = useTranslations('rd.inline');
  const { token, company } = useAuth();

  const productsQuery = useApiQuery<Product[]>('/inventory/products');
  // Optional: without categories the list still shows ("no category").
  const categoriesQuery = useApiQuery<Category[]>('/inventory/categories');
  const products = useMemo(() => productsQuery.data ?? [], [productsQuery.data]);
  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);
  const loading = productsQuery.isPending;
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Category management state
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCatNameUz, setNewCatNameUz] = useState('');
  const [newCatNameRu, setNewCatNameRu] = useState('');
  const [createCatLoading, setCreateCatLoading] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editCatNameUz, setEditCatNameUz] = useState('');
  const [editCatNameRu, setEditCatNameRu] = useState('');
  const [editCatLoading, setEditCatLoading] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [deleteCatLoading, setDeleteCatLoading] = useState(false);

  // Filters live in the URL and are remembered per user; the list is filtered here. A link may open
  // the list pre-filtered (?stock=low from the dashboard).
  const lf = useFilterState('products.list', FILTER_DEFAULTS);
  const search = lf.search;
  const { categoryId: selectedCategory, type: selectedType, status: selectedStatus } = lf.values;
  const focus = lf.values.stock;

  // Selected product modal
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const fetchCatalogData = () => {
    void productsQuery.refetch();
    void categoriesQuery.refetch();
  };

  const handleDeleteProduct = async () => {
    if (!deletingProduct || !token || !company) return;
    setDeleteLoading(true);
    try {
      await apiFetch(`/inventory/products/${deletingProduct.id}`, {
        method: 'DELETE',
        token,
        tenantId: company.id,
        locale,
      });
      setDeletingProduct(null);
      toast.success(isRu ? 'Товар успешно удален' : 'Tovar muvaffaqiyatli o‘chirildi');
      fetchCatalogData();
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Ошибка при удалении товара' : 'Tovarni o‘chirishda xatolik'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !company || !newCatNameUz.trim()) return;
    setCreateCatLoading(true);
    try {
      await apiFetch('/inventory/categories', {
        method: 'POST',
        token,
        tenantId: company.id,
        locale,
        body: JSON.stringify({
          name: { uz: newCatNameUz.trim(), ru: newCatNameRu.trim() || newCatNameUz.trim() },
        }),
      });
      setNewCatNameUz('');
      setNewCatNameRu('');
      toast.success(isRu ? 'Категория успешно создана' : 'Kategoriya muvaffaqiyatli yaratildi');
      fetchCatalogData();
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Ошибка при создании категории' : 'Kategoriya yaratishda xatolik'));
    } finally {
      setCreateCatLoading(false);
    }
  };

  const handleOpenEditCategory = (cat: Category) => {
    setEditingCategory(cat);
    const uz = typeof cat.name === 'object' ? (cat.name.uz || '') : cat.name || '';
    const ru = typeof cat.name === 'object' ? (cat.name.ru || '') : cat.name || '';
    setEditCatNameUz(uz);
    setEditCatNameRu(ru);
  };

  const handleSaveEditCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !company || !editingCategory || !editCatNameUz.trim()) return;
    setEditCatLoading(true);
    try {
      await apiFetch(`/inventory/categories/${editingCategory.id}`, {
        method: 'PATCH',
        token,
        tenantId: company.id,
        locale,
        body: JSON.stringify({
          name: { uz: editCatNameUz.trim(), ru: editCatNameRu.trim() || editCatNameUz.trim() },
        }),
      });
      setEditingCategory(null);
      toast.success(isRu ? 'Категория успешно обновлена' : 'Kategoriya muvaffaqiyatli yangilandi');
      fetchCatalogData();
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Ошибка при обновлении категории' : 'Kategoriyani tahrirlashda xatolik'));
    } finally {
      setEditCatLoading(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (!token || !company || !deletingCategory) return;
    setDeleteCatLoading(true);
    try {
      await apiFetch(`/inventory/categories/${deletingCategory.id}`, {
        method: 'DELETE',
        token,
        tenantId: company.id,
        locale,
      });
      setDeletingCategory(null);
      toast.success(isRu ? 'Категория успешно удалена' : 'Kategoriya muvaffaqiyatli o‘chirildi');
      fetchCatalogData();
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Ошибка при удалении категории' : 'Kategoriyani o‘chirishda xatolik'));
    } finally {
      setDeleteCatLoading(false);
    }
  };



  // Helper for localized name
  const getProductName = (p: Product) => productName(p, locale);

  const getCategoryName = (catId?: string | null) => {
    const defaultLabel = isRu ? 'Без категории' : 'Kategoriyasiz';
    if (!catId) return defaultLabel;
    const cat = categories.find((c) => c.id === catId);
    if (!cat || !cat.name) return defaultLabel;
    if (typeof cat.name === 'string') return cat.name;
    return cat.name[locale] || cat.name.ru || cat.name.uz || defaultLabel;
  };

  // Filtered Products List
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const name = productName(p, locale).toLowerCase();
      const sku = (p.sku || '').toLowerCase();
      const barcode = (p.barcode || '').toLowerCase();
      const query = search.toLowerCase().trim();

      const matchesSearch = !query || name.includes(query) || sku.includes(query) || barcode.includes(query);
      const matchesCategory = !selectedCategory || p.categoryId === selectedCategory;
      const matchesType = !selectedType || p.type === selectedType;
      const matchesStatus =
        !selectedStatus ||
        (selectedStatus === 'ACTIVE' && p.isActive) ||
        (selectedStatus === 'INACTIVE' && !p.isActive);

      return matchesSearch && matchesCategory && matchesType && matchesStatus;
    });
  }, [products, search, selectedCategory, selectedType, selectedStatus, locale]);

  // Summary Metrics
  const totalProducts = products.length;
  const activeProducts = products.filter((p) => p.isActive).length;
  const servicesCount = products.filter((p) => p.type === 'SERVICE').length;
  const totalCategories = categories.length;

  const tl = useTranslations('rd.list');
  const tp = useTranslations('rd.products');
  const [hiddenCols, setHiddenCols] = usePersistentState<string[]>('products.hidden', ['unit']);
  const [sort, setSort] = usePersistentState<SortState | null>('products.sort', null);
  const [limit, setLimit] = useState(100);
  const isGoods = (p: Product) => p.type !== 'SERVICE';
  const stockOf = (p: Product) => Number((p as Product & { totalStock?: number }).totalStock ?? 0);
  const lowOf = (p: Product) => Boolean((p as Product & { isLowStock?: boolean }).isLowStock);
  const lowCount = products.filter(lowOf).length;
  const noPriceCount = products.filter((p) => p.isActive && !(Number(p.salePrice) > 0)).length;
  const focused = filteredProducts.filter((p) => (focus === 'low' ? lowOf(p) : focus === 'noprice' ? p.isActive && !(Number(p.salePrice) > 0) : true));
  const visible = focused.slice(0, limit);
  const openEdit = (p: Product) => {
    setEditingProduct(p);
    setIsCreateOpen(true);
  };

  const columns: Column<Product>[] = [
    {
      key: 'name',
      label: isRu ? 'Наименование' : 'Nomi',
      primary: true,
      locked: true,
      sortValue: (p) => getProductName(p),
      render: (p) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span aria-hidden style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', backgroundColor: p.type === 'SERVICE' ? 'var(--color-info-50)' : 'var(--color-primary-50)', color: p.type === 'SERVICE' ? 'var(--color-info-700)' : 'var(--color-primary-600)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {p.type === 'SERVICE' ? <Zap size={16} /> : <Package size={16} />}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 'var(--font-semibold)', opacity: p.isActive ? 1 : 0.6 }}>{getProductName(p)}</div>
            <div className="rd-sub">
              {productTypeLabel(p.type, locale)}
              {p.isSemiFinished ? ` · ${semiFinishedLabel(locale)}` : ''}
              {p.sku ? ` · ${p.sku}` : ''}
              {!p.isActive ? ` · ${tIn('nofaol')}` : ''}
            </div>
          </div>
        </div>
      ),
    },
    { key: 'barcode', label: isRu ? 'Штрихкод' : 'Shtrix-kod', sortValue: (p) => p.barcode ?? '', render: (p) => (p.barcode ? <span className="tabular-nums" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><QrCode size={12} aria-hidden /> {p.barcode}</span> : '—') },
    { key: 'category', label: isRu ? 'Категория' : 'Kategoriya', sortValue: (p) => getCategoryName(p.categoryId), render: (p) => <Badge variant="neutral">{getCategoryName(p.categoryId)}</Badge> },
    { key: 'unit', label: isRu ? 'Ед. изм.' : 'O‘lchov birligi', render: (p) => unitLabel(p.unitOfMeasure, locale) },
    {
      key: 'stock',
      label: tp('stock'),
      numeric: true,
      sortValue: (p) => (isGoods(p) ? stockOf(p) : -1),
      render: (p) =>
        isGoods(p) ? (
          <span style={{ fontWeight: 'var(--font-semibold)', color: lowOf(p) ? 'var(--color-error-700)' : undefined }}>
            {stockOf(p)} {unitLabel(p.unitOfMeasure, locale)}
            {lowOf(p) && <span className="rd-sub" style={{ color: 'inherit', display: 'block' }}>{tp('low', { min: Number(p.minStockAlert ?? 0) })}</span>}
          </span>
        ) : (
          <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
        ),
    },
    {
      key: 'cost',
      label: isRu ? 'Себестоимость' : 'Tannarx',
      numeric: true,
      sortValue: (p) => Number(p.costPrice || 0),
      render: (p) => <span style={{ color: 'var(--color-text-secondary)' }}>{formatPriceOrUnset(Number(p.costPrice || 0), locale, p.costPriceCurrency)}</span>,
    },
    {
      key: 'price',
      label: isRu ? 'Цена продажи' : 'Sotuv narxi',
      numeric: true,
      sortValue: (p) => Number(p.salePrice || 0),
      render: (p) => <strong style={{ color: Number(p.salePrice) > 0 ? undefined : 'var(--color-warning-700)' }}>{formatPriceOrUnset(Number(p.salePrice || 0), locale, p.salePriceCurrency)}</strong>,
    },
    {
      key: 'markup',
      label: isRu ? 'Наценка %' : 'Ustama %',
      numeric: true,
      sortValue: (p) => catalogMarkupPercent(p) ?? -999,
      render: (p) => {
        const markup = catalogMarkupPercent(p);
        return markup !== null ? <Badge variant={markup >= 20 ? 'success' : markup > 0 ? 'warning' : 'error'}>{markup > 0 ? '+' : ''}{formatPercent(markup)}</Badge> : '—';
      },
    },
    {
      key: 'actions',
      label: isRu ? 'Действия' : 'Amallar',
      locked: true,
      render: (p) => (
        <div className="rd-row-actions">
          {!(Number(p.salePrice) > 0) && p.isActive && (
            <button type="button" className="rd-next-btn" onClick={() => openEdit(p)}>
              {tp('setPrice')}
            </button>
          )}
          <ActionsMenu
            label={tl('rowActions')}
            actions={[
              { label: tl('open'), onSelect: () => setSelectedProduct(p) },
              { label: tl('edit'), onSelect: () => openEdit(p) },
              { label: tl('delete'), onSelect: () => setDeletingProduct(p), danger: true },
            ]}
          />
        </div>
      ),
    },
  ];

  const filterDefs: FilterDef[] = [
    { key: 'type', kind: 'segmented', label: tIn('turi'), options: productTypeOptions(locale) },
    {
      key: 'categoryId',
      kind: 'select',
      label: isRu ? 'Категория' : 'Kategoriya',
      searchable: true,
      options: categories.map((c) => ({ value: c.id, label: typeof c.name === 'object' ? c.name[locale] || c.name.ru || c.name.uz || '' : c.name })),
    },
    { key: 'status', kind: 'select', label: isRu ? 'Статус' : 'Holat', options: [{ value: 'ACTIVE', label: isRu ? 'Активный' : 'Faol' }, { value: 'INACTIVE', label: isRu ? 'Неактивный' : 'Nofaol' }] },
    { key: 'stock', kind: 'select', label: tp('attention'), options: [{ value: 'low', label: tp('sigLow'), count: lowCount }, { value: 'noprice', label: tp('sigNoPrice'), count: noPriceCount }] },
  ];
  const anyFilter = Boolean(search.trim() || lf.activeCount > 0);
  const clearAll = lf.reset;

  return (
    <div className="rd-page animate-fade-in">
      <PageHeader
        title={isRu ? 'Товары и услуги' : 'Tovarlar va xizmatlar'}
        subtitle={tp('subtitle')}
        actions={
          <>
            <Button variant="secondary" onClick={() => setIsCategoryModalOpen(true)}>
              <Tag size={16} aria-hidden /> {isRu ? 'Категории' : 'Kategoriyalar'}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setEditingProduct(null);
                setIsCreateOpen(true);
              }}
            >
              <Plus size={18} aria-hidden /> {isRu ? 'Добавить товар' : 'Yangi tovar qo‘shish'}
            </Button>
          </>
        }
      />

      <StatCardGrid label={tl('summary')} count={4}>
        <StatCard label={tp('sigLow')} loading={productsQuery.isPending} value={lowCount} secondary={tp('sigLowHint')} />
        <StatCard label={tp('sigNoPrice')} loading={productsQuery.isPending} value={noPriceCount} secondary={tp('sigNoPriceHint')} />
        <StatCard label={tIn('faol_pozitsiyalar')} loading={productsQuery.isPending} value={`${activeProducts} / ${totalProducts}`} secondary={tIn('xizmatlar_p0', { p0: servicesCount })} />
        <StatCard label={isRu ? 'Категории' : 'Kategoriyalar'} value={totalCategories} />
      </StatCardGrid>

      <FilterBar
        state={lf}
        defs={filterDefs}
        searchPlaceholder={tp('searchPh')}
        resultCount={productsQuery.isPending ? null : focused.length}
        columns={<ColumnChooser columns={columns.map((col) => ({ key: col.key, label: col.label, locked: col.locked }))} hidden={hiddenCols} onChange={setHiddenCols} />}
      />

      <div className="rd-table-card">
        {productsQuery.isError ? (
          <LoadError error={productsQuery.error} onRetry={fetchCatalogData} retrying={productsQuery.isFetching} />
        ) : (
          <DataTable
            rows={visible}
            columns={columns}
            rowKey={(p) => p.id}
            hidden={hiddenCols}
            sort={sort}
            onSortChange={setSort}
            onRowClick={(p) => setSelectedProduct(p)}
            selectedKey={selectedProduct?.id}
            loading={productsQuery.isPending}
            caption={tl('clickRowHint')}
            empty={
              anyFilter ? (
                <EmptyState icon={Package} title={tl('nothingFound')} description={tl('nothingFoundHint')} action={<Button variant="secondary" onClick={clearAll}>{tl('clearFilters')}</Button>} />
              ) : (
                <EmptyState icon={Package} title={tp('none')} description={tp('noneHint')} action={<Button onClick={() => { setEditingProduct(null); setIsCreateOpen(true); }}><Plus size={16} aria-hidden /> {isRu ? 'Добавить товар' : 'Yangi tovar qo‘shish'}</Button>} />
              )
            }
          />
        )}
        {focused.length > visible.length && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderTop: '1px solid var(--color-border-light)' }}>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{tp('shownOf', { shown: visible.length, total: focused.length })}</span>
            <Button variant="secondary" size="sm" onClick={() => setLimit((n) => n + 200)}>
              {tp('showMore')}
            </Button>
          </div>
        )}
      </div>

      {/* Product Detail View Modal */}
      {selectedProduct && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedProduct(null)}
          title={`${isRu ? 'Информация о товаре' : 'Tovar ma\'lumotlari'}: ${getProductName(selectedProduct)}`}
          size="md"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'SKU (Артикул)' : 'SKU (Kodu)'}</div>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', fontFamily: 'var(--font-mono)' }}>
                  {selectedProduct.sku || '—'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Штрихкод' : 'Shtrix-kod'}</div>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', fontFamily: 'var(--font-mono)' }}>
                  {selectedProduct.barcode || '—'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Категория' : 'Kategoriya'}</div>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)' }}>
                  {getCategoryName(selectedProduct.categoryId)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Единица измерения' : 'O‘lchov birligi'}</div>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)' }}>
                  {unitLabel(selectedProduct.unitOfMeasure, locale)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Себестоимость' : 'Tannarxi'}</div>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)' }}>
                  {formatCurrency(selectedProduct.costPrice, locale, selectedProduct.costPriceCurrency)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Цена продажи' : 'Sotish narxi'}</div>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', color: 'var(--color-primary-600)' }}>
                  {formatPriceOrUnset(selectedProduct.salePrice, locale, selectedProduct.salePriceCurrency)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Ставка НДС' : 'QQS stavkasi'}</div>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)' }}>
                  {selectedProduct.vatRate}%
                </div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Порог мин. остатка' : 'Minimal qoldiq chegarasi'}</div>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', color: 'var(--color-warning-700)' }}>
                  {selectedProduct.minStockAlert} {unitLabel(selectedProduct.unitOfMeasure, locale)}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
              <Button variant="secondary" onClick={() => setSelectedProduct(null)}>
                {isRu ? 'Закрыть' : 'Yopish'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Product Confirmation Modal */}
      {deletingProduct && (
        <Modal
          isOpen={true}
          onClose={() => setDeletingProduct(null)}
          title={isRu ? 'Удалить товар?' : 'Tovarni o‘chirishni tasdiqlaysizmi?'}
          size="sm"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
              {isRu
                ? `Вы действительно хотите удалить позицию «${getProductName(deletingProduct)}»? Если по ней уже есть складские партии или документы, она будет безопасно архивирована.`
                : `Rostdan ham «${getProductName(deletingProduct)}» tovarini o‘chirmoqchimisiz? Agar tovar bo‘yicha partiyalar yoki hujjatlar bo‘lsa, u xavfsiz arxivlanadi.`}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
              <Button variant="secondary" onClick={() => setDeletingProduct(null)} disabled={deleteLoading}>
                {isRu ? 'Отмена' : 'Bekor qilish'}
              </Button>
              <Button
                variant="danger"
                onClick={handleDeleteProduct}
                disabled={deleteLoading}
              >
                {deleteLoading ? (isRu ? 'Удаление...' : 'O‘chirilmoqda...') : (isRu ? 'Да, удалить' : 'Ha, o‘chirish')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Create / Edit Product Slide-Over Drawer */}
      {isCreateOpen && (
        <CreateProductDrawer
          isOpen={isCreateOpen}
          productToEdit={editingProduct}
          onClose={() => {
            setIsCreateOpen(false);
            setEditingProduct(null);
          }}
          onSuccess={() => {
            fetchCatalogData();
          }}
        />
      )}

      {/* Category Management Modal */}
      {isCategoryModalOpen && (
        <Modal
          isOpen={isCategoryModalOpen}
          onClose={() => setIsCategoryModalOpen(false)}
          title={isRu ? 'Управление категориями товаров' : 'Mahsulot kategoriyalarini boshqarish'}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {/* Create category form */}
            <form onSubmit={handleCreateCategory} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: '12px', backgroundColor: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-light)' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                {isRu ? 'Новая категория' : 'Yangi kategoriya qo‘shish'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 'var(--space-2)', alignItems: 'center' }}>
                <input
                  type="text"
                  required
                  value={newCatNameUz}
                  onChange={(e) => setNewCatNameUz(e.target.value)}
                  placeholder={isRu ? 'Название (узб) *' : "Nomi (o'zbekcha) *"}
                  style={{ width: '100%', padding: '6px 10px', fontSize: 'var(--text-xs)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', outline: 'none' }}
                />
                <input
                  type="text"
                  value={newCatNameRu}
                  onChange={(e) => setNewCatNameRu(e.target.value)}
                  placeholder={isRu ? 'Название (рус)' : 'Nomi (ruscha)'}
                  style={{ width: '100%', padding: '6px 10px', fontSize: 'var(--text-xs)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', outline: 'none' }}
                />
                <Button type="submit" size="sm" variant="primary" disabled={createCatLoading}>
                  <Plus size={14} />
                  {createCatLoading ? '...' : (isRu ? 'Добавить' : 'Qo‘shish')}
                </Button>
              </div>
            </form>

            {/* Categories List */}
            <div style={{ maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {categories.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-4)', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>
                  {isRu ? 'Категории отсутствуют' : 'Kategoriyalar mavjud emas'}
                </div>
              ) : (
                categories.map((c) => {
                  const catNameUz = typeof c.name === 'object' ? c.name.uz : c.name;
                  const catNameRu = typeof c.name === 'object' ? c.name.ru : c.name;
                  const prodCount = products.filter((p) => p.categoryId === c.id).length;

                  return (
                    <div
                      key={c.id}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: 'var(--color-bg-primary)',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--color-border-light)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Tag size={14} style={{ color: 'var(--color-primary-600)' }} />
                        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
                          {isRu ? (catNameRu || catNameUz) : (catNameUz || catNameRu)}
                        </span>
                        <Badge variant="neutral">
                          {prodCount} {isRu ? 'тов.' : 'ta'}
                        </Badge>
                      </div>

                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenEditCategory(c)}
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', color: 'var(--color-text-secondary)' }}
                          title={isRu ? 'Редактировать' : 'Tahrirlash'}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingCategory(c)}
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', color: 'var(--color-error-700)' }}
                          title={isRu ? 'Удалить' : 'O‘chirish'}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--color-border-light)', paddingTop: 'var(--space-3)' }}>
              <Button variant="secondary" onClick={() => setIsCategoryModalOpen(false)}>
                {isRu ? 'Закрыть' : 'Yopish'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Category Modal */}
      {editingCategory && (
        <Modal
          isOpen={Boolean(editingCategory)}
          onClose={() => setEditingCategory(null)}
          title={isRu ? 'Редактировать категорию' : 'Kategoriyani tahrirlash'}
          size="sm"
        >
          <form onSubmit={handleSaveEditCategory} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
                {isRu ? 'Название категории (узбекский) *' : 'Kategoriya nomi (o‘zbekcha) *'}
              </label>
              <input
                type="text"
                required
                value={editCatNameUz}
                onChange={(e) => setEditCatNameUz(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', outline: 'none' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
                {isRu ? 'Название категории (русский)' : 'Kategoriya nomi (ruscha)'}
              </label>
              <input
                type="text"
                value={editCatNameRu}
                onChange={(e) => setEditCatNameRu(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              <Button type="button" variant="secondary" onClick={() => setEditingCategory(null)}>
                {isRu ? 'Отмена' : 'Bekor qilish'}
              </Button>
              <Button type="submit" variant="primary" disabled={editCatLoading}>
                {editCatLoading ? (isRu ? 'Сохранение...' : 'Saqlanmoqda...') : (isRu ? 'Сохранить' : 'Saqlash')}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Category Confirm Modal */}
      {deletingCategory && (
        <Modal
          isOpen={Boolean(deletingCategory)}
          onClose={() => setDeletingCategory(null)}
          title={isRu ? 'Удалить категорию?' : 'Kategoriyani o‘chirishni tasdiqlaysizmi?'}
          size="sm"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
              {isRu
                ? `Вы действительно хотите удалить категорию «${typeof deletingCategory.name === 'object' ? (deletingCategory.name[locale] || deletingCategory.name.ru || deletingCategory.name.uz) : deletingCategory.name}»? Товары в этой категории останутся без категории.`
                : `Rostdan ham «${typeof deletingCategory.name === 'object' ? (deletingCategory.name[locale] || deletingCategory.name.uz || deletingCategory.name.ru) : deletingCategory.name}» kategoriyasini o‘chirmoqchimisiz? Ushbu kategoriyadagi tovarlar kategoriyasiz holatga o‘tadi.`}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
              <Button variant="secondary" onClick={() => setDeletingCategory(null)} disabled={deleteCatLoading}>
                {isRu ? 'Отмена' : 'Bekor qilish'}
              </Button>
              <Button
                variant="danger"
                onClick={handleDeleteCategory}
                disabled={deleteCatLoading}
              >
                {deleteCatLoading ? (isRu ? 'Удаление...' : 'O‘chirilmoqda...') : (isRu ? 'Удалить' : 'O‘chirish')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>

  );
}
