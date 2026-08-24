'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { formatCurrency, CURRENCY_OPTIONS } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, SelectOption } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { Plus, Trash2, AlertTriangle, UserCheck } from 'lucide-react';

interface CounterpartyOption {
  id: string;
  name: string;
}
interface ProductOption {
  id: string;
  name: any;
  sku: string;
  salePrice: number;
  costPrice: number;
  unitOfMeasure: string;
}
interface SellerOption {
  id: string;
  firstName: string;
  lastName: string;
}

interface OrderItemRow {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  _name: string;
  _unitOfMeasure: string;
}

interface CreateSalesOrderModalProps {
  onClose: () => void;
  onCreated: () => void;
  counterparties: CounterpartyOption[];
}

export function CreateSalesOrderModal({
  onClose,
  onCreated,
  counterparties,
}: CreateSalesOrderModalProps) {
  const { token, company } = useAuth();
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [sellers, setSellers] = useState<SellerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [counterpartyId, setCounterpartyId] = useState(counterparties[0]?.id || '');
  const [currency, setCurrency] = useState('UZS');
  const [exchangeRate, setExchangeRate] = useState(1);
  const [paymentCondition, setPaymentCondition] = useState<'PREPAID_100' | 'PARTIAL' | 'CREDIT'>('PREPAID_100');
  const [requiredPaymentPercent, setRequiredPaymentPercent] = useState<number>(50);
  const [deliveryDate, setDeliveryDate] = useState<string>('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [assignedSellerId, setAssignedSellerId] = useState('');
  const [comment, setComment] = useState('');

  // Line items
  const [items, setItems] = useState<OrderItemRow[]>([]);

  // Fetch products and sellers
  useEffect(() => {
    if (!token || !company) return;

    apiFetch<ProductOption[]>('/inventory/products', {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then((res) => setProducts(res || []))
      .catch(console.error);

    apiFetch<{ data: any[] }>('/users', {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then((res) => {
        const userList = (res?.data || res || []).map((u: any) => ({
          id: u.id,
          firstName: u.firstName,
          lastName: u.lastName,
        }));
        setSellers(userList);
      })
      .catch(console.error);
  }, [token, company, locale]);

  const addItemRow = () => {
    if (products.length === 0) return;
    const first = products[0];
    const productName = typeof first.name === 'object' ? (first.name[locale] || first.name.uz || '') : first.name;
    setItems((prev) => [
      ...prev,
      {
        productId: first.id,
        quantity: 1,
        unitPrice: Number(first.salePrice) || 0,
        discount: 0,
        _name: productName,
        _unitOfMeasure: first.unitOfMeasure || 'dona',
      },
    ]);
  };

  const updateItem = (index: number, patch: Partial<OrderItemRow>) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      if (patch.productId) {
        const p = products.find((x) => x.id === patch.productId);
        if (p) {
          const name = typeof p.name === 'object' ? (p.name[locale] || p.name.uz || '') : p.name;
          next[index]._name = name;
          next[index].unitPrice = Number(p.salePrice) || 0;
          next[index]._unitOfMeasure = p.unitOfMeasure || 'dona';
        }
      }
      return next;
    });
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Calculations
  const subtotal = items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
  const discountTotal = items.reduce((sum, it) => sum + (Number(it.discount) || 0), 0);
  const totalAmount = Math.max(0, subtotal - discountTotal);

  const handleSubmit = async () => {
    if (!counterpartyId) {
      setError(isRu ? 'Выберите контрагента' : 'Mijozni tanlang');
      return;
    }
    if (items.length === 0) {
      setError(isRu ? 'Добавьте хотя бы один товар' : 'Kamida bitta mahsulot qo‘shing');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await apiFetch('/api/sales/orders', {
        method: 'POST',
        token: token || undefined,
        tenantId: company?.id,
        locale,
        body: JSON.stringify({
          counterpartyId,
          currency,
          exchangeRate: Number(exchangeRate) || 1,
          paymentCondition,
          requiredPaymentPercent:
            paymentCondition === 'PARTIAL' ? Number(requiredPaymentPercent) : undefined,
          deliveryDate: deliveryDate || undefined,
          deliveryAddress: deliveryAddress || undefined,
          assignedSellerId: assignedSellerId || undefined,
          comment: comment || undefined,
          items: items.map((it) => ({
            productId: it.productId,
            quantity: Number(it.quantity),
            unitPrice: Number(it.unitPrice),
            discount: Number(it.discount) || 0,
          })),
        }),
      });

      onCreated();
      onClose();
    } catch (err: any) {
      setError(err?.message || (isRu ? 'Ошибка при создании заказа' : 'Zakaz yaratishda xatolik yuz berdi'));
    } finally {
      setLoading(false);
    }
  };

  const counterpartyOptions: SelectOption[] = counterparties.map((c) => ({
    value: c.id,
    label: c.name,
  }));

  const sellerOptions: SelectOption[] = [
    { value: '', label: isRu ? '— Выберите продавца —' : '— Sotuvchini tanlang —' },
    ...sellers.map((s) => ({
      value: s.id,
      label: `${s.firstName} ${s.lastName}`,
    })),
  ];

  const productOptions: SelectOption[] = products.map((p) => {
    const name = typeof p.name === 'object' ? (p.name[locale] || p.name.uz || '') : p.name;
    return {
      value: p.id,
      label: `${name} (${p.sku})`,
    };
  });

  const paymentConditionOptions: SelectOption[] = [
    { value: 'PREPAID_100', label: isRu ? '100% предоплата' : '100% oldindan to‘lov' },
    { value: 'PARTIAL', label: isRu ? 'Частичная предоплата' : 'Qisman oldindan to‘lov' },
    { value: 'CREDIT', label: isRu ? 'В долг / Постоплата' : 'Nasiya / Qarzga' },
  ];

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={isRu ? 'Новый заказ (Заявка)' : 'Yangi zakaz (Buyurtma)'}
      size="xl"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacing-sm)',
              padding: 'var(--spacing-sm) var(--spacing-md)',
              backgroundColor: 'var(--color-error-light)',
              color: 'var(--color-error)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-sm)',
            }}
          >
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        {/* Top form fields */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 'var(--spacing-md)',
          }}
        >
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
              {isRu ? 'Клиент / Контрагент *' : 'Mijoz / Kontragent *'}
            </label>
            <Select
              options={counterpartyOptions}
              value={counterpartyId}
              onChange={(val) => setCounterpartyId(val)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
              {isRu ? 'Условие оплаты' : 'To‘lov sharti'}
            </label>
            <Select
              options={paymentConditionOptions}
              value={paymentCondition}
              onChange={(val) => setPaymentCondition(val as any)}
            />
          </div>

          {paymentCondition === 'PARTIAL' && (
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
                {isRu ? 'Требуемый аванс (%)' : 'Kerakli oldindan to‘lov (%)'}
              </label>
              <Input
                type="number"
                min="1"
                max="99"
                value={requiredPaymentPercent}
                onChange={(e) => setRequiredPaymentPercent(Number(e.target.value))}
              />
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
              {isRu ? 'Срок поставки / готовности' : 'Yetkazib berish muddati'}
            </label>
            <Input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
              {isRu ? 'Ответственный продавец' : 'Mas‘ul sotuvchi'}
            </label>
            <Select
              options={sellerOptions}
              value={assignedSellerId}
              onChange={(val) => setAssignedSellerId(val)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
              {isRu ? 'Валюта' : 'Valyuta'}
            </label>
            <Select
              options={CURRENCY_OPTIONS}
              value={currency}
              onChange={(val) => setCurrency(val)}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-md)' }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
              {isRu ? 'Адрес доставки' : 'Yetkazib berish manzili'}
            </label>
            <Input
              placeholder={isRu ? 'г. Ташкент, ул. ...' : 'Toshkent sh., ...'}
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
              {isRu ? 'Комментарий / Примечание' : 'Izoh / Eslatma'}
            </label>
            <Input
              placeholder={isRu ? 'Спецификация заказа...' : 'Zakaz talablari...'}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
        </div>

        {/* Items Section */}
        <div style={{ borderTop: '1px solid var(--color-border-light)', paddingTop: 'var(--spacing-md)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-sm)' }}>
            <h4 style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 600 }}>
              {isRu ? 'Заказанные товары' : 'Buyurtma qilingan tovarlar'}
            </h4>
            <Button variant="secondary" size="sm" onClick={addItemRow}>
              <Plus size={14} style={{ marginRight: '4px' }} />
              {isRu ? 'Добавить товар' : 'Tovar qo‘shish'}
            </Button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-light)', color: 'var(--color-text-secondary)', textAlign: 'left' }}>
                  <th style={{ padding: '8px', width: '35%' }}>{isRu ? 'Товар' : 'Mahsulot'}</th>
                  <th style={{ padding: '8px', width: '15%' }}>{isRu ? 'Количество' : 'Miqdor'}</th>
                  <th style={{ padding: '8px', width: '20%' }}>{isRu ? 'Цена за ед.' : 'Birlik narxi'}</th>
                  <th style={{ padding: '8px', width: '15%' }}>{isRu ? 'Скидка' : 'Chegirma'}</th>
                  <th style={{ padding: '8px', width: '15%', textAlign: 'right' }}>{isRu ? 'Итого' : 'Jami'}</th>
                  <th style={{ padding: '8px', width: '40px' }}></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-secondary)' }}>
                      {isRu ? 'Список товаров пуст. Нажмите "Добавить товар"' : 'Tovar qo‘shilmagan. "Tovar qo‘shish" tugmasini bosing'}
                    </td>
                  </tr>
                ) : (
                  items.map((row, idx) => {
                    const lineSub = row.quantity * row.unitPrice;
                    const lineTotal = Math.max(0, lineSub - row.discount);
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                        <td style={{ padding: '8px' }}>
                          <Select
                            options={productOptions}
                            value={row.productId}
                            onChange={(val) => updateItem(idx, { productId: val })}
                          />
                        </td>
                        <td style={{ padding: '8px' }}>
                          <Input
                            type="number"
                            min="1"
                            value={row.quantity}
                            onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                          />
                        </td>
                        <td style={{ padding: '8px' }}>
                          <Input
                            type="number"
                            min="0"
                            value={row.unitPrice}
                            onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) })}
                          />
                        </td>
                        <td style={{ padding: '8px' }}>
                          <Input
                            type="number"
                            min="0"
                            value={row.discount}
                            onChange={(e) => updateItem(idx, { discount: Number(e.target.value) })}
                          />
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>
                          {formatCurrency(lineTotal, currency)}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--color-error)',
                              cursor: 'pointer',
                              padding: '4px',
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          {items.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                marginTop: 'var(--spacing-md)',
                gap: '4px',
                fontSize: 'var(--text-sm)',
              }}
            >
              <div>
                <span style={{ color: 'var(--color-text-secondary)', marginRight: '16px' }}>
                  {isRu ? 'Подытог:' : 'Oraliq summa:'}
                </span>
                <span>{formatCurrency(subtotal, currency)}</span>
              </div>
              {discountTotal > 0 && (
                <div>
                  <span style={{ color: 'var(--color-text-secondary)', marginRight: '16px' }}>
                    {isRu ? 'Скидка:' : 'Chegirma:'}
                  </span>
                  <span style={{ color: 'var(--color-error)' }}>-{formatCurrency(discountTotal, currency)}</span>
                </div>
              )}
              <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, marginTop: '4px' }}>
                <span style={{ marginRight: '16px' }}>{isRu ? 'Итоговая сумма:' : 'Jami buyurtma summasi:'}</span>
                <span style={{ color: 'var(--color-primary)' }}>{formatCurrency(totalAmount, currency)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 'var(--spacing-sm)',
            marginTop: 'var(--spacing-md)',
            borderTop: '1px solid var(--color-border-light)',
            paddingTop: 'var(--spacing-md)',
          }}
        >
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {isRu ? 'Отмена' : 'Bekor qilish'}
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={loading || items.length === 0}>
            {loading ? (isRu ? 'Сохранение...' : 'Saqlanmoqda...') : isRu ? 'Создать заказ' : 'Zakaz yaratish'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
