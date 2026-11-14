'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { LoadError } from '@/components/ui/LoadError';
import { formatCurrency, formatPriceOrUnset, formatQuantity, errorMessage, type LocalizedName } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import {
  Package,
  Plus,
  Search,
  Filter,
  AlertTriangle,
  QrCode,
  FileText,
  ArrowRightLeft,
  Building2,
  Pencil,
} from 'lucide-react';
import { Product, Category } from '@shared/types';
import type { Warehouse as WarehouseRow } from '@shared/types';
import { unitLabel } from '@/lib/units';
import { CreateProductDrawer } from '@/components/products/CreateProductDrawer';

export default function InventoryPage() {
  const t = useTranslations('inventory');
  const tCommon = useTranslations('common');
  const locale = useLocale() as 'uz' | 'ru';
  const { token, company, hasPermission } = useAuth();
  const canEditProducts = hasPermission('inventory:edit');
  // muammolar B10: the nomenclature list can open a product for editing.
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const [search, setSearch] = useState('');
  // The typed search applies on Enter / the filter button, as before.
  const [appliedSearch, setAppliedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');
  const [filterLowStockOnly, setFilterLowStockOnly] = useState(false);

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
    if (search !== appliedSearch) {
      setAppliedSearch(search);
      return;
    }
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

  const filteredProducts = filterLowStockOnly
    ? safeProducts.filter((p) => p.isLowStock)
    : safeProducts;

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', margin: 0 }}>
            {isRu ? 'Склад и остатки' : t('title')}
          </h1>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <Link href="/settings/branches" style={{ textDecoration: 'none' }}>
            <Button variant="outline">
              <Building2 size={16} />
              {isRu ? 'Филиалы и Склады' : 'Filial va Omborlar'}
            </Button>
          </Link>
          <Link href="/inventory/transfers" style={{ textDecoration: 'none' }}>
            <Button variant="outline">
              <ArrowRightLeft size={16} />
              {isRu ? 'Перемещение' : 'Omborlararo Transfer'}
            </Button>
          </Link>
          <Button variant="outline" onClick={() => setShowScanner(true)}>
            <QrCode size={16} />
            {isRu ? 'Сканер штрихкода' : 'Shtrix-kod skaner'}
          </Button>
          <Link href="/inventory/documents" style={{ textDecoration: 'none' }}>
            <Button variant="secondary">
              <FileText size={16} />
              {isRu ? 'Документы' : 'Hujjatlar (Kirim/Chiqim)'}
            </Button>
          </Link>
          {hasPermission('inventory:create') && (
            <Link href="/products/new" style={{ textDecoration: 'none' }}>
              <Button variant="primary">
                <Plus size={16} />
                {isRu ? 'Добавить товар' : t('addProduct')}
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Low Stock Banner Alert */}
      {lowStockAlerts.length > 0 && (
        <div
          style={{
            padding: 'var(--space-4)',
            borderRadius: 'var(--radius-lg)',
            backgroundColor: 'var(--color-warning-50)',
            border: '1px solid var(--color-warning-100)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-warning-100)', color: 'var(--color-warning-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertTriangle size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-sm)', color: 'var(--color-warning-600)' }}>
                {lowStockAlerts.length} ta mahsulot bo&apos;yicha kam qoldiq ogohlantirishi!
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                Minimal zahira me&apos;yoridan kam qolgan tovarlar
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFilterLowStockOnly(!filterLowStockOnly)}
          >
            {filterLowStockOnly ? 'Barcha tovarlar' : 'Kam qoldiqlarni ko\'rish'}
          </Button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <Card style={{ padding: 'var(--space-4)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Search */}
          <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchData()}
              placeholder="SKU, Shtrix-kod bo'yicha qidiruv..."
              style={{
                width: '100%',
                padding: '8px 12px 8px 36px',
                fontSize: 'var(--text-sm)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-bg-input)',
                color: 'var(--color-text-primary)',
                outline: 'none',
              }}
            />
          </div>

          {/* Warehouse Filter */}
          <div style={{ width: '220px' }}>
            <Select
              options={warehouseOptions}
              value={selectedWarehouse}
              onChange={(val) => setSelectedWarehouse(val)}
              placeholder="Barcha Omborlar"
            />
          </div>

          {/* Category Select */}
          <div style={{ width: '220px' }}>
            <Select
              options={categoryOptions}
              value={selectedCategory}
              onChange={(val) => setSelectedCategory(val)}
              placeholder="Barcha kategoriyalar"
            />
          </div>

          <Button variant="secondary" size="sm" onClick={fetchData}>
            <Filter size={14} />
            {tCommon('filter')}
          </Button>
        </div>
      </Card>

      {/* Product Catalog Table */}
      <Card>
        {failedQuery ? (
          <LoadError
            error={failedQuery.error}
            onRetry={() => inventoryQueries.filter((q) => q.isError).forEach((q) => void q.refetch())}
            retrying={inventoryQueries.some((q) => q.isFetching)}
          />
        ) : loading ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            {tCommon('loading')}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            <Package size={40} style={{ margin: '0 auto var(--space-2)', opacity: 0.4 }} />
            <div>{tCommon('noData')}</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>
                  <th style={{ padding: '12px' }}>MAHSULOT NOMI</th>
                  <th style={{ padding: '12px' }}>SKU</th>
                  <th style={{ padding: '12px' }}>SHTRIX-KOD</th>
                  <th style={{ padding: '12px' }}>KATEGORIYA</th>
                  <th style={{ padding: '12px' }}>O&apos;LCHOV BIRLIGI</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>TAN NARXI</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>SOTUV NARXI</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>JAMI QOLDIQ</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>HOLAT</th>
                  {canEditProducts && (
                    <th style={{ padding: '12px', textAlign: 'center' }}>{isRu ? 'ДЕЙСТВИЯ' : 'AMALLAR'}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => {
                  const isLow = product.isLowStock;
                  return (
                    <tr key={product.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                      <td style={{ padding: '12px', fontWeight: 'var(--font-semibold)' }}>
                        {getLocalizedName(product.name)}
                      </td>
                      <td style={{ padding: '12px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                        {product.sku}
                      </td>
                      <td style={{ padding: '12px', color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}>
                        {product.barcode || '—'}
                      </td>
                      <td style={{ padding: '12px' }}>
                        {product.category ? (
                          <Badge variant="neutral">{getLocalizedName(product.category.name)}</Badge>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>
                        {unitLabel(product.unitOfMeasure, locale)}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }} className="tabular-nums">
                        {formatCurrency(Number(product.costPrice), locale, product.costPriceCurrency || 'UZS')}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'var(--font-medium)' }} className="tabular-nums">
                        {formatPriceOrUnset(Number(product.salePrice), locale, product.salePriceCurrency)}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'var(--font-bold)' }} className="tabular-nums">
                        {formatQuantity(Number(product.totalStock ?? 0))} {unitLabel(product.unitOfMeasure, locale)}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        {isLow ? (
                          <Badge variant="warning">Kam qoldiq</Badge>
                        ) : (
                          <Badge variant="success">Normal</Badge>
                        )}
                      </td>
                      {canEditProducts && (
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingProduct(product)}
                            aria-label={`${isRu ? 'Редактировать' : 'Tahrirlash'}: ${getLocalizedName(product.name)}`}
                            title={isRu ? 'Редактировать' : 'Tahrirlash'}
                          >
                            <Pencil size={16} />
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

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
              <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-semibold)' }}>Shtrix-kod / QR Qidiruv</h3>
              <button type="button" onClick={() => setShowScanner(false)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>✕</button>
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
              <div style={{ padding: '10px', backgroundColor: 'var(--color-error-50)', color: 'var(--color-error-600)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)' }}>
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
