'use client';

import React, { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/context/ToastContext';
import { PackagePlus, AlertCircle, CheckCircle2, Plus } from 'lucide-react';

export interface CreateProductDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  productToEdit?: any | null;
  initialSkuOrBarcode?: string;
  initialType?: 'PRODUCT' | 'RAW_MATERIAL' | 'SERVICE';
  onSuccess?: (createdProduct: any, initialQuantity?: number) => void;
}

export const CreateProductDrawer: React.FC<CreateProductDrawerProps> = ({
  isOpen,
  onClose,
  productToEdit = null,
  initialSkuOrBarcode = '',
  initialType = 'PRODUCT',
  onSuccess,
}) => {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token, company } = useAuth();
  const isEdit = Boolean(productToEdit);

  const [itemType, setItemType] = useState<'PRODUCT' | 'RAW_MATERIAL' | 'SERVICE'>(initialType);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [minStockAlert, setMinStockAlert] = useState<number | string>(0);
  const [unitOfMeasure, setUnitOfMeasure] = useState('piece');
  const [quantity, setQuantity] = useState<number | string>(1);
  const [costPrice, setCostPrice] = useState<number | string>('');
  const [sellingPrice, setSellingPrice] = useState<number | string>('');

  const [categories, setCategories] = useState<any[]>([]);
  const isMultiTier = Boolean(company?.settings?.sales?.enableMultiTierPriceLists);
  const [priceLists, setPriceLists] = useState<any[]>([]);
  const [tierPrices, setTierPrices] = useState<Record<string, number | string>>({});

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
    if (!token || !company?.id || !isOpen || !isMultiTier) return;
    apiFetch<any[]>('/sales/price-lists', { token, tenantId: company.id, locale })
      .then((pls) => setPriceLists(pls || []))
      .catch(console.error);
  }, [token, company, locale, isOpen, isMultiTier]);

  useEffect(() => {
    if (!token || !company?.id || !isOpen) return;
    apiFetch<any[]>('/inventory/categories', { token, tenantId: company.id, locale })
      .then((cats) => setCategories(cats || []))
      .catch(console.error);
  }, [token, company, locale, isOpen]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
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
        setItemType(productToEdit.type || 'PRODUCT');
        setUnitOfMeasure(productToEdit.unitOfMeasure || 'piece');
        setCostPrice(productToEdit.costPrice !== undefined ? String(productToEdit.costPrice) : '');
        setSellingPrice(productToEdit.salePrice !== undefined ? String(productToEdit.salePrice) : '');
        setMinStockAlert(productToEdit.minStockAlert !== undefined ? String(productToEdit.minStockAlert) : '0');
        setError(null);

        // Pre-populate tier prices
        const initialTiers: Record<string, number | string> = {};
        if (Array.isArray(productToEdit.productPrices)) {
          productToEdit.productPrices.forEach((pp: any) => {
            if (pp.priceListId && pp.price !== undefined) {
              initialTiers[pp.priceListId] = Number(pp.price);
            }
          });
          setTierPrices(initialTiers);
        } else if (productToEdit.id && isMultiTier && token && company?.id) {
          apiFetch<any>(`/inventory/products/${productToEdit.id}`, { token, tenantId: company.id, locale })
            .then((fullProd) => {
              if (Array.isArray(fullProd?.productPrices)) {
                const loadedTiers: Record<string, number | string> = {};
                fullProd.productPrices.forEach((pp: any) => {
                  if (pp.priceListId && pp.price !== undefined) {
                    loadedTiers[pp.priceListId] = Number(pp.price);
                  }
                });
                setTierPrices(loadedTiers);
              }
            })
            .catch(console.error);
        } else {
          setTierPrices({});
        }
      } else {
        setItemType(initialType || 'PRODUCT');
        setTierPrices({});
        if (initialSkuOrBarcode) {
          if (!/^\d{8,14}$/.test(initialSkuOrBarcode)) {
            setName(initialSkuOrBarcode);
          } else {
            setBarcode(initialSkuOrBarcode);
          }
        }
      }
    }
  }, [isOpen, productToEdit, initialType, initialSkuOrBarcode, locale, isMultiTier, token, company]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const finalName = name.trim();
    if (!finalName) {
      setError(isRu ? 'Наименование обязательно' : 'Nom kiritilishi shart');
      return;
    }

    const numQty = parseFloat(String(quantity)) || 1;
    setLoading(true);
    setError(null);

    try {
      const customMatch = customUnits.find((u) => u.value === unitOfMeasure);
      const validDbUnit = ['piece', 'kg', 'liter', 'meter', 'box', 'pack'].includes(unitOfMeasure)
        ? unitOfMeasure
        : (customMatch?.baseUnit || 'piece');

      let res: any;
      if (productToEdit) {
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
          salePrice: Number(sellingPrice) || 0,
          minStockAlert: Number(minStockAlert) || 0,
        };
        res = await apiFetch(`/inventory/products/${productToEdit.id}`, {
          method: 'PUT',
          token: token || undefined,
          tenantId: company?.id,
          locale,
          body: JSON.stringify(payload),
        });
      } else {
        const randomCode = Date.now().toString().slice(-6);
        const prefix = itemType === 'RAW_MATERIAL' ? 'RAW' : itemType === 'SERVICE' ? 'SRV' : 'PRD';
        const payload = {
          name: {
            uz: finalName,
            ru: finalName,
          },
          sku: sku.trim() || `${prefix}-${randomCode}`,
          barcode: barcode.trim() || null,
          categoryId: categoryId || null,
          type: itemType,
          unitOfMeasure: validDbUnit,
          costPrice: Number(costPrice) || 0,
          salePrice: Number(sellingPrice) || 0,
          minStockAlert: Number(minStockAlert) || 0,
        };

        res = await apiFetch('/inventory/products', {
          method: 'POST',
          token: token || undefined,
          tenantId: company?.id,
          locale,
          body: JSON.stringify(payload),
        });
      }

      const targetProductId = productToEdit?.id || res?.id;
      if (isMultiTier && targetProductId) {
        const priceEntries = Object.entries(tierPrices).filter(
          ([_, val]) => val !== '' && !isNaN(Number(val)) && Number(val) >= 0,
        );
        for (const [plId, val] of priceEntries) {
          await apiFetch(`/sales/price-lists/${plId}/items`, {
            method: 'POST',
            token: token || undefined,
            tenantId: company?.id,
            locale,
            body: JSON.stringify({
              productId: targetProductId,
              price: Number(val),
            }),
          }).catch(console.error);
        }
      }

      const savedQuantity = numQty;
      resetForm();
      if (onSuccess) onSuccess(res, savedQuantity);
      onClose();
    } catch (err: any) {
      setError(err?.message || (isRu ? 'Ошибка сохранения позиции' : 'Pozitsiyani saqlashda xatolik'));
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
    setSellingPrice('');
    setTierPrices({});
    setError(null);
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

  const getQuantityLabel = () => {
    switch (unitOfMeasure) {
      case 'kg':
        return isRu ? 'Количество (кг) *' : 'Soni (kg) *';
      case 'liter':
        return isRu ? 'Количество (литр) *' : 'Soni (litr) *';
      case 'meter':
        return isRu ? 'Количество (метр) *' : 'Soni (metr) *';
      case 'box':
        return isRu ? 'Количество (коробок) *' : 'Soni (quti) *';
      case 'pack':
        return isRu ? 'Количество (пачек) *' : 'Soni (pachka) *';
      case 'piece':
        return isRu ? 'Количество (шт) *' : 'Soni (dona) *';
      default: {
        const custom = customUnits.find((u) => u.value === unitOfMeasure);
        return isRu
          ? `Количество (${custom ? custom.label : unitOfMeasure}) *`
          : `Soni (${custom ? custom.label : unitOfMeasure}) *`;
      }
    }
  };

  const getDrawerTitle = () => {
    if (isEdit) return isRu ? 'Редактировать позицию' : 'Pozitsiyani tahrirlash';
    if (itemType === 'RAW_MATERIAL') return isRu ? 'Новое сырьё / материал' : 'Yangi Xomashyo Qo‘shish';
    if (itemType === 'SERVICE') return isRu ? 'Новая услуга' : 'Yangi Xizmat Qo‘shish';
    return isRu ? 'Новый товар' : 'Yangi Tovar Qo‘shish';
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
    return isRu
      ? 'Быстрое добавление нового товара в каталог и документ'
      : 'Yangi tovar, miqdori va narxlarini tezkor kiritish';
  };

  const getSubmitLabel = () => {
    if (isEdit) return isRu ? 'Сохранить изменения (Ctrl+Enter)' : 'O‘zgarishlarni saqlash (Ctrl+Enter)';
    if (itemType === 'RAW_MATERIAL') return isRu ? 'Сохранить сырьё (Ctrl+Enter)' : 'Xomashyoni saqlash (Ctrl+Enter)';
    if (itemType === 'SERVICE') return isRu ? 'Сохранить услугу (Ctrl+Enter)' : 'Xizmatni saqlash (Ctrl+Enter)';
    return isRu ? 'Сохранить товар (Ctrl+Enter)' : 'Tovarni saqlash (Ctrl+Enter)';
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={() => {
        resetForm();
        onClose();
      }}
      title={getDrawerTitle()}
      description={getDrawerDescription()}
      icon={<PackagePlus size={20} />}
      size="md"
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
        {/* Type Segmented Switch */}
        <div>
          <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
            {isRu ? 'Тип номенклатуры' : 'Nomenklatura turi'}
          </label>
          <div style={{ display: 'flex', borderRadius: 'var(--radius-lg)', padding: '4px', gap: '4px', backgroundColor: 'var(--color-segmented-bg)', border: '1px solid var(--color-segmented-border)' }}>
            <button
              type="button"
              onClick={() => setItemType('PRODUCT')}
              style={{
                flex: 1,
                padding: '8px 12px',
                fontSize: 'var(--text-xs)',
                fontWeight: itemType === 'PRODUCT' ? 700 : 500,
                borderRadius: 'var(--radius-md)',
                border: itemType === 'PRODUCT' ? '1px solid var(--color-primary-500)' : '1px solid transparent',
                cursor: 'pointer',
                backgroundColor: itemType === 'PRODUCT' ? 'var(--color-primary-100)' : 'transparent',
                color: itemType === 'PRODUCT' ? 'var(--color-primary-700)' : 'var(--color-text-secondary)',
                boxShadow: itemType === 'PRODUCT' ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              {isRu ? 'Товар' : 'Tovar'}
            </button>
            <button
              type="button"
              onClick={() => setItemType('RAW_MATERIAL')}
              style={{
                flex: 1,
                padding: '8px 12px',
                fontSize: 'var(--text-xs)',
                fontWeight: itemType === 'RAW_MATERIAL' ? 700 : 500,
                borderRadius: 'var(--radius-md)',
                border: itemType === 'RAW_MATERIAL' ? '1px solid var(--color-success-500)' : '1px solid transparent',
                cursor: 'pointer',
                backgroundColor: itemType === 'RAW_MATERIAL' ? 'var(--color-success-100)' : 'transparent',
                color: itemType === 'RAW_MATERIAL' ? 'var(--color-success-600)' : 'var(--color-text-secondary)',
                boxShadow: itemType === 'RAW_MATERIAL' ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              {isRu ? 'Сырьё / Материал' : 'Xomashyo'}
            </button>
            <button
              type="button"
              onClick={() => setItemType('SERVICE')}
              style={{
                flex: 1,
                padding: '8px 12px',
                fontSize: 'var(--text-xs)',
                fontWeight: itemType === 'SERVICE' ? 700 : 500,
                borderRadius: 'var(--radius-md)',
                border: itemType === 'SERVICE' ? '1px solid var(--color-warning-500)' : '1px solid transparent',
                cursor: 'pointer',
                backgroundColor: itemType === 'SERVICE' ? 'var(--color-warning-100)' : 'transparent',
                color: itemType === 'SERVICE' ? 'var(--color-warning-600)' : 'var(--color-text-secondary)',
                boxShadow: itemType === 'SERVICE' ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              {isRu ? 'Услуга' : 'Xizmat'}
            </button>
          </div>
        </div>

        {/* Product Name */}
        <div>
          <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
            {isRu ? (itemType === 'SERVICE' ? 'Наименование услуги *' : itemType === 'RAW_MATERIAL' ? 'Наименование сырья *' : 'Наименование товара *') : (itemType === 'SERVICE' ? 'Xizmat nomi *' : itemType === 'RAW_MATERIAL' ? 'Xomashyo nomi *' : 'Tovar nomi *')}
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isRu ? (itemType === 'SERVICE' ? 'Например: Доставка и логистика' : itemType === 'RAW_MATERIAL' ? 'Например: Алюминиевый профиль 60x40' : 'Например: Футболка Zara M') : (itemType === 'SERVICE' ? 'Masalan: Transport xizmati' : itemType === 'RAW_MATERIAL' ? 'Masalan: Alyumin profil 60x40' : 'Masalan: Futbolka Zara M')}
            autoFocus
          />
        </div>

        {/* SKU & Barcode */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              {isRu ? 'Артикул (SKU)' : 'Artikul (SKU)'}
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
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              {isRu ? 'Мин. остаток (оповещение)' : 'Minimal qoldiq chegarasi'}
            </label>
            <Input
              type="number"
              min="0"
              value={minStockAlert}
              onChange={(e) => setMinStockAlert(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>

        {/* Unit of Measure & Quantity */}
        <div style={{ display: 'grid', gridTemplateColumns: isEdit ? '1fr' : '1fr 1fr', gap: 'var(--space-3)' }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              {isRu ? 'Единица измерения' : 'O‘lchov birligi'}
            </label>
            <Select
              options={allUnitOptions}
              value={unitOfMeasure}
              onChange={(val) => setUnitOfMeasure(val)}
              onCreateNew={() => setShowNewUnitModal(true)}
              createNewLabel={isRu ? '+ Новая единица' : '+ Yangi'}
            />
          </div>

          {!isEdit && (
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                {getQuantityLabel()}
              </label>
              <Input
                type="number"
                min="0.001"
                step={isFractionalUnit ? 'any' : '1'}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="1"
                style={{ fontWeight: 600 }}
              />
            </div>
          )}
        </div>

        {/* Cost Price & Selling Price */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              {isRu ? 'Цена закупки (Себестоимость)' : 'Xarid narxi (Tan narx)'}
            </label>
            <Input
              type="number"
              min="0"
              step="any"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              placeholder="0"
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              {isRu ? 'Цена продажи (Опционально)' : 'Sotish narxi (Ixtiyoriy)'}
            </label>
            <Input
              type="number"
              min="0"
              step="any"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>

        {/* Multi-tier Price Lists Section */}
        {isMultiTier && priceLists.length > 0 && itemType === 'PRODUCT' && (
          <div style={{ borderTop: '1px solid var(--color-border-light)', paddingTop: 'var(--space-3)' }}>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
              {isRu ? 'Цены по категориям (Прайс-листы)' : 'Narx toifalari bo‘yicha narxlar (Pricelists)'}
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {priceLists.map((pl) => {
                const plName = typeof pl.name === 'object' ? (pl.name[locale] || pl.name.ru || pl.name.uz) : pl.name;
                return (
                  <div
                    key={pl.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 140px',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                      padding: '6px 10px',
                      backgroundColor: 'var(--color-bg-secondary)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-primary)' }}>
                        {plName}
                      </span>
                      <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: 'var(--radius-xs)', backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary-700)', fontWeight: 600 }}>
                        {pl.currency}
                      </span>
                      {pl.isDefault && (
                        <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>
                          ({isRu ? 'Осн.' : 'Asosiy'})
                        </span>
                      )}
                    </div>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={tierPrices[pl.id] || ''}
                      onChange={(e) => setTierPrices((prev) => ({ ...prev, [pl.id]: e.target.value }))}
                      placeholder={isRu ? 'Цена' : 'Narx'}
                      style={{ fontSize: 'var(--text-xs)', padding: '4px 8px' }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </form>

      <Modal
        isOpen={showNewUnitModal}
        onClose={() => {
          setShowNewUnitModal(false);
          setNewUnitName('');
          setNewUnitCode('');
        }}
        title={isRu ? 'Новая единица измерения' : 'Yangi o‘lchov birligi'}
        size="sm"
      >
        <form onSubmit={handleAddCustomUnit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-2) 0' }}>
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

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
            <Button
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
            <Button type="submit" variant="primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={16} />
              {isRu ? 'Добавить' : 'Qo‘shish'}
            </Button>
          </div>
        </form>
      </Modal>
    </Drawer>
  );
};
