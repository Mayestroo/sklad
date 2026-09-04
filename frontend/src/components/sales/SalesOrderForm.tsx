'use client';

import { useState, useEffect, useMemo } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { invalidateApiCache } from '@/lib/cache';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { SelectOption } from '@/components/ui/Select';
import { formatCurrency, getLocalizedName } from '@/lib/utils';
import {
  ORDER_STATUS_LABELS,
} from '@/lib/constants/statuses';
import {
  ArrowLeft,
  Save,
  CheckCircle2,
  Send,
  Truck,
  Printer,
  CreditCard,
  AlertCircle,
  Factory,
  PackageCheck,
  CheckCheck,
  XCircle,
} from 'lucide-react';
import { PaySalesOrderModal } from './PaySalesOrderModal';
import { PartialDispatchModal } from './PartialDispatchModal';
import { OrderPickListModal } from './OrderPickListModal';
import { OrderDeliveryNoteModal } from './OrderDeliveryNoteModal';
import { CreateCounterpartyDrawer } from '@/components/counterparties/CreateCounterpartyDrawer';
import { CreateWarehouseDrawer } from '@/components/warehouses/CreateWarehouseDrawer';
import { useDocumentDropdowns, CounterpartyDropdownItem, WarehouseDropdownItem } from '@/hooks/useDocumentDropdowns';
import { OrderGeneralInfo } from './order-form/OrderGeneralInfo';
import { OrderItemsTable, OrderItemRow } from './order-form/OrderItemsTable';
import { OrderTotalsSummary } from './order-form/OrderTotalsSummary';

// Re-export ORDER_STATUS_LABELS for backward compatibility
export { ORDER_STATUS_LABELS };

export interface SalesOrderFormProps {
  initialData?: any | null;
  mode: 'create' | 'edit';
}

