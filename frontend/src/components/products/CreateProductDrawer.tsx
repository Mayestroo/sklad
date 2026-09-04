'use client';

import React, { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { PackagePlus, AlertCircle, CheckCircle2 } from 'lucide-react';

export interface CreateProductDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  initialSkuOrBarcode?: string;
  initialType?: 'PRODUCT' | 'RAW_MATERIAL' | 'SERVICE';
  onSuccess?: (createdProduct: any, initialQuantity?: number) => void;
}

export const CreateProductDrawer: React.FC<CreateProductDrawerProps> = ({
  isOpen,
  onClose,
  initialSkuOrBarcode = '',
  initialType = 'PRODUCT',
  onSuccess,
}) => {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token, company } = useAuth();

  const [itemType, setItemType] = useState<'PRODUCT' | 'RAW_MATERIAL' | 'SERVICE'>(initialType);
  const [name, setName] = useState('');
  const [unitOfMeasure, setUnitOfMeasure] = useState('piece');
  const [quantity, setQuantity] = useState<number | string>(1);
  const [costPrice, setCostPrice] = useState<number | string>('');
  const [sellingPrice, setSellingPrice] = useState<number | string>('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setItemType(initialType || 'PRODUCT');
    }
  }, [isOpen, initialType]);

  useEffect(() => {
    if (isOpen && initialSkuOrBarcode) {
      if (!/^\d{8,14}$/.test(initialSkuOrBarcode)) {
        setName(initialSkuOrBarcode);
      }
    }
  }, [isOpen, initialSkuOrBarcode]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const finalName = name.trim();
    if (!finalName) {
      setError(isRu ? 'Введите наименование товара' : 'Tovar nomini kiriting');
      return;
    }

    const numQty = parseFloat(String(quantity)) || 1;
    if (numQty <= 0) {
      setError(isRu ? 'Укажите правильное количество товара' : 'Tovar sonini to‘g‘ri kiriting');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const randomCode = Math.floor(100000 + Math.random() * 900000);
      const prefix = itemType === 'RAW_MATERIAL' ? 'RAW' : itemType === 'SERVICE' ? 'SRV' : 'PRD';
      const payload = {
        name: {
          uz: finalName,
          ru: finalName,
        },
        sku: `${prefix}-${randomCode}`,
        type: itemType,
        unitOfMeasure: unitOfMeasure || 'piece',
        costPrice: Number(costPrice) || 0,
        salePrice: Number(sellingPrice) || 0,
        minStockAlert: 0,
      };

      const res = await apiFetch('/inventory/products', {
        method: 'POST',
        token: token || undefined,
        tenantId: company?.id,
        locale,
        body: JSON.stringify(payload),
      });

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
    setUnitOfMeasure('piece');
    setQuantity(1);
    setCostPrice('');
    setSellingPrice('');
    setError(null);
  };

  const unitOptions = [
    { value: 'piece', label: isRu ? 'Штука (шт)' : 'Dona (dona)' },
    { value: 'kg', label: isRu ? 'Килограмм (кг)' : 'Kilogramm (kg)' },
    { value: 'liter', label: isRu ? 'Литр (л)' : 'Litr (l)' },
    { value: 'meter', label: isRu ? 'Метр (м)' : 'Metr (m)' },
    { value: 'box', label: isRu ? 'Коробка / Упаковка (уп)' : 'Quti / Blok' },
    { value: 'pack', label: isRu ? 'Пачка' : 'Pachka' },
  ];

  const isFractionalUnit = unitOfMeasure === 'kg' || unitOfMeasure === 'liter' || unitOfMeasure === 'meter';

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
      default:
        return isRu ? 'Количество (шт) *' : 'Soni (dona) *';
    }
  };

  const getDrawerTitle = () => {
    if (itemType === 'RAW_MATERIAL') return isRu ? 'Новое сырьё / материал' : 'Yangi Xomashyo Qo‘shish';
    if (itemType === 'SERVICE') return isRu ? 'Новая услуга' : 'Yangi Xizmat Qo‘shish';
    return isRu ? 'Новый товар' : 'Yangi Tovar Qo‘shish';
  };

  const getDrawerDescription = () => {
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
          <div style={{ display: 'flex', borderRadius: 'var(--radius-md)', padding: '3px', backgroundColor: 'var(--color-bg-subtle)', border: '1px solid var(--color-border-light)' }}>
            <button
              type="button"
              onClick={() => setItemType('PRODUCT')}
              style={{
                flex: 1,
                padding: '6px 12px',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: itemType === 'PRODUCT' ? 'var(--color-surface)' : 'transparent',
                color: itemType === 'PRODUCT' ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
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
                padding: '6px 12px',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: itemType === 'RAW_MATERIAL' ? 'var(--color-surface)' : 'transparent',
                color: itemType === 'RAW_MATERIAL' ? '#059669' : 'var(--color-text-secondary)',
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
                padding: '6px 12px',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: itemType === 'SERVICE' ? 'var(--color-surface)' : 'transparent',
                color: itemType === 'SERVICE' ? '#d97706' : 'var(--color-text-secondary)',
                boxShadow: itemType === 'SERVICE' ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              {isRu ? 'Услуга' : 'Xizmat'}
            </button>
          </div>
        </div>

        {/* Product Name (Single Unified Field) */}
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

        {/* Unit of Measure & Quantity */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              {isRu ? 'Единица измерения' : 'O‘lchov birligi'}
            </label>
            <Select
              options={unitOptions}
              value={unitOfMeasure}
              onChange={(val) => setUnitOfMeasure(val)}
            />
          </div>

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
      </form>
    </Drawer>
  );
};
