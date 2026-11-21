'use client';

import { useState, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { useApiQuery, useInvalidateApi } from '@/lib/query/useApiQuery';
import { LoadError } from '@/components/ui/LoadError';
import { formatCurrency, formatDate, errorMessage, getLocalizedName } from '@/lib/utils';
import { Button, buttonStyle } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Drawer } from '@/components/ui/Drawer';
import { Select, SelectOption } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchField } from '@/components/ui/SearchField';
import { ActionsMenu } from '@/components/production/ActionsMenu';
import { ClipboardList, Plus, CreditCard, ExternalLink, PackageCheck } from 'lucide-react';
import { ORDER_STATUS_LABELS } from '@/components/sales/SalesOrderForm';
import { PaySalesOrderModal } from '@/components/sales/PaySalesOrderModal';
import { OrderPickListModal } from '@/components/sales/OrderPickListModal';
import { OrderDeliveryNoteModal } from '@/components/sales/OrderDeliveryNoteModal';
import { invalidateApiCache } from '@/lib/cache';
import { apiFetch } from '@/lib/api';
import { useConfirm } from '@/context/ConfirmContext';
import { toast } from '@/context/ToastContext';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { usePersistentState } from '@/lib/usePersistentState';
import { totalsByCurrency } from '@/lib/currency-totals';
import { localIsoDate } from '@/lib/date-range';
import {
  ActiveFilters,
  ALL_TIME,
  ChipGroup,
  ColumnChooser,
  CurrencyTotals,
  MoreFiltersButton,
  PeriodFilter,
  resolvePeriod,
  Signal,
  SignalStrip,
  useListFilters,
  type ActiveFilter,
  type PeriodValue,
} from '@/components/ui/list/ListKit';
import { DataTable, type Column, type SortState } from '@/components/ui/list/DataTable';
import { Facts, PaidProgress, PreviewHead } from '@/components/ui/list/Preview';
import type { SalesOrderDetail } from '@/components/sales/order-form/types';

const ORDERS_PAGE_SIZE = 50;

interface CounterpartyItem {
  id: string;
  name: string;
}

interface SellerItem {
  id: string;
  firstName: string;
  lastName: string;
}

interface OrderItemSummary {
  id: string;
  orderNumber: string;
  counterpartyId: string;
  counterparty?: { id: string; name: string; phone?: string } | null;
  status: string;
  paymentStatus: string;
  paymentCondition?: 'PREPAID_100' | 'PARTIAL' | 'CREDIT' | null;
  requiredPaymentPercent?: number | null;
  currency: string;
  totalAmount: number;
  paidAmount: number;
  debtAmount: number;
  deliveryDate?: string | null;
  createdAt: string;
  assignedSeller?: { id: string; firstName: string; lastName: string } | null;
  orderItems?: Array<{ id: string; quantity: number; readyQty?: number; isReady?: boolean }>;
}

type OrderStatsSummary = Partial<Record<string, number>>;

