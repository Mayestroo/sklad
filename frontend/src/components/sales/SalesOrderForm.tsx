'use client';

import { useState, useEffect, useMemo } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { DatePicker } from '@/components/ui/DatePicker';
import { Select, SelectOption } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDate, CURRENCY_OPTIONS } from '@/lib/utils';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  Send,
  Truck,
  RotateCcw,
  Printer,
  CreditCard,
  Barcode,
  Search,
  AlertCircle,
  AlertTriangle,
  UserPlus,
  PackagePlus,
  Building2,
  Factory,
  PackageCheck,
  CheckCheck,
  XCircle,
  Percent,
  Clock,
} from 'lucide-react';
import { PaySalesOrderModal } from './PaySalesOrderModal';
import { QuickAddCustomerModal } from './QuickAddCustomerModal';
import { QuickAddProductModal } from '@/components/purchases/QuickAddProductModal';
import { CustomerProfileDrawer } from './CustomerProfileDrawer';

export const ORDER_STATUS_LABELS: Record<string, { uz: string; ru: string; variant: 'neutral' | 'info' | 'warning' | 'success' | 'error' }> = {
  NEW: { uz: 'Yangi', ru: 'Новый', variant: 'neutral' },
  PENDING_APPROVAL: { uz: 'Tasdiqlashda', ru: 'На согласовании', variant: 'warning' },
  APPROVED: { uz: 'Tasdiqlangan', ru: 'Согласован', variant: 'info' },
  SENT_TO_PRODUCTION: { uz: 'Ishlab chiqarishga yuborilgan', ru: 'Передан в пр-во', variant: 'info' },
  IN_PRODUCTION: { uz: 'Ishlab chiqarilmoqda', ru: 'В производстве', variant: 'warning' },
  PARTIALLY_READY: { uz: 'Qisman tayyor', ru: 'Частично готов', variant: 'warning' },
  READY: { uz: 'Tayyor', ru: 'Готов', variant: 'success' },
  AWAITING_PAYMENT: { uz: 'To‘lov kutilmoqda', ru: 'Ожидает оплаты', variant: 'warning' },
  PAYMENT_CONFIRMED: { uz: 'To‘lov tasdiqlandi', ru: 'Оплата подтверждена', variant: 'success' },
  READY_TO_SHIP: { uz: 'Jo‘natishga tayyor', ru: 'Готов к отгрузке', variant: 'success' },
  SHIPPED: { uz: 'Jo‘natilgan', ru: 'Отгружен', variant: 'success' },
  COMPLETED: { uz: 'Bajarildi', ru: 'Завершён', variant: 'success' },
  CANCELLED: { uz: 'Bekor qilingan', ru: 'Отменён', variant: 'error' },
};

interface CounterpartyOption {
  id: string;
  name: string;
  phone?: string;
  debtBalance?: number;
}

interface ProductOption {
  id: string;
  name: string | Record<string, string>;
  sku: string;
  salePrice: number;
  costPrice: number;
  unitOfMeasure?: string;
}

interface SellerOption {
  id: string;
  firstName: string;
  lastName: string;
}

interface WarehouseOption {
  id: string;
  name: string | Record<string, string>;
}

interface OrderItemRow {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  readyQty?: number;
}

interface SalesOrderFormProps {
  initialData?: any | null;
  mode: 'create' | 'edit';
}

