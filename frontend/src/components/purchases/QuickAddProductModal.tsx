'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, SelectOption } from '@/components/ui/Select';
import { X, Package, Sparkles } from 'lucide-react';

interface QuickAddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newProduct: {
    id: string;
    name: Record<string, string> | string;
    sku: string;
    barcode?: string;
    costPrice: number;
    salePrice?: number;
    unitOfMeasure?: string;
  }) => void;
  initialSkuOrBarcode?: string;
}

export function QuickAddProductModal({
  isOpen,
  onClose,
  onSuccess,
  initialSkuOrBarcode = '',
}: QuickAddProductModalProps) {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token, company } = useAuth();

  const [nameUz, setNameUz] = useState('');
  const [nameRu, setNameRu] = useState('');
  const [sku, setSku] = useState(initialSkuOrBarcode || '');
  const [barcode, setBarcode] = useState(initialSkuOrBarcode || '');
  const [unitOfMeasure, setUnitOfMeasure] = useState<string>('piece');
  const [costPrice, setCostPrice] = useState<number>(0);
  const [salePrice, setSalePrice] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const unitOptions: SelectOption[] = [
    { value: 'piece', label: isRu ? 'Штука (шт)' : 'Dona' },
    { value: 'kg', label: isRu ? 'Килограмм (кг)' : 'Kilogramm (kg)' },
    { value: 'liter', label: isRu ? 'Литр (л)' : 'Litr (l)' },
    { value: 'meter', label: isRu ? 'Метр (м)' : 'Metr (m)' },
    { value: 'box', label: isRu ? 'Коробка' : 'Quti' },
    { value: 'pack', label: isRu ? 'Пачка / Упаковка' : 'Paket / Qadoq' },
  ];

  const generateSku = () => {
    const random = Math.floor(1000 + Math.random() * 9000);
    setSku(`PRD-${Date.now().toString().slice(-4)}-${random}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const resolvedNameUz = nameUz.trim() || nameRu.trim();
    const resolvedNameRu = nameRu.trim() || nameUz.trim();

    if (!resolvedNameUz) {
      setError(isRu ? 'Введите наименование товара' : 'Tovar nomini kiriting');
      return;
    }
    if (!sku.trim()) {
      setError(isRu ? 'Укажите артикул (SKU)' : 'Artikul (SKU) kiritilishi shart');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const created = await apiFetch<any>('/inventory/products', {
        method: 'POST',
        token: token || undefined,
        tenantId: company?.id,
        locale,
        body: JSON.stringify({
          name: {
            uz: resolvedNameUz,
            ru: resolvedNameRu,
          },
          type: 'PRODUCT',
          sku: sku.trim(),
          barcode: barcode.trim() || undefined,
          unitOfMeasure,
          costPrice: Number(costPrice) || 0,
          salePrice: Number(salePrice) || 0,
        }),
      });

      if (created && created.id) {
        onSuccess(created);
        onClose();
        setNameUz('');
        setNameRu('');
        setSku('');
        setBarcode('');
        setCostPrice(0);
        setSalePrice(0);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : undefined;
      setError(msg || (isRu ? 'Ошибка при создании товара' : 'Tovarni saqlashda xatolik yuz berdi'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-surface dark:bg-zinc-900 rounded-2xl shadow-2xl border border-border w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-hover/30">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-text-primary text-base">
                {isRu ? 'Быстрое создание товара' : 'Yangi tovar yaratish'}
              </h3>
              <p className="text-xs text-text-muted">
                {isRu ? 'Добавьте товар в номенклатуру без выхода из формы' : 'Xarid oynasidan chiqmasdan yangi tovar ochish'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="text-text-muted hover:text-text-primary p-1.5 rounded-lg hover:bg-surface-hover transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-danger/10 border border-danger/20 rounded-xl text-danger text-sm font-medium">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                {isRu ? 'Название (O‘zbekcha) *' : 'Nomi (O‘zbekcha) *'}
              </label>
              <Input
                value={nameUz}
                onChange={(e) => setNameUz(e.target.value)}
                placeholder="Masalan: iPhone 15 128GB"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                {isRu ? 'Название (Русский)' : 'Nomi (Ruscha)'}
              </label>
              <Input
                value={nameRu}
                onChange={(e) => setNameRu(e.target.value)}
                placeholder="Например: iPhone 15 128GB"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  {isRu ? 'Артикул (SKU) *' : 'Artikul (SKU) *'}
                </label>
                <button
                  type="button"
                  onClick={generateSku}
                  className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
                >
                  <Sparkles className="w-3 h-3" />
                  {isRu ? 'Генерация' : 'Avto'}
                </button>
              </div>
              <Input
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="IP15-BLK-128"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                {isRu ? 'Штрихкод' : 'Shtrixkod'}
              </label>
              <Input
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="4780001234567"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                {isRu ? 'Ед. изм.' : 'O‘lchov birligi'}
              </label>
              <Select
                options={unitOptions}
                value={unitOfMeasure}
                onChange={(val) => setUnitOfMeasure(val)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                {isRu ? 'Цена закупки' : 'Xarid narxi'}
              </label>
              <Input
                type="number"
                min="0"
                value={costPrice || ''}
                onChange={(e) => setCostPrice(Number(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                {isRu ? 'Цена продажи' : 'Sotuv narxi'}
              </label>
              <Input
                type="number"
                min="0"
                value={salePrice || ''}
                onChange={(e) => setSalePrice(Number(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              {isRu ? 'Отмена' : 'Bekor qilish'}
            </Button>
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? (isRu ? 'Создание...' : 'Yaratilmoqda...') : isRu ? 'Создать товар' : 'Tovarni yaratish'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
