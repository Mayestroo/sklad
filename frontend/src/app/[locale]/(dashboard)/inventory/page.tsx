'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
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
  CheckCircle2,
  Tag,
  Warehouse,
  Building2,
} from 'lucide-react';
import { Product, Category } from '@shared/types';

export default function InventoryPage() {
  const t = useTranslations('inventory');
  const tCommon = useTranslations('common');
  const locale = useLocale() as 'uz' | 'ru';
  const { token, company, hasPermission } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [lowStockAlerts, setLowStockAlerts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');
  const [filterLowStockOnly, setFilterLowStockOnly] = useState(false);

  // Barcode scanner modal state
  const [showScanner, setShowScanner] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [scanResult, setScanResult] = useState<Product | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const fetchData = async () => {
    if (!token || !company) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [prodsData, catsData, whData, alertData] = await Promise.all([
        apiFetch<Product[]>(`/inventory/products?${search ? `search=${search}` : ''}${selectedCategory ? `&category=${selectedCategory}` : ''}`, {
          token,
          tenantId: company.id,
          locale,
        }),
        apiFetch<Category[]>('/inventory/categories', {
          token,
          tenantId: company.id,
          locale,
        }),
        apiFetch<any[]>('/tenants/warehouses', {
          token,
          tenantId: company.id,
          locale,
        }),
        apiFetch<Product[]>('/inventory/products/low-stock', {
          token,
          tenantId: company.id,
          locale,
        }),
      ]);

      setProducts(Array.isArray(prodsData) ? prodsData : []);
      setCategories(Array.isArray(catsData) ? catsData : []);
      setWarehouses(Array.isArray(whData) ? whData : []);
      setLowStockAlerts(Array.isArray(alertData) ? alertData : []);
    } catch (err) {
      console.error('Failed to load inventory data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token, company, selectedCategory]);

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
    } catch (err: any) {
      setScanError(err.message || 'Product not found');
    }
  };

  const safeProducts = Array.isArray(products) ? products : [];
  const safeWarehouses = Array.isArray(warehouses) ? warehouses : [];
  const safeCategories = Array.isArray(categories) ? categories : [];

  const filteredProducts = filterLowStockOnly
    ? safeProducts.filter((p) => (p as any).isLowStock)
    : safeProducts;

  const isRu = locale === 'ru';

  const getLocalizedName = (name: any) => {
    if (!name) return '';
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
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            {isRu ? 'Управление складом и остатками' : t('title')}
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
        {loading ? (
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
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => {
                  const isLow = (product as any).isLowStock;
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
                        {t(`units.${product.unitOfMeasure}` as any) || product.unitOfMeasure}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }} className="tabular-nums">
                        {formatCurrency(Number(product.costPrice), locale)}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'var(--font-medium)' }} className="tabular-nums">
                        {formatCurrency(Number(product.salePrice), locale)}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'var(--font-bold)' }} className="tabular-nums">
                        {(product as any).totalStock || 0} {t(`units.${product.unitOfMeasure}` as any)}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        {isLow ? (
                          <Badge variant="warning">Kam qoldiq</Badge>
                        ) : (
                          <Badge variant="success">Normal</Badge>
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
                  Narxi: {formatCurrency(Number(scanResult.salePrice), locale)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
