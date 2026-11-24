'use client';

import { QuantityInput } from '@/components/ui/QuantityInput';
import { MoneyInput } from '@/components/ui/MoneyInput';
import React, { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { CURRENCY_OPTIONS, errorMessage, formatCurrency } from '@/lib/utils';
import { useSalesDefaultCurrency } from '@/hooks/useSalesDefaultCurrency';
import { toast } from '@/context/ToastContext';
import { PackagePlus, AlertCircle, CheckCircle2, Plus, Tag, Ruler } from 'lucide-react';
import type { Category } from '@shared/types';
import { editedProductName } from '@/lib/product-name';
import { Checkbox } from '@/components/ui/Checkbox';
import { unitLabel } from '@/lib/units';
import { productTypeLabel } from '@/lib/product-types';
import { unitOptionsFor } from '@/lib/production-recipe';
import { Trash2 } from 'lucide-react';

type ItemType = 'PRODUCT' | 'RAW_MATERIAL' | 'FINISHED_PRODUCT' | 'SERVICE';

/** An extra unit row: 1 `name` = `factor` base units (TZ 8.1). */
interface UnitRow {
  key: number;
  name: string;
  factor: string;
}
let unitRowKey = 0;

/** The saved product handed back to the caller (the API returns more). */
interface CreatedProduct {
  id: string;
  name: string | { uz?: string; ru?: string };
  sku: string;
  type?: string;
}

/** The fields of a product this drawer edits (callers pass list rows of several shapes). */
interface EditableProduct {
  id: string;
  name: string | { uz?: string; ru?: string };
  sku?: string | null;
  barcode?: string | null;
  categoryId?: string | null;
  type?: string | null;
  unitOfMeasure?: string | null;
  costPrice?: number | string | null;
  costPriceCurrency?: string | null;
  costPriceExchangeRate?: number | string | null;
  salePrice?: number | string | null;
  salePriceCurrency?: string | null;
  minStockAlert?: number | string | null;
  isSemiFinished?: boolean | null;
  costSource?: string | null;
  units?: Array<{ name: string; factor: number | string }> | null;
}

export interface CreateProductDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  productToEdit?: EditableProduct | null;
  initialSkuOrBarcode?: string;
  initialType?: ItemType;
  /** The type cannot be changed (quick create from a recipe, TZ 3.2). */
  lockType?: boolean;
  /** Types offered by the switch; all four by default. */
  allowedTypes?: ItemType[];
  onSuccess?(createdProduct: CreatedProduct, initialQuantity?: number): void;
}

