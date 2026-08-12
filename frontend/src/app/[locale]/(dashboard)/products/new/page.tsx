'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter, Link } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ArrowLeft, Save, Package, AlertCircle } from 'lucide-react';
import { Category } from '@shared/types';

export default function NewProductPage() {
  const t = useTranslations('inventory');
  const tCommon = useTranslations('common');
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const router = useRouter();
  const { token, company } = useAuth();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form Fields
  const [nameUz, setNameUz] = useState('');
  const [nameRu, setNameRu] = useState('');
  const [descUz, setDescUz] = useState('');
  const [descRu, setDescRu] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [type, setType] = useState<'PRODUCT' | 'SERVICE' | 'BUNDLE'>('PRODUCT');
  const [unitOfMeasure, setUnitOfMeasure] = useState<'piece' | 'kg' | 'liter' | 'meter' | 'box' | 'pack'>('piece');
  const [costPrice, setCostPrice] = useState<number>(0);
  const [salePrice, setSalePrice] = useState<number>(0);
  const [vatRate, setVatRate] = useState<number>(12);
  const [minStockAlert, setMinStockAlert] = useState<number>(5);

  useEffect(() => {
    if (!token || !company) return;
    apiFetch<Category[]>('/inventory/categories', { token, tenantId: company.id, locale })
      .then(setCategories)
      .catch(console.error);
  }, [token, company, locale]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !company) return;
    setError(null);
    setLoading(true);

    try {
      await apiFetch('/inventory/products', {
        method: 'POST',
        token,
        tenantId: company.id,
        locale,
        body: JSON.stringify({
          name: { uz: nameUz || nameRu, ru: nameRu || nameUz },
          description: descUz || descRu ? { uz: descUz || descRu, ru: descRu || descUz } : undefined,
          sku: sku || undefined,
          barcode: barcode || undefined,
          categoryId: categoryId || undefined,
          type,
          unitOfMeasure,
          costPrice: Number(costPrice),
          salePrice: Number(salePrice),
          vatRate: Number(vatRate),
          minStockAlert: Number(minStockAlert),
        }),
      });

      router.push('/products');
    } catch (err: any) {
      setError(err.message || (isRu ? 'Ошибка создания товара' : 'Tovar yaratishda xatolik'));
    } finally {
      setLoading(false);
    }
  };

  const categoryOptions = [
    { value: '', label: isRu ? 'Не выбрано' : 'Tanlanmagan' },
    ...categories.map((c) => ({
      value: c.id,
      label: typeof c.name === 'object' ? c.name[locale] || c.name.ru || c.name.uz || '' : c.name,
    })),
  ];

  const typeOptions = [
    { value: 'PRODUCT', label: isRu ? 'Товар (Продукт)' : 'Mahsulot (Tovar)' },
    { value: 'SERVICE', label: isRu ? 'Услуга' : 'Xizmat' },
    { value: 'BUNDLE', label: isRu ? 'Комплект (Набор)' : 'To‘plam (Komplekt)' },
  ];

  const unitOptions = [
    { value: 'piece', label: isRu ? 'шт (Штука)' : 'dona (Shtuk)' },
    { value: 'kg', label: isRu ? 'кг (Килограмм)' : 'kg (Kilogramm)' },
    { value: 'liter', label: isRu ? 'л (Литр)' : 'litr (Litr)' },
    { value: 'meter', label: isRu ? 'м (Метр)' : 'metr (Metr)' },
    { value: 'box', label: isRu ? 'кор (Коробка)' : 'quti (Korobka)' },
    { value: 'pack', label: isRu ? 'упак (Упаковка)' : 'pachka (Pachka)' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', maxWidth: '800px', margin: '0 auto' }} className="animate-fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
        <Link href="/products" style={{ textDecoration: 'none' }}>
          <Button variant="ghost" size="sm">
            <ArrowLeft size={16} />
            {isRu ? 'Назад' : 'Orqaga'}
          </Button>
        </Link>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            {isRu ? 'Карточка нового товара' : 'Yangi Mahsulot Kartochkasi'}
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            {isRu ? 'Создание номенклатурной карточки (на узбекском и русском)' : 'Nomenklatura kartasini yaratish (O‘zbek va Rus tillarida)'}
          </p>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-error-50)', color: 'var(--color-error-600)', border: '1px solid var(--color-error-100)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        {/* Basic Info */}
        <Card title={isRu ? 'Основная информация' : 'Asosiy Ma\'lumotlar'}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
            <Input
              id="prod-name-uz"
              label={isRu ? 'Название товара (узбекский)' : 'Tovar nomi (O‘zbekcha) *'}
              required={!isRu}
              value={nameUz}
              onChange={(e) => setNameUz(e.target.value)}
              placeholder="Например: Paxta yog'i 5L"
            />
            <Input
              id="prod-name-ru"
              label={isRu ? 'Название товара (русский) *' : 'Tovar nomi (Ruscha)'}
              required={isRu}
              value={nameRu}
              onChange={(e) => setNameRu(e.target.value)}
              placeholder="Например: Хлопковое масло 5Л"
            />

            <Select
              id="prod-category"
              label={isRu ? 'Категория' : 'Kategoriya'}
              value={categoryId}
              onChange={setCategoryId}
              options={categoryOptions}
            />

            <Select
              id="prod-type"
              label={isRu ? 'Тип позиции' : 'Pozitsiya turi'}
              value={type}
              onChange={(val) => setType(val as any)}
              options={typeOptions}
            />

            <Input
              id="prod-sku"
              label={isRu ? 'SKU (Артикул / Код)' : 'SKU (Artikul / Kodu)'}
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="Например: OIL-5L-001"
            />
            <Input
              id="prod-barcode"
              label={isRu ? 'Штрихкод (Barcode)' : 'Shtrix-kod (Barcode)'}
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="Например: 4780012345678"
            />
          </div>
        </Card>

        {/* Pricing & Units */}
        <Card title={isRu ? 'Цены и единицы измерения' : 'Narx va O\'lchov Birliklari'}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-4)' }}>
            <Select
              id="prod-unit"
              label={isRu ? 'Единица измерения' : 'O\'lchov birligi'}
              value={unitOfMeasure}
              onChange={(val) => setUnitOfMeasure(val as any)}
              options={unitOptions}
            />

            <Input
              id="prod-cost-price"
              label={isRu ? 'Себестоимость (UZS)' : 'Tannarxi (UZS)'}
              type="number"
              min={0}
              value={costPrice}
              onChange={(e) => setCostPrice(Number(e.target.value))}
            />

            <Input
              id="prod-sale-price"
              label={isRu ? 'Цена продажи (UZS) *' : 'Sotuv narxi (UZS) *'}
              type="number"
              min={0}
              required
              value={salePrice}
              onChange={(e) => setSalePrice(Number(e.target.value))}
            />

            <Input
              id="prod-vat-rate"
              label={isRu ? 'Ставка НДС (%)' : 'QQS stavkasi (%)'}
              type="number"
              min={0}
              max={100}
              value={vatRate}
              onChange={(e) => setVatRate(Number(e.target.value))}
            />

            <Input
              id="prod-min-stock"
              label={isRu ? 'Порог мин. остатка' : 'Minimal qoldiq ogohlantirishi'}
              type="number"
              min={0}
              value={minStockAlert}
              onChange={(e) => setMinStockAlert(Number(e.target.value))}
            />
          </div>
        </Card>

        {/* Submit */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
          <Link href="/products">
            <Button variant="secondary" type="button">
              {isRu ? 'Отмена' : 'Bekor qilish'}
            </Button>
          </Link>
          <Button variant="primary" type="submit" disabled={loading}>
            <Save size={18} />
            {loading ? (isRu ? 'Сохранение...' : 'Saqlanmoqda...') : (isRu ? 'Сохранить' : 'Saqlash')}
          </Button>
        </div>
      </form>
    </div>
  );
}
