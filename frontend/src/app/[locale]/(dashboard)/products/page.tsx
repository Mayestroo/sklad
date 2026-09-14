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
  Edit2,
  Trash2,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { Product, Category } from '@shared/types';
import { CreateProductDrawer } from '@/components/products/CreateProductDrawer';
import { toast } from '@/context/ToastContext';

export default function ProductsPage() {
  const t = useTranslations('inventory');
  const tCommon = useTranslations('common');
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token, company } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
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
    } catch (err: any) {
      toast.error(err?.message || (isRu ? 'Ошибка при удалении товара' : 'Tovarni o‘chirishda xatolik'));
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
    } catch (err: any) {
      toast.error(err?.message || (isRu ? 'Ошибка при создании категории' : 'Kategoriya yaratishda xatolik'));
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
    } catch (err: any) {
      toast.error(err?.message || (isRu ? 'Ошибка при обновлении категории' : 'Kategoriyani tahrirlashda xatolik'));
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
    } catch (err: any) {
      toast.error(err?.message || (isRu ? 'Ошибка при удалении категории' : 'Kategoriyani o‘chirishda xatolik'));
    } finally {
      setDeleteCatLoading(false);
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
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', margin: 0 }}>
            {isRu ? 'Товары и услуги' : 'Tovarlar va xizmatlar'}
          </h1>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <Button variant="ghost" size="sm" onClick={fetchCatalogData} disabled={loading}>
            <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : undefined }} />
            {isRu ? 'Обновить' : 'Yangilash'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => setIsCategoryModalOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Tag size={16} />
            {isRu ? 'Категории' : 'Kategoriyalar'}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setEditingProduct(null);
              setIsCreateOpen(true);
            }}
          >
            <Plus size={18} />
            {isRu ? 'Добавить товар' : 'Yangi tovar qo‘shish'}
          </Button>
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

        <Card
          onClick={() => setIsCategoryModalOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-4)', cursor: 'pointer' }}
          title={isRu ? 'Управление категориями' : 'Kategoriyalarni boshqarish'}
        >
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
      <Card style={{ padding: 0, overflow: 'hidden' }}>
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
                {filteredProducts.map((p, idx) => {
                  const cost = Number(p.costPrice || 0);
                  const sale = Number(p.salePrice || 0);
                  const marginPct = cost > 0 ? (((sale - cost) / cost) * 100).toFixed(1) : '—';
                  const isLastRow = idx === filteredProducts.length - 1;

                  return (
                    <tr
                      key={p.id}
                      style={{
                        borderBottom: isLastRow ? 'none' : '1px solid var(--color-border-light)',
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
                        {formatCurrency(cost, locale, 'UZS')}
                      </td>

                      {/* Sale price */}
                      <td style={{ padding: '12px 16px', fontVariantNumeric: 'tabular-nums', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)' }}>
                        {formatCurrency(sale, locale, 'UZS')}
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
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                          <Button variant="ghost" size="sm" onClick={() => setSelectedProduct(p)} title={isRu ? 'Просмотр' : 'Ko‘rish'}>
                            <Eye size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingProduct(p);
                              setIsCreateOpen(true);
                            }}
                            title={isRu ? 'Редактировать' : 'Tahrirlash'}
                            style={{ color: 'var(--color-primary-600)' }}
                          >
                            <Edit2 size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingProduct(p)}
                            title={isRu ? 'Удалить' : 'O‘chirish'}
                            style={{ color: '#ef4444' }}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
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
                  {formatCurrency(selectedProduct.costPrice, locale, 'UZS')}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Цена продажи' : 'Sotish narxi'}</div>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', color: 'var(--color-primary-600)' }}>
                  {formatCurrency(selectedProduct.salePrice, locale, 'UZS')}
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
                variant="primary"
                onClick={handleDeleteProduct}
                disabled={deleteLoading}
                style={{ backgroundColor: '#ef4444', borderColor: '#ef4444' }}
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
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', color: '#ef4444' }}
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
                variant="primary"
                onClick={handleDeleteCategory}
                disabled={deleteCatLoading}
                style={{ backgroundColor: '#ef4444', borderColor: '#ef4444' }}
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