export const CreateProductDrawer: React.FC<CreateProductDrawerProps> = ({
  isOpen,
  onClose,
  productToEdit = null,
  initialSkuOrBarcode = '',
  initialType = 'PRODUCT',
  lockType = false,
  allowedTypes,
  onSuccess,
}) => {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token, company } = useAuth();
  // Never guessed: no tenant sales default leaves the currency blank (ADR 0022).
  const salesDefault = useSalesDefaultCurrency();
  const isEdit = Boolean(productToEdit);

  const [itemType, setItemType] = useState<ItemType>(initialType);
  const [isSemiFinished, setIsSemiFinished] = useState(false);
  const [unitRows, setUnitRows] = useState<UnitRow[]>([]);
  const [duplicates, setDuplicates] = useState<string[]>([]);
  const isFinished = itemType === 'FINISHED_PRODUCT';
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [minStockAlert, setMinStockAlert] = useState<number | string>(0);
  const [unitOfMeasure, setUnitOfMeasure] = useState('piece');
  const [quantity, setQuantity] = useState<number | string>(1);
  const [costPrice, setCostPrice] = useState<number | string>('');
  // F8 / ADR 0022: the cost currency is chosen, never guessed.
  const [costPriceCurrency, setCostPriceCurrency] = useState('');
  const [costPriceExchangeRate, setCostPriceExchangeRate] = useState('');
  const [sellingPrice, setSellingPrice] = useState<number | string>('');
  const [salePriceCurrency, setSalePriceCurrency] = useState('');

  const [categories, setCategories] = useState<Category[]>([]);
  const [showNewCategoryModal, setShowNewCategoryModal] = useState(false);
  const [newCategoryNameUz, setNewCategoryNameUz] = useState('');
  const [newCategoryNameRu, setNewCategoryNameRu] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [customUnits, setCustomUnits] = useState<{ value: string; label: string; baseUnit: string }[]>([]);
  const [showNewUnitModal, setShowNewUnitModal] = useState(false);
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitCode, setNewUnitCode] = useState('');
  const [newUnitBaseType, setNewUnitBaseType] = useState('piece');

  useEffect(() => {
    try {
      const stored = localStorage.getItem('sklad_custom_units');
      if (stored) {
        setCustomUnits(JSON.parse(stored));
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!token || !company?.id || !isOpen) return;
    apiFetch<Category[]>('/inventory/categories', { token, tenantId: company.id, locale })
      .then((cats) => setCategories(cats || []))
      .catch(console.error);
  }, [token, company, locale, isOpen]);

  // TZ 3.2: warn about a product with the same name (saving is still allowed).
  useEffect(() => {
    const trimmed = name.trim();
    if (!isOpen || !token || !company?.id || trimmed.length < 2) return;
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({ name: trimmed });
      if (productToEdit?.id) query.set('excludeId', productToEdit.id);
      apiFetch<Array<{ id: string; name: unknown; type: string }>>(`/inventory/products/name-check?${query.toString()}`, { token, tenantId: company.id, locale })
        .then((rows) => setDuplicates((rows ?? []).map((row) => productTypeLabel(row.type, locale))))
        .catch(() => setDuplicates([]));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [name, isOpen, token, company, locale, productToEdit?.id]);

  useEffect(() => {
    if (isOpen) {
      if (productToEdit) {
        const pName =
          typeof productToEdit.name === 'object'
            ? productToEdit.name[locale] || productToEdit.name.ru || productToEdit.name.uz || ''
            : productToEdit.name || '';
        setName(pName);
        setSku(productToEdit.sku || '');
        setBarcode(productToEdit.barcode || '');
        setCategoryId(productToEdit.categoryId || '');
        setItemType((productToEdit.type || 'PRODUCT') as typeof itemType);
        setUnitOfMeasure(productToEdit.unitOfMeasure || 'piece');
        setCostPrice(productToEdit.costPrice !== undefined ? String(productToEdit.costPrice) : '');
        const editCostCurrency = productToEdit.costPriceCurrency || '';
        const editCostRate = Number(productToEdit.costPriceExchangeRate);
        setCostPriceCurrency(editCostCurrency);
        setCostPriceExchangeRate(
          editCostCurrency === 'UZS' ? '1' : editCostRate > 0 ? String(editCostRate) : '',
        );
        setSellingPrice(productToEdit.salePrice !== undefined ? String(productToEdit.salePrice) : '');
        setSalePriceCurrency(productToEdit.salePriceCurrency || '');
        setMinStockAlert(productToEdit.minStockAlert !== undefined ? String(productToEdit.minStockAlert) : '0');
        setIsSemiFinished(Boolean(productToEdit.isSemiFinished));
        setUnitRows((productToEdit.units ?? []).map((u) => ({ key: ++unitRowKey, name: u.name, factor: String(Number(u.factor)) })));
        setError(null);

      } else {
        setItemType(initialType || 'PRODUCT');
        setIsSemiFinished(false);
        setUnitRows([]);
        setCostPriceCurrency('');
        setCostPriceExchangeRate('');
        setSalePriceCurrency(salesDefault ?? '');
        if (initialSkuOrBarcode) {
          if (!/^\d{8,14}$/.test(initialSkuOrBarcode)) {
            setName(initialSkuOrBarcode);
          } else {
            setBarcode(initialSkuOrBarcode);
          }
        }
      }
    }
  }, [isOpen, productToEdit, initialType, initialSkuOrBarcode, locale, token, company, salesDefault]);

  const handleCreateCategory = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !company?.id || !newCategoryNameUz.trim()) return;
    setCreatingCategory(true);
    try {
      const created = await apiFetch<Category>('/inventory/categories', {
        method: 'POST',
        token,
        tenantId: company.id,
        locale,
        body: JSON.stringify({
          name: {
            uz: newCategoryNameUz.trim(),
            ru: newCategoryNameRu.trim() || newCategoryNameUz.trim(),
          },
        }),
      });
      setCategories((current) => [created, ...current]);
      setCategoryId(created.id);
      setShowNewCategoryModal(false);
      setNewCategoryNameUz('');
      setNewCategoryNameRu('');
      toast.success(isRu ? 'Категория успешно создана' : 'Kategoriya yaratildi');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Kategoriya yaratilmadi');
    } finally {
      setCreatingCategory(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const finalName = name.trim();
    if (!finalName) {
      setError(isRu ? 'Наименование обязательно' : 'Nom kiritilishi shart');
      return;
    }
    if (Number(sellingPrice) > 0 && !salePriceCurrency) {
      setError(isRu ? 'Укажите валюту цены продажи' : 'Sotish narxi valyutasini tanlang');
      return;
    }
    if (Number(costPrice) > 0 && !costPriceCurrency) {
      setError(isRu ? 'Укажите валюту себестоимости' : 'Xarid tannarxi valyutasini tanlang');
      return;
    }
    if (
      costPriceCurrency === 'USD' &&
      Number(costPrice) > 0 &&
      (!Number.isFinite(Number(costPriceExchangeRate)) || Number(costPriceExchangeRate) <= 0)
    ) {
      setError(isRu ? 'Укажите положительный курс себестоимости' : 'Xarid tannarxi uchun 0 dan katta kursni kiriting');
      return;
    }

    const units: Array<{ name: string; factor: number }> = [];
    for (const row of unitRows) {
      const unitName = row.name.trim();
      const factor = Number(String(row.factor).replace(',', '.'));
      if (!unitName && !row.factor) continue;
      if (!unitName || !(factor > 0)) {
        setError(isRu ? 'Укажите название и коэффициент (больше 0) каждой доп. единицы' : 'Har bir qo‘shimcha birlik uchun nom va koeffitsiyent (0 dan katta) kiriting');
        return;
      }
      units.push({ name: unitName, factor });
    }

    const numQty = parseFloat(String(quantity)) || 1;
    setLoading(true);
    setError(null);

    try {
      const customMatch = customUnits.find((u) => u.value === unitOfMeasure);
      const validDbUnit = ['piece', 'kg', 'liter', 'meter', 'box', 'pack'].includes(unitOfMeasure)
        ? unitOfMeasure
        : (customMatch?.baseUnit || 'piece');

      let res: CreatedProduct;
      if (productToEdit) {
        const payload = {
          // Keep the other language's name: this drawer edits one name field.
          name: editedProductName(productToEdit.name, locale, finalName),
          sku: sku.trim() || undefined,
          barcode: barcode.trim() || null,
          categoryId: categoryId || null,
          type: itemType,
          unitOfMeasure: validDbUnit,
          costPrice: Number(costPrice) || 0,
          costPriceCurrency: costPriceCurrency || undefined,
          costPriceExchangeRate: costPriceCurrency === 'USD' ? Number(costPriceExchangeRate) : 1,
          salePrice: Number(sellingPrice) || 0,
          salePriceCurrency: salePriceCurrency || undefined,
          minStockAlert: Number(minStockAlert) || 0,
          isSemiFinished: isFinished ? isSemiFinished : false,
          units,
          // TZ 3.3: a finished product's cost is never typed in.
          ...(isFinished ? { costPrice: undefined, costPriceCurrency: undefined, costPriceExchangeRate: undefined } : {}),
        };
        res = await apiFetch(`/inventory/products/${productToEdit.id}`, {
          method: 'PUT',
          token: token || undefined,
          tenantId: company?.id,
          locale,
          body: JSON.stringify(payload),
        });
      } else {
        const payload = {
          name: {
            uz: finalName,
            ru: finalName,
          },
          sku: sku.trim() || undefined,
          barcode: barcode.trim() || null,
          categoryId: categoryId || null,
          type: itemType,
          unitOfMeasure: validDbUnit,
          costPrice: Number(costPrice) || 0,
          costPriceCurrency: costPriceCurrency || undefined,
          costPriceExchangeRate: costPriceCurrency === 'USD' ? Number(costPriceExchangeRate) : 1,
          salePrice: Number(sellingPrice) || 0,
          salePriceCurrency: salePriceCurrency || undefined,
          minStockAlert: Number(minStockAlert) || 0,
          isSemiFinished: isFinished ? isSemiFinished : false,
          units,
          // TZ 3.3: a finished product's cost is never typed in.
          ...(isFinished ? { costPrice: undefined, costPriceCurrency: undefined, costPriceExchangeRate: undefined } : {}),
        };

        res = await apiFetch('/inventory/products', {
          method: 'POST',
          token: token || undefined,
          tenantId: company?.id,
          locale,
          body: JSON.stringify(payload),
        });
      }

      // TZ 3.3: a finished product gets stock only from production.
      const savedQuantity = isFinished ? 0 : numQty;
      resetForm();
      if (onSuccess) onSuccess(res, savedQuantity);
      onClose();
    } catch (err) {
      setError(errorMessage(err) || (isRu ? 'Ошибка сохранения позиции' : 'Pozitsiyani saqlashda xatolik'));
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setSku('');
    setBarcode('');
    setCategoryId('');
    setMinStockAlert(0);
    setUnitOfMeasure('piece');
    setQuantity(1);
    setCostPrice('');
    setCostPriceCurrency('');
    setCostPriceExchangeRate('');
    setSellingPrice('');
    setSalePriceCurrency(salesDefault ?? '');
    setIsSemiFinished(false);
    setUnitRows([]);
    setDuplicates([]);
    setError(null);
  };

  /** TZ 11.5: the drawer itself asks before unsaved input is lost (backdrop, Esc, ✕, Cancel). */
  const requestClose = () => {
    resetForm();
    onClose();
  };

  const handleAddCustomUnit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newUnitName.trim();
    if (!trimmedName) return;
    const trimmedCode = newUnitCode.trim() || trimmedName.toLowerCase().replace(/\s+/g, '_');
    const label = `${trimmedName} (${newUnitCode.trim() || trimmedCode})`;

    const exists =
      customUnits.some((u) => u.value === trimmedCode) ||
      ['piece', 'kg', 'liter', 'meter', 'box', 'pack'].includes(trimmedCode);
    if (exists) {
      toast.warning(isRu ? 'Такая единица измерения уже существует' : 'Bunday o‘lchov birligi allaqachon mavjud');
      return;
    }

    const updated = [...customUnits, { value: trimmedCode, label, baseUnit: newUnitBaseType }];
    setCustomUnits(updated);
    try {
      localStorage.setItem('sklad_custom_units', JSON.stringify(updated));
    } catch {}
    setUnitOfMeasure(trimmedCode);
    setShowNewUnitModal(false);
    setNewUnitName('');
    setNewUnitCode('');
    toast.success(isRu ? 'Единица измерения успешно добавлена' : 'Yangi o‘lchov birligi muvaffaqiyatli qo‘shildi');
  };

  const unitOptions = [
    { value: 'piece', label: isRu ? 'Штука (шт)' : 'Dona (dona)' },
    { value: 'kg', label: isRu ? 'Килограмм (кг)' : 'Kilogramm (kg)' },
    { value: 'liter', label: isRu ? 'Литр (л)' : 'Litr (l)' },
    { value: 'meter', label: isRu ? 'Метр (м)' : 'Metr (m)' },
    { value: 'box', label: isRu ? 'Коробка / Упаковка (уп)' : 'Quti / Blok' },
    { value: 'pack', label: isRu ? 'Пачка' : 'Pachka' },
  ];

  const allUnitOptions = [
    ...unitOptions,
    ...customUnits.map((u) => ({ value: u.value, label: u.label })),
  ];

  const customMatch = customUnits.find((u) => u.value === unitOfMeasure);
  const effectiveBaseUnit = customMatch ? customMatch.baseUnit : unitOfMeasure;
  const isFractionalUnit = effectiveBaseUnit === 'kg' || effectiveBaseUnit === 'liter' || effectiveBaseUnit === 'meter';

  // TZ 11.5: the unit is the input's suffix, so the label does not repeat it.
  const getQuantityLabel = () => (isRu ? 'Количество *' : 'Soni *');

  const standardSubUnits = unitOptionsFor(unitOfMeasure)
    .slice(1)
    .map((u) => unitLabel(u.code, locale))
    .join(', ');

  const getDrawerTitle = () => {
    if (isEdit) return isRu ? 'Редактировать позицию' : 'Pozitsiyani tahrirlash';
    if (itemType === 'RAW_MATERIAL') return isRu ? 'Новое сырьё / материал' : 'Yangi xomashyo qo‘shish';
    if (itemType === 'SERVICE') return isRu ? 'Новая услуга' : 'Yangi xizmat qo‘shish';
    if (itemType === 'FINISHED_PRODUCT') return isRu ? 'Новый готовый продукт' : 'Yangi tayyor mahsulot qo‘shish';
    return isRu ? 'Новый товар' : 'Yangi tovar qo‘shish';
  };

  const getDrawerDescription = () => {
    if (isEdit) {
      return isRu
        ? 'Редактирование параметров, цен, категорий и штрихкодов'
        : 'Parametrlar, narxlar, kategoriya va shtrix-kodlarni tahrirlash';
    }
    if (itemType === 'RAW_MATERIAL') {
      return isRu
        ? 'Быстрое добавление сырья и производственных материалов в документ'
        : 'Ishlab chiqarish xomashyosi va materiallarini tezkor kiritish';
    }
    if (itemType === 'SERVICE') {
      return isRu
        ? 'Быстрое добавление транспортных или иных услуг в документ'
        : 'Yetkazib berish yoki boshqa xizmatlarni tezkor kiritish';
    }
    if (itemType === 'FINISHED_PRODUCT') {
      return isRu
        ? 'Себестоимость рассчитается по рецептуре и производству; остаток появится после выпуска'
        : 'Tannarx retseptura va ishlab chiqarishdan hisoblanadi; qoldiq ishlab chiqarish yakunlanganda paydo bo‘ladi';
    }
    return isRu
      ? 'Быстрое добавление нового товара в каталог и документ'
      : 'Yangi tovar, miqdori va narxlarini tezkor kiritish';
  };

  const getSubmitLabel = () => {
    if (isEdit) return isRu ? 'Сохранить изменения' : 'O‘zgarishlarni saqlash';
    if (itemType === 'RAW_MATERIAL') return isRu ? 'Сохранить сырьё' : 'Xomashyoni saqlash';
    if (itemType === 'SERVICE') return isRu ? 'Сохранить услугу' : 'Xizmatni saqlash';
    if (itemType === 'FINISHED_PRODUCT') return isRu ? 'Сохранить продукт' : 'Mahsulotni saqlash';
    return isRu ? 'Сохранить товар' : 'Tovarni saqlash';
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={() => requestClose()}
      title={getDrawerTitle()}
      description={getDrawerDescription()}
      icon={<PackagePlus size={20} />}
      size="md"
      onSubmitShortcut={handleSubmit}
      footer={
        <>
          <Button data-dialog-cancel
            type="button"
            variant="secondary"
            onClick={() => requestClose()}
            disabled={loading}
          >
            {isRu ? 'Отмена' : 'Bekor qilish'}
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
                {getSubmitLabel()}
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
            color: 'var(--color-error-700)',
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

      <form
        onSubmit={handleSubmit}
        onInput={() => {
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
      >
        {/* Type Segmented Switch */}
        <div>
          <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
            {isRu ? 'Тип номенклатуры' : 'Nomenklatura turi'}
          </label>
          <div role="radiogroup" aria-label={isRu ? 'Тип номенклатуры' : 'Nomenklatura turi'} style={{ display: 'flex', flexWrap: 'wrap', borderRadius: 'var(--radius-lg)', padding: '4px', gap: '4px', backgroundColor: 'var(--color-segmented-bg)', border: '1px solid var(--color-segmented-border)' }}>
            {(lockType ? [itemType] : allowedTypes ?? (['PRODUCT', 'RAW_MATERIAL', 'FINISHED_PRODUCT', 'SERVICE'] as ItemType[])).map((type) => {
              const active = itemType === type;
              return (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={lockType}
                  onClick={() => {
                    setItemType(type);
                  }}
                  style={{
                    flex: 1,
                    minWidth: 96,
                    minHeight: 40,
                    padding: '8px 12px',
                    fontSize: 'var(--text-xs)',
                    fontWeight: active ? 700 : 500,
                    borderRadius: 'var(--radius-md)',
                    border: active ? '1px solid var(--color-primary-500)' : '1px solid transparent',
                    cursor: lockType ? 'default' : 'pointer',
                    backgroundColor: active ? 'var(--color-primary-100)' : 'transparent',
                    color: active ? 'var(--color-primary-700)' : 'var(--color-text-secondary)',
                    boxShadow: active ? 'var(--shadow-sm)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {productTypeLabel(type, locale)}
                  {lockType && <span style={{ fontWeight: 500 }}> · {isRu ? 'тип закреплён' : 'tur qulflangan'}</span>}
                </button>
              );
            })}
          </div>
          {isFinished && (
            <div style={{ marginTop: 'var(--space-2)' }}>
              <Checkbox
                label={isRu ? 'Полуфабрикат' : 'Yarim tayyor mahsulot'}
                description={isRu ? 'Используется как сырьё в других рецептурах' : 'Boshqa retseptalarda xomashyo sifatida ishlatiladi'}
                checked={isSemiFinished}
                onChange={(event) => {
                  setIsSemiFinished(event.target.checked);
                }}
              />
            </div>
          )}
        </div>

        {/* Product Name */}
        <div>
          <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
            {isRu ? (itemType === 'SERVICE' ? 'Наименование услуги *' : itemType === 'RAW_MATERIAL' ? 'Наименование сырья *' : itemType === 'FINISHED_PRODUCT' ? 'Наименование продукта *' : 'Наименование товара *') : (itemType === 'SERVICE' ? 'Xizmat nomi *' : itemType === 'RAW_MATERIAL' ? 'Xomashyo nomi *' : itemType === 'FINISHED_PRODUCT' ? 'Mahsulot nomi *' : 'Tovar nomi *')}
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isRu ? (itemType === 'SERVICE' ? 'Например: Доставка и логистика' : itemType === 'RAW_MATERIAL' ? 'Например: Алюминиевый профиль 60x40' : 'Например: Футболка Zara M') : (itemType === 'SERVICE' ? 'Masalan: Transport xizmati' : itemType === 'RAW_MATERIAL' ? 'Masalan: Alyumin profil 60x40' : 'Masalan: Futbolka Zara M')}
            autoFocus
            aria-required="true"
          />
          {duplicates.length > 0 && name.trim().length >= 2 && (
            <div role="status" style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, fontSize: 'var(--text-xs)', color: 'var(--color-warning-700)' }}>
              <AlertCircle size={14} aria-hidden />
              {isRu
                ? `Позиция с таким названием уже есть (${duplicates.join(', ')}). Проверьте, не дубликат ли это.`
                : `Bunday nomli pozitsiya allaqachon bor (${duplicates.join(', ')}). Takror emasligini tekshiring.`}
            </div>
          )}
        </div>

        {/* SKU & Barcode */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              {isRu ? 'Артикул (SKU) (необязательно)' : 'Artikul (SKU) (ixtiyoriy)'}
            </label>
            <Input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder={isRu ? 'Оставьте пустым для авто' : 'Avto-kod uchun bo‘sh qoldiring'}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              {isRu ? 'Штрихкод' : 'Shtrix-kod'}
            </label>
            <Input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder={isRu ? 'Штрихкод...' : 'Shtrix-kod...'}
            />
          </div>
        </div>

        {/* Category & Min Stock Alert */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              {isRu ? 'Категория' : 'Kategoriya'}
            </label>
            <Select
              options={[
                { value: '', label: isRu ? 'Без категории' : 'Kategoriyasiz' },
                ...categories.map((c) => ({
                  value: c.id,
                  label: typeof c.name === 'object' ? (c.name[locale] || c.name.ru || c.name.uz || '') : c.name,
                })),
              ]}
              value={categoryId}
              onChange={(val) => setCategoryId(val)}
              onCreateNew={() => setShowNewCategoryModal(true)}
              createNewLabel={isRu ? 'Добавить категорию' : 'Kategoriya qo‘shish'}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              {isRu ? 'Мин. остаток (оповещение)' : 'Minimal qoldiq chegarasi'}
            </label>
            <QuantityInput
              unit={unitOfMeasure}
              value={minStockAlert}
              onValueChange={setMinStockAlert}
              aria-label={isRu ? 'Мин. остаток' : 'Minimal qoldiq'}
            />
          </div>
        </div>

        {/* Unit of Measure & Quantity */}
        <div style={{ display: 'grid', gridTemplateColumns: isEdit || isFinished ? '1fr' : '1fr 1fr', gap: 'var(--space-3)' }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              {isRu ? 'Единица измерения *' : 'O‘lchov birligi *'}
            </label>
            <Select
              options={allUnitOptions}
              value={unitOfMeasure}
              onChange={(val) => setUnitOfMeasure(val)}
              onCreateNew={() => setShowNewUnitModal(true)}
              createNewLabel={isRu ? 'Новая единица' : 'Yangi birlik'}
            />
          </div>

          {!isEdit && !isFinished && (
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                {getQuantityLabel()}
              </label>
              <QuantityInput
                unit={unitOfMeasure}
                value={quantity}
                onValueChange={setQuantity}
                placeholder="1"
                decimals={isFractionalUnit ? 3 : 0}
                aria-label={getQuantityLabel()}
              />
            </div>
          )}
        </div>

        {/* Cost Price & Selling Price */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          {isFinished ? (
            <div>
              <label htmlFor="finished-cost" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                {isRu ? 'Себестоимость' : 'Tannarx'}
              </label>
              {/* TZ 3.3: read-only, grey, with the reason (11.5). */}
              <input
                id="finished-cost"
                readOnly
                aria-readonly="true"
                value={formatCurrency(Number(productToEdit?.costPrice ?? 0), locale, 'UZS')}
                style={{ width: '100%', minHeight: 40, padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px dashed var(--color-border)', background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', cursor: 'not-allowed' }}
              />
              <div style={{ marginTop: 6, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                {productToEdit?.costSource === 'PRODUCTION_ACTUAL'
                  ? isRu ? 'Фактическая (производство)' : 'Haqiqiy (ishlab chiqarish)'
                  : productToEdit?.costSource === 'RECIPE_ESTIMATE'
                    ? isRu ? 'Оценка (рецептура)' : 'Taxminiy (retseptura)'
                    : isRu ? 'Рассчитывается автоматически по рецептуре и производству' : 'Retseptura va ishlab chiqarishdan avtomatik hisoblanadi'}
              </div>
            </div>
          ) : (
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                {isRu ? 'Цена закупки (Себестоимость)' : 'Xarid narxi (Tan narx)'}
              </label>
              <MoneyInput
                aria-label={isRu ? 'Цена закупки' : 'Xarid narxi'}
                value={costPrice}
                onValueChange={setCostPrice}
              />
              <div style={{ marginTop: 'var(--space-2)' }}>
                <Select
                  label={isRu ? 'Валюта себестоимости' : 'Xarid tannarxi valyutasi'}
                  options={CURRENCY_OPTIONS}
                  value={costPriceCurrency}
                  onChange={(value) => {
                    setCostPriceCurrency(value);
                    if (value === 'UZS') setCostPriceExchangeRate('1');
                    else if (costPriceCurrency !== 'USD') setCostPriceExchangeRate('');
                  }}
                  placeholder={isRu ? 'Выберите валюту' : 'Valyutani tanlang'}
                />
              </div>
              {costPriceCurrency === 'USD' && (
                <MoneyInput
                  label={isRu ? 'Курс к UZS' : 'UZS ga kurs'}
                  value={costPriceExchangeRate}
                  onValueChange={setCostPriceExchangeRate}
                  decimals={4}
                  placeholder="12,800"
                />
              )}
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              {isRu ? 'Цена продажи (Опционально)' : 'Sotish narxi (Ixtiyoriy)'}
            </label>
            <MoneyInput
              aria-label={isRu ? 'Цена продажи' : 'Sotish narxi'}
              value={sellingPrice}
              onValueChange={setSellingPrice}
            />
            <div style={{ marginTop: 'var(--space-2)' }}>
              <Select
                label={isRu ? 'Валюта цены продажи' : 'Sotish narxi valyutasi'}
                options={CURRENCY_OPTIONS}
                value={salePriceCurrency}
                onChange={setSalePriceCurrency}
                placeholder={isRu ? 'Выберите валюту' : 'Valyutani tanlang'}
              />
            </div>
          </div>
        </div>

        {itemType !== 'SERVICE' && (
          <fieldset style={{ border: '1px solid var(--color-border-light)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', margin: 0 }}>
            <legend style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', padding: '0 4px' }}>
              {isRu ? 'Дополнительные единицы' : 'Qo‘shimcha birliklar'}
            </legend>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 8 }}>
              {isRu
                ? `Например: 1 мешок = 50 ${unitLabel(unitOfMeasure, locale)}. Стандартные единицы (${standardSubUnits || '—'}) уже есть.`
                : `Masalan: 1 qop = 50 ${unitLabel(unitOfMeasure, locale)}. Standart birliklar (${standardSubUnits || '—'}) avtomatik mavjud.`}
            </div>
            {unitRows.map((row, index) => (
              <div key={row.key} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto minmax(0, 1fr) auto 40px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>1</span>
                <Input
                  aria-label={`${isRu ? 'Название единицы' : 'Birlik nomi'} ${index + 1}`}
                  placeholder={isRu ? 'мешок' : 'qop'}
                  value={row.name}
                  onChange={(e) => setUnitRows((rows) => rows.map((r) => (r.key === row.key ? { ...r, name: e.target.value } : r)))}
                />
                <span aria-hidden style={{ color: 'var(--color-text-secondary)' }}>=</span>
                <Input
                  aria-label={`${isRu ? 'Коэффициент' : 'Koeffitsiyent'} ${index + 1}`}
                  inputMode="decimal"
                  placeholder="50"
                  value={row.factor}
                  onChange={(e) => setUnitRows((rows) => rows.map((r) => (r.key === row.key ? { ...r, factor: e.target.value.replace(/[^0-9.,]/g, '') } : r)))}
                  style={{ textAlign: 'right' }}
                />
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{unitLabel(unitOfMeasure, locale)}</span>
                <button
                  type="button"
                  aria-label={isRu ? 'Удалить единицу' : 'Birlikni o‘chirish'}
                  title={isRu ? 'Удалить единицу' : 'Birlikni o‘chirish'}
                  onClick={() => {
                    setUnitRows((rows) => rows.filter((r) => r.key !== row.key));
                  }}
                  style={{ width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', color: 'var(--color-error-700)', cursor: 'pointer' }}
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setUnitRows((rows) => [...rows, { key: ++unitRowKey, name: '', factor: '' }]);
              }}
            >
              <Plus size={14} aria-hidden /> {isRu ? 'Добавить единицу' : 'Birlik qo‘shish'}
            </Button>
          </fieldset>
        )}
        </form>

      <Modal icon={<Tag size={20} />}
        isOpen={showNewCategoryModal}
        onClose={() => setShowNewCategoryModal(false)}
        title={isRu ? 'Новая категория' : 'Yangi kategoriya'}
        size="sm"
      footer={
        <>
          <Button data-dialog-cancel type="button" variant="secondary" onClick={() => setShowNewCategoryModal(false)}>
            {isRu ? 'Отмена' : 'Bekor qilish'}
          </Button>
          <Button type="submit" form="create-product-drawer-form" disabled={creatingCategory}>
            {isRu ? 'Создать' : 'Yaratish'}
          </Button>
        </>
      }
      onSubmitShortcut={() => (document.getElementById('create-product-drawer-form') as HTMLFormElement | null)?.requestSubmit()}
    >
        <form id="create-product-drawer-form" onSubmit={handleCreateCategory} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <Input
            label={isRu ? 'Название на узбекском *' : 'O‘zbekcha nomi *'}
            value={newCategoryNameUz}
            onChange={(event) => setNewCategoryNameUz(event.target.value)}
            required
            autoFocus
          />
          <Input
            label={isRu ? 'Название на русском' : 'Ruscha nomi'}
            value={newCategoryNameRu}
            onChange={(event) => setNewCategoryNameRu(event.target.value)}
          />
      </form>
    </Modal>

      <Modal icon={<Ruler size={20} />}
        isOpen={showNewUnitModal}
        onClose={() => {
          setShowNewUnitModal(false);
          setNewUnitName('');
          setNewUnitCode('');
        }}
        title={isRu ? 'Новая единица измерения' : 'Yangi o‘lchov birligi'}
        size="sm"
      footer={
        <>
          <Button data-dialog-cancel
            type="button"
            variant="secondary"
            onClick={() => {
              setShowNewUnitModal(false);
              setNewUnitName('');
              setNewUnitCode('');
            }}
          >
            {isRu ? 'Отмена' : 'Bekor qilish'}
          </Button>
          <Button type="submit" form="create-product-drawer-form-2" variant="primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={16} />
            {isRu ? 'Добавить' : 'Qo‘shish'}
          </Button>
        </>
      }
      onSubmitShortcut={() => (document.getElementById('create-product-drawer-form-2') as HTMLFormElement | null)?.requestSubmit()}
    >
        <form id="create-product-drawer-form-2" onSubmit={handleAddCustomUnit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-2) 0' }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              {isRu ? 'Название единицы * (напр. Грамм, Рулон)' : 'Birlik nomi * (masalan: Gramm, Rulon, Qop)'}
            </label>
            <Input
              value={newUnitName}
              onChange={(e) => setNewUnitName(e.target.value)}
              placeholder={isRu ? 'Напр. Грамм' : 'Masalan: Gramm'}
              autoFocus
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              {isRu ? 'Краткое обозначение (напр. г, т, рул)' : 'Qisqartmasi (masalan: g, t, rul, m²)'}
            </label>
            <Input
              value={newUnitCode}
              onChange={(e) => setNewUnitCode(e.target.value)}
              placeholder={isRu ? 'г' : 'g'}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              {isRu ? 'Базовый тип для учета' : 'Baza turi (hisob-kitob uchun)'}
            </label>
            <Select
              options={[
                { value: 'piece', label: isRu ? 'Штучный (шт, коробка, пачка)' : 'Donali (dona, quti, blok)' },
                { value: 'kg', label: isRu ? 'Весовой (кг, грамм, тонна)' : 'Vaznli (kg, gramm, tonna)' },
                { value: 'liter', label: isRu ? 'Объемный (литр, миллилитр)' : 'Hajmli (litr, ml)' },
                { value: 'meter', label: isRu ? 'Метражный (метр, рулон, погонный)' : 'Uzunlik/Meyor (metr, rulon)' },
              ]}
              value={newUnitBaseType}
              onChange={(val) => setNewUnitBaseType(val)}
            />
          </div>
      </form>
    </Modal>
    </Drawer>
  );
};
