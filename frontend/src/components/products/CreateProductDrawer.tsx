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
  onSuccess?: (createdProduct: any, initialQuantity?: number) => void;
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

  const [name, setName] = useState('');
  const [unitOfMeasure, setUnitOfMeasure] = useState('piece');
  const [quantity, setQuantity] = useState<number | string>(1);
  const [costPrice, setCostPrice] = useState<number | string>('');
  const [sellingPrice, setSellingPrice] = useState<number | string>('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const payload = {
        name: {
          uz: finalName,
          ru: finalName,
        },
        sku: `PRD-${randomCode}`,
        type: 'PRODUCT',
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
      setError(err?.message || (isRu ? 'Ошибка сохранения товара' : 'Tovarni saqlashda xatolik'));
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

  return (
    <Drawer
      isOpen={isOpen}
      onClose={() => {
        resetForm();
        onClose();
      }}
      title={isRu ? 'Новый товар' : 'Yangi Tovar Qo‘shish'}
      description={
        isRu
          ? 'Быстрое добавление нового товара в каталог и документ'
          : 'Yangi tovar, miqdori va narxlarini tezkor kiritish'
      }
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
        {/* Product Name (Single Unified Field) */}
        <div>
          <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
            {isRu ? 'Наименование товара *' : 'Tovar nomi *'}
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isRu ? 'Например: Футболка Zara M' : 'Masalan: Erkaklar futbolkasi Zara M'}
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
