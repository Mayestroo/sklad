'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, SelectOption } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import {
  ClipboardList,
  Plus,
  Eye,
  RotateCcw,
  Filter,
  Search,
  Factory,
  Truck,
  CreditCard,
  CheckCircle,
  AlertCircle,
  Package,
  Layers,
} from 'lucide-react';
import { CreateSalesOrderModal } from '@/components/sales/CreateSalesOrderModal';
import {
  SalesOrderDetailModal,
  ORDER_STATUS_LABELS,
} from '@/components/sales/SalesOrderDetailModal';

interface CounterpartyItem {
  id: string;
  name: string;
}
interface WarehouseItem {
  id: string;
  name: any;
}
interface ProductItem {
  id: string;
  name: any;
  sku: string;
}
interface SellerItem {
  id: string;
  firstName: string;
  lastName: string;
}

export default function SalesOrdersPage() {
  const { token, company } = useAuth();
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  // Data states
  const [orders, setOrders] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState<any>(null);
  const [counterparties, setCounterparties] = useState<CounterpartyItem[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [sellers, setSellers] = useState<SellerItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters (All 8 spec criteria)
  const [search, setSearch] = useState('');
  const [counterpartyId, setCounterpartyId] = useState('');
  const [status, setStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [productId, setProductId] = useState('');
  const [assignedSellerId, setAssignedSellerId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [deliveryDateFrom, setDeliveryDateFrom] = useState('');
  const [deliveryDateTo, setDeliveryDateTo] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // Fetch initial dropdown references
  useEffect(() => {
    if (!token || !company) return;

    apiFetch<{ data: CounterpartyItem[] }>('/counterparties', {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then((res) => setCounterparties(res?.data || (res as any) || []))
      .catch(console.error);

    apiFetch<WarehouseItem[]>('/inventory/warehouses', {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then((res) => setWarehouses(res || []))
      .catch(console.error);

    apiFetch<ProductItem[]>('/inventory/products', {
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
        const uList = (res?.data || res || []).map((u: any) => ({
          id: u.id,
          firstName: u.firstName,
          lastName: u.lastName,
        }));
        setSellers(uList);
      })
      .catch(console.error);
  }, [token, company, locale]);

  // Fetch orders and dashboard stats
  const fetchOrders = useCallback(() => {
    if (!token || !company) return;
    setLoading(true);

    const query = new URLSearchParams();
    if (search) query.append('search', search);
    if (counterpartyId) query.append('counterpartyId', counterpartyId);
    if (status) query.append('status', status);
    if (paymentStatus) query.append('paymentStatus', paymentStatus);
    if (productId) query.append('productId', productId);
    if (assignedSellerId) query.append('assignedSellerId', assignedSellerId);
    if (dateFrom) query.append('dateFrom', dateFrom);
    if (dateTo) query.append('dateTo', dateTo);
    if (deliveryDateFrom) query.append('deliveryDateFrom', deliveryDateFrom);
    if (deliveryDateTo) query.append('deliveryDateTo', deliveryDateTo);

    Promise.all([
      apiFetch<{ data: any[]; total: number }>(`/api/sales/orders?${query.toString()}`, {
        token: token || undefined,
        tenantId: company.id,
        locale,
      }),
      apiFetch<any>('/api/sales/orders/stats', {
        token: token || undefined,
        tenantId: company.id,
        locale,
      }),
    ])
      .then(([ordersRes, statsRes]) => {
        setOrders(ordersRes?.data || []);
        setTotalCount(ordersRes?.total || 0);
        setStats(statsRes);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [
    token,
    company,
    locale,
    search,
    counterpartyId,
    status,
    paymentStatus,
    productId,
    assignedSellerId,
    dateFrom,
    dateTo,
    deliveryDateFrom,
    deliveryDateTo,
  ]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const resetFilters = () => {
    setSearch('');
    setCounterpartyId('');
    setStatus('');
    setPaymentStatus('');
    setProductId('');
    setAssignedSellerId('');
    setDateFrom('');
    setDateTo('');
    setDeliveryDateFrom('');
    setDeliveryDateTo('');
  };

  const statusOptions: SelectOption[] = [
    { value: '', label: isRu ? 'Все статусы' : 'Barcha statuslar' },
    ...Object.entries(ORDER_STATUS_LABELS).map(([k, v]) => ({
      value: k,
      label: isRu ? v.ru : v.uz,
    })),
  ];

  const paymentStatusOptions: SelectOption[] = [
    { value: '', label: isRu ? 'Любая оплата' : 'Barcha to‘lovlar' },
    { value: 'PAID', label: isRu ? 'Полностью оплачен' : 'To‘liq to‘langan' },
    { value: 'PARTIALLY_PAID', label: isRu ? 'Частично оплачен' : 'Qisman to‘langan' },
    { value: 'UNPAID', label: isRu ? 'Не оплачен' : 'To‘lanmagan' },
  ];

  const counterpartyOptions: SelectOption[] = [
    { value: '', label: isRu ? 'Все контрагенты' : 'Barcha mijozlar' },
    ...counterparties.map((c) => ({ value: c.id, label: c.name })),
  ];

  const productOptions: SelectOption[] = [
    { value: '', label: isRu ? 'Все товары' : 'Barcha mahsulotlar' },
    ...products.map((p) => {
      const name = typeof p.name === 'object' ? (p.name[locale] || p.name.uz || '') : p.name;
      return { value: p.id, label: `${name} (${p.sku})` };
    }),
  ];

  const sellerOptions: SelectOption[] = [
    { value: '', label: isRu ? 'Все продавцы' : 'Barcha sotuvchilar' },
    ...sellers.map((s) => ({ value: s.id, label: `${s.firstName} ${s.lastName}` })),
  ];

  const pipeline = stats?.pipeline || {};
  const inProductionCount =
    (pipeline.SENT_TO_PRODUCTION || 0) +
    (pipeline.IN_PRODUCTION || 0) +
    (pipeline.PARTIALLY_READY || 0);
  const readyToShipCount = pipeline.READY_TO_SHIP || 0;
  const awaitingPaymentCount = pipeline.AWAITING_PAYMENT || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 'var(--text-2xl)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ClipboardList size={28} color="var(--color-primary)" />
            {isRu ? 'Заказы клиентов (Заявки)' : 'Zakazlar (Mijoz buyurtmalari)'}
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            {isRu
              ? 'Полный цикл: от приёма заявки и производства до оплаты и отгрузки со склада'
              : 'Qabul qilish, ishlab chiqarish, to‘lov nazorati va ombordan chiqim qilish jarayoni'}
          </p>
        </div>

        <Button variant="primary" onClick={() => setIsCreateOpen(true)}>
          <Plus size={16} style={{ marginRight: '6px' }} />
          {isRu ? 'Новый заказ' : 'Yangi zakaz'}
        </Button>
      </div>

      {/* KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 'var(--spacing-md)',
        }}
      >
        <Card style={{ padding: 'var(--spacing-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
              {isRu ? 'ВСЕГО ЗАКАЗОВ' : 'JAMI ZAKAZLAR'}
            </span>
            <Layers size={18} color="var(--color-primary)" />
          </div>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, marginTop: '8px' }}>
            {totalCount}
          </div>
        </Card>

        <Card style={{ padding: 'var(--spacing-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
              {isRu ? 'В ПРОИЗВОДСТВЕ' : 'ISHLAB CHIQARISHDA'}
            </span>
            <Factory size={18} color="var(--color-warning)" />
          </div>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, marginTop: '8px', color: 'var(--color-warning)' }}>
            {inProductionCount}
          </div>
        </Card>

        <Card style={{ padding: 'var(--spacing-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
              {isRu ? 'ОЖИДАЮТ ОПЛАТЫ' : 'TO‘LOV KUTILMOQDA'}
            </span>
            <CreditCard size={18} color="var(--color-error)" />
          </div>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, marginTop: '8px', color: 'var(--color-error)' }}>
            {awaitingPaymentCount}
          </div>
        </Card>

        <Card style={{ padding: 'var(--spacing-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
              {isRu ? 'ГОТОВЫ К ОТГРУЗКЕ' : 'JO‘NATISHGA TAYYOR'}
            </span>
            <Truck size={18} color="var(--color-success)" />
          </div>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, marginTop: '8px', color: 'var(--color-success)' }}>
            {readyToShipCount}
          </div>
        </Card>
      </div>

      {/* Filter Bar (8 criteria) */}
      <Card style={{ padding: 'var(--spacing-md)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 'var(--spacing-sm)',
              alignItems: 'center',
            }}
          >
            <div>
              <Input
                placeholder={isRu ? 'Номер заказа (напр. Z-2026-0001)...' : 'Zakaz raqami (Z-2026-0001)...'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div>
              <Select options={counterpartyOptions} value={counterpartyId} onChange={(val) => setCounterpartyId(val)} />
            </div>
            <div>
              <Select options={statusOptions} value={status} onChange={(val) => setStatus(val)} />
            </div>
            <div>
              <Select options={paymentStatusOptions} value={paymentStatus} onChange={(val) => setPaymentStatus(val)} />
            </div>
          </div>

          {/* Advanced toggle & secondary row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            >
              <Filter size={14} style={{ marginRight: '6px' }} />
              {showAdvancedFilters
                ? isRu ? 'Скрыть доп. фильтры' : 'Qo‘shimcha filtrlarni yashirish'
                : isRu ? 'Дополнительные фильтры (Товар, Продавец, Даты)' : 'Qo‘shimcha filtrlar (Mahsulot, Sotuvchi, Sanalar)'}
            </Button>

            {(search || counterpartyId || status || paymentStatus || productId || assignedSellerId || dateFrom || dateTo || deliveryDateFrom || deliveryDateTo) && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                <RotateCcw size={14} style={{ marginRight: '6px' }} />
                {isRu ? 'Сбросить фильтры' : 'Filtrlarni tozalash'}
              </Button>
            )}
          </div>

          {showAdvancedFilters && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 'var(--spacing-sm)',
                paddingTop: 'var(--spacing-sm)',
                borderTop: '1px dashed var(--color-border-light)',
              }}
            >
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: '2px' }}>
                  {isRu ? 'Товар в заказе' : 'Zakazdagi mahsulot'}
                </label>
                <Select options={productOptions} value={productId} onChange={(val) => setProductId(val)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: '2px' }}>
                  {isRu ? 'Ответственный продавец' : 'Mas‘ul sotuvchi'}
                </label>
                <Select options={sellerOptions} value={assignedSellerId} onChange={(val) => setAssignedSellerId(val)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: '2px' }}>
                  {isRu ? 'Дата заказа (с / по)' : 'Buyurtma sanasi (dan / gacha)'}
                </label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: '2px' }}>
                  {isRu ? 'Срок доставки (с / по)' : 'Yetkazish sanasi (dan / gacha)'}
                </label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <Input type="date" value={deliveryDateFrom} onChange={(e) => setDeliveryDateFrom(e.target.value)} />
                  <Input type="date" value={deliveryDateTo} onChange={(e) => setDeliveryDateTo(e.target.value)} />
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Orders Table */}
      <Card style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
            <thead>
              <tr
                style={{
                  backgroundColor: 'var(--color-bg-secondary)',
                  borderBottom: '1px solid var(--color-border-light)',
                  color: 'var(--color-text-secondary)',
                  textAlign: 'left',
                }}
              >
                <th style={{ padding: '12px 16px' }}>{isRu ? '№ Заказа' : 'Zakaz №'}</th>
                <th style={{ padding: '12px 16px' }}>{isRu ? 'Дата' : 'Sana'}</th>
                <th style={{ padding: '12px 16px' }}>{isRu ? 'Клиент' : 'Mijoz'}</th>
                <th style={{ padding: '12px 16px' }}>{isRu ? 'Сумма' : 'Jami summa'}</th>
                <th style={{ padding: '12px 16px' }}>{isRu ? 'Оплата' : 'To‘lov holati'}</th>
                <th style={{ padding: '12px 16px' }}>{isRu ? 'Условие' : 'To‘lov sharti'}</th>
                <th style={{ padding: '12px 16px' }}>{isRu ? 'Статус' : 'Holat'}</th>
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>{isRu ? 'Действия' : 'Amallar'}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-secondary)' }}>
                    {isRu ? 'Загрузка заказов...' : 'Zakazlar yuklanmoqda...'}
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-secondary)' }}>
                    {isRu ? 'Заказы не найдены' : 'Zakazlar topilmadi'}
                  </td>
                </tr>
              ) : (
                orders.map((o) => {
                  const statusObj = ORDER_STATUS_LABELS[o.status] || {
                    uz: o.status,
                    ru: o.status,
                    variant: 'neutral' as const,
                  };

                  const payPercent = o.paymentPercent || 0;
                  const payBadgeVariant = payPercent >= 100 ? 'success' : payPercent > 0 ? 'warning' : 'error';

                  return (
                    <tr
                      key={o.id}
                      style={{
                        borderBottom: '1px solid var(--color-border-light)',
                        transition: 'background-color var(--transition-fast)',
                      }}
                    >
                      <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                        {o.orderNumber}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)' }}>
                        {formatDate(o.orderDate || o.createdAt)}
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 500 }}>
                        {o.counterparty?.name || '—'}
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                        {formatCurrency(Number(o.totalAmount), o.currency)}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <Badge variant={payBadgeVariant}>
                            {formatCurrency(Number(o.paidAmount), o.currency)} ({payPercent}%)
                          </Badge>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                        {o.paymentCondition === 'PREPAID_100'
                          ? '100% oldindan'
                          : o.paymentCondition === 'PARTIAL'
                          ? `${o.requiredPaymentPercent || 50}% oldindan`
                          : 'Nasiya / Qarzga'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <Badge variant={statusObj.variant}>
                          {isRu ? statusObj.ru : statusObj.uz}
                        </Badge>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setSelectedOrderId(o.id)}
                        >
                          <Eye size={14} style={{ marginRight: '4px' }} />
                          {isRu ? 'Просмотр' : 'Ko‘rish'}
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create Order Modal */}
      {isCreateOpen && (
        <CreateSalesOrderModal
          onClose={() => setIsCreateOpen(false)}
          onCreated={fetchOrders}
          counterparties={counterparties}
        />
      )}

      {/* Detail & Action Modal */}
      {selectedOrderId && (
        <SalesOrderDetailModal
          orderId={selectedOrderId}
          onClose={() => setSelectedOrderId(null)}
          onUpdated={fetchOrders}
          warehouses={warehouses}
        />
      )}
    </div>
  );
}