export function SalesOrderForm({ initialData, mode }: SalesOrderFormProps) {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token, company } = useAuth();
  const router = useRouter();

  // Dropdown lists
  const [counterparties, setCounterparties] = useState<CounterpartyOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [sellers, setSellers] = useState<SellerOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);

  // Order state
  const [orderId, setOrderId] = useState<string | null>(initialData?.id || null);
  const [orderNumber, setOrderNumber] = useState<string>(initialData?.orderNumber || '');
  const [orderStatus, setOrderStatus] = useState<string>(initialData?.status || 'NEW');
  const [counterpartyId, setCounterpartyId] = useState(initialData?.counterpartyId || '');
  const [currency, setCurrency] = useState(initialData?.currency || 'UZS');
  const [exchangeRate, setExchangeRate] = useState(Number(initialData?.exchangeRate) || 1);
  const [paymentCondition, setPaymentCondition] = useState<'PREPAID_100' | 'PARTIAL' | 'CREDIT'>(
    initialData?.paymentCondition || 'PREPAID_100'
  );
  const [requiredPaymentPercent, setRequiredPaymentPercent] = useState<number>(
    Number(initialData?.requiredPaymentPercent) || 50
  );
  const [assignedSellerId, setAssignedSellerId] = useState(initialData?.assignedSellerId || '');
  const [deliveryDate, setDeliveryDate] = useState(
    initialData?.deliveryDate ? initialData.deliveryDate.slice(0, 10) : ''
  );
  const [deliveryAddress, setDeliveryAddress] = useState(initialData?.deliveryAddress || '');
  const [comment, setComment] = useState(initialData?.comment || '');
  const [dispatchWarehouseId, setDispatchWarehouseId] = useState('');

  // Line items
  const [items, setItems] = useState<OrderItemRow[]>(
    initialData?.items && initialData.items.length > 0
      ? initialData.items.map((i: any) => ({
          productId: i.productId,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
          discount: Number(i.discount) || 0,
          readyQty: Number(i.readyQty || 0),
        }))
      : [{ productId: '', quantity: 1, unitPrice: 0, discount: 0, readyQty: 0 }]
  );

  // States
  const [currentOrderData, setCurrentOrderData] = useState<any | null>(initialData || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [isPayOpen, setIsPayOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isCustomerDrawerOpen, setIsCustomerDrawerOpen] = useState(false);

  const isLocked = orderStatus !== 'NEW' && orderStatus !== 'PENDING_APPROVAL';

  const getLocalizedName = (name: any) => {
    if (!name) return '—';
    if (typeof name === 'string') return name;
    return name[locale] || name.ru || name.uz || Object.values(name)[0] || '—';
  };

  // Fetch dropdown data
  const fetchDropdowns = async () => {
    if (!token || !company) return;

    try {
      const [cpRes, prdRes, usrRes, whRes] = await Promise.all([
        apiFetch<any>('/counterparties', { token, tenantId: company.id, locale }),
        apiFetch<any>('/inventory/products', { token, tenantId: company.id, locale }),
        apiFetch<any>('/users', { token, tenantId: company.id, locale }),
        apiFetch<any>('/inventory/warehouses', { token, tenantId: company.id, locale }),
      ]);

      const cpList = cpRes?.data || cpRes || [];
      setCounterparties(cpList);
      if (!counterpartyId && cpList.length > 0 && mode === 'create') {
        setCounterpartyId(cpList[0].id);
      }

      const prdList = (prdRes?.data || prdRes || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        salePrice: Number(p.salePrice) || 0,
        costPrice: Number(p.costPrice) || 0,
        unitOfMeasure: p.unitOfMeasure || 'dona',
      }));
      setProducts(prdList);

      const userList = (usrRes?.data || usrRes || []).map((u: any) => ({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
      }));
      setSellers(userList);

      const whList = whRes?.data || whRes || [];
      setWarehouses(whList);
      if (whList.length > 0) {
        setDispatchWarehouseId(whList[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchDropdowns();
  }, [token, company, locale]);

  // Calculations
  const calculations = useMemo(() => {
    let subtotal = 0;
    let totalDiscount = 0;

    items.forEach((i) => {
      const raw = i.quantity * i.unitPrice;
      const disc = (raw * i.discount) / 100;
      subtotal += raw;
      totalDiscount += disc;
    });

    const grandTotal = subtotal - totalDiscount;
    const paid = Number(currentOrderData?.paidAmount || 0);
    const remaining = Math.max(0, grandTotal - paid);

    const minRequired =
      paymentCondition === 'PARTIAL'
        ? (grandTotal * requiredPaymentPercent) / 100
        : paymentCondition === 'PREPAID_100'
        ? grandTotal
        : 0;

    const minNeededForDispatch = Math.max(0, minRequired - paid);

    return {
      subtotal,
      totalDiscount,
      grandTotal,
      paid,
      remaining,
      minRequired,
      minNeededForDispatch,
    };
  }, [items, currentOrderData, paymentCondition, requiredPaymentPercent]);

  const handleItemChange = (index: number, field: keyof OrderItemRow, val: any) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: val };
      if (field === 'productId') {
        const prd = products.find((p) => p.id === val);
        if (prd) updated[index].unitPrice = prd.salePrice || 0;
      }
      return updated;
    });
  };

  const addItemRow = (productId = '') => {
    const prd = products.find((p) => p.id === productId);
    setItems((prev) => [
      ...prev,
      {
        productId,
        quantity: 1,
        unitPrice: prd ? prd.salePrice || 0 : 0,
        discount: 0,
        readyQty: 0,
      },
    ]);
  };

  const removeItemRow = (index: number) => {
    if (items.length <= 1) {
      setItems([{ productId: '', quantity: 1, unitPrice: 0, discount: 0, readyQty: 0 }]);
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Save Order
  const handleSave = async () => {
    setError(null);
    if (!counterpartyId) {
      setError(isRu ? 'Выберите клиента' : 'Mijozni tanlang');
      return;
    }

    const validItems = items.filter((i) => i.productId && i.quantity > 0);
    if (validItems.length === 0) {
      setError(isRu ? 'Добавьте хотя бы один товар' : 'Kamida bitta tovar kiriting');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        counterpartyId,
        currency,
        exchangeRate: Number(exchangeRate) || 1,
        paymentCondition,
        requiredPaymentPercent: paymentCondition === 'PARTIAL' ? Number(requiredPaymentPercent) : undefined,
        deliveryDate: deliveryDate ? new Date(deliveryDate).toISOString() : undefined,
        deliveryAddress: deliveryAddress.trim() || undefined,
        comment: comment.trim() || undefined,
        assignedSellerId: assignedSellerId || undefined,
        items: validItems.map((i) => ({
          productId: i.productId,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
          discount: Number(i.discount) || 0,
        })),
      };

      if (mode === 'create' || !orderId) {
        const res = await apiFetch<any>('/sales/orders', {
          method: 'POST',
          token: token || undefined,
          tenantId: company?.id,
          locale,
          body: JSON.stringify(payload),
        });

        if (res && res.id) {
          router.push(`/sales/orders/${res.id}`);
        }
      } else {
        const res = await apiFetch<any>(`/sales/orders/${orderId}`, {
          method: 'PATCH',
          token: token || undefined,
          tenantId: company?.id,
          locale,
          body: JSON.stringify(payload),
        });
        if (res) {
          setCurrentOrderData(res);
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || (isRu ? 'Ошибка сохранения заказа' : 'Buyurtmani saqlashda xatolik'));
    } finally {
      setLoading(false);
    }
  };

  // State Transition Action
  const handleTransition = async (action: string) => {
    if (!orderId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch<any>(`/sales/orders/${orderId}/transition`, {
        method: 'POST',
        token: token || undefined,
        tenantId: company?.id,
        locale,
        body: JSON.stringify({ action }),
      });

      if (res) {
        setOrderStatus(res.status);
        setCurrentOrderData(res);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || (isRu ? 'Ошибка перехода статуса' : 'Holatni o‘zgartirishda xatolik yuz berdi'));
    } finally {
      setLoading(false);
    }
  };

  // Dispatch Action (Converts to Invoice)
  const handleDispatch = async () => {
    if (!orderId || !dispatchWarehouseId) {
      setError(isRu ? 'Выберите склад для списания' : 'Chiqim omborini tanlang');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch<any>(`/sales/orders/${orderId}/dispatch`, {
        method: 'POST',
        token: token || undefined,
        tenantId: company?.id,
        locale,
        body: JSON.stringify({ warehouseId: dispatchWarehouseId }),
      });

      if (res) {
        setOrderStatus(res.status);
        setCurrentOrderData(res);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || (isRu ? 'Ошибка отгрузки заказа' : 'Buyurtmani jo‘natishda xatolik yuz berdi'));
    } finally {
      setLoading(false);
    }
  };

  // Complete Order
  const handleComplete = async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch<any>(`/sales/orders/${orderId}/complete`, {
        method: 'POST',
        token: token || undefined,
        tenantId: company?.id,
        locale,
      });

      if (res) {
        setOrderStatus(res.status);
        setCurrentOrderData(res);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || (isRu ? 'Ошибка завершения заказа' : 'Buyurtmani yakunlashda xatolik'));
    } finally {
      setLoading(false);
    }
  };

  const statusMeta = ORDER_STATUS_LABELS[orderStatus] || { uz: orderStatus, ru: orderStatus, variant: 'neutral' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', paddingBottom: 'var(--space-10)' }}>
      {/* Header & Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Button
            variant="secondary"
            onClick={() => router.push('/sales/orders')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '38px', padding: '0 12px' }}
          >
            <ArrowLeft size={16} />
            {isRu ? 'К заказам' : 'Buyurtmalarga'}
          </Button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
                {mode === 'create'
                  ? (isRu ? 'Новый заказ покупателя' : 'Yangi Xaridor Buyurtmasi')
                  : `${isRu ? 'Заказ' : 'Buyurtma'} № ${orderNumber}`}
              </h1>
              <Badge variant={statusMeta.variant as any}>
                {isRu ? statusMeta.ru : statusMeta.uz}
              </Badge>
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              {isRu ? '13-этапный жизненный цикл, координация производства, оплат и отгрузки' : '13 bosqichli sikl, ishlab chiqarish, to‘lovlar va jo‘natish koordinatsiyasi'}
            </p>
          </div>
        </div>

        {/* Action Buttons based on orderStatus */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {orderStatus !== 'CANCELLED' && orderStatus !== 'COMPLETED' && (
            <Button
              variant="secondary"
              onClick={() => setIsPayOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '38px', borderColor: '#10b981', color: '#10b981' }}
            >
              <CreditCard size={16} />
              {isRu ? 'Принять оплату' : 'To‘lov qabul qilish'}
            </Button>
          )}

          {/* Lifecycle actions */}
          {orderStatus === 'NEW' && (
            <Button
              onClick={() => handleTransition('SUBMIT')}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '38px' }}
            >
              <Send size={16} />
              {isRu ? 'Отправить на согласование' : 'Tasdiqlashga yuborish'}
            </Button>
          )}

          {orderStatus === 'PENDING_APPROVAL' && (
            <>
              <Button
                onClick={() => handleTransition('APPROVE')}
                disabled={loading}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '38px' }}
              >
                <CheckCircle2 size={16} />
                {isRu ? 'Согласовать заказ' : 'Tasdiqlash'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleTransition('REJECT')}
                disabled={loading}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '38px', color: '#ef4444' }}
              >
                <XCircle size={16} />
                {isRu ? 'Отклонить' : 'Rad etish'}
              </Button>
            </>
          )}

          {orderStatus === 'APPROVED' && (
            <Button
              onClick={() => handleTransition('SEND_TO_PRODUCTION')}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '38px' }}
            >
              <Factory size={16} />
              {isRu ? 'Передать в производство' : 'Ishlab chiqarishga yuborish'}
            </Button>
          )}

          {orderStatus === 'READY_TO_SHIP' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Select
                options={warehouses.map((w) => ({ value: w.id, label: getLocalizedName(w.name) }))}
                value={dispatchWarehouseId}
                onChange={setDispatchWarehouseId}
                style={{ width: '160px' }}
              />
              <Button
                onClick={handleDispatch}
                disabled={loading || !dispatchWarehouseId}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '38px' }}
              >
                <Truck size={16} />
                {isRu ? 'Отгрузить (Создать фактуру)' : 'Jo‘natish (Faktura ochish)'}
              </Button>
            </div>
          )}

          {orderStatus === 'SHIPPED' && (
            <Button
              onClick={handleComplete}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '38px' }}
            >
              <CheckCheck size={16} />
              {isRu ? 'Подтвердить получение' : 'Yakunlash (Topshirildi)'}
            </Button>
          )}

          {/* Cancellation */}
          {orderStatus !== 'COMPLETED' && orderStatus !== 'CANCELLED' && orderStatus !== 'SHIPPED' && (
            <Button
              variant="secondary"
              onClick={() => handleTransition('CANCEL')}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '38px', color: '#ef4444' }}
            >
              <XCircle size={16} />
              {isRu ? 'Отменить заказ' : 'Bekor qilish'}
            </Button>
          )}

          {!isLocked && (
            <Button
              variant="secondary"
              onClick={handleSave}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '38px' }}
            >
              <Save size={16} />
              {isRu ? 'Сохранить' : 'Saqlash'}
            </Button>
          )}
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-md)',
            color: '#ef4444',
            fontSize: 'var(--text-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 'var(--space-6)', alignItems: 'start' }}>
        {/* Left Column: Details & Items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {/* Requisites Card */}
          <Card style={{ padding: 'var(--space-5)' }}>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 'var(--space-4)' }}>
              {isRu ? 'Параметры заказа' : 'Buyurtma parametrlari'}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
              {/* Customer */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                    {isRu ? 'Клиент (Покупатель) *' : 'Mijoz (Xaridor) *'}
                  </label>
                  {!isLocked && (
                    <button
                      type="button"
                      onClick={() => setIsCustomerModalOpen(true)}
                      style={{
                        fontSize: '11px',
                        color: 'var(--color-primary-600)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px',
                        fontWeight: 600,
                      }}
                    >
                      <UserPlus size={12} /> {isRu ? '+ Клиент' : '+ Mijoz'}
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <div style={{ flex: 1 }}>
                    <Select
                      options={counterparties.map((c) => ({ value: c.id, label: c.name }))}
                      value={counterpartyId}
                      onChange={setCounterpartyId}
                      disabled={isLocked}
                    />
                  </div>
                  {counterpartyId && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setIsCustomerDrawerOpen(true)}
                      title={isRu ? 'Профиль клиента' : 'Mijoz profili'}
                      style={{ padding: '0 10px', height: '38px' }}
                    >
                      <Building2 size={16} />
                    </Button>
                  )}
                </div>
              </div>

              {/* Payment Condition */}
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                  {isRu ? 'Условие отгрузки / оплаты' : 'To‘lov / Jo‘natish sharti'}
                </label>
                <Select
                  options={[
                    { value: 'PREPAID_100', label: isRu ? '100% Предоплата' : '100% Oldindan to‘lov' },
                    { value: 'PARTIAL', label: isRu ? 'Частичная предоплата (%)' : 'Qisman oldindan to‘lov (%)' },
                    { value: 'CREDIT', label: isRu ? 'В кредит (Без предоплаты)' : 'Nasiya / Kreditga (Avanssiz)' },
                  ]}
                  value={paymentCondition}
                  onChange={(val) => setPaymentCondition(val as any)}
                  disabled={isLocked}
                />
              </div>

              {/* Required % when partial */}
              {paymentCondition === 'PARTIAL' && (
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                    {isRu ? 'Мин. % оплаты для отгрузки' : 'Jo‘natish uchun min. to‘lov %'}
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={requiredPaymentPercent}
                    onChange={(e) => setRequiredPaymentPercent(parseFloat(e.target.value) || 50)}
                    disabled={isLocked}
                  />
                </div>
              )}

              {/* Responsible Seller */}
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                  {isRu ? 'Ответственный продавец' : 'Mas’ul sotuvchi'}
                </label>
                <Select
                  options={[
                    { value: '', label: isRu ? '— Не назначен —' : '— Biriktirilmagan —' },
                    ...sellers.map((s) => ({ value: s.id, label: `${s.firstName} ${s.lastName}` })),
                  ]}
                  value={assignedSellerId}
                  onChange={setAssignedSellerId}
                  disabled={isLocked}
                />
              </div>

              {/* Delivery Date */}
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                  {isRu ? 'Требуемая дата доставки' : 'Yetkazish talab sanasi'}
                </label>
                <DatePicker
                  value={deliveryDate}
                  onChange={setDeliveryDate}
                  disabled={isLocked}
                />
              </div>

              {/* Currency */}
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                  {isRu ? 'Валюта' : 'Valyuta'}
                </label>
                <Select
                  options={CURRENCY_OPTIONS}
                  value={currency}
                  onChange={(val) => {
                    setCurrency(val);
                    if (val === 'UZS') setExchangeRate(1);
                  }}
                  disabled={isLocked}
                />
              </div>
            </div>

            {/* Delivery address & note */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginTop: 'var(--space-4)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--color-border-light)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                  {isRu ? 'Адрес доставки' : 'Yetkazish manzili'}
                </label>
                <Input
                  placeholder={isRu ? 'Город, район, улица, ориентир...' : 'Shahar, tuman, ko‘cha, mo‘ljal...'}
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  disabled={isLocked}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                  {isRu ? 'Комментарий / Инструкции' : 'Izoh / Ko‘rsatmalar'}
                </label>
                <Input
                  placeholder={isRu ? 'Дополнительные сведения...' : 'Qo‘shimcha ma’lumotlar...'}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  disabled={isLocked}
                />
              </div>
            </div>
          </Card>

          {/* Order Items Table */}
          <Card style={{ padding: 'var(--space-5)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {isRu ? 'Товары в заказе' : 'Buyurtmadagi tovarlar'}
              </div>

              {!isLocked && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsProductModalOpen(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', height: '32px', padding: '0 10px', fontSize: 'var(--text-xs)' }}
                >
                  <PackagePlus size={14} />
                  {isRu ? '+ Новый товар' : '+ Yangi tovar'}
                </Button>
              )}
            </div>

            <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-subtle)' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', width: '38%' }}>
                      {isRu ? 'ТОВАР' : 'TOVAR'}
                    </th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', width: '14%' }}>
                      {isRu ? 'ЗАКАЗАНО' : 'BUYURTMA'}
                    </th>
                    {orderStatus !== 'NEW' && (
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', width: '14%' }}>
                        {isRu ? 'ГОТОВО' : 'TAYYOR'}
                      </th>
                    )}
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', width: '16%' }}>
                      {isRu ? 'ЦЕНА' : 'NARX'}
                    </th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', width: '14%' }}>
                      {isRu ? 'СУММА' : 'SUMMA'}
                    </th>
                    {!isLocked && (
                      <th style={{ padding: '8px 12px', textAlign: 'center', width: '4%' }}></th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => {
                    const prd = products.find((p) => p.id === item.productId);
                    const lineTotal = item.quantity * item.unitPrice * (1 - item.discount / 100);

                    return (
                      <tr key={index} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                        {/* Product */}
                        <td style={{ padding: '6px 8px' }}>
                          <Select
                            options={[
                              { value: '', label: isRu ? '— Выберите товар —' : '— Tovarni tanlang —' },
                              ...products.map((p) => ({
                                value: p.id,
                                label: `${getLocalizedName(p.name)} (${p.sku})`,
                              })),
                            ]}
                            value={item.productId}
                            onChange={(val) => handleItemChange(index, 'productId', val)}
                            disabled={isLocked}
                          />
                        </td>

                        {/* Quantity */}
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                          <Input
                            type="number"
                            min={0.001}
                            step="any"
                            value={item.quantity || ''}
                            onChange={(e) => handleItemChange(index, 'quantity', parseFloat(e.target.value) || 0)}
                            disabled={isLocked}
                            style={{ textAlign: 'right', height: '36px' }}
                          />
                        </td>

                        {/* Ready Qty */}
                        {orderStatus !== 'NEW' && (
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                            <span style={{ fontWeight: 600, color: (item.readyQty || 0) >= item.quantity ? '#10b981' : '#f59e0b' }}>
                              {item.readyQty || 0} / {item.quantity}
                            </span>
                          </td>
                        )}

                        {/* Unit Price */}
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            value={item.unitPrice || ''}
                            onChange={(e) => handleItemChange(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                            disabled={isLocked}
                            style={{ textAlign: 'right', height: '36px' }}
                          />
                        </td>

                        {/* Line Total */}
                        <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 600 }} className="tabular-nums">
                          {formatCurrency(lineTotal, locale, currency)}
                        </td>

                        {/* Delete Row */}
                        {!isLocked && (
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => removeItemRow(index)}
                              style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 4 }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {!isLocked && (
              <div style={{ marginTop: 'var(--space-3)' }}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => addItemRow()}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '36px', fontSize: 'var(--text-xs)' }}
                >
                  <Plus size={14} />
                  {isRu ? 'Добавить строку' : 'Qator qo‘shish'}
                </Button>
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Summary & Payment Card */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', position: 'sticky', top: 'var(--space-6)' }}>
          <Card style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)', borderBottom: '1px solid var(--color-border-light)', paddingBottom: 'var(--space-3)' }}>
              {isRu ? 'Финансовый итог' : 'Buyurtma hisobi'}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-secondary)' }}>
                <span>{isRu ? 'Сумма заказа:' : 'Buyurtma qiymati:'}</span>
                <span className="tabular-nums font-semibold">{formatCurrency(calculations.grandTotal, locale, currency)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#10b981' }}>
                <span>{isRu ? 'Оплачено (Аванс):' : 'To‘langan (Avans):'}</span>
                <span className="tabular-nums font-semibold">{formatCurrency(calculations.paid, locale, currency)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: calculations.remaining > 0 ? '#ef4444' : '#10b981', fontWeight: 700, borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-2)' }}>
                <span>{isRu ? 'Остаток к оплате:' : 'Qoldiq to‘lov:'}</span>
                <span className="tabular-nums">{formatCurrency(calculations.remaining, locale, currency)}</span>
              </div>
            </div>

            {/* Dispatch Gate Requirement Widget */}
            <div style={{ padding: '12px', backgroundColor: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                {isRu ? 'Условие отгрузки (Dispatch Gate)' : 'Jo‘natish talabi (Dispatch Gate)'}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-primary)' }}>
                {paymentCondition === 'PREPAID_100' && (isRu ? 'Требуется 100% оплата' : '100% to‘lov talab qilinadi')}
                {paymentCondition === 'PARTIAL' && (isRu ? `Требуется минимум ${requiredPaymentPercent}% (${formatCurrency(calculations.minRequired, locale, currency)})` : `Min. ${requiredPaymentPercent}% to‘lov talab qilinadi (${formatCurrency(calculations.minRequired, locale, currency)})`)}
                {paymentCondition === 'CREDIT' && (isRu ? 'Кредит / Nasiya (Отгрузка без предоплаты)' : 'Nasiya / Kredit (Avanssiz jo‘natish ruxsat etilgan)')}
              </div>

              {calculations.minNeededForDispatch > 0 && paymentCondition !== 'CREDIT' ? (
                <div style={{ fontSize: '11px', color: '#ef4444', marginTop: 4, fontWeight: 600 }}>
                  {isRu ? `Необходимо оплатить еще: ${formatCurrency(calculations.minNeededForDispatch, locale, currency)}` : `Jo‘natish uchun yana to‘lanishi kerak: ${formatCurrency(calculations.minNeededForDispatch, locale, currency)}`}
                </div>
              ) : (
                <div style={{ fontSize: '11px', color: '#10b981', marginTop: 4, fontWeight: 600 }}>
                  {isRu ? 'Условие для отгрузки выполнено' : 'Jo‘natish sharti bajarilgan'}
                </div>
              )}
            </div>

            {/* Linked Invoice if Shipped/Completed */}
            {currentOrderData?.invoiceId && (
              <Button
                variant="secondary"
                onClick={() => router.push(`/sales/${currentOrderData.invoiceId}`)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <Truck size={16} />
                {isRu ? 'Открыть накладную отгрузки' : 'Chiqim fakturasini ochish'}
              </Button>
            )}
          </Card>
        </div>
      </div>

      {/* Auxiliary Modals */}
      <QuickAddCustomerModal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        onSuccess={(newCp) => {
          setCounterparties((prev) => [newCp, ...prev]);
          setCounterpartyId(newCp.id);
        }}
      />

      <QuickAddProductModal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        onSuccess={(newPrd) => {
          const formatted = {
            id: newPrd.id,
            name: newPrd.name,
            sku: newPrd.sku,
            salePrice: Number(newPrd.salePrice) || 0,
            costPrice: Number(newPrd.costPrice) || 0,
            unitOfMeasure: newPrd.unitOfMeasure || 'dona',
          };
          setProducts((prev) => [formatted, ...prev]);
          addItemRow(newPrd.id);
        }}
      />

      {counterpartyId && (
        <CustomerProfileDrawer
          isOpen={isCustomerDrawerOpen}
          onClose={() => setIsCustomerDrawerOpen(false)}
          customerId={counterpartyId}
        />
      )}

      {currentOrderData && (
        <PaySalesOrderModal
          isOpen={isPayOpen}
          onClose={() => setIsPayOpen(false)}
          order={currentOrderData}
          onSuccess={() => {
            if (orderId) {
              apiFetch<any>(`/sales/orders/${orderId}`, { token: token || undefined, tenantId: company?.id, locale }).then((res) => {
                if (res) setCurrentOrderData(res);
              });
            }
          }}
        />
      )}
    </div>
  );
}