const FINISHED = ['SHIPPED', 'COMPLETED', 'CANCELLED'];
const STAGES = ['NEW', 'ACCEPTED', 'PROCESSING', 'READY_FOR_SHIPMENT', 'SHIPPED', 'COMPLETED', 'CANCELLED'] as const;
const STAGE_STAT: Record<string, string> = {
  NEW: 'new',
  ACCEPTED: 'accepted',
  PROCESSING: 'processing',
  READY_FOR_SHIPMENT: 'readyToShip',
  SHIPPED: 'shipped',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

const FILTER_DEFAULTS = {
  status: '',
  paymentStatus: '',
  counterpartyId: '',
  assignedSellerId: '',
  period: ALL_TIME as PeriodValue,
};

export default function SalesOrdersPage() {
  const { token, company, hasRole, hasPermission } = useAuth();
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const tIn = useTranslations('rd.inline');
  const confirm = useConfirm();
  const router = useRouter();
  const tl = useTranslations('rd.list');
  const td = useTranslations('rd.doc');
  const to = useTranslations('rd.orders');

  const [filters, setFilters, resetFilters] = useListFilters('orders.list', FILTER_DEFAULTS, ['status']);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim(), 350);
  const [moreOpen, setMoreOpen] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [pageSize, setPageSize] = useState(ORDERS_PAGE_SIZE);
  const [hiddenCols, setHiddenCols] = usePersistentState<string[]>('orders.list.hidden', ['condition']);
  const [sort, setSort] = usePersistentState<SortState | null>('orders.list.sort', null);
  const range = resolvePeriod(filters.period);
  const today = localIsoDate(new Date());

  // Modals
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [payOrder, setPayOrder] = useState<OrderItemSummary | null>(null);
  const [pickListOrder, setPickListOrder] = useState<SalesOrderDetail | null>(null);
  const [deliveryNoteOrder, setDeliveryNoteOrder] = useState<SalesOrderDetail | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  // Delete modal state
  const [deleteConfirmOrder, setDeleteConfirmOrder] = useState<OrderItemSummary | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const invalidateApi = useInvalidateApi();
  const handleDeleteOrder = async () => {
    if (!token || !company || !deleteConfirmOrder) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await apiFetch(`/sales/orders/${deleteConfirmOrder.id}`, { method: 'DELETE', token, tenantId: company.id, locale });
      if (previewId === deleteConfirmOrder.id) setPreviewId(null);
      setDeleteConfirmOrder(null);
      refresh();
    } catch (err) {
      setDeleteError(errorMessage(err) || (isRu ? 'Ошибка удаления заказа' : "Buyurtmani o'chirishda xatolik"));
    } finally {
      setDeleteLoading(false);
    }
  };

  // Role slugs are lowercase (common/auth/permission-catalog.ts SYSTEM_ROLES);
  // lifecycle actions are <module>:edit, there is no sales:post permission.
  const isWarehouseOperator = Boolean(hasRole('super_admin') || hasRole('company_admin') || hasRole('warehouse_manager') || hasPermission('inventory:create'));
  const canDelete = hasPermission('sales:delete') || hasRole('super_admin') || hasRole('company_admin');

  const handleQuickStatusChange = async (orderId: string, newStatus: string) => {
    if (!token) return;
    setUpdatingOrderId(orderId);
    try {
      await apiFetch(`/sales/orders/${orderId}/status`, {
        method: 'PATCH',
        token,
        tenantId: company?.id,
        body: JSON.stringify({ status: newStatus }),
      });
      invalidateApiCache('/sales/orders*');
      toast.success(isRu ? 'Статус заказа обновлен' : 'Buyurtma statusi yangilandi');
      // Refreshes the order list and the stats (both under /sales/orders).
      void invalidateApi('/sales/orders');
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Ошибка смены статуса' : 'Statusni o‘zgartirishda xatolik yuz berdi'));
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const getNextStatuses = (currentStatus: string): Array<{ status: string; labelUz: string; labelRu: string }> => {
    // Sellers can only cancel their own unaccepted orders
    if (!isWarehouseOperator) {
      if (currentStatus === 'NEW' || currentStatus === 'PENDING_APPROVAL') {
        return [{ status: 'CANCELLED', labelUz: 'Bekor qilish', labelRu: 'Отменить' }];
      }
      return [];
    }
    switch (currentStatus) {
      case 'NEW':
        return [
          { status: 'ACCEPTED', labelUz: 'Qabul qilish', labelRu: 'Принять' },
          { status: 'PROCESSING', labelUz: 'Yig‘ishga olish', labelRu: 'В сборку' },
          { status: 'CANCELLED', labelUz: 'Bekor qilish', labelRu: 'Отменить' },
        ];
      case 'ACCEPTED':
        return [
          { status: 'PROCESSING', labelUz: 'Yig‘ishga olish', labelRu: 'В сборку' },
          { status: 'READY_FOR_SHIPMENT', labelUz: 'Jo‘natishga tayyorlash', labelRu: 'Готов к отгрузке' },
          { status: 'SHIPPED', labelUz: 'Otgruzka qilish (Sotish)', labelRu: 'Отгрузить заказ' },
          { status: 'CANCELLED', labelUz: 'Bekor qilish', labelRu: 'Отменить' },
        ];
      case 'PROCESSING':
        return [
          { status: 'READY_FOR_SHIPMENT', labelUz: 'Jo‘natishga tayyorlash', labelRu: 'Готов к отгрузке' },
          { status: 'SHIPPED', labelUz: 'Otgruzka qilish (Sotish)', labelRu: 'Отгрузить заказ' },
          { status: 'CANCELLED', labelUz: 'Bekor qilish', labelRu: 'Отменить' },
        ];
      case 'READY_FOR_SHIPMENT':
      case 'READY_TO_SHIP':
        return [
          { status: 'SHIPPED', labelUz: 'Otgruzka qilish (Sotish)', labelRu: 'Отгрузить заказ' },
          { status: 'CANCELLED', labelUz: 'Bekor qilish', labelRu: 'Отменить' },
        ];
      default:
        return [];
    }
  };

  /** Same confirmations as before for cancel and ship; other steps go straight through. */
  const runStatus = async (ord: OrderItemSummary, next: string) => {
    if (next === 'CANCELLED') {
      const ok = await confirm({
        title: isRu ? 'Отмена заказа' : 'Buyurtmani bekor qilish',
        description: isRu ? 'Вы уверены, что хотите отменить этот заказ?' : 'Haqiqatan ham bu buyurtmani bekor qilmoqchimisiz?',
        variant: 'warning',
        confirmText: isRu ? 'Отменить заказ' : 'Bekor qilish',
        cancelText: isRu ? 'Назад' : 'Orqaga',
      });
      if (ok) void handleQuickStatusChange(ord.id, next);
    } else if (next === 'SHIPPED') {
      const ok = await confirm({
        title: isRu ? 'Отгрузка заказа' : 'Buyurtmani otgruzka qilish',
        description: isRu ? 'Выполнить отгрузку (создать счет-фактуру и списать склад)?' : 'Otgruzka qilish (sotuv fakturasi yaratish va qoldiqdan ayirish)ni tasdiqlaysizmi?',
        variant: 'info',
        confirmText: isRu ? 'Отгрузить' : 'Otgruzka qilish',
        cancelText: isRu ? 'Отмена' : 'Bekor qilish',
      });
      if (ok) void handleQuickStatusChange(ord.id, next);
    } else {
      void handleQuickStatusChange(ord.id, next);
    }
  };

  // Reference data, fresh for 5 minutes (TanStack Query, see docs/frontend-data-loading.md)
  const { data: rawCp } = useApiQuery<CounterpartyItem[] | { data: CounterpartyItem[] }>('/sales/counterparties', { staleTime: 5 * 60 * 1000 });
  const counterparties: CounterpartyItem[] = useMemo(() => (!rawCp ? [] : Array.isArray(rawCp) ? rawCp : rawCp.data || []), [rawCp]);
  const { data: rawUsers } = useApiQuery<SellerItem[] | { data: SellerItem[] }>('/users', { staleTime: 5 * 60 * 1000 });
  const sellers: SellerItem[] = useMemo(() => {
    if (!rawUsers) return [];
    const list = Array.isArray(rawUsers) ? rawUsers : rawUsers.data || [];
    return list.map((u) => ({ id: u.id, firstName: u.firstName, lastName: u.lastName }));
  }, [rawUsers]);

  const statsQuery = useApiQuery<OrderStatsSummary>('/sales/orders/stats');
  const stats = statsQuery.data ?? {};

  // The endpoint string carries the filters: a new filter is a new query.
  const ordersEndpoint = useMemo(() => {
    const query = new URLSearchParams();
    if (debouncedSearch) query.append('search', debouncedSearch);
    if (filters.counterpartyId) query.append('counterpartyId', filters.counterpartyId);
    if (filters.status) query.append('status', filters.status);
    if (filters.paymentStatus) query.append('paymentStatus', filters.paymentStatus);
    if (filters.assignedSellerId) query.append('assignedSellerId', filters.assignedSellerId);
    if (range.from) query.append('dateFrom', range.from);
    if (range.to) query.append('dateTo', range.to);
    query.append('take', String(pageSize));
    return `/sales/orders?${query.toString()}`;
  }, [debouncedSearch, filters.counterpartyId, filters.status, filters.paymentStatus, filters.assignedSellerId, range.from, range.to, pageSize]);

  const ordersQuery = useApiQuery<{ data: OrderItemSummary[]; total: number }>(ordersEndpoint, { staleTime: 10000, keepPrevious: true });
  const allOrders = useMemo(() => ordersQuery.data?.data ?? [], [ordersQuery.data]);
  const totalOrders = ordersQuery.data?.total ?? 0;
  const refresh = () => {
    void statsQuery.refetch();
    void ordersQuery.refetch();
  };

  const isOverdue = (o: OrderItemSummary) => Boolean(o.deliveryDate && o.deliveryDate.slice(0, 10) < today && !FINISHED.includes(o.status));
  const overdueCount = allOrders.filter(isOverdue).length;
  const orders = overdueOnly ? allOrders.filter(isOverdue) : allOrders;
  const preview = allOrders.find((o) => o.id === previewId) ?? null;

  const statusMeta = (st: string) => ORDER_STATUS_LABELS[st] || { uz: st, ru: st, variant: 'neutral' };
  const statusBadge = (st: string) => {
    const m = statusMeta(st);
    return <Badge variant={(m.variant as 'success' | 'warning' | 'error' | 'info' | 'neutral') || 'neutral'}>{isRu ? m.ru : m.uz}</Badge>;
  };
  const paymentBadge = (pst: string) =>
    pst === 'PAID' ? <Badge variant="success">{td('paid')}</Badge> : pst === 'PARTIALLY_PAID' || pst === 'PARTIAL' ? <Badge variant="warning">{td('partial')}</Badge> : <Badge variant="error">{td('unpaid')}</Badge>;
  const conditionText = (o: OrderItemSummary) =>
    o.paymentCondition === 'PREPAID_100' ? to('prepaid') : o.paymentCondition === 'PARTIAL' ? to('advance', { pct: o.requiredPaymentPercent ?? 0 }) : to('credit');
  const readyText = (o: OrderItemSummary) => {
    const items = o.orderItems ?? [];
    if (items.length === 0) return null;
    return to('readyOf', { ready: items.filter((i) => i.isReady).length, total: items.length });
  };

  /** The row's main next step: the first forward status (not cancel). */
  const nextStep = (o: OrderItemSummary) => getNextStatuses(o.status).find((s) => s.status !== 'CANCELLED');

  const rowMenu = (o: OrderItemSummary) => (
    <ActionsMenu
      label={tl('rowActions')}
      actions={[
        { label: tl('open'), onSelect: () => router.push(`/sales/orders/${o.id}`) },
        { label: td('takePayment'), onSelect: () => setPayOrder(o), hidden: o.status === 'CANCELLED' || o.status === 'COMPLETED' },
        { label: to('pickList'), onSelect: () => setPickListOrder(o as unknown as SalesOrderDetail) },
        { label: to('deliveryNote'), onSelect: () => setDeliveryNoteOrder(o as unknown as SalesOrderDetail), hidden: o.status !== 'SHIPPED' },
        ...getNextStatuses(o.status)
          .filter((s) => s.status !== nextStep(o)?.status)
          .map((s) => ({ label: isRu ? s.labelRu : s.labelUz, onSelect: () => void runStatus(o, s.status), danger: s.status === 'CANCELLED' })),
        { label: tl('delete'), onSelect: () => { setDeleteConfirmOrder(o); setDeleteError(null); }, danger: true, hidden: !canDelete || o.status === 'SHIPPED' || o.status === 'COMPLETED' },
      ]}
    />
  );

  const totals = (amount: (r: OrderItemSummary) => number) => <CurrencyTotals totals={totalsByCurrency(orders, (r) => r.currency, amount)} locale={locale} />;

  const columns: Column<OrderItemSummary>[] = [
    {
      key: 'number',
      label: tIn('sana'),
      primary: true,
      locked: true,
      sortValue: (r) => r.createdAt,
      render: (r) => (
        <div>
          <div className="rd-doc-no">{r.orderNumber}</div>
          <div className="rd-sub">{formatDate(r.createdAt)}</div>
        </div>
      ),
      footer: <span>{tl('total')} · {tl('results', { count: orders.length })}</span>,
    },
    {
      key: 'customer',
      label: to('customer'),
      sortValue: (r) => r.counterparty?.name ?? '',
      render: (r) => (
        <div>
          <div style={{ fontWeight: 'var(--font-medium)' }}>{r.counterparty?.name || '—'}</div>
          {r.assignedSeller && <div className="rd-sub">{r.assignedSeller.firstName} {r.assignedSeller.lastName}</div>}
        </div>
      ),
    },
    {
      key: 'delivery',
      label: to('delivery'),
      sortValue: (r) => r.deliveryDate ?? '9999',
      render: (r) =>
        r.deliveryDate ? (
          <span className={isOverdue(r) ? 'rd-due' : undefined}>
            {formatDate(r.deliveryDate)}
            {isOverdue(r) && <span className="rd-sub" style={{ color: 'inherit' }}> · {to('overdue')}</span>}
          </span>
        ) : (
          <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
        ),
    },
    {
      key: 'status',
      label: to('stage'),
      sortValue: (r) => STAGES.indexOf(r.status as (typeof STAGES)[number]),
      render: (r) => (
        <div className="rd-status-stack">
          {statusBadge(r.status)}
          {readyText(r) && !FINISHED.includes(r.status) && <span className="rd-sub">{readyText(r)}</span>}
        </div>
      ),
    },
    { key: 'condition', label: to('condition'), render: (r) => <span className="rd-sub" style={{ marginTop: 0 }}>{conditionText(r)}</span> },
    { key: 'amount', label: tl('amount'), numeric: true, sortValue: (r) => Number(r.totalAmount || 0), render: (r) => <strong>{formatCurrency(Number(r.totalAmount || 0), locale, r.currency)}</strong>, footer: totals((r) => Number(r.totalAmount || 0)) },
    {
      key: 'paid',
      label: to('payment'),
      numeric: true,
      sortValue: (r) => Number(r.paidAmount || 0),
      render: (r) => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span>{formatCurrency(Number(r.paidAmount || 0), locale, r.currency)}</span>
          {r.status !== 'CANCELLED' && paymentBadge(r.paymentStatus)}
        </div>
      ),
      footer: totals((r) => Number(r.paidAmount || 0)),
    },
    {
      key: 'actions',
      label: tIn('amallar'),
      locked: true,
      render: (r) => {
        const step = nextStep(r);
        return (
          <div className="rd-row-actions">
            {step && (
              <button type="button" className="rd-next-btn" disabled={updatingOrderId === r.id} onClick={() => void runStatus(r, step.status)}>
                {isRu ? step.labelRu : step.labelUz}
              </button>
            )}
            {rowMenu(r)}
          </div>
        );
      },
    },
  ];

  const customerOptions: SelectOption[] = [{ value: '', label: to('anyCustomer') }, ...counterparties.map((c) => ({ value: c.id, label: c.name }))];
  const sellerOptions: SelectOption[] = [{ value: '', label: to('anySeller') }, ...sellers.map((s) => ({ value: s.id, label: `${s.firstName} ${s.lastName}` }))];
  const stageOptions = [
    { value: '', label: tl('all'), count: undefined as number | undefined },
    ...STAGES.map((st) => ({ value: st as string, label: isRu ? statusMeta(st).ru : statusMeta(st).uz, count: stats[STAGE_STAT[st]] })),
  ];
  const paymentOptions = [
    { value: 'UNPAID', label: td('unpaid') },
    { value: 'PARTIALLY_PAID', label: td('partial') },
    { value: 'PAID', label: td('paid') },
  ];

  const active: ActiveFilter[] = [];
  if (debouncedSearch) active.push({ key: 'q', label: `«${debouncedSearch}»`, onClear: () => setSearch('') });
  if (filters.counterpartyId) active.push({ key: 'c', label: counterparties.find((c) => c.id === filters.counterpartyId)?.name ?? to('customer'), onClear: () => setFilters({ counterpartyId: '' }) });
  if (filters.assignedSellerId) {
    const s = sellers.find((x) => x.id === filters.assignedSellerId);
    active.push({ key: 's', label: s ? `${s.firstName} ${s.lastName}` : to('seller'), onClear: () => setFilters({ assignedSellerId: '' }) });
  }
  if (overdueOnly) active.push({ key: 'o', label: to('sigOverdue'), onClear: () => setOverdueOnly(false) });
  const anyFilter = Boolean(debouncedSearch || filters.status || filters.paymentStatus || filters.counterpartyId || filters.assignedSellerId || filters.period.key !== 'all' || overdueOnly);
  const clearAll = () => {
    setSearch('');
    setOverdueOnly(false);
    resetFilters();
  };

  return (
    <div className="rd-page">
      <PageHeader
        title={isRu ? 'Заказы покупателей' : 'Buyurtmalar'}
        subtitle={to('subtitle')}
        actions={
          <Link href="/sales/orders/new" style={buttonStyle('primary')}>
            <Plus size={18} aria-hidden /> {to('newOrder')}
          </Link>
        }
      />

      <SignalStrip label={tl('summary')}>
        <Signal tone="warning" label={to('sigNew')} value={(stats.new ?? 0) + (stats.pendingApproval ?? 0)} hint={to('sigNewHint')} active={filters.status === 'NEW'} onClick={() => setFilters({ status: filters.status === 'NEW' ? '' : 'NEW' })} />
        <Signal tone="success" label={to('sigReady')} value={stats.readyToShip ?? 0} hint={to('sigReadyHint')} active={filters.status === 'READY_FOR_SHIPMENT'} onClick={() => setFilters({ status: filters.status === 'READY_FOR_SHIPMENT' ? '' : 'READY_FOR_SHIPMENT' })} />
        <Signal tone="error" label={to('sigOverdue')} value={overdueCount} hint={to('sigOverdueHint')} active={overdueOnly} onClick={() => setOverdueOnly((v) => !v)} />
        <Signal tone="info" label={to('sigActive')} value={stats.activeOrders ?? 0} hint={to('sigActiveHint')} />
      </SignalStrip>

      <div className="rd-toolbar">
        <div className="rd-toolbar-row">
          <SearchField value={search} onChange={setSearch} placeholder={to('searchPh')} label={tl('search')} />
          <ColumnChooser columns={columns.map((c) => ({ key: c.key, label: c.label, locked: c.locked }))} hidden={hiddenCols} onChange={setHiddenCols} />
        </div>
        <div className="rd-toolbar-row">
          <ChipGroup label={to('stage')} showLabel options={stageOptions} value={filters.status} onChange={(v) => setFilters({ status: v })} />
        </div>
        <div className="rd-toolbar-row">
          <ChipGroup label={to('payment')} showLabel options={paymentOptions} value={filters.paymentStatus} onChange={(v) => setFilters({ paymentStatus: v })} />
          <span className="rd-toolbar-spacer" />
          <MoreFiltersButton open={moreOpen} onToggle={() => setMoreOpen((o) => !o)} activeCount={(filters.counterpartyId ? 1 : 0) + (filters.assignedSellerId ? 1 : 0) + (filters.period.key !== 'all' ? 1 : 0)} controls="orders-more" />
        </div>
        {moreOpen && (
          <div id="orders-more" className="rd-more-panel">
            <div>
              <span className="rd-field-label">{to('customer')}</span>
              <Select options={customerOptions} value={filters.counterpartyId} onChange={(v) => setFilters({ counterpartyId: v })} searchable />
            </div>
            <div>
              <span className="rd-field-label">{to('seller')}</span>
              <Select options={sellerOptions} value={filters.assignedSellerId} onChange={(v) => setFilters({ assignedSellerId: v })} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <span className="rd-field-label">{tl('period')}</span>
              <PeriodFilter value={filters.period} onChange={(p) => setFilters({ period: p })} locale={locale} />
            </div>
          </div>
        )}
        <ActiveFilters items={active} onClearAll={clearAll} />
      </div>

      <div className="rd-table-card">
        {ordersQuery.isError ? (
          <LoadError error={ordersQuery.error} onRetry={() => void ordersQuery.refetch()} retrying={ordersQuery.isFetching} />
        ) : (
          <DataTable
            rows={orders}
            columns={columns}
            rowKey={(r) => r.id}
            hidden={hiddenCols}
            sort={sort}
            onSortChange={setSort}
            onRowClick={(r) => setPreviewId(r.id)}
            selectedKey={previewId}
            loading={ordersQuery.isPending}
            caption={tl('clickRowHint')}
            empty={
              anyFilter ? (
                <EmptyState icon={ClipboardList} title={tl('nothingFound')} description={tl('nothingFoundHint')} action={<Button variant="secondary" onClick={clearAll}>{tl('clearFilters')}</Button>} />
              ) : (
                <EmptyState
                  icon={ClipboardList}
                  title={to('noOrders')}
                  description={to('noOrdersHint')}
                  action={
                    <Link href="/sales/orders/new" style={buttonStyle('primary')}>
                      <Plus size={16} aria-hidden /> {to('newOrder')}
                    </Link>
                  }
                />
              )
            }
          />
        )}
        {allOrders.length < totalOrders && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4)', borderTop: '1px solid var(--color-border-light)' }}>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{to('shownOf', { shown: allOrders.length, total: totalOrders })}</span>
            <Button variant="secondary" size="sm" onClick={() => setPageSize((n) => n + ORDERS_PAGE_SIZE)}>
              {to('showMore')}
            </Button>
          </div>
        )}
      </div>

      {preview && (
        <Drawer
          isOpen
          onClose={() => setPreviewId(null)}
          title={to('previewTitle', { number: preview.orderNumber })}
          description={`${preview.counterparty?.name ?? '—'} · ${formatDate(preview.createdAt)}`}
          size="md"
          footer={
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', justifyContent: 'flex-end', width: '100%' }}>
              <Button variant="secondary" onClick={() => setPickListOrder(preview as unknown as SalesOrderDetail)}>
                <PackageCheck size={16} aria-hidden /> {to('pickList')}
              </Button>
              <Link href={`/sales/orders/${preview.id}`} style={buttonStyle('secondary')}>
                <ExternalLink size={16} aria-hidden /> {tl('openFull')}
              </Link>
              {preview.status !== 'CANCELLED' && preview.status !== 'COMPLETED' && preview.paymentStatus !== 'PAID' && (
                <Button onClick={() => setPayOrder(preview)}>
                  <CreditCard size={16} aria-hidden /> {td('takePayment')}
                </Button>
              )}
            </div>
          }
        >
          <PreviewHead
            badges={
              <>
                {statusBadge(preview.status)}
                {preview.status !== 'CANCELLED' && paymentBadge(preview.paymentStatus)}
              </>
            }
            amount={formatCurrency(Number(preview.totalAmount || 0), locale, preview.currency)}
            caption={
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <PaidProgress paid={Number(preview.paidAmount || 0)} total={Number(preview.totalAmount || 0)} label={tl('paidShare')} />
                <span>
                  {tl('paid')}: {formatCurrency(Number(preview.paidAmount || 0), locale, preview.currency)}
                  {Number(preview.debtAmount || 0) > 0 && (
                    <>
                      {' · '}
                      <span className="rd-due">
                        {tl('due')}: {formatCurrency(Number(preview.debtAmount), locale, preview.currency)}
                      </span>
                    </>
                  )}
                </span>
              </div>
            }
          />
          <Facts
            items={[
              { label: to('customer'), value: preview.counterparty?.name ?? '—' },
              { label: to('phone'), value: preview.counterparty?.phone, hidden: !preview.counterparty?.phone },
              { label: to('delivery'), value: preview.deliveryDate ? `${formatDate(preview.deliveryDate)}${isOverdue(preview) ? ` · ${to('overdue')}` : ''}` : '—' },
              { label: to('condition'), value: conditionText(preview) },
              { label: to('seller'), value: preview.assignedSeller ? `${preview.assignedSeller.firstName} ${preview.assignedSeller.lastName}` : '—' },
              { label: to('items'), value: readyText(preview) ?? String(preview.orderItems?.length ?? 0) },
            ]}
          />
          {nextStep(preview) && (
            <Button style={{ width: '100%' }} disabled={updatingOrderId === preview.id} onClick={() => void runStatus(preview, nextStep(preview)!.status)}>
              {isRu ? nextStep(preview)!.labelRu : nextStep(preview)!.labelUz}
            </Button>
          )}
        </Drawer>
      )}

      {payOrder && <PaySalesOrderModal isOpen onClose={() => setPayOrder(null)} order={payOrder} onSuccess={refresh} />}
      {pickListOrder && <OrderPickListModal isOpen onClose={() => setPickListOrder(null)} order={pickListOrder} />}
      {deliveryNoteOrder && (
        <OrderDeliveryNoteModal isOpen onClose={() => setDeliveryNoteOrder(null)} companyName={company?.name ? getLocalizedName(company.name, locale) : undefined} order={deliveryNoteOrder} />
      )}

      {/* Delete confirmation: shared dialog (role=dialog, Esc, focus kept inside) */}
      <Modal
        isOpen={Boolean(deleteConfirmOrder)}
        onClose={() => {
          if (!deleteLoading) setDeleteConfirmOrder(null);
        }}
        title={isRu ? 'Удалить заказ?' : 'Buyurtmani o‘chirish?'}
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setDeleteConfirmOrder(null)} disabled={deleteLoading}>
              {isRu ? 'Отмена' : 'Bekor qilish'}
            </Button>
            <Button type="button" variant="danger" onClick={handleDeleteOrder} loading={deleteLoading} loadingText={isRu ? 'Удаление…' : 'O‘chirilmoqda…'}>
              {isRu ? 'Да, удалить' : 'Ha, o‘chirish'}
            </Button>
          </>
        }
      >
        {deleteError && (
          <div role="alert" className="doc-banner is-error" style={{ marginBottom: 'var(--space-4)' }}>
            {deleteError}
          </div>
        )}
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
          {deleteConfirmOrder &&
            (isRu
              ? `Заказ № ${deleteConfirmOrder.orderNumber} будет удалён, позиции и бронь товаров аннулированы.`
              : `№ ${deleteConfirmOrder.orderNumber} buyurtma o‘chiriladi, tovarlar va bron bekor qilinadi.`)}
        </p>
      </Modal>
    </div>
  );
}
