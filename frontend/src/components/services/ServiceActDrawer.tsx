'use client';

import { QuantityInput } from '@/components/ui/QuantityInput';
import { MoneyInput } from '@/components/ui/MoneyInput';
import React, { useState, useEffect, useRef } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { buildServiceActPayload } from '@/lib/service-act';
import { CURRENCY_OPTIONS, formatCurrency, errorMessage } from '@/lib/utils';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { Plus, Trash2, AlertCircle } from 'lucide-react';
import type { ServiceActDetail } from '@/lib/service-act';
import type { Counterparty, Product } from '@shared/types';
import { localIsoDate } from '@/lib/date-range';

interface ServiceActDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: ServiceActDetail | null;
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
  { value: 'service', label: 'xizmat / услуga' },
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
  const { token, company } = useAuth();

  const [type, setType] = useState<'PROVIDED' | 'RECEIVED'>(defaultType);
  const [counterpartyId, setCounterpartyId] = useState('');
  const [actDate, setActDate] = useState(localIsoDate(new Date()));
  const [currency, setCurrency] = useState(initialData?.currency || '');
  // Empty until the user enters a rate: a foreign-currency act must never default to 1
  const [exchangeRate, setExchangeRate] = useState<number | ''>('');
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

  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [servicesCatalog, setServicesCatalog] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Both endpoints return plain arrays
    apiFetch<Counterparty[]>('/sales/counterparties', {
      token: token || undefined,
      tenantId: company?.id,
      locale,
    })
      .then((res) => setCounterparties(res))
      .catch((err: Error) => setError(err.message));

    // Catalog services (products of type SERVICE)
    apiFetch<Product[]>('/inventory/products?type=SERVICE', {
      token: token || undefined,
      tenantId: company?.id,
      locale,
    })
      .then((res) => setServicesCatalog(res))
      .catch((err: Error) => setError(err.message));

    // Reset or populate initial data
    if (initialData) {
      setType(initialData.type || defaultType);
      setCounterpartyId(initialData.counterpartyId || '');
      setActDate(
        initialData.actDate
          ? new Date(initialData.actDate).toISOString().split('T')[0]
          : localIsoDate(new Date()),
      );
      setCurrency(initialData.currency || '');
      setExchangeRate(initialData.exchangeRate != null ? Number(initialData.exchangeRate) : '');
      setExternalNumber(initialData.externalNumber || '');
      setExternalDate(
        initialData.externalDate
          ? new Date(initialData.externalDate).toISOString().split('T')[0]
          : '',
      );
      setNotes(initialData.notes || '');

      if (initialData.items && initialData.items.length > 0) {
        setItems(
          initialData.items.map((i) => ({
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
      setActDate(localIsoDate(new Date()));
      setCurrency('');
      setExchangeRate('');
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

  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  // The message is at the top of a long form: bring it into view.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [error]);

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

  const handleItemChange = (idx: number, field: keyof FormItem, value: FormItem[keyof FormItem]) => {
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
    const built = buildServiceActPayload(
      { type, counterpartyId, actDate, currency, exchangeRate, externalNumber, externalDate, notes, items },
      locale,
    );
    if (!built.ok) {
      setError(built.error);
      return;
    }
    const payload = built.payload;

    setLoading(true);
    setError(null);


    try {
      if (initialData?.id) {
        await apiFetch(`/services/${initialData.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
          token: token || undefined,
          tenantId: company?.id,
          locale,
        });
      } else {
        await apiFetch('/services', {
          method: 'POST',
          body: JSON.stringify(payload),
          token: token || undefined,
          tenantId: company?.id,
          locale,
        });
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(errorMessage(err) || (isRu ? 'Не удалось сохранить акт' : 'Aktni saqlab bo‘lmadi'));
    } finally {
      setLoading(false);
    }
  };

  const counterpartyOptions = counterparties.map((c) => ({
    value: c.id,
    label: c.inn ? `${c.name} (${c.inn})` : c.name,
  }));

  const serviceCatalogOptions = [
    { value: '', label: isRu ? 'Своя услуга (ввести название)' : 'Erkin xizmat (nomini kiriting)' },
    ...servicesCatalog.map((s) => ({
      value: s.id,
      label: typeof s.name === 'object' ? (isRu ? s.name.ru || s.name.uz : s.name.uz || s.name.ru) : s.name,
    })),
  ];

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)', marginBottom: 4 };
  const money = (n: number) => (currency ? formatCurrency(n, locale, currency) : '—');

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={
        initialData?.id
          ? isRu
            ? `Акт ${initialData.actNumber}`
            : `${initialData.actNumber} akti`
          : type === 'PROVIDED'
            ? isRu ? 'Новый акт оказанных услуг' : 'Yangi ko‘rsatilgan xizmat akti'
            : isRu ? 'Новый акт полученных услуг' : 'Yangi olingan xizmat akti'
      }
      description={
        initialData?.id
          ? isRu ? 'Изменения сохраняются в черновике; проведите акт из карточки.' : 'O‘zgarishlar qoralamada saqlanadi; aktni kartochkadan tasdiqlang.'
          : isRu ? 'Сохраняется черновиком. Долг и проводки появятся после проведения.' : 'Qoralama sifatida saqlanadi. Qarz va provodkalar tasdiqlangandan keyin paydo bo‘ladi.'
      }
      size="lg"
      onSubmitShortcut={() => formRef.current?.requestSubmit()}
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', width: '100%', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            {isRu ? 'Итого: ' : 'Jami: '}
            <strong className="tabular-nums" style={{ color: 'var(--color-text-primary)' }}>{money(grandTotal)}</strong>
          </span>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              {isRu ? 'Отмена' : 'Bekor qilish'}
            </Button>
            <Button type="submit" form="service-act-form" variant="primary" loading={loading} loadingText={isRu ? 'Сохранение…' : 'Saqlanmoqda…'}>
              {initialData?.id ? (isRu ? 'Сохранить' : 'Saqlash') : isRu ? 'Сохранить черновик' : 'Qoralamani saqlash'}
            </Button>
          </div>
        </div>
      }
    >
      <form id="service-act-form" ref={formRef} onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        {error && (
          <div ref={errorRef} role="alert" className="doc-banner is-error" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={16} aria-hidden style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {!initialData?.id && (
          <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
            <legend style={labelStyle}>{isRu ? 'Вид акта' : 'Akt turi'}</legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 'var(--space-3)' }}>
              {([
                ['PROVIDED', isRu ? 'Оказали услугу клиенту' : 'Mijozga xizmat ko‘rsatdik'],
                ['RECEIVED', isRu ? 'Получили услугу от поставщика' : 'Yetkazib beruvchidan xizmat oldik'],
              ] as const).map(([value, label]) => {
                const on = type === value;
                return (
                  <label
                    key={value}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 12px', cursor: 'pointer',
                      borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', fontWeight: on ? 600 : 500,
                      border: on ? '2px solid var(--color-primary-600)' : '1px solid var(--color-border)',
                      background: on ? 'var(--color-primary-50)' : 'var(--color-bg-secondary)',
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    <input type="radio" name="service-act-type" value={value} checked={on} onChange={() => setType(value)} />
                    {label}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 'var(--space-4)' }}>
          <Select
            label={type === 'PROVIDED' ? (isRu ? 'Клиент *' : 'Mijoz *') : isRu ? 'Поставщик *' : 'Yetkazib beruvchi *'}
            options={counterpartyOptions}
            value={counterpartyId}
            searchable
            onChange={(val) => setCounterpartyId(val)}
            placeholder={type === 'PROVIDED' ? (isRu ? 'Выберите клиента' : 'Mijozni tanlang') : isRu ? 'Выберите поставщика' : 'Yetkazib beruvchini tanlang'}
          />
          <DatePicker label={isRu ? 'Дата акта *' : 'Akt sanasi *'} value={actDate} onChange={setActDate} />
          <Select
            label={isRu ? 'Валюта *' : 'Valyuta *'}
            options={CURRENCY_OPTIONS}
            value={currency}
            placeholder={isRu ? 'Выберите валюту' : 'Valyutani tanlang'}
            onChange={(val) => setCurrency(val)}
          />
          {currency && currency !== 'UZS' && (
            <div>
              <label htmlFor="service-act-rate" style={labelStyle}>{isRu ? `Курс: 1 ${currency} в UZS *` : `Kurs: 1 ${currency} = UZS *`}</label>
              <MoneyInput id="service-act-rate" value={exchangeRate} onValueChange={(value) => setExchangeRate(value === '' ? '' : Number(value))} decimals={4} placeholder="12 800" />
            </div>
          )}
          <Input
            label={isRu ? 'Номер документа контрагента' : 'Kontragent hujjati raqami'}
            type="text"
            placeholder={isRu ? 'напр. 104-СФ' : 'masalan, 104-SF'}
            value={externalNumber}
            onChange={(e) => setExternalNumber(e.target.value)}
          />
          <DatePicker label={isRu ? 'Дата документа контрагента' : 'Kontragent hujjati sanasi'} value={externalDate} onChange={setExternalDate} />
        </div>

        <section aria-labelledby="service-act-lines" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <h3 id="service-act-lines" style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)' }}>
              {isRu ? 'Услуги' : 'Xizmatlar'} ({items.length})
            </h3>
          </div>

          {items.map((item, idx) => {
            const n = idx + 1;
            return (
              <div key={idx} style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-light)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)' }}>{isRu ? `Строка ${n}` : `${n}-qator`}</span>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      aria-label={isRu ? `Удалить строку ${n}` : `${n}-qatorni o‘chirish`}
                      title={isRu ? 'Удалить строку' : 'Qatorni o‘chirish'}
                      style={{ width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 'var(--radius-sm)', background: 'transparent', color: 'var(--color-error-700)', cursor: 'pointer' }}
                    >
                      <Trash2 size={16} aria-hidden />
                    </button>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 'var(--space-3)' }}>
                  {servicesCatalog.length > 0 && (
                    <Select
                      label={isRu ? 'Из каталога' : 'Katalogdan'}
                      options={serviceCatalogOptions}
                      value={item.productId || ''}
                      searchable={servicesCatalog.length > 8}
                      onChange={(val) => handleItemChange(idx, 'productId', val)}
                    />
                  )}
                  <Input
                    label={isRu ? 'Название услуги *' : 'Xizmat nomi *'}
                    type="text"
                    placeholder={isRu ? 'напр. Перевозка груза' : 'masalan, Yuk tashish'}
                    value={item.serviceName}
                    onChange={(e) => handleItemChange(idx, 'serviceName', e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 130px), 1fr))', gap: 'var(--space-3)' }}>
                  <Select label={isRu ? 'Единица' : 'Birlik'} options={UNIT_OPTIONS} value={item.unit} onChange={(val) => handleItemChange(idx, 'unit', val)} />
                  <div>
                    <label htmlFor={`service-qty-${idx}`} style={labelStyle}>{isRu ? 'Количество *' : 'Miqdori *'}</label>
                    <QuantityInput id={`service-qty-${idx}`} unit={item.unit} value={item.quantity} onValueChange={(value) => handleItemChange(idx, 'quantity', Number(value) || 0)} />
                  </div>
                  <div>
                    <label htmlFor={`service-price-${idx}`} style={labelStyle}>{isRu ? 'Цена за единицу *' : 'Birlik narxi *'}</label>
                    <MoneyInput id={`service-price-${idx}`} value={item.unitPrice || ''} onValueChange={(value) => handleItemChange(idx, 'unitPrice', Number(value) || 0)} />
                  </div>
                  <Select
                    label={isRu ? 'НДС' : 'QQS'}
                    options={[
                      { value: '0', label: isRu ? 'Без НДС' : 'QQSsiz' },
                      { value: '12', label: isRu ? '12% НДС' : '12% QQS' },
                    ]}
                    value={String(item.vatRate)}
                    onChange={(val) => handleItemChange(idx, 'vatRate', Number(val))}
                  />
                </div>

                <Input
                  label={isRu ? 'Описание (необязательно)' : 'Tavsif (ixtiyoriy)'}
                  type="text"
                  placeholder={isRu ? 'маршрут, период, детали' : 'yo‘nalish, davr, tafsilotlar'}
                  value={item.description || ''}
                  onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                  {isRu ? 'Сумма строки: ' : 'Qator summasi: '}
                  <strong className="tabular-nums" style={{ color: 'var(--color-text-primary)', marginLeft: 4 }}>{money(calculatedRows[idx]?.total || 0)}</strong>
                </div>
              </div>
            );
          })}

          <Button type="button" variant="outline" size="sm" onClick={handleAddItem} style={{ alignSelf: 'flex-start' }}>
            <Plus size={14} aria-hidden /> {isRu ? 'Добавить услугу' : 'Xizmat qo‘shish'}
          </Button>
        </section>

        <div>
          <label htmlFor="service-act-notes" style={labelStyle}>{isRu ? 'Комментарий' : 'Izoh'}</label>
          <textarea
            id="service-act-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg-input)', color: 'var(--color-text-primary)', resize: 'vertical' }}
          />
        </div>

        <dl style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', background: 'var(--color-bg-tertiary)', display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px 12px', fontSize: 'var(--text-sm)' }}>
          <dt style={{ color: 'var(--color-text-secondary)' }}>{isRu ? 'Без НДС' : 'QQSsiz'}</dt>
          <dd className="tabular-nums" style={{ textAlign: 'right' }}>{money(totalSubtotal)}</dd>
          <dt style={{ color: 'var(--color-text-secondary)' }}>{isRu ? 'НДС' : 'QQS'}</dt>
          <dd className="tabular-nums" style={{ textAlign: 'right' }}>{money(totalVat)}</dd>
          <dt style={{ fontWeight: 'var(--font-semibold)', borderTop: '1px solid var(--color-border)', paddingTop: 6 }}>{isRu ? 'Итого' : 'Jami'}</dt>
          <dd className="tabular-nums" style={{ textAlign: 'right', fontWeight: 'var(--font-bold)', borderTop: '1px solid var(--color-border)', paddingTop: 6 }}>{money(grandTotal)}</dd>
        </dl>
      </form>
    </Drawer>
  );
}
