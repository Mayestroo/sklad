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
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { ActionsMenu } from '@/components/production/ActionsMenu';
import { ClipboardList, Plus, CreditCard, ExternalLink, PackageCheck, FileText, Trash2 } from 'lucide-react';
import { ORDER_STATUS_LABELS } from '@/components/sales/SalesOrderForm';
import { PaySalesOrderModal } from '@/components/sales/PaySalesOrderModal';
import { OrderPickListModal } from '@/components/sales/OrderPickListModal';
import { OrderDeliveryNoteModal } from '@/components/sales/OrderDeliveryNoteModal';
import { invalidateApiCache } from '@/lib/cache';
import { apiFetch } from '@/lib/api';
import { useConfirm } from '@/context/ConfirmContext';
import { toast } from '@/context/ToastContext';
import { usePersistentState } from '@/lib/usePersistentState';
import { totalsByCurrency } from '@/lib/currency-totals';
import { localIsoDate } from '@/lib/date-range';
import { CurrencyTotals } from '@/components/ui/list/ListKit';
import { ColumnChooser, FilterBar, periodRange, useFilterState, type FilterDef } from '@/components/ui/filters';
import { StatCard, StatCardGrid } from '@/components/ui/stats/StatCard';
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
  period: '',
  /** Delivery date passed, not shipped — applied to the loaded rows. */
  overdue: '',
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

  // Filters live in the URL and are remembered per user.
  const lf = useFilterState('orders.list', FILTER_DEFAULTS);
  const filters = lf.values;
  const debouncedSearch = lf.debouncedSearch;
  const overdueOnly = filters.overdue === '1';
  const [pageSize, setPageSize] = useState(ORDERS_PAGE_SIZE);
  const [hiddenCols, setHiddenCols] = usePersistentState<string[]>('orders.list.hidden', ['condition']);
  const [sort, setSort] = usePersistentState<SortState | null>('orders.list.sort', null);
  const range = periodRange(filters.period);
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

  const filterDefs: FilterDef[] = [
    { key: 'status', kind: 'select', label: to('stage'), options: STAGES.map((st) => ({ value: st as string, label: isRu ? statusMeta(st).ru : statusMeta(st).uz, count: stats[STAGE_STAT[st]] })) },
    { key: 'paymentStatus', kind: 'select', label: to('payment'), options: [{ value: 'UNPAID', label: td('unpaid') }, { value: 'PARTIALLY_PAID', label: td('partial') }, { value: 'PAID', label: td('paid') }] },
    { key: 'counterpartyId', kind: 'select', label: to('customer'), searchable: true, options: counterparties.map((c) => ({ value: c.id, label: c.name })) },
    { key: 'assignedSellerId', kind: 'select', label: to('seller'), searchable: true, options: sellers.map((sl) => ({ value: sl.id, label: `${sl.firstName} ${sl.lastName}` })) },
    { key: 'overdue', kind: 'toggle', label: to('sigOverdue') },
    { key: 'period', kind: 'period', label: tl('period') },
  ];
  const anyFilter = Boolean(debouncedSearch || lf.activeCount > 0);
  const clearAll = lf.reset;

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

      <StatCardGrid label={tl('summary')} count={4}>
        <StatCard label={to('sigNew')} loading={statsQuery.isPending} value={(stats.new ?? 0) + (stats.pendingApproval ?? 0)} secondary={to('sigNewHint')} />
        <StatCard label={to('sigReady')} loading={statsQuery.isPending} value={stats.readyToShip ?? 0} secondary={to('sigReadyHint')} />
        <StatCard label={to('sigOverdue')} loading={ordersQuery.isPending} value={overdueCount} secondary={to('sigOverdueHint')} />
        <StatCard label={to('sigActive')} loading={statsQuery.isPending} value={stats.activeOrders ?? 0} secondary={to('sigActiveHint')} />
      </StatCardGrid>

      <FilterBar
        state={lf}
        defs={filterDefs}
        searchPlaceholder={to('searchPh')}
        resultCount={ordersQuery.isPending ? null : overdueOnly ? orders.length : totalOrders}
        columns={<ColumnChooser columns={columns.map((col) => ({ key: col.key, label: col.label, locked: col.locked }))} hidden={hiddenCols} onChange={setHiddenCols} />}
      />

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
        <Drawer icon={<FileText size={20} />}
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
            <Button variant="secondary" style={{ width: '100%' }} disabled={updatingOrderId === preview.id} onClick={() => void runStatus(preview, nextStep(preview)!.status)}>
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
      <Modal icon={<Trash2 size={20} />} tone="error"
        isOpen={Boolean(deleteConfirmOrder)}
        onClose={() => {
          if (!deleteLoading) setDeleteConfirmOrder(null);
        }}
        title={isRu ? 'Удалить заказ?' : 'Buyurtmani o‘chirish?'}
        size="sm"
        footer={
          <>
            <Button data-dialog-cancel type="button" variant="secondary" onClick={() => setDeleteConfirmOrder(null)} disabled={deleteLoading}>
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
