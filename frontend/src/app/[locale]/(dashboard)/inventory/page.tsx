'use client';

import { productTypeLabel, productTypeOptions } from '@/lib/product-types';
import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchField } from '@/components/ui/SearchField';
import { EmptyState } from '@/components/ui/EmptyState';
import { buttonStyle } from '@/components/ui/Button';
import { ActionsMenu } from '@/components/production/ActionsMenu';
import { usePersistentState } from '@/lib/usePersistentState';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { ChipGroup, Signal, SignalStrip } from '@/components/ui/list/ListKit';
import { DataTable, type Column, type SortState } from '@/components/ui/list/DataTable';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { LoadError } from '@/components/ui/LoadError';
import { formatPriceOrUnset, formatQuantity, errorMessage, type LocalizedName } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import {
  Package,
  QrCode,
  FileText,
  ArrowRightLeft,
} from 'lucide-react';
import { Product, Category } from '@shared/types';
import type { Warehouse as WarehouseRow } from '@shared/types';
import { unitLabel } from '@/lib/units';
import { CreateProductDrawer } from '@/components/products/CreateProductDrawer';

export default function InventoryPage() {
  const t = useTranslations('inventory');
  const locale = useLocale() as 'uz' | 'ru';
  const { token, company, hasPermission } = useAuth();
  const canEditProducts = hasPermission('inventory:edit');
  // muammolar B10: the nomenclature list can open a product for editing.
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const [search, setSearch] = useState('');
  // The typed search applies on Enter / the filter button, as before.
  const appliedSearch = useDebouncedValue(search.trim(), 350);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  // TZ "Ishlab chiqarish" 7: finished products are filtered apart from raw materials.
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');
  const filterLowStockOnly = false;

  // Barcode scanner modal state
  const [showScanner, setShowScanner] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [scanResult, setScanResult] = useState<Product | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const productsQuery = useApiQuery<Product[]>(
    `/inventory/products?${appliedSearch ? `search=${encodeURIComponent(appliedSearch)}` : ''}${selectedCategory ? `&category=${encodeURIComponent(selectedCategory)}` : ''}`,
  );
  const categoriesQuery = useApiQuery<Category[]>('/inventory/categories');
  const warehousesQuery = useApiQuery<WarehouseRow[]>('/tenants/warehouses');
  const lowStockQuery = useApiQuery<Product[]>('/inventory/products/low-stock');
  const inventoryQueries = [productsQuery, categoriesQuery, warehousesQuery, lowStockQuery];
  const products = productsQuery.data;
  const categories = categoriesQuery.data;
  const warehouses = warehousesQuery.data;
  const lowStockAlerts = Array.isArray(lowStockQuery.data) ? lowStockQuery.data : [];
  const loading = inventoryQueries.some((q) => q.isPending);
  const failedQuery = inventoryQueries.find((q) => q.isError);

  /** Enter / filter button: apply the typed search, or reload when it is unchanged. */
  const fetchData = () => {
    inventoryQueries.forEach((q) => void q.refetch());
  };

  const handleBarcodeSearch = async () => {
    if (!scannedBarcode || !token || !company) return;
    setScanError(null);
    setScanResult(null);
    try {
      const res = await apiFetch<Product>(`/inventory/products/barcode/${scannedBarcode}`, {
        token,
        tenantId: company.id,
        locale,
      });
      setScanResult(res);
    } catch (err) {
      setScanError(errorMessage(err) || 'Product not found');
    }
  };

  const safeProducts = Array.isArray(products) ? products : [];
  const safeWarehouses = Array.isArray(warehouses) ? warehouses : [];
  const safeCategories = Array.isArray(categories) ? categories : [];

  const filteredProducts = safeProducts.filter(
    (p) => (!filterLowStockOnly || p.isLowStock) && (!selectedType || p.type === selectedType),
  );

  const isRu = locale === 'ru';

  const getLocalizedName = (name: LocalizedName | null | undefined) => {
    if (!name) return '';
    if (typeof name === 'string') return name;
    return name[locale] || name.ru || name.uz || '';
  };

  const warehouseOptions = [
    { value: '', label: isRu ? 'Все склады' : 'Barcha Omborlar' },
    ...safeWarehouses.map((w) => ({ value: w.id, label: getLocalizedName(w.name) })),
  ];

  const categoryOptions = [
    { value: '', label: isRu ? 'Все категории' : 'Barcha kategoriyalar' },
    ...safeCategories.map((c) => ({ value: c.id, label: getLocalizedName(c.name) })),
  ];

  const tl = useTranslations('rd.list');
  const ti = useTranslations('rd.inv');
  const [stockFocus, setStockFocus] = useState<'' | 'low' | 'zero' | 'instock'>('');
  const [limit, setLimit] = useState(100);
  const [sort, setSort] = usePersistentState<SortState | null>('inventory.sort', null);
  const goods = filteredProducts.filter((p) => p.type !== 'SERVICE');
  const qtyIn = (p: Product, warehouseId: string) =>
    Number(((p as Product & { stockLevels?: Array<{ warehouseId: string; quantity: number | string }> }).stockLevels ?? []).find((l) => l.warehouseId === warehouseId)?.quantity ?? 0);
  const total = (p: Product) => (selectedWarehouse ? qtyIn(p, selectedWarehouse) : Number(p.totalStock ?? 0));
  const zeroCount = goods.filter((p) => Number(p.totalStock ?? 0) <= 0).length;
  const shownRows = goods.filter((p) =>
    stockFocus === 'low' ? p.isLowStock : stockFocus === 'zero' ? total(p) <= 0 : stockFocus === 'instock' ? total(p) > 0 : true,
  );
  const visibleRows = shownRows.slice(0, limit);
  // One column per warehouse (up to four) so stock in each place is visible at a glance.
  const warehouseCols = (selectedWarehouse ? safeWarehouses.filter((w) => w.id === selectedWarehouse) : safeWarehouses).slice(0, 4);

  const columns: Column<Product>[] = [
    {
      key: 'name',
      label: isRu ? 'Товар' : 'Tovar',
      primary: true,
      locked: true,
      sortValue: (p) => getLocalizedName(p.name),
      render: (p) => (
        <div>
          <div style={{ fontWeight: 'var(--font-semibold)' }}>{getLocalizedName(p.name)}</div>
          <div className="rd-sub">
            {productTypeLabel(p.type, locale)}
            {p.sku ? ` · ${p.sku}` : ''}
            {p.barcode ? ` · ${p.barcode}` : ''}
          </div>
        </div>
      ),
    },
    ...warehouseCols.map<Column<Product>>((w) => ({
      key: `w-${w.id}`,
      label: getLocalizedName(w.name),
      numeric: true,
      sortValue: (p: Product) => qtyIn(p, w.id),
      render: (p: Product) => {
        const q = qtyIn(p, w.id);
        return <span style={{ color: q <= 0 ? 'var(--color-text-tertiary)' : undefined }}>{formatQuantity(q)}</span>;
      },
    })),
    {
      key: 'total',
      label: selectedWarehouse ? ti('inWarehouse') : ti('total'),
      numeric: true,
      sortValue: total,
      render: (p) => (
        <strong style={{ color: p.isLowStock ? 'var(--color-error-700)' : undefined }}>
          {formatQuantity(total(p))} {unitLabel(p.unitOfMeasure, locale)}
        </strong>
      ),
    },
    {
      key: 'min',
      label: ti('min'),
      numeric: true,
      sortValue: (p) => Number(p.minStockAlert ?? 0),
      render: (p) => <span style={{ color: 'var(--color-text-secondary)' }}>{formatQuantity(Number(p.minStockAlert ?? 0))}</span>,
    },
    {
      key: 'status',
      label: tl('status'),
      sortValue: (p) => (p.isLowStock ? 0 : 1),
      render: (p) =>
        Number(p.totalStock ?? 0) <= 0 ? <Badge variant="error">{ti('out')}</Badge> : p.isLowStock ? <Badge variant="warning">{ti('lowBadge')}</Badge> : <Badge variant="success">{ti('ok')}</Badge>,
    },
    {
      key: 'actions',
      label: isRu ? 'Действия' : 'Amallar',
      locked: true,
      render: (p) =>
        canEditProducts ? (
          <div className="rd-row-actions">
            <ActionsMenu label={tl('rowActions')} actions={[{ label: tl('edit'), onSelect: () => setEditingProduct(p) }]} />
          </div>
        ) : null,
    },
  ];

  return (
    <div className="rd-page">
      <PageHeader
        title={isRu ? 'Склад и остатки' : t('title')}
        subtitle={ti('subtitle')}
        actions={
          <>
            <Button variant="outline" onClick={() => setShowScanner(true)}>
              <QrCode size={16} aria-hidden /> {isRu ? 'Сканер штрихкода' : 'Shtrix-kod skaner'}
            </Button>
            <Link href="/inventory/transfers" style={buttonStyle('outline')}>
              <ArrowRightLeft size={16} aria-hidden /> {isRu ? 'Перемещение' : 'Omborlararo transfer'}
            </Link>
            <Link href="/inventory/documents" style={buttonStyle('primary')}>
              <FileText size={16} aria-hidden /> {ti('documents')}
            </Link>
          </>
        }
      />

      <SignalStrip label={tl('summary')}>
        <Signal tone="error" label={ti('sigLow')} value={lowStockAlerts.length} hint={ti('sigLowHint')} active={stockFocus === 'low'} onClick={() => setStockFocus(stockFocus === 'low' ? '' : 'low')} />
        <Signal tone="warning" label={ti('sigZero')} value={zeroCount} hint={ti('sigZeroHint')} active={stockFocus === 'zero'} onClick={() => setStockFocus(stockFocus === 'zero' ? '' : 'zero')} />
        <Signal tone="info" label={ti('sigItems')} value={goods.length} hint={ti('sigItemsHint')} />
        <Signal tone="neutral" label={ti('sigWarehouses')} value={safeWarehouses.length} hint={<Link href="/settings/branches">{isRu ? 'Филиалы и склады' : 'Filial va omborlar'}</Link>} />
      </SignalStrip>

      <div className="rd-toolbar">
        <div className="rd-toolbar-row">
          <SearchField value={search} onChange={setSearch} placeholder={ti('searchPh')} label={tl('search')} />
          <div style={{ minWidth: 200 }}>
            <Select options={categoryOptions} value={selectedCategory} onChange={setSelectedCategory} searchable />
          </div>
        </div>
        <div className="rd-toolbar-row">
          <ChipGroup label={tl('warehouse')} showLabel options={warehouseOptions} value={selectedWarehouse} onChange={setSelectedWarehouse} />
        </div>
        <div className="rd-toolbar-row">
          <ChipGroup
            label={ti('stockFilter')}
            showLabel
            options={[
              { value: '', label: tl('all') },
              { value: 'instock', label: ti('inStock') },
              { value: 'low', label: ti('lowBadge') },
              { value: 'zero', label: ti('out') },
            ]}
            value={stockFocus}
            onChange={(v) => setStockFocus(v as typeof stockFocus)}
          />
          <ChipGroup label={isRu ? 'Тип' : 'Turi'} showLabel options={productTypeOptions(locale, tl('all')).filter((o) => o.value !== 'SERVICE')} value={selectedType} onChange={setSelectedType} />
        </div>
      </div>

      <div className="rd-table-card">
        {failedQuery ? (
          <LoadError
            error={failedQuery.error}
            onRetry={() => inventoryQueries.filter((q) => q.isError).forEach((q) => void q.refetch())}
            retrying={inventoryQueries.some((q) => q.isFetching)}
          />
        ) : (
          <DataTable
            rows={visibleRows}
            columns={columns}
            rowKey={(p) => p.id}
            sort={sort}
            onSortChange={setSort}
            onRowClick={canEditProducts ? (p) => setEditingProduct(p) : undefined}
            loading={loading}
            empty={<EmptyState icon={Package} title={tl('nothingFound')} description={tl('nothingFoundHint')} />}
          />
        )}
        {shownRows.length > visibleRows.length && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderTop: '1px solid var(--color-border-light)' }}>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{ti('shownOf', { shown: visibleRows.length, total: shownRows.length })}</span>
            <Button variant="secondary" size="sm" onClick={() => setLimit((n) => n + 200)}>
              {ti('showMore')}
            </Button>
          </div>
        )}
      </div>

      {editingProduct && (
        <CreateProductDrawer
          isOpen={Boolean(editingProduct)}
          productToEdit={editingProduct}
          onClose={() => setEditingProduct(null)}
          onSuccess={() => {
            setEditingProduct(null);
            fetchData();
          }}
        />
      )}

      {/* Barcode Scanner Modal */}
      {showScanner && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ width: '100%', maxWidth: '420px', backgroundColor: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)', boxShadow: 'var(--shadow-xl)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'Поиск по штрих-коду / QR' : 'Shtrix-kod / QR bo‘yicha qidirish'}</h3>
              <button aria-label={isRu ? 'Закрыть' : 'Yopish'} title={isRu ? 'Закрыть' : 'Yopish'} type="button" onClick={() => setShowScanner(false)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
              <input
                type="text"
                value={scannedBarcode}
                onChange={(e) => setScannedBarcode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleBarcodeSearch()}
                placeholder="Shtrix-kodni kiriting yoki skanerlang..."
                style={{ flex: 1, padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
              />
              <Button variant="primary" size="sm" onClick={handleBarcodeSearch}>Qidirish</Button>
            </div>

            {scanError && (
              <div style={{ padding: '10px', backgroundColor: 'var(--color-error-50)', color: 'var(--color-error-700)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)' }}>
                {scanError}
              </div>
            )}

            {scanResult && (
              <div style={{ padding: '12px', backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ fontWeight: 'var(--font-bold)' }}>{getLocalizedName(scanResult.name)}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>SKU: {scanResult.sku} | Barcode: {scanResult.barcode}</div>
                <div style={{ fontWeight: 'var(--font-semibold)', color: 'var(--color-primary-600)', marginTop: '4px' }}>
                  Narxi: {formatPriceOrUnset(Number(scanResult.salePrice), locale, scanResult.salePriceCurrency)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
