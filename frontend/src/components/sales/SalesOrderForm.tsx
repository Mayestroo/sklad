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
  PackagePlus,
  Factory,
  PackageCheck,
  CheckCheck,
  XCircle,
  Percent,
} from 'lucide-react';
import { PaySalesOrderModal } from './PaySalesOrderModal';
import { CreateCounterpartyDrawer } from '@/components/counterparties/CreateCounterpartyDrawer';
import { CreateWarehouseDrawer } from '@/components/warehouses/CreateWarehouseDrawer';

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
  type?: string;
}

interface ProductOption {
  id: string;
  name: string | Record<string, string>;
  sku: string;
  barcode?: string;
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
  const [isDirty, setIsDirty] = useState(false);

  // Quick Add Drawers
  const [isQuickCustomerOpen, setIsQuickCustomerOpen] = useState(false);
  const [isQuickWarehouseOpen, setIsQuickWarehouseOpen] = useState(false);

  // Modals
  const [isPayOpen, setIsPayOpen] = useState(false);

  const isLocked = orderStatus !== 'NEW' && orderStatus !== 'PENDING_APPROVAL';

  const markDirty = () => {
    if (!isDirty) setIsDirty(true);
  };

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
        apiFetch<any>('/sales/counterparties', { token: token || undefined, tenantId: company.id, locale }),
        apiFetch<any>('/inventory/products', { token: token || undefined, tenantId: company.id, locale }),
        apiFetch<any>('/users', { token: token || undefined, tenantId: company.id, locale }),
        apiFetch<any>('/inventory/warehouses', { token: token || undefined, tenantId: company.id, locale }),
      ]);

      const cpList = cpRes?.data || (Array.isArray(cpRes) ? cpRes : []);
      setCounterparties(cpList);
      if (!counterpartyId && cpList.length > 0 && mode === 'create') {
        setCounterpartyId(cpList[0].id);
      }

      const prdList = (prdRes?.data || prdRes || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
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

  // Drawer handlers
  const handleCustomerAdded = (newCustomer: { id: string; name: string; type: string; debtBalance?: number }) => {
    markDirty();
    setCounterparties((prev) => [newCustomer, ...prev]);
    setCounterpartyId(newCustomer.id);
  };

  const handleWarehouseAdded = (newWarehouse: { id: string; name: string | Record<string, string> }) => {
    markDirty();
    setWarehouses((prev) => [newWarehouse, ...prev]);
    setDispatchWarehouseId(newWarehouse.id);
  };

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
    markDirty();
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
    markDirty();
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
    markDirty();
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
          setIsDirty(false);
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
          setIsDirty(false);
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

  // Dispatch Action
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

  const handleBackNavigation = () => {
    if (isDirty) {
      const confirmed = window.confirm(
        isRu
          ? 'У вас есть несохраненные изменения. Вы уверены, что хотите выйти?'
          : 'Sizda saqlanmagan o‘zgarishlar bor. Haqiqatan ham chiqib ketmoqchimisiz?'
      );
      if (!confirmed) return;
    }
    setIsDirty(false);
    router.push('/sales/orders');
  };

  const statusMeta = ORDER_STATUS_LABELS[orderStatus] || { uz: orderStatus, ru: orderStatus, variant: 'neutral' };

  const customerOptions: SelectOption[] = counterparties.map((c) => ({
    value: c.id,
    label: c.name,
    description: c.phone
      ? `${c.phone}${Number(c.debtBalance) > 0 ? ` · ${isRu ? 'Долг' : 'Qarz'}: ${formatCurrency(Number(c.debtBalance), 'UZS')}` : ''}`
      : Number(c.debtBalance) > 0
      ? `${isRu ? 'Долг' : 'Qarz'}: ${formatCurrency(Number(c.debtBalance), 'UZS')}`
      : undefined,
  }));

  const productOptions: SelectOption[] = products.map((p) => ({
    value: p.id,
    label: `${getLocalizedName(p.name)} ${p.sku ? `(${p.sku})` : ''}`,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', paddingBottom: 'var(--space-12)' }}>
      {/* Sticky Top Header & Toolbar */}
      <div
        style={{
          position: 'sticky',
          top: 'var(--header-height)',
          zIndex: 15,
          backgroundColor: 'var(--color-bg-primary)',
          padding: 'var(--space-4) 0',
          borderBottom: '1px solid var(--color-border-light)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBackNavigation}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <ArrowLeft size={18} /> {isRu ? 'К списку заказов' : 'Buyurtmalar ro‘yxatiga'}
          </Button>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
                {mode === 'create' && !orderNumber
                  ? isRu
                    ? 'Новый заказ покупателя'
                    : 'Yangi Xaridor Buyurtmasi'
                  : `${isRu ? 'Заказ покупателя' : 'Xaridor buyurtmasi'} ${orderNumber}`}
              </h1>
              <Badge variant={statusMeta.variant as any}>
                {isRu ? statusMeta.ru : statusMeta.uz}
              </Badge>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {orderStatus !== 'CANCELLED' && orderStatus !== 'COMPLETED' && (
            <Button
              variant="secondary"
              onClick={() => setIsPayOpen(true)}
              style={{
                backgroundColor: 'var(--color-success-50)',
                color: 'var(--color-success-600)',
                border: '1px solid var(--color-success-200)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <CreditCard size={16} /> {isRu ? 'Принять оплату' : 'To‘lov qabul qilish'}
            </Button>
          )}

          {orderStatus === 'NEW' && (
            <Button
              onClick={() => handleTransition('SUBMIT')}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Send size={16} /> {isRu ? 'Отправить на согласование' : 'Tasdiqlashga yuborish'}
            </Button>
          )}

          {orderStatus === 'PENDING_APPROVAL' && (
            <>
              <Button
                onClick={() => handleTransition('APPROVE')}
                disabled={loading}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'var(--color-success-600)' }}
              >
                <CheckCircle2 size={16} /> {isRu ? 'Согласовать' : 'Tasdiqlash'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleTransition('REJECT')}
                disabled={loading}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ef4444' }}
              >
                <XCircle size={16} /> {isRu ? 'Отклонить' : 'Rad etish'}
              </Button>
            </>
          )}

          {orderStatus === 'APPROVED' && (
            <Button
              onClick={() => handleTransition('SEND_TO_PRODUCTION')}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Factory size={16} /> {isRu ? 'В производство' : 'Ishlab chiqarishga'}
            </Button>
          )}

          {orderStatus === 'READY_TO_SHIP' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Select
                options={warehouses.map((w) => ({ value: w.id, label: getLocalizedName(w.name) }))}
                value={dispatchWarehouseId}
                onChange={setDispatchWarehouseId}
                onCreateNew={() => setIsQuickWarehouseOpen(true)}
                createNewLabel={isRu ? 'Создать склад' : 'Yangi ombor'}
                style={{ width: '160px' }}
              />
              <Button
                onClick={handleDispatch}
                disabled={loading || !dispatchWarehouseId}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'var(--color-success-600)' }}
              >
                <Truck size={16} /> {isRu ? 'Отгрузить' : 'Jo‘natish'}
              </Button>
            </div>
          )}

          {orderStatus === 'SHIPPED' && (
            <Button
              onClick={handleComplete}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'var(--color-success-600)' }}
            >
              <CheckCheck size={16} /> {isRu ? 'Завершить' : 'Yakunlash'}
            </Button>
          )}

          {orderStatus !== 'COMPLETED' && orderStatus !== 'CANCELLED' && orderStatus !== 'SHIPPED' && (
            <Button
              variant="secondary"
              onClick={() => handleTransition('CANCEL')}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ef4444' }}
            >
              <XCircle size={16} /> {isRu ? 'Отменить' : 'Bekor qilish'}
            </Button>
          )}

          {!isLocked && (
            <Button
              variant="secondary"
              onClick={handleSave}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Save size={16} /> {isRu ? 'Сохранить' : 'Saqlash'}
            </Button>
          )}

          <Button
            variant="ghost"
            onClick={() => window.print()}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Printer size={16} /> {isRu ? 'Печать' : 'Chop etish'}
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <Card style={{ padding: 'var(--space-3) var(--space-4)', backgroundColor: 'rgba(239, 68, 68, 0.08)', borderColor: '#ef4444', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AlertCircle size={20} />
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>{error}</span>
        </Card>
      )}

      {/* Document Primary Metadata Form Card */}
      <Card style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)' }}>
          {isRu ? 'Основная информация' : 'Asosiy Hujjat Ma’lumotlari'}
        </h3>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
          {/* Customer */}
          <div style={{ minWidth: '200px', flex: '2 1 220px' }}>
            <Select
              label={isRu ? 'Клиент (Покупатель) *' : 'Mijoz (Xaridor) *'}
              options={customerOptions}
              value={counterpartyId}
              onChange={(val) => { markDirty(); setCounterpartyId(val); }}
              placeholder={isRu ? 'Выберите клиента' : 'Mijozni tanlang'}
              disabled={isLocked}
              onCreateNew={!isLocked ? () => setIsQuickCustomerOpen(true) : undefined}
              createNewLabel={isRu ? 'Добавить клиента' : 'Yangi mijoz qo‘shish'}
            />
          </div>

          {/* Payment Condition */}
          <div style={{ minWidth: '160px', flex: '1.5 1 180px' }}>
            <Select
              label={isRu ? 'Условие отгрузки / оплаты' : 'To‘lov / Jo‘natish sharti'}
              options={[
                { value: 'PREPAID_100', label: isRu ? '100% Предоплата' : '100% Oldindan to‘lov' },
                { value: 'PARTIAL', label: isRu ? 'Частичная предоплата (%)' : 'Qisman oldindan to‘lov (%)' },
                { value: 'CREDIT', label: isRu ? 'В кредит (Без предоплаты)' : 'Nasiya / Kreditga' },
              ]}
              value={paymentCondition}
              onChange={(val) => { markDirty(); setPaymentCondition(val as any); }}
              disabled={isLocked}
            />
          </div>

          {/* Required % when partial */}
          {paymentCondition === 'PARTIAL' && (
            <div style={{ minWidth: '120px', flex: '1 1 130px' }}>
              <Input
                label={isRu ? 'Мин. % оплаты' : 'Min. to‘lov %'}
                type="number"
                min={1}
                max={100}
                value={requiredPaymentPercent}
                onChange={(e) => { markDirty(); setRequiredPaymentPercent(parseFloat(e.target.value) || 50); }}
                disabled={isLocked}
              />
            </div>
          )}

          {/* Responsible Seller */}
          <div style={{ minWidth: '160px', flex: '1.5 1 180px' }}>
            <Select
              label={isRu ? 'Ответственный продавец' : 'Mas’ul sotuvchi'}
              options={[
                { value: '', label: isRu ? '— Не назначен —' : '— Biriktirilmagan —' },
                ...sellers.map((s) => ({ value: s.id, label: `${s.firstName} ${s.lastName}` })),
              ]}
              value={assignedSellerId}
              onChange={(val) => { markDirty(); setAssignedSellerId(val); }}
              disabled={isLocked}
            />
          </div>

          {/* Delivery Date */}
          <div style={{ minWidth: '140px', flex: '1 1 150px' }}>
            <DatePicker
              label={isRu ? 'Требуемая дата доставки' : 'Yetkazish talab sanasi'}
              value={deliveryDate}
              onChange={(val) => { markDirty(); setDeliveryDate(val); }}
              disabled={isLocked}
            />
          </div>

          {/* Currency */}
          <div style={{ minWidth: '90px', flex: '0.8 1 100px' }}>
            <Select
              label={isRu ? 'Валюта' : 'Valyuta'}
              options={CURRENCY_OPTIONS}
              value={currency}
              onChange={(val) => {
                markDirty();
                setCurrency(val);
                if (val === 'UZS') setExchangeRate(1);
              }}
              disabled={isLocked}
            />
          </div>

          {/* Delivery Address */}
          <div style={{ minWidth: '220px', flex: '2 1 250px' }}>
            <Input
              label={isRu ? 'Адрес доставки' : 'Yetkazish manzili'}
              value={deliveryAddress}
              onChange={(e) => { markDirty(); setDeliveryAddress(e.target.value); }}
              placeholder={isRu ? 'Город, район, улица...' : 'Shahar, tuman, ko‘cha...'}
              disabled={isLocked}
            />
          </div>

          {/* Comment */}
          <div style={{ minWidth: '220px', flex: '2 1 250px' }}>
            <Input
              label={isRu ? 'Примечание / Комментарий' : 'Izoh / Qayd'}
              value={comment}
              onChange={(e) => { markDirty(); setComment(e.target.value); }}
              placeholder={isRu ? 'Дополнительные сведения...' : 'Qo‘shimcha ma’lumotlar...'}
              disabled={isLocked}
            />
          </div>
        </div>
      </Card>

      {/* Items Table Card */}
      <Card style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)' }}>
            {isRu ? 'Товары в заказе' : 'Buyurtmadagi Tovarlar'} ({items.length})
          </h3>
        </div>

        {/* Table container */}
        <div style={{ overflowX: 'auto', minHeight: '280px', paddingBottom: '40px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border-light)', backgroundColor: 'var(--color-bg-subtle)' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', width: '40px' }}>#</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', minWidth: '240px' }}>
                  {isRu ? 'Товар / Номенклатура' : 'Tovar / Mahsulot'}
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'right', width: '120px' }}>
                  {isRu ? 'Заказано' : 'Buyurtma miqdori'}
                </th>
                {orderStatus !== 'NEW' && (
                  <th style={{ padding: '10px 12px', textAlign: 'right', width: '120px' }}>
                    {isRu ? 'Готово (Пр-во)' : 'Tayyorlandi'}
                  </th>
                )}
                <th style={{ padding: '10px 12px', textAlign: 'right', width: '140px' }}>
                  {isRu ? 'Цена за ед.' : 'Birlik narxi'}
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'right', width: '110px' }}>
                  {isRu ? 'Скидка %' : 'Skidka %'}
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'right', width: '150px' }}>
                  {isRu ? 'Итого' : 'Jami Summa'}
                </th>
                {!isLocked && <th style={{ padding: '10px 12px', textAlign: 'center', width: '50px' }}></th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const prd = products.find((p) => p.id === item.productId);
                const lineRaw = item.quantity * item.unitPrice;
                const discountVal = (lineRaw * item.discount) / 100;
                const lineTotal = lineRaw - discountVal;

                return (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                    <td style={{ padding: '10px 12px', color: 'var(--color-text-tertiary)' }}>{idx + 1}</td>

                    {/* Product select */}
                    <td style={{ padding: '10px 12px' }}>
                      <Select
                        options={productOptions}
                        value={item.productId}
                        onChange={(val) => handleItemChange(idx, 'productId', val)}
                        placeholder={isRu ? 'Выберите товар...' : 'Tovarni tanlang...'}
                        disabled={isLocked}
                      />
                    </td>

                    {/* Quantity */}
                    <td style={{ padding: '10px 12px' }}>
                      <Input
                        type="number"
                        min="0.001"
                        step="any"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(idx, 'quantity', parseFloat(e.target.value) || 0)}
                        disabled={isLocked}
                        style={{ textAlign: 'right' }}
                      />
                    </td>

                    {/* Ready Qty */}
                    {orderStatus !== 'NEW' && (
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <span style={{ fontWeight: 600, color: (item.readyQty || 0) >= item.quantity ? '#10b981' : '#f59e0b' }}>
                          {item.readyQty || 0} / {item.quantity}
                        </span>
                      </td>
                    )}

                    {/* Unit Price */}
                    <td style={{ padding: '10px 12px' }}>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={item.unitPrice}
                        onChange={(e) => handleItemChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                        disabled={isLocked}
                        style={{ textAlign: 'right' }}
                      />
                    </td>

                    {/* Discount */}
                    <td style={{ padding: '10px 12px' }}>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="any"
                        value={item.discount}
                        onChange={(e) => handleItemChange(idx, 'discount', parseFloat(e.target.value) || 0)}
                        disabled={isLocked}
                        style={{ textAlign: 'right' }}
                      />
                    </td>

                    {/* Line Total */}
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }} className="tabular-nums">
                      {formatCurrency(lineTotal, locale, currency)}
                    </td>

                    {/* Actions */}
                    {!isLocked && (
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeItemRow(idx)}
                          style={{ color: 'var(--color-text-tertiary)', padding: '4px' }}
                          title={isRu ? 'Удалить строку' : 'Qatorni o‘chirish'}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!isLocked && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => addItemRow()}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Plus size={16} /> {isRu ? 'Добавить позицию' : 'Qator qo‘shish'}
            </Button>
          </div>
        )}
      </Card>

      {/* Summary Footer Panel */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Card style={{ padding: 'var(--space-6)', width: '100%', maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)', borderBottom: '1px solid var(--color-border-light)', paddingBottom: 'var(--space-2)' }}>
            {isRu ? 'Финансовый итог' : 'Buyurtma Hisobi'}
          </h3>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            <span>{isRu ? 'Сумма заказа:' : 'Buyurtma summasi:'}</span>
            <span className="tabular-nums font-medium">{formatCurrency(calculations.grandTotal, locale, currency)}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', color: '#10b981' }}>
            <span>{isRu ? 'Оплачено (Аванс):' : 'To‘langan (Avans):'}</span>
            <span className="tabular-nums font-medium">{formatCurrency(calculations.paid, locale, currency)}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-3)', marginTop: 'var(--space-1)' }}>
            <span>{isRu ? 'ОСТАТОК К ОПЛАТЕ:' : 'QOLDIQ TO‘LOV:'}</span>
            <span className="tabular-nums" style={{ color: calculations.remaining > 0 ? '#ef4444' : '#10b981' }}>
              {formatCurrency(calculations.remaining, locale, currency)}
            </span>
          </div>

          {/* Dispatch Gate Widget */}
          <div style={{ padding: '12px', backgroundColor: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginTop: 'var(--space-2)' }}>
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
        </Card>
      </div>

      {/* Drawers */}
      <CreateCounterpartyDrawer
        isOpen={isQuickCustomerOpen}
        onClose={() => setIsQuickCustomerOpen(false)}
        onSuccess={handleCustomerAdded}
        defaultType="CUSTOMER"
      />

      <CreateWarehouseDrawer
        isOpen={isQuickWarehouseOpen}
        onClose={() => setIsQuickWarehouseOpen(false)}
        onSuccess={handleWarehouseAdded}
      />

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
