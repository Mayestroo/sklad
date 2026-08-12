'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import {
  Package,
  Plus,
  Search,
  QrCode,
  Tag,
  CheckCircle2,
  Eye,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { Product, Category } from '@shared/types';

export default function ProductsPage() {
  const t = useTranslations('inventory');
  const tCommon = useTranslations('common');
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token, company } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');

  // Selected product modal
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const fetchCatalogData = async () => {
    if (!token || !company) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [prodsData, catsData] = await Promise.all([
        apiFetch<Product[]>('/inventory/products', { token, tenantId: company.id, locale }),
        apiFetch<Category[]>('/inventory/categories', { token, tenantId: company.id, locale }).catch(() => []),
      ]);
      setProducts(prodsData || []);
      setCategories(catsData || []);
    } catch (err) {
      console.error('Failed to fetch products catalog:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalogData();
  }, [token, company, locale]);

  // Helper for localized name
  const getProductName = (p: Product) => {
    if (!p.name) return '—';
    if (typeof p.name === 'string') return p.name;
    return p.name[locale] || p.name.ru || p.name.uz || '—';
  };

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
      const name = getProductName(p).toLowerCase();
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

  const categoryOptions = [
    { value: '', label: isRu ? 'Все категории' : 'Hamma kategoriyalar' },
    ...categories.map((c) => ({
      value: c.id,
      label: typeof c.name === 'object' ? c.name[locale] || c.name.ru || c.name.uz || '' : c.name,
    })),
  ];

  const typeOptions = [
    { value: '', label: isRu ? 'Все типы' : 'Barcha turlar' },
    { value: 'PRODUCT', label: isRu ? 'Товар (Продукт)' : 'Mahsulot (Tovar)' },
    { value: 'SERVICE', label: isRu ? 'Услуга' : 'Xizmat' },
    { value: 'BUNDLE', label: isRu ? 'Комплект (Набор)' : 'To‘plam (Komplekt)' },
  ];

  const statusOptions = [
    { value: '', label: isRu ? 'Все статусы' : 'Barcha holatlar' },
    { value: 'ACTIVE', label: isRu ? 'Активный' : 'Faol' },
    { value: 'INACTIVE', label: isRu ? 'Неактивный' : 'Nofaol' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }} className="animate-fade-in">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            {isRu ? 'Каталог товаров и услуг' : 'Tovarlar va Xizmatlar Katalogi'}
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
            {isRu ? 'Управление номенклатурой, ценами и карточками товаров' : 'Nomenklatura, narxlar va mahsulot kartochkalarini boshqarish'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <Button variant="ghost" size="sm" onClick={fetchCatalogData} disabled={loading}>
            <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : undefined }} />
            {isRu ? 'Обновить' : 'Yangilash'}
          </Button>
          <Link href="/products/new">
            <Button variant="primary">
              <Plus size={18} />
              {isRu ? 'Добавить товар' : 'Yangi tovar qo‘shish'}
            </Button>
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
        <Card style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-4)' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Package size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Всего товаров' : 'Jami Tovarlar'}</div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
              {totalProducts} {isRu ? 'шт' : 'ta'}
            </div>
          </div>
        </Card>

        <Card style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-4)' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-success-50)', color: 'var(--color-success-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle2 size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Активные позиции' : 'Faol Pozitsiyalar'}</div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
              {activeProducts} {isRu ? 'шт' : 'ta'}
            </div>
          </div>
        </Card>

        <Card style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-4)' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-info-50)', color: 'var(--color-info-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Услуги' : 'Xizmatlar'}</div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
              {servicesCount} {isRu ? 'шт' : 'ta'}
            </div>
          </div>
        </Card>

        <Card style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-4)' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-warning-50)', color: 'var(--color-warning-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Tag size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Категории' : 'Kategoriyalar'}</div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
              {totalCategories} {isRu ? 'шт' : 'ta'}
            </div>
          </div>
        </Card>
      </div>

      {/* Filters Bar */}
      <Card style={{ padding: 'var(--space-4)', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'center' }}>
        <div style={{ flex: '1 1 240px', position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isRu ? 'Название товара, артикул (SKU) или штрихкод...' : 'Tovar nomi, SKU yoki shtrix-kod...'}
            style={{
              width: '100%',
              padding: '8px 12px 8px 38px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-bg-secondary)',
              color: 'var(--color-text-primary)',
              fontSize: 'var(--text-sm)',
              outline: 'none',
            }}
          />
        </div>

        <div style={{ width: '200px' }}>
          <Select
            value={selectedCategory}
            onChange={setSelectedCategory}
            options={categoryOptions}
            placeholder={isRu ? 'Категория' : 'Kategoriya'}
          />
        </div>

        <div style={{ width: '160px' }}>
          <Select
            value={selectedType}
            onChange={setSelectedType}
            options={typeOptions}
            placeholder={isRu ? 'Тип' : 'Tur'}
          />
        </div>

        <div style={{ width: '160px' }}>
          <Select
            value={selectedStatus}
            onChange={setSelectedStatus}
            options={statusOptions}
            placeholder={isRu ? 'Статус' : 'Holat'}
          />
        </div>
      </Card>

      {/* Products Table */}
      <Card style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            {isRu ? 'Загрузка...' : 'Yuklanmoqda...'}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            <Package size={48} style={{ marginBottom: 'var(--space-3)', opacity: 0.4 }} />
            <div style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)' }}>
              {isRu ? 'Товары не найдены' : 'Tovarlar topilmadi'}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', marginTop: '4px' }}>
              {isRu ? 'Измените условия поиска или добавьте новый товар' : 'Qidiruv shartlarini o‘zgartiring yoki yangi tovar qo‘shing'}
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)' }}>{isRu ? 'Наименование товара / услуги' : 'Tovar / Xizmat Nomi'}</th>
                  <th style={{ padding: '12px 16px', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)' }}>{isRu ? 'SKU / Штрихкод' : 'SKU / Barcode'}</th>
                  <th style={{ padding: '12px 16px', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)' }}>{isRu ? 'Категория' : 'Kategoriya'}</th>
                  <th style={{ padding: '12px 16px', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)' }}>{isRu ? 'Ед. изм.' : 'O‘lchov birligi'}</th>
                  <th style={{ padding: '12px 16px', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)' }}>{isRu ? 'Себестоимость' : 'Tannarx'}</th>
                  <th style={{ padding: '12px 16px', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)' }}>{isRu ? 'Цена продажи' : 'Sotuv Narxi'}</th>
                  <th style={{ padding: '12px 16px', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)' }}>{isRu ? 'Наценка %' : 'Ustama %'}</th>
                  <th style={{ padding: '12px 16px', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)' }}>{isRu ? 'Статус' : 'Holat'}</th>
                  <th style={{ padding: '12px 16px', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)', textAlign: 'right' }}>{isRu ? 'Действия' : 'Amallar'}</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((p) => {
                  const cost = Number(p.costPrice || 0);
                  const sale = Number(p.salePrice || 0);
                  const marginPct = cost > 0 ? (((sale - cost) / cost) * 100).toFixed(1) : '—';

                  return (
                    <tr
                      key={p.id}
                      style={{
                        borderBottom: '1px solid var(--color-border-light)',
                        transition: 'background-color var(--transition-fast)',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      {/* Name & Type */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: 'var(--radius-sm)',
                              backgroundColor: p.type === 'SERVICE' ? 'var(--color-info-50)' : 'var(--color-primary-50)',
                              color: p.type === 'SERVICE' ? 'var(--color-info-600)' : 'var(--color-primary-600)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {p.type === 'SERVICE' ? <Zap size={16} /> : <Package size={16} />}
                          </div>
                          <div>
                            <div style={{ fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)' }}>
                              {getProductName(p)}
                            </div>
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                              {p.type === 'SERVICE' ? (isRu ? 'Услуга' : 'Xizmat') : p.type === 'BUNDLE' ? (isRu ? 'Комплект' : 'To‘plam') : (isRu ? 'Товар' : 'Mahsulot')}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* SKU & Barcode */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-primary)' }}>
                          {p.sku || '—'}
                        </div>
                        {p.barcode && (
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <QrCode size={12} /> {p.barcode}
                          </div>
                        )}
                      </td>

                      {/* Category */}
                      <td style={{ padding: '12px 16px' }}>
                        <Badge variant="neutral">{getCategoryName(p.categoryId)}</Badge>
                      </td>

                      {/* Unit */}
                      <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)' }}>
                        {p.unitOfMeasure || (isRu ? 'шт' : 'dona')}
                      </td>

                      {/* Cost price */}
                      <td style={{ padding: '12px 16px', fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-secondary)' }}>
                        {formatCurrency(cost, 'UZS')}
                      </td>

                      {/* Sale price */}
                      <td style={{ padding: '12px 16px', fontVariantNumeric: 'tabular-nums', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)' }}>
                        {formatCurrency(sale, 'UZS')}
                      </td>

                      {/* Margin % */}
                      <td style={{ padding: '12px 16px' }}>
                        {marginPct !== '—' ? (
                          <Badge variant={Number(marginPct) >= 20 ? 'success' : Number(marginPct) > 0 ? 'warning' : 'error'}>
                            +{marginPct}%
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </td>

                      {/* Status */}
                      <td style={{ padding: '12px 16px' }}>
                        {p.isActive ? (
                          <Badge variant="success">{isRu ? 'Активный' : 'Faol'}</Badge>
                        ) : (
                          <Badge variant="neutral">{isRu ? 'Неактивный' : 'Nofaol'}</Badge>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedProduct(p)}>
                          <Eye size={16} />
                          {isRu ? 'Просмотр' : 'Ko‘rish'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

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
                  {selectedProduct.unitOfMeasure}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Себестоимость' : 'Tannarxi'}</div>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)' }}>
                  {formatCurrency(selectedProduct.costPrice, 'UZS')}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Цена продажи' : 'Sotish narxi'}</div>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', color: 'var(--color-primary-600)' }}>
                  {formatCurrency(selectedProduct.salePrice, 'UZS')}
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
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', color: 'var(--color-warning-600)' }}>
                  {selectedProduct.minStockAlert} {selectedProduct.unitOfMeasure}
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
    </div>
  );
}
