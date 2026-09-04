'use client';

import React, { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { CURRENCY_OPTIONS, formatCurrency } from '@/lib/utils';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Plus, Trash2, AlertCircle } from 'lucide-react';

interface ServiceActDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: any;
  defaultType?: 'PROVIDED' | 'RECEIVED';
}

interface FormItem {
  id?: string;
  productId?: string;
  serviceName: string;
  description?: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
}

const UNIT_OPTIONS = [
  { value: 'piece', label: 'dona / шт' },
  { value: 'hour', label: 'soat / час' },
  { value: 'km', label: 'km / км' },
  { value: 'trip', label: 'reys / рейс' },
  { value: 'month', label: 'oy / месяц' },
  { value: 'sq_m', label: 'm² / кв.м' },
  { value: 'service', label: 'xizmat / услуга' },
];

export function ServiceActDrawer({
  isOpen,
  onClose,
  onSuccess,
  initialData,
  defaultType = 'PROVIDED',
}: ServiceActDrawerProps) {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  const [type, setType] = useState<'PROVIDED' | 'RECEIVED'>(defaultType);
  const [counterpartyId, setCounterpartyId] = useState('');
  const [actDate, setActDate] = useState(new Date().toISOString().split('T')[0]);
  const [currency, setCurrency] = useState('UZS');
  const [exchangeRate, setExchangeRate] = useState(1.0);
  const [externalNumber, setExternalNumber] = useState('');
  const [externalDate, setExternalDate] = useState('');
  const [notes, setNotes] = useState('');

  const [items, setItems] = useState<FormItem[]>([
    {
      serviceName: '',
      description: '',
      unit: 'piece',
      quantity: 1,
      unitPrice: 0,
      vatRate: 0,
    },
  ]);

  const [counterparties, setCounterparties] = useState<any[]>([]);
  const [servicesCatalog, setServicesCatalog] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Fetch counterparties
    apiFetch<{ items: any[] }>('/sales/counterparties')
      .then((res) => {
        if (res && res.items) {
          setCounterparties(res.items);
        }
      })
      .catch(() => {});

    // Fetch catalog services (Product with type SERVICE)
    apiFetch<{ items: any[] }>('/products?type=SERVICE&limit=100')
      .then((res) => {
        if (res && res.items) {
          setServicesCatalog(res.items);
        }
      })
      .catch(() => {});

    // Reset or populate initial data
    if (initialData) {
      setType(initialData.type || defaultType);
      setCounterpartyId(initialData.counterpartyId || '');
      setActDate(
        initialData.actDate
          ? new Date(initialData.actDate).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0],
      );
      setCurrency(initialData.currency || 'UZS');
      setExchangeRate(Number(initialData.exchangeRate) || 1.0);
      setExternalNumber(initialData.externalNumber || '');
      setExternalDate(
        initialData.externalDate
          ? new Date(initialData.externalDate).toISOString().split('T')[0]
          : '',
      );
      setNotes(initialData.notes || '');

      if (initialData.items && initialData.items.length > 0) {
        setItems(
          initialData.items.map((i: any) => ({
            productId: i.productId || undefined,
            serviceName: i.serviceName || '',
            description: i.description || '',
            unit: i.unit || 'piece',
            quantity: Number(i.quantity) || 1,
            unitPrice: Number(i.unitPrice) || 0,
            vatRate: Number(i.vatRate) || 0,
          })),
        );
      }
    } else {
      setType(defaultType);
      setCounterpartyId('');
      setActDate(new Date().toISOString().split('T')[0]);
      setCurrency('UZS');
      setExchangeRate(1.0);
      setExternalNumber('');
      setExternalDate('');
      setNotes('');
      setItems([
        {
          serviceName: '',
          description: '',
          unit: 'piece',
          quantity: 1,
          unitPrice: 0,
          vatRate: 0,
        },
      ]);
    }
    setError(null);
  }, [isOpen, initialData, defaultType]);

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        serviceName: '',
        description: '',
        unit: 'piece',
        quantity: 1,
        unitPrice: 0,
        vatRate: 0,
      },
    ]);
  };

  const handleRemoveItem = (idx: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== idx));
  };

  const handleItemChange = (idx: number, field: keyof FormItem, value: any) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], [field]: value };

    // If selecting a catalog service, auto-fill unitPrice and unit
    if (field === 'productId' && value) {
      const found = servicesCatalog.find((s) => s.id === value);
      if (found) {
        const nameUz = typeof found.name === 'object' ? found.name.uz || found.name.ru : found.name;
        updated[idx].serviceName = nameUz || updated[idx].serviceName;
        updated[idx].unitPrice = Number(found.salePrice) || Number(found.costPrice) || 0;
        updated[idx].vatRate = Number(found.vatRate) || 0;
        if (found.unitOfMeasure) {
          updated[idx].unit = found.unitOfMeasure;
        }
      }
    }

    setItems(updated);
  };

  // Calculations
  const calculatedRows = items.map((item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unitPrice) || 0;
    const subtotal = qty * price;
    const vatRate = Number(item.vatRate) || 0;
    const vatAmount = (subtotal * vatRate) / 100;
    const total = subtotal + vatAmount;
    return { subtotal, vatAmount, total };
  });

  const totalSubtotal = calculatedRows.reduce((s, r) => s + r.subtotal, 0);
  const totalVat = calculatedRows.reduce((s, r) => s + r.vatAmount, 0);
  const grandTotal = calculatedRows.reduce((s, r) => s + r.total, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!counterpartyId) {
      setError(isRu ? 'Пожалуйста, выберите контрагента' : 'Iltimos, kontragentni tanlang');
      return;
    }

    for (const it of items) {
      if (!it.serviceName.trim()) {
        setError(isRu ? 'Наименование услуги обязательно для всех строк' : 'Barcha qatorlarda xizmat nomi kiritilishi shart');
        return;
      }
    }

    setLoading(true);
    setError(null);

    const payload = {
      type,
      counterpartyId,
      actDate,
      currency,
      exchangeRate: Number(exchangeRate) || 1.0,
      externalNumber: externalNumber.trim() || undefined,
      externalDate: externalDate || undefined,
      notes: notes.trim() || undefined,
      items: items.map((it) => ({
        productId: it.productId || undefined,
        serviceName: it.serviceName.trim(),
        description: it.description?.trim() || undefined,
        unit: it.unit || 'piece',
        quantity: Number(it.quantity) || 1,
        unitPrice: Number(it.unitPrice) || 0,
        vatRate: Number(it.vatRate) || 0,
      })),
    };

    try {
      if (initialData?.id) {
        await apiFetch(`/services/${initialData.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/services', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  const counterpartyOptions = counterparties.map((c) => ({
    value: c.id,
    label: `${c.name} ${c.inn ? `(${c.inn})` : ''}`,
  }));

  const serviceCatalogOptions = [
    { value: '', label: isRu ? '-- Пользовательская услуга --' : '-- Erkin xizmat nomi --' },
    ...servicesCatalog.map((s) => ({
      value: s.id,
      label: typeof s.name === 'object' ? s.name.uz || s.name.ru : s.name,
    })),
  ];

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={
        initialData?.id
          ? isRu
            ? `Редактирование акта ${initialData.actNumber}`
            : `Xizmat aktini tahrirlash ${initialData.actNumber}`
          : type === 'PROVIDED'
          ? isRu
            ? 'Новый акт оказанных услуг'
            : 'Yangi ko\'rsatilgan xizmat akti'
          : isRu
          ? 'Новый акт полученных услуг'
          : 'Yangi olingan xizmat akti'
      }
      size="lg"
    >
      <form onSubmit={handleSubmit} className="flex flex-col h-full space-y-6 pb-6">
        {error && (
          <div className="flex items-center gap-2 p-3 text-sm text-red-700 bg-red-50 rounded-md border border-red-200">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Type selector if creating new */}
        {!initialData?.id && (
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-2">
              {isRu ? 'Тип акта' : 'Xizmat turi'}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setType('PROVIDED')}
                className={`py-2 px-3 text-sm rounded-md font-medium border text-center transition-all ${
                  type === 'PROVIDED'
                    ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {isRu ? 'Оказанная услуга (клиенту)' : 'Ko\'rsatilgan xizmat (mijozga)'}
              </button>
              <button
                type="button"
                onClick={() => setType('RECEIVED')}
                className={`py-2 px-3 text-sm rounded-md font-medium border text-center transition-all ${
                  type === 'RECEIVED'
                    ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {isRu ? 'Полученная услуга (от поставщика)' : 'Olingan xizmat (yetkazib beruvchidan)'}
              </button>
            </div>
          </div>
        )}

        {/* Header Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {type === 'PROVIDED'
                ? isRu
                  ? 'Клиент *'
                  : 'Mijoz (Kontragent) *'
                : isRu
                ? 'Поставщик / Исполнитель *'
                : 'Yetkazib beruvchi / Hamkor *'}
            </label>
            <Select
              options={counterpartyOptions}
              value={counterpartyId}
              onChange={(val) => setCounterpartyId(val)}
              placeholder={isRu ? 'Выберите контрагента' : 'Kontragentni tanlang'}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {isRu ? 'Дата акта *' : 'Akt sanasi *'}
            </label>
            <Input
              type="date"
              value={actDate}
              onChange={(e) => setActDate(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {isRu ? 'Валюта' : 'Valyuta'}
            </label>
            <Select
              options={CURRENCY_OPTIONS}
              value={currency}
              onChange={(val) => setCurrency(val)}
            />
          </div>

          {currency !== 'UZS' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                {isRu ? 'Курс валюты' : 'Valyuta kursi'}
              </label>
              <Input
                type="number"
                step="0.0001"
                min="0.0001"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(Number(e.target.value))}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {isRu ? 'Внешний № счета / акта' : 'Tashqi akt / schet №'}
            </label>
            <Input
              type="text"
              placeholder="e.g. 104-SF"
              value={externalNumber}
              onChange={(e) => setExternalNumber(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {isRu ? 'Дата внешнего акта' : 'Tashqi akt sanasi'}
            </label>
            <Input
              type="date"
              value={externalDate}
              onChange={(e) => setExternalDate(e.target.value)}
            />
          </div>
        </div>

        {/* Line Items Table */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 uppercase">
              {isRu ? 'Позиции услуг' : 'Xizmat qatorlari'}
            </h3>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleAddItem}
              className="flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              {isRu ? 'Добавить строку' : 'Qator qo\'shish'}
            </Button>
          </div>

          <div className="space-y-4">
            {items.map((item, idx) => (
              <div
                key={idx}
                className="p-4 rounded-lg bg-gray-50 border border-gray-200 space-y-3 relative group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-500">#{idx + 1}</span>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="text-red-500 hover:text-red-700 p-1"
                      title={isRu ? 'Удалить' : 'O\'chirish'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {servicesCatalog.length > 0 && (
                    <div>
                      <label className="block text-[11px] font-medium text-gray-600 mb-1">
                        {isRu ? 'Из каталога' : 'Katalogdan tanlash'}
                      </label>
                      <Select
                        options={serviceCatalogOptions}
                        value={item.productId || ''}
                        onChange={(val) => handleItemChange(idx, 'productId', val)}
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 mb-1">
                      {isRu ? 'Наименование услуги *' : 'Xizmat nomi *'}
                    </label>
                    <Input
                      type="text"
                      placeholder="e.g. Yuk tashish / Ofis ijarasi"
                      value={item.serviceName}
                      onChange={(e) => handleItemChange(idx, 'serviceName', e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 mb-1">
                      {isRu ? 'Ед. изм.' : 'Birlik'}
                    </label>
                    <Select
                      options={UNIT_OPTIONS}
                      value={item.unit}
                      onChange={(val) => handleItemChange(idx, 'unit', val)}
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 mb-1">
                      {isRu ? 'Количество *' : 'Miqdori *'}
                    </label>
                    <Input
                      type="number"
                      step="0.001"
                      min="0.001"
                      value={item.quantity}
                      onChange={(e) =>
                        handleItemChange(idx, 'quantity', parseFloat(e.target.value) || 0)
                      }
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 mb-1">
                      {isRu ? 'Цена за ед. *' : 'Birlik narxi *'}
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.unitPrice}
                      onChange={(e) =>
                        handleItemChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)
                      }
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 mb-1">
                      {isRu ? 'НДС (%)' : 'QQS (%)'}
                    </label>
                    <Select
                      options={[
                        { value: '0', label: '0% (QQSsiz)' },
                        { value: '12', label: '12% QQS' },
                      ]}
                      value={String(item.vatRate)}
                      onChange={(val) => handleItemChange(idx, 'vatRate', Number(val))}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-600 mb-1">
                    {isRu ? 'Дополнительное описание / маршрут' : 'Batafsil tavsif / tafsilotlar'}
                  </label>
                  <Input
                    type="text"
                    placeholder={isRu ? 'Описание услуги...' : 'Tafsilotlar...'}
                    value={item.description || ''}
                    onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                  />
                </div>

                <div className="flex justify-end pt-1 text-xs text-gray-700">
                  <span className="font-semibold">
                    {isRu ? 'Итого по строке: ' : 'Qator summasi: '}
                    {formatCurrency(calculatedRows[idx]?.total || 0, locale, currency)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            {isRu ? 'Примечание / Комментарий' : 'Umumiy izoh'}
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder={isRu ? 'Дополнительные заметки...' : 'Qo\'shimcha ma\'lumotlar...'}
          />
        </div>

        {/* Summary Card */}
        <div className="p-4 rounded-lg bg-blue-50/50 border border-blue-100 space-y-2 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>{isRu ? 'Сумма без НДС:' : 'QQSsiz summa:'}</span>
            <span className="font-medium">{formatCurrency(totalSubtotal, locale, currency)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>{isRu ? 'НДС:' : 'QQS summasi:'}</span>
            <span className="font-medium">{formatCurrency(totalVat, locale, currency)}</span>
          </div>
          <div className="flex justify-between text-gray-900 font-bold text-base border-t border-blue-200 pt-2">
            <span>{isRu ? 'ИТОГО К НАЧИСЛЕНИЮ:' : 'JAMI SUMMA:'}</span>
            <span className="text-blue-700">{formatCurrency(grandTotal, locale, currency)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 mt-auto">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            {isRu ? 'Отмена' : 'Bekor qilish'}
          </Button>
          <Button type="submit" variant="primary" disabled={loading}>
            {loading
              ? isRu
                ? 'Сохранение...'
                : 'Saqlanmoqda...'
              : initialData?.id
              ? isRu
                ? 'Сохранить изменения'
                : 'O\'zgarishlarni saqlash'
              : isRu
              ? 'Сохранить как черновик'
              : 'Qoralama sifatida saqlash'}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}
