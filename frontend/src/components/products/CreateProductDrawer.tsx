'use client';

import React, { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Package, PackagePlus, AlertCircle, CheckCircle2, Sparkles, Barcode } from 'lucide-react';
import { Category } from '@shared/types';

export interface CreateProductDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  initialSkuOrBarcode?: string;
  onSuccess?: (createdProduct: any) => void;
}

export const CreateProductDrawer: React.FC<CreateProductDrawerProps> = ({
  isOpen,
  onClose,
  initialSkuOrBarcode = '',
  onSuccess,
}) => {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token, company } = useAuth();

  const [categories, setCategories] = useState<Category[]>([]);
  const [nameUz, setNameUz] = useState('');
  const [nameRu, setNameRu] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState(initialSkuOrBarcode || '');
  const [categoryId, setCategoryId] = useState('');
  const [unitOfMeasure, setUnitOfMeasure] = useState('DONA');
  const [costPrice, setCostPrice] = useState<number | string>('');
  const [sellingPrice, setSellingPrice] = useState<number | string>('');
  const [minStock, setMinStock] = useState<number | string>(0);
  const [type, setType] = useState<'GOODS' | 'SERVICE'>('GOODS');
  const [weight, setWeight] = useState<number | string>(1);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !company || !isOpen) return;

    apiFetch<Category[]>('/inventory/categories', { token, tenantId: company.id, locale })
      .then((res) => setCategories(res || []))
      .catch((err) => console.error(err));

    if (initialSkuOrBarcode) {
      if (/^\d{8,14}$/.test(initialSkuOrBarcode)) {
        setBarcode(initialSkuOrBarcode);
      } else {
        setSku(initialSkuOrBarcode);
      }
    }
  }, [token, company, isOpen, initialSkuOrBarcode, locale]);

  const generateAutoSku = () => {
    const random = Math.floor(1000 + Math.random() * 9000);
    setSku(`PRD-${random}`);
  };

  const generateAutoBarcode = () => {
    // EAN-13 style random digits
    const prefix = '200';
    const random = Math.floor(100000000 + Math.random() * 900000000);
    setBarcode(`${prefix}${random}`);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const finalName = nameUz.trim() || nameRu.trim();
    if (!finalName) {
      setError(isRu ? 'Введите наименование товара' : 'Tovar nomini kiriting');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = {
        name: {
          uz: nameUz.trim() || nameRu.trim(),
          ru: nameRu.trim() || nameUz.trim(),
        },
        sku: sku.trim() || undefined,
        barcode: barcode.trim() || undefined,
        categoryId: categoryId || undefined,
        unitOfMeasure,
        costPrice: Number(costPrice) || 0,
        sellingPrice: Number(sellingPrice) || 0,
        minStock: Number(minStock) || 0,
        type,
        weight: Number(weight) || 1,
        isActive: true,
      };

      const res = await apiFetch('/inventory/products', {
        method: 'POST',
        token: token || undefined,
        tenantId: company?.id,
        locale,
        body: JSON.stringify(payload),
      });

      resetForm();
      if (onSuccess) onSuccess(res);
      onClose();
    } catch (err: any) {
      setError(err?.message || (isRu ? 'Ошибка сохранения товара' : 'Tovarni saqlashda xatolik'));
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setNameUz('');
    setNameRu('');
    setSku('');
    setBarcode('');
    setCategoryId('');
    setUnitOfMeasure('DONA');
    setCostPrice('');
    setSellingPrice('');
    setMinStock(0);
    setType('GOODS');
    setWeight(1);
    setError(null);
  };

  const unitOptions = [
    { value: 'DONA', label: isRu ? 'Штука (шт)' : 'Dona (dona)' },
    { value: 'KG', label: isRu ? 'Килограмм (кг)' : 'Kilogramm (kg)' },
    { value: 'METR', label: isRu ? 'Метр (м)' : 'Metr (m)' },
    { value: 'LITR', label: isRu ? 'Литр (л)' : 'Litr (l)' },
    { value: 'KV_M', label: isRu ? 'Кв. метр (м²)' : 'Kvadrat metr (m²)' },
    { value: 'KUB_M', label: isRu ? 'Куб. метр (м³)' : 'Kub metr (m³)' },
    { value: 'QUTI', label: isRu ? 'Коробка / Упаковка' : 'Quti / Blok' },
    { value: 'KOMPLEKT', label: isRu ? 'Комплект' : 'Komplekt' },
  ];

  const categoryOptions = [
    { value: '', label: isRu ? '— Без категории —' : '— Kategoriyasiz —' },
    ...categories.map((c) => ({
      value: c.id,
      label: typeof c.name === 'string' ? c.name : (c.name as any)?.[locale] || (c.name as any)?.uz || 'Kategoriya',
    })),
  ];

  return (
    <Drawer
      isOpen={isOpen}
      onClose={() => {
        resetForm();
        onClose();
      }}
      title={isRu ? 'Новый товар / номенклатура' : 'Yangi Tovar / Mahsulot'}
      description={
        isRu
          ? 'Создание номенклатурной позиции, артикула, штрихкода и цен'
          : 'Yangi tovar kartochkasi, SKU, shtrix-kod va narxlarni kiritish'
      }
      icon={<PackagePlus size={20} />}
      size="lg"
      onSubmitShortcut={handleSubmit}
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              resetForm();
              onClose();
            }}
            disabled={loading}
          >
            {isRu ? 'Отмена (Esc)' : 'Bekor qilish (Esc)'}
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => handleSubmit()}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {loading ? (
              isRu ? 'Сохранение...' : 'Saqlanmoqda...'
            ) : (
              <>
                <CheckCircle2 size={16} />
                {isRu ? 'Сохранить товар (Ctrl+Enter)' : 'Tovarni saqlash (Ctrl+Enter)'}
              </>
            )}
          </Button>
        </>
      }
    >
      {error && (
        <div
          style={{
            padding: '12px 14px',
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid #ef4444',
            color: '#ef4444',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-xs)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertCircle size={16} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {/* Type & Category */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              {isRu ? 'Тип номенклатуры' : 'Tovar turi'}
            </label>
            <Select
              options={[
                { value: 'GOODS', label: isRu ? 'Товар (Складской)' : 'Tovar (Ombordagi tovar)' },
                { value: 'SERVICE', label: isRu ? 'Услуга (Без остатка)' : 'Xizmat (Omborsiz xizmat)' },
              ]}
              value={type}
              onChange={(val) => setType(val as any)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              {isRu ? 'Категория' : 'Kategoriya'}
            </label>
            <Select
              options={categoryOptions}
              value={categoryId}
              onChange={(val) => setCategoryId(val)}
              placeholder={isRu ? 'Выберите категорию' : 'Kategoriyani tanlang'}
            />
          </div>
        </div>

        {/* Product Names (UZ & RU) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              Nomi (O‘zbekcha) *
            </label>
            <Input
              value={nameUz}
              onChange={(e) => setNameUz(e.target.value)}
              placeholder="Masalan: Erkaklar ko'ylagi L"
              autoFocus
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              Наименование (Русский)
            </label>
            <Input
              value={nameRu}
              onChange={(e) => setNameRu(e.target.value)}
              placeholder="Например: Рубашка мужская L"
            />
          </div>
        </div>

        {/* SKU & Barcode with auto-generation buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                {isRu ? 'Артикул / SKU' : 'Artikul / SKU'}
              </label>
              <button
                type="button"
                onClick={generateAutoSku}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  color: 'var(--color-primary-600)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                }}
              >
                <Sparkles size={12} /> {isRu ? 'Авто-SKU' : 'Avto-SKU'}
              </button>
            </div>
            <Input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="PRD-1024"
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                {isRu ? 'Штрихкод' : 'Shtrix-kod'}
              </label>
              <button
                type="button"
                onClick={generateAutoBarcode}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  color: 'var(--color-primary-600)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                }}
              >
                <Barcode size={12} /> {isRu ? 'Сгенерировать' : 'Generatsiya'}
              </button>
            </div>
            <Input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="2001234567890"
            />
          </div>
        </div>

        {/* Pricing & Unit Section */}
        <div style={{ borderTop: '1px solid var(--color-border-light)', paddingTop: 'var(--space-3)' }}>
          <h4 style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-3)' }}>
            {isRu ? 'Цены, единицы измерения и вес' : 'Narxlar, o‘lchov birligi va og‘irlik'}
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 'var(--space-3)' }}>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                {isRu ? 'Ед. изм.' : 'O‘lchov birligi'}
              </label>
              <Select
                options={unitOptions}
                value={unitOfMeasure}
                onChange={(val) => setUnitOfMeasure(val)}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                {isRu ? 'Цена закупки (UZS)' : 'Xarid narxi (UZS)'}
              </label>
              <Input
                type="number"
                min={0}
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                placeholder="100 000"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                {isRu ? 'Цена продажи (UZS)' : 'Sotuv narxi (UZS)'}
              </label>
              <Input
                type="number"
                min={0}
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                placeholder="150 000"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                {isRu ? 'Мин. остаток' : 'Min. qoldiq'}
              </label>
              <Input
                type="number"
                min={0}
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
                placeholder="5"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                {isRu ? 'Вес единицы (кг)' : 'Og‘irligi (kg)'}
              </label>
              <Input
                type="number"
                min={0.001}
                step={0.01}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="1.0"
              />
            </div>
          </div>
        </div>
      </form>
    </Drawer>
  );
};