export function SalesOrderForm({ initialData, mode }: SalesOrderFormProps) {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token, company, hasPermission } = useAuth();
  const router = useRouter();

  const isPriceOverrideAllowed =
    hasPermission('sales:override_price') ||
    company?.settings?.sales?.allowSellerPriceOverride !== false;

  // Cached Dropdown Hook
  const {
    counterparties: initialCounterparties,
    products,
    sellers,
    warehouses: initialWarehouses,
    priceLists,
  } = useDocumentDropdowns({
    token: token || undefined,
    tenantId: company?.id,
    locale,
  });

  // Local state for dynamically added counterparties/warehouses from drawers
  const [counterparties, setCounterparties] = useState<CounterpartyDropdownItem[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseDropdownItem[]>([]);

  useEffect(() => {
    if (initialCounterparties.length > 0 && counterparties.length === 0) {
      setCounterparties(initialCounterparties);
    }
  }, [initialCounterparties, counterparties.length]);

  useEffect(() => {
    if (initialWarehouses.length > 0 && warehouses.length === 0) {
      setWarehouses(initialWarehouses);
    }
  }, [initialWarehouses, warehouses.length]);

  // Order state
  const [orderId] = useState<string | null>(initialData?.id || null);
  const [orderNumber] = useState<string>(initialData?.orderNumber || '');
  const [orderStatus, setOrderStatus] = useState<string>(initialData?.status || 'NEW');
  const [counterpartyId, setCounterpartyId] = useState(initialData?.counterpartyId || '');
  const [priceListId, setPriceListId] = useState(initialData?.priceListId || '');
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
  const [isDispatchOpen, setIsDispatchOpen] = useState(false);
  const [isPickListOpen, setIsPickListOpen] = useState(false);
  const [isDeliveryNoteOpen, setIsDeliveryNoteOpen] = useState(false);

  const isLocked = orderStatus !== 'NEW' && orderStatus !== 'PENDING_APPROVAL';

  const markDirty = () => {
    if (!isDirty) setIsDirty(true);
  };

  // Set default counterparty if empty in create mode
  useEffect(() => {
    if (!counterpartyId && counterparties.length > 0 && mode === 'create') {
      const defaultCp = counterparties[0];
      setCounterpartyId(defaultCp.id);
      if (defaultCp.priceListId) setPriceListId(defaultCp.priceListId);
    }
  }, [counterpartyId, counterparties, mode]);

  // Drawer handlers
  const handleCustomerAdded = (newCustomer: { id: string; name: string; type: string; debtBalance?: number }) => {
    markDirty();
    setCounterparties((prev) => [newCustomer, ...prev]);
    setCounterpartyId(newCustomer.id);
  };

  const handleWarehouseAdded = (newWarehouse: { id: string; name: string | Record<string, string> }) => {
    markDirty();
    setWarehouses((prev) => [newWarehouse, ...prev]);
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

  const getProductPriceForList = (pId: string, pListId?: string) => {
    const prd = products.find((p) => p.id === pId);
    if (!prd) return 0;
    const activeListId = pListId !== undefined ? pListId : priceListId;
    let price = Number(prd.salePrice) || 0;
    let itemCurrency = (prd as any).currency || 'UZS';

    if (activeListId) {
      const pl = priceLists.find((l: any) => l.id === activeListId);
      const custom = (pl as any)?.prices?.find((item: any) => item.productId === pId);
      if (custom && Number(custom.price) > 0) {
        price = Number(custom.price);
        itemCurrency = pl?.currency || 'UZS';
      }
    }

    if (itemCurrency !== currency) {
      const rate = Number(exchangeRate) || 1;
      if (currency === 'UZS' && itemCurrency === 'USD') {
        price = Math.round(price * rate);
      } else if (currency === 'USD' && itemCurrency === 'UZS' && rate > 0) {
        price = Number((price / rate).toFixed(2));
      }
    }

    return price;
  };

  const handleCounterpartySelect = (cpId: string) => {
    markDirty();
    setCounterpartyId(cpId);
    const cp: any = counterparties.find((c: any) => c.id === cpId);
    if (cp) {
      const targetPriceListId = cp.priceListId || '';
      setPriceListId(targetPriceListId);
      const custDiscount = Number(cp.discountPercent || 0);

      // Recalculate existing rows
      setItems((prev) =>
        prev.map((row) => {
          if (!row.productId) return row;
          const unitPrice = getProductPriceForList(row.productId, targetPriceListId);
          return {
            ...row,
            unitPrice,
            discount: custDiscount > 0 ? custDiscount : row.discount,
          };
        })
      );
    }
  };

  const handlePriceListChange = (newListId: string) => {
    markDirty();
    setPriceListId(newListId);
    setItems((prev) =>
      prev.map((row) => {
        if (!row.productId) return row;
        const unitPrice = getProductPriceForList(row.productId, newListId);
        return { ...row, unitPrice };
      })
    );
  };

  const handleItemChange = (index: number, field: keyof OrderItemRow, val: any) => {
    markDirty();
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: val };
      if (field === 'productId') {
        const unitPrice = getProductPriceForList(val);
        const cp: any = counterparties.find((c: any) => c.id === counterpartyId);
        const custDiscount = Number(cp?.discountPercent || 0);
        updated[index].unitPrice = unitPrice;
        if (custDiscount > 0 && (!updated[index].discount || updated[index].discount === 0)) {
          updated[index].discount = custDiscount;
        }
      }
      return updated;
    });
  };

  const addItemRow = (productId = '') => {
    markDirty();
    const unitPrice = productId ? getProductPriceForList(productId) : 0;
    const cp: any = counterparties.find((c: any) => c.id === counterpartyId);
    const custDiscount = Number(cp?.discountPercent || 0);
    setItems((prev) => [
      ...prev,
      {
        productId,
        quantity: 1,
        unitPrice,
        discount: custDiscount > 0 ? custDiscount : 0,
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
        priceListId: priceListId || undefined,
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
          invalidateApiCache('/sales/orders*');
          setIsDirty(false);
          router.push(`/sales/orders/${res.id}`);
        }
      } else {
        const res = await apiFetch<{ id: string; status: string }>(`/sales/orders/${orderId}`, {
          method: 'PATCH',
          token: token || undefined,
          tenantId: company?.id,
          locale,
          body: JSON.stringify(payload),
        });
        if (res) {
          invalidateApiCache('/sales/orders*');
          setCurrentOrderData(res);
          setIsDirty(false);
        }
      }
    } catch (err: unknown) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : '';
      setError(errMsg || (isRu ? 'Ошибка сохранения заказа' : 'Buyurtmani saqlashda xatolik'));
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
      const res = await apiFetch<{ id: string; status: string }>(`/sales/orders/${orderId}/transition`, {
        method: 'POST',
        token: token || undefined,
        tenantId: company?.id,
        locale,
        body: JSON.stringify({ action }),
      });

      if (res) {
        invalidateApiCache('/sales/orders*');
        setOrderStatus(res.status);
        setCurrentOrderData(res);
      }
    } catch (err: unknown) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : '';
      setError(errMsg || (isRu ? 'Ошибка перехода статуса' : 'Holatni o‘zgartirishda xatolik yuz berdi'));
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
      const res = await apiFetch<{ id: string; status: string }>(`/sales/orders/${orderId}/complete`, {
        method: 'POST',
        token: token || undefined,
        tenantId: company?.id,
        locale,
      });

      if (res) {
        invalidateApiCache('/sales/orders*');
        setOrderStatus(res.status);
        setCurrentOrderData(res);
      }
    } catch (err: unknown) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : '';
      setError(errMsg || (isRu ? 'Ошибка завершения заказа' : 'Buyurtmani yakunlashda xatolik'));
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (newStatus: string) => {
    if (!orderId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch<{ id: string; status: string }>(`/sales/orders/${orderId}/status`, {
        method: 'PATCH',
        token: token || undefined,
        tenantId: company?.id,
        locale,
        body: JSON.stringify({ status: newStatus }),
      });

      if (res) {
        invalidateApiCache('/sales/orders*');
        setOrderStatus(res.status);
        setCurrentOrderData(res);
      }
    } catch (err: unknown) {
      console.error(err);
      const errMsg = err instanceof Error ? err.message : '';
      setError(errMsg || (isRu ? 'Ошибка обновления статуса' : 'Statusni yangilashda xatolik yuz berdi'));
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
      ? `${c.phone}${Number(c.debtBalance) > 0 ? ` · ${isRu ? 'Долг' : 'Qarz'}: ${formatCurrency(Number(c.debtBalance), locale, 'UZS')}` : ''}`
      : Number(c.debtBalance) > 0
      ? `${isRu ? 'Долг' : 'Qarz'}: ${formatCurrency(Number(c.debtBalance), locale, 'UZS')}`
      : undefined,
  }));

  const productOptions: SelectOption[] = products.map((p) => ({
    value: p.id,
    label: `${getLocalizedName(p.name, locale)} ${p.sku ? `(${p.sku})` : ''}`,
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

          {/* Warehouse workflow buttons */}
          {orderStatus === 'NEW' && mode === 'edit' && (
            <Button
              onClick={() => handleStatusUpdate('ACCEPTED')}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'var(--color-primary-600)' }}
            >
              <CheckCircle2 size={16} /> {isRu ? 'Принять на складе' : 'Omborga qabul qilish'}
            </Button>
          )}

          {orderStatus === 'ACCEPTED' && (
            <Button
              onClick={() => handleStatusUpdate('PROCESSING')}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#f59e0b', color: '#fff' }}
            >
              <PackageCheck size={16} /> {isRu ? 'В сборку' : 'Yig‘uvga olish'}
            </Button>
          )}

          {orderStatus === 'PROCESSING' && (
            <Button
              onClick={() => handleStatusUpdate('READY_FOR_SHIPMENT')}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'var(--color-success-600)' }}
            >
              <CheckCircle2 size={16} /> {isRu ? 'Готов к отгрузке' : 'Jo‘natishga tayyor'}
            </Button>
          )}

          {(orderStatus === 'READY_TO_SHIP' || orderStatus === 'READY_FOR_SHIPMENT' || orderStatus === 'PARTIALLY_SHIPPED' || orderStatus === 'PROCESSING') && (
            <Button
              onClick={() => setIsDispatchOpen(true)}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'var(--color-success-600)' }}
            >
              <Truck size={16} /> {isRu ? (orderStatus === 'PARTIALLY_SHIPPED' ? 'Отгрузить еще' : 'Отгрузить') : (orderStatus === 'PARTIALLY_SHIPPED' ? 'Keyingi chiqim (jo‘natish)' : 'Ombordan chiqim (jo‘natish)')}
            </Button>
          )}

          {/* Pick list print button */}
          {mode === 'edit' && (
            <Button
              variant="secondary"
              onClick={() => setIsPickListOpen(true)}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <PackageCheck size={16} /> {isRu ? 'Лист сборки' : 'Yig‘uv varaqasi'}
            </Button>
          )}

          {/* Delivery Note print button */}
          {(orderStatus === 'SHIPPED' || orderStatus === 'COMPLETED') && (
            <Button
              variant="secondary"
              onClick={() => setIsDeliveryNoteOpen(true)}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#059669' }}
            >
              <Printer size={16} /> {isRu ? 'Накладная' : 'Yuk xati'}
            </Button>
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

      {/* Primary General Info */}
      <OrderGeneralInfo
        locale={locale}
        isLocked={isLocked}
        counterpartyId={counterpartyId}
        onCounterpartyChange={handleCounterpartySelect}
        customerOptions={customerOptions}
        onQuickCustomerOpen={() => setIsQuickCustomerOpen(true)}
        priceListId={priceListId}
        onPriceListChange={handlePriceListChange}
        priceLists={priceLists}
        paymentCondition={paymentCondition}
        onPaymentConditionChange={(val) => { markDirty(); setPaymentCondition(val); }}
        requiredPaymentPercent={requiredPaymentPercent}
        onRequiredPaymentPercentChange={(val) => { markDirty(); setRequiredPaymentPercent(val); }}
        assignedSellerId={assignedSellerId}
        onAssignedSellerChange={(val) => { markDirty(); setAssignedSellerId(val); }}
        sellers={sellers}
        deliveryDate={deliveryDate}
        onDeliveryDateChange={(val) => { markDirty(); setDeliveryDate(val); }}
        currency={currency}
        onCurrencyChange={(val) => {
          markDirty();
          setCurrency(val);
          if (val === 'UZS') setExchangeRate(1);
        }}
        deliveryAddress={deliveryAddress}
        onDeliveryAddressChange={(val) => { markDirty(); setDeliveryAddress(val); }}
        comment={comment}
        onCommentChange={(val) => { markDirty(); setComment(val); }}
      />

      {/* Items Table Card */}
      <OrderItemsTable
        locale={locale}
        currency={currency}
        isLocked={isLocked}
        orderStatus={orderStatus}
        isPriceOverrideAllowed={isPriceOverrideAllowed}
        items={items}
        products={products}
        productOptions={productOptions}
        onItemChange={handleItemChange}
        onAddItem={addItemRow}
        onRemoveItem={removeItemRow}
      />

      {/* Totals Summary and Linked Invoices */}
      <OrderTotalsSummary
        locale={locale}
        currency={currency}
        calculations={calculations}
        paymentCondition={paymentCondition}
        requiredPaymentPercent={requiredPaymentPercent}
        salesInvoices={currentOrderData?.salesInvoices}
      />

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
        <>
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

          <PartialDispatchModal
            isOpen={isDispatchOpen}
            onClose={() => setIsDispatchOpen(false)}
            order={currentOrderData}
            onSuccess={() => {
              if (orderId) {
                apiFetch<any>(`/sales/orders/${orderId}`, { token: token || undefined, tenantId: company?.id, locale }).then((res) => {
                  if (res) {
                    setCurrentOrderData(res);
                    setOrderStatus(res.status);
                  }
                });
              }
            }}
          />

          <OrderPickListModal
            isOpen={isPickListOpen}
            onClose={() => setIsPickListOpen(false)}
            order={currentOrderData}
          />

          <OrderDeliveryNoteModal
            isOpen={isDeliveryNoteOpen}
            onClose={() => setIsDeliveryNoteOpen(false)}
            companyName={company?.name}
            order={currentOrderData}
          />
        </>
      )}
    </div>
  );
}
