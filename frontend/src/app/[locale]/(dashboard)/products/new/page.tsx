'use client';

import { QuantityInput } from '@/components/ui/QuantityInput';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { useState, useEffect, useRef, FormEvent } from 'react';
import { toast } from '@/context/ToastContext';
import { useLocale, useTranslations } from 'next-intl';
import { unitLabel } from '@/lib/units';
import { useRouter, Link } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button, buttonStyle } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { CURRENCY_OPTIONS, errorMessage, formatCurrency } from '@/lib/utils';
import { useSalesDefaultCurrency } from '@/hooks/useSalesDefaultCurrency';
import { ArrowLeft, Save, AlertCircle, Tag } from 'lucide-react';
import { Category } from '@shared/types';

export default function NewProductPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const tp = useTranslations('rd.products');
  const router = useRouter();
  const { token, company } = useAuth();
  // Never guessed: no tenant sales default leaves the currency blank (ADR 0022).
  const salesDefault = useSalesDefaultCurrency();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categoryNameUz, setCategoryNameUz] = useState('');
  const [categoryNameRu, setCategoryNameRu] = useState('');
  const [categoryLoading, setCategoryLoading] = useState(false);

  // Form Fields
  const [nameUz, setNameUz] = useState('');
  const [nameRu, setNameRu] = useState('');
  const [descUz] = useState('');
  const [descRu] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [type, setType] = useState<'PRODUCT' | 'RAW_MATERIAL' | 'FINISHED_PRODUCT' | 'SERVICE' | 'BUNDLE'>('PRODUCT');
  const [isSemiFinished, setIsSemiFinished] = useState(false);
  const isFinished = type === 'FINISHED_PRODUCT';
  const [unitOfMeasure, setUnitOfMeasure] = useState<'piece' | 'kg' | 'liter' | 'meter' | 'box' | 'pack'>('piece');
  const [costPrice, setCostPrice] = useState<number>(0);
  // F8 / ADR 0022: the cost currency is chosen, never guessed.
  const [costPriceCurrency, setCostPriceCurrency] = useState<'USD' | 'UZS' | ''>('');
  const [costPriceExchangeRate, setCostPriceExchangeRate] = useState('');
  const [salePrice, setSalePrice] = useState<number>(0);
  const [salePriceCurrency, setSalePriceCurrency] = useState<'USD' | 'UZS' | ''>(salesDefault ?? '');
  const [vatRate, setVatRate] = useState<number>(12);
  const [minStockAlert, setMinStockAlert] = useState<number>(5);
  /** "Save and add another": stay on the form for the next item (category, unit, currencies kept). */
  const addAnother = useRef(false);

  useEffect(() => {
    if (!token || !company) return;
    apiFetch<Category[]>('/inventory/categories', { token, tenantId: company.id, locale })
      .then(setCategories)
      .catch(console.error);
  }, [token, company, locale]);

  useEffect(() => {
    if (salePrice === 0) setSalePriceCurrency(salesDefault ?? '');
  }, [salesDefault, salePrice]);

  const handleCreateCategory = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !company || !categoryNameUz.trim()) return;
    setCategoryLoading(true);
    try {
      const created = await apiFetch<Category>('/inventory/categories', {
        method: 'POST',
        token,
        tenantId: company.id,
        locale,
        body: JSON.stringify({ name: { uz: categoryNameUz.trim(), ru: categoryNameRu.trim() || categoryNameUz.trim() } }),
      });
      setCategories((current) => [created, ...current]);
      setCategoryId(created.id);
      setShowCategoryModal(false);
      setCategoryNameUz('');
      setCategoryNameRu('');
    } catch (categoryError) {
      setError(categoryError instanceof Error ? categoryError.message : 'Kategoriya yaratishda xatolik');
    } finally {
      setCategoryLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !company) return;
    setError(null);
    setLoading(true);

    if (!isFinished && costPrice > 0 && !costPriceCurrency) {
      setError(isRu ? 'Укажите валюту себестоимости' : 'Xarid tannarxi valyutasini tanlang');
      setLoading(false);
      return;
    }
    if (!isFinished && costPrice > 0 && costPriceCurrency === 'USD' && Number(costPriceExchangeRate) <= 0) {
      setError(isRu ? 'Укажите положительный курс себестоимости' : 'Xarid tannarxi uchun 0 dan katta kursni kiriting');
      setLoading(false);
      return;
    }
    if (salePrice > 0 && !salePriceCurrency) {
      setError(isRu ? 'Укажите валюту цены продажи' : 'Sotish narxi valyutasini tanlang');
      setLoading(false);
      return;
    }

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
          // TZ "Ishlab chiqarish" 3.3: a finished product's cost comes from its recipe and production.
          ...(isFinished
            ? { isSemiFinished }
            : {
                costPrice: Number(costPrice),
                costPriceCurrency: costPriceCurrency || undefined,
                costPriceExchangeRate: costPriceCurrency === 'USD' ? Number(costPriceExchangeRate) : 1,
              }),
          salePrice: Number(salePrice),
          salePriceCurrency: salePriceCurrency || undefined,
          vatRate: Number(vatRate),
          minStockAlert: Number(minStockAlert),
        }),
      });

      const savedName = nameUz || nameRu;
      if (addAnother.current) {
        addAnother.current = false;
        toast.success(isRu ? `Товар «${savedName}» сохранён. Введите следующий.` : `«${savedName}» saqlandi. Keyingisini kiriting.`);
        setNameUz('');
        setNameRu('');
        setSku('');
        setBarcode('');
        setCostPrice(0);
        setSalePrice(0);
        document.getElementById('prod-name-uz')?.focus();
        return;
      }
      toast.success(isRu ? `Товар «${savedName}» создан` : `«${savedName}» tovari yaratildi`);
      router.push('/products');
    } catch (err) {
      setError(errorMessage(err) || (isRu ? 'Ошибка создания товара' : 'Tovar yaratishda xatolik'));
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
    { value: 'RAW_MATERIAL', label: isRu ? 'Сырьё' : 'Xomashyo' },
    { value: 'FINISHED_PRODUCT', label: isRu ? 'Готовый продукт' : 'Tayyor mahsulot' },
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', width: '100%' }} className="animate-fade-in">
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
            {isRu ? 'Карточка нового товара' : 'Yangi tovar kartochkasi'}
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            {isRu ? 'Название на двух языках; поля со * обязательны' : 'Nom ikki tilda; * belgili maydonlar majburiy'}
          </p>
        </div>
      </div>

      {error && (
        <div role="alert" className="doc-banner is-error">
          <AlertCircle size={18} aria-hidden />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="doc-layout">
        <div className="doc-main">
          {/* The four things a clerk needs to start selling: name, barcode, unit, price */}
          <Card title={tp('essentials')} subtitle={tp('essentialsHint')}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 'var(--space-4)' }}>
              {isRu ? (
            <Input
              id="prod-name-ru"
              label={isRu ? 'Название товара (русский) *' : 'Tovar nomi (Ruscha)'}
              required={isRu}
              value={nameRu}
              onChange={(e) => setNameRu(e.target.value)}
              placeholder={isRu ? 'Например: Хлопковое масло 5Л' : 'Masalan: Хлопковое масло 5Л'}
            />

              ) : (
            <Input
              id="prod-name-uz"
              label={isRu ? 'Название товара (узбекский)' : 'Tovar nomi (O‘zbekcha) *'}
              required={!isRu}
              value={nameUz}
              onChange={(e) => setNameUz(e.target.value)}
              placeholder={isRu ? 'Например: Paxta yog‘i 5L' : 'Masalan: Paxta yog‘i 5L'}
              autoFocus
            />
              )}
            <Input
              id="prod-barcode"
              label={isRu ? 'Штрихкод (Barcode)' : 'Shtrix-kod (Barcode)'}
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder={isRu ? 'Например: 4780012345678' : 'Masalan: 4780012345678'}
            />
            <Select
              id="prod-unit"
              label={isRu ? 'Единица измерения' : 'O\'lchov birligi'}
              value={unitOfMeasure}
              onChange={(val) => setUnitOfMeasure(val as typeof unitOfMeasure)}
              options={unitOptions}
            />

            <MoneyInput
              id="prod-sale-price"
              label={isRu ? 'Цена продажи' : 'Sotuv narxi'}
              value={salePrice || ''}
              onValueChange={(value) => setSalePrice(Number(value) || 0)}
            />
            <Select label={isRu ? 'Валюта цены продажи' : 'Sotish narxi valyutasi'} options={CURRENCY_OPTIONS} value={salePriceCurrency} onChange={(value) => setSalePriceCurrency(value as 'USD' | 'UZS')} />

            </div>
          </Card>

          {/* Everything else is optional and folded */}
          <Card>
            <details className="doc-more" style={{ borderTop: 'none', paddingTop: 0 }} open={Boolean((isRu ? nameUz : nameRu) || categoryId || sku || costPrice || type !== 'PRODUCT') || undefined}>
              <summary>{tp('moreOptions')}</summary>
              <div style={{ paddingTop: 'var(--space-3)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 'var(--space-4)' }}>
                {isRu ? (
            <Input
              id="prod-name-uz"
              label={isRu ? 'Название товара (узбекский)' : 'Tovar nomi (O‘zbekcha) *'}
              required={!isRu}
              value={nameUz}
              onChange={(e) => setNameUz(e.target.value)}
              placeholder={isRu ? 'Например: Paxta yog‘i 5L' : 'Masalan: Paxta yog‘i 5L'}
              autoFocus
            />
                ) : (
            <Input
              id="prod-name-ru"
              label={isRu ? 'Название товара (русский) *' : 'Tovar nomi (Ruscha)'}
              required={isRu}
              value={nameRu}
              onChange={(e) => setNameRu(e.target.value)}
              placeholder={isRu ? 'Например: Хлопковое масло 5Л' : 'Masalan: Хлопковое масло 5Л'}
            />

                )}
            <Select
              id="prod-category"
              label={isRu ? 'Категория' : 'Kategoriya'}
              value={categoryId}
              onChange={setCategoryId}
              options={categoryOptions}
              onCreateNew={() => setShowCategoryModal(true)}
              createNewLabel={isRu ? 'Добавить категорию' : 'Kategoriya qo‘shish'}
            />

            <Select
              id="prod-type"
              label={isRu ? 'Тип позиции' : 'Pozitsiya turi'}
              value={type}
              onChange={(val) => setType(val as typeof type)}
              options={typeOptions}
            />

            <Input
              id="prod-sku"
              label={isRu ? 'SKU (Артикул / Код) (необязательно)' : 'SKU (Artikul / Kodu) (ixtiyoriy)'}
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder={isRu ? 'Например: OIL-5L-001' : 'Masalan: OIL-5L-001'}
            />
            {isFinished ? (
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 40, fontSize: 'var(--text-sm)' }}>
                  <input type="checkbox" checked={isSemiFinished} onChange={(e) => setIsSemiFinished(e.target.checked)} style={{ width: 18, height: 18 }} />
                  {isRu ? 'Полуфабрикат (используется в других рецептурах)' : 'Yarim tayyor mahsulot (boshqa retseptalarda xomashyo)'}
                </label>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                  {isRu ? 'Себестоимость рассчитывается автоматически по рецептуре и производству.' : 'Tannarx retseptura va ishlab chiqarishdan avtomatik hisoblanadi.'}
                </div>
              </div>
            ) : (
              <>
                <MoneyInput
                  id="prod-cost-price"
                  label={isRu ? 'Себестоимость' : 'Tannarxi'}
                  value={costPrice || ''}
                  onValueChange={(value) => setCostPrice(Number(value) || 0)}
                />

                <Select label={isRu ? 'Валюта себестоимости' : 'Xarid tannarxi valyutasi'} options={CURRENCY_OPTIONS} value={costPriceCurrency} onChange={(value) => { setCostPriceCurrency(value as 'USD' | 'UZS'); setCostPriceExchangeRate(value === 'UZS' ? '1' : ''); }} placeholder={isRu ? 'Выберите валюту' : 'Valyutani tanlang'} />
                {costPriceCurrency === 'USD' && (
                  <MoneyInput
                    label={isRu ? 'Курс к UZS' : 'UZS ga kurs'}
                    value={costPriceExchangeRate}
                    onValueChange={setCostPriceExchangeRate}
                    decimals={4}
                    placeholder="12,800"
                  />
                )}
              </>
            )}

            <Input
              id="prod-vat-rate"
              label={isRu ? 'Ставка НДС (%)' : 'QQS stavkasi (%)'}
              type="number"
              min={0}
              max={100}
              value={vatRate}
              onChange={(e) => setVatRate(Number(e.target.value))}
            />

            <QuantityInput
              id="prod-min-stock"
              label={isRu ? 'Порог мин. остатка' : 'Minimal qoldiq ogohlantirishi'}
              unit={unitOfMeasure}
              value={minStockAlert || ''}
              onValueChange={(value) => setMinStockAlert(Number(value) || 0)}
            />
              </div>
              </div>
            </details>
          </Card>
        </div>

        {/* Side panel: how the product will look in a sale, and Save */}
        <aside className="doc-aside" aria-label={tp('preview')}>
          <Card style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }} aria-live="polite">
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{tp('preview')}</div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', overflowWrap: 'anywhere' }}>{(isRu ? nameRu || nameUz : nameUz || nameRu) || <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}>{tp('noName')}</span>}</div>
            <div className="tabular-nums" style={{ fontSize: 'var(--text-base)' }}>
              {salePrice > 0 && salePriceCurrency ? formatCurrency(salePrice, locale, salePriceCurrency) : <span style={{ color: 'var(--color-warning-700)' }}>{tp('noPrice')}</span>}
              <span style={{ color: 'var(--color-text-secondary)' }}> / {unitLabel(unitOfMeasure, locale)}</span>
            </div>
            {barcode && <div className="rd-sub">{tp('barcode')}: {barcode}</div>}
            {!isFinished && costPrice > 0 && costPriceCurrency && <div className="rd-sub">{isRu ? 'Себестоимость' : 'Tannarx'}: {formatCurrency(costPrice, locale, costPriceCurrency)}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
              <Button variant="primary" type="submit" loading={loading} loadingText={isRu ? 'Сохранение…' : 'Saqlanmoqda…'} onClick={() => { addAnother.current = false; }} style={{ width: '100%' }}>
                {!loading && <Save size={18} aria-hidden />}
                {isRu ? 'Сохранить' : 'Saqlash'}
              </Button>
              <Button variant="secondary" type="submit" disabled={loading} onClick={() => { addAnother.current = true; }} style={{ width: '100%' }}>
                {isRu ? 'Сохранить и добавить ещё' : 'Saqlash va yana qo‘shish'}
              </Button>
              <Link href="/products" style={{ ...buttonStyle('ghost'), justifyContent: 'center' }}>
                {isRu ? 'Отмена' : 'Bekor qilish'}
              </Link>
            </div>
          </Card>
        </aside>
      </form>
      <Modal icon={<Tag size={20} />} isOpen={showCategoryModal} onClose={() => setShowCategoryModal(false)} title={isRu ? 'Новая категория' : 'Yangi kategoriya'} size="sm"
      footer={
        <>
          <Button data-dialog-cancel type="button" variant="secondary" onClick={() => setShowCategoryModal(false)}>{isRu ? 'Отмена' : 'Bekor qilish'}</Button>
          <Button type="submit" form="page-form" disabled={categoryLoading}>{isRu ? 'Создать' : 'Yaratish'}</Button>
        </>
      }
      onSubmitShortcut={() => (document.getElementById('page-form') as HTMLFormElement | null)?.requestSubmit()}
    >
        <form id="page-form" onSubmit={handleCreateCategory} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <Input label={isRu ? 'Название на узбекском *' : 'O‘zbekcha nomi *'} value={categoryNameUz} onChange={(event) => setCategoryNameUz(event.target.value)} required autoFocus />
          <Input label={isRu ? 'Название на русском' : 'Ruscha nomi'} value={categoryNameRu} onChange={(event) => setCategoryNameRu(event.target.value)} />
      </form>
    </Modal>
    </div>
  );
}
