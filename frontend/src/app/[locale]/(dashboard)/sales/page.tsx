'use client';

import { useMemo, useState } from 'react';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { LoadError } from '@/components/ui/LoadError';
import { useAuth } from '@/context/AuthContext';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { apiFetch, listOf, type ListResponse } from '@/lib/api';
import { formatCurrency, formatPercent, formatDate, formatDateTime, errorMessage, type LocalizedName } from '@/lib/utils';
import { MultiCurrencyValue } from '@/components/ui/MultiCurrencyValue';
import { Button, buttonStyle } from '@/components/ui/Button';
import { Select, SelectOption } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Drawer } from '@/components/ui/Drawer';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchField } from '@/components/ui/SearchField';
import { ActionsMenu } from '@/components/production/ActionsMenu';
import { toast } from '@/context/ToastContext';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { totalsByCurrency } from '@/lib/currency-totals';
import { usePersistentState } from '@/lib/usePersistentState';
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
import { Facts, PaidProgress, PreviewHead, SectionTitle } from '@/components/ui/list/Preview';
import { CreditCard, Plus, RotateCcw, ShoppingCart, ExternalLink } from 'lucide-react';
import { SalesInvoice, SalesSummaryStats } from '@shared/types';
import { PaySalesInvoiceModal } from '@/components/sales/PaySalesInvoiceModal';
import { CreateSalesReturnModal } from '@/components/sales/CreateSalesReturnModal';

interface CounterpartyItem {
  id: string;
  name: string;
}

interface WarehouseItem {
  id: string;
  name: LocalizedName;
}

type InvoiceRow = SalesInvoice & {
  docNumber?: string;
  items?: Array<{ id: string; quantity: number | string; unitPrice: number | string; totalPrice: number | string; product?: { name?: LocalizedName; unitOfMeasure?: string } }>;
  createdBy?: { firstName?: string; lastName?: string } | null;
  postedAt?: string | null;
};

const FILTER_DEFAULTS = {
  status: '',
  paymentStatus: '',
  counterpartyId: '',
  warehouseId: '',
  period: ALL_TIME as PeriodValue,
};

/** GET /sales/invoices with the non-empty filters. */
function invoicesEndpointFor(filters: Record<string, string>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) query.append(key, value);
  }
  return `/sales/invoices?${query.toString()}`;
}

const numberOf = (inv: InvoiceRow) => inv.invoiceNumber || inv.docNumber || '—';
const dueOf = (inv: InvoiceRow) => Math.max(0, Number(inv.totalAmount || 0) - Number(inv.paidAmount || 0));

export default function SalesPage() {
  const { token, company } = useAuth();
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const router = useRouter();
  const tl = useTranslations('rd.list');
  const td = useTranslations('rd.doc');
  const ts = useTranslations('rd.sales');

  // Filters apply at once and are remembered; a link may open the list pre-filtered (?status=DRAFT).
  const [filters, setFilters, resetFilters] = useListFilters('sales.list', FILTER_DEFAULTS, ['status', 'paymentStatus']);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim(), 350);
  const [moreOpen, setMoreOpen] = useState(false);
  const [hiddenCols, setHiddenCols] = usePersistentState<string[]>('sales.list.hidden', ['warehouse']);
  const [sort, setSort] = usePersistentState<SortState | null>('sales.list.sort', null);
  const range = resolvePeriod(filters.period);

  const invoicesEndpoint = useMemo(
    () =>
      invoicesEndpointFor({
        search: debouncedSearch,
        status: filters.status,
        paymentStatus: filters.paymentStatus,
        counterpartyId: filters.counterpartyId,
        warehouseId: filters.warehouseId,
        dateFrom: range.from,
        dateTo: range.to,
      }),
    [debouncedSearch, filters.status, filters.paymentStatus, filters.counterpartyId, filters.warehouseId, range.from, range.to],
  );
  const invoicesQuery = useApiQuery<InvoiceRow[]>(invoicesEndpoint, { keepPrevious: true });
  const invoices = useMemo(() => invoicesQuery.data ?? [], [invoicesQuery.data]);
  // Summary tiles and dropdown lists are optional: a failure leaves them empty.
  const statsQuery = useApiQuery<SalesSummaryStats>('/sales/summary');
  const stats = statsQuery.data ?? null;
  const draftsQuery = useApiQuery<InvoiceRow[]>('/sales/invoices?status=DRAFT');
  const draftCount = draftsQuery.data?.length ?? 0;
  const counterpartiesQuery = useApiQuery<ListResponse<CounterpartyItem>>('/sales/counterparties');
  const warehousesQuery = useApiQuery<ListResponse<WarehouseItem>>('/tenants/warehouses');
  const counterparties = useMemo(() => (counterpartiesQuery.data ? listOf(counterpartiesQuery.data) : []), [counterpartiesQuery.data]);
  const warehouses = useMemo(() => (warehousesQuery.data ? listOf(warehousesQuery.data) : []), [warehousesQuery.data]);

  // Preview drawer and action modals
  const [previewId, setPreviewId] = useState<string | null>(null);
  const preview = invoices.find((i) => i.id === previewId) ?? null;
  const [payInvoice, setPayInvoice] = useState<InvoiceRow | null>(null);
  const [returnInvoice, setReturnInvoice] = useState<InvoiceRow | null>(null);
  const [deletingInvoice, setDeletingInvoice] = useState<InvoiceRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const nameOf = (name: LocalizedName | null | undefined) => {
    if (!name) return '—';
    if (typeof name === 'string') return name;
    return name[locale] || name.ru || name.uz || Object.values(name)[0] || '—';
  };

  const refresh = () => {
    void statsQuery.refetch();
    void invoicesQuery.refetch();
    void draftsQuery.refetch();
  };

  const handleDeleteInvoice = async () => {
    if (!deletingInvoice || !token || !company) return;
    setDeleteLoading(true);
    try {
      if (deletingInvoice.status === 'POSTED') {
        // Step 1: Unpost (reverses stock levels, batches, ledger entries, customer debt)
        await apiFetch(`/sales/invoices/${deletingInvoice.id}/unpost`, { method: 'POST', token, tenantId: company.id, locale });
      }
      // Step 2: Delete invoice
      await apiFetch(`/sales/invoices/${deletingInvoice.id}`, { method: 'DELETE', token, tenantId: company.id, locale });
      setDeletingInvoice(null);
      if (previewId === deletingInvoice.id) setPreviewId(null);
      toast.success(isRu ? 'Накладная успешно удалена' : 'Nukladnoy muvaffaqiyatli o‘chirildi');
      refresh();
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Ошибка при удалении накладной' : 'Nukladnoyni o‘chirishda xatolik'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const statusBadge = (st: string) =>
    st === 'DRAFT' ? <Badge variant="warning">{td('draft')}</Badge> : st === 'POSTED' ? <Badge variant="success">{td('posted')}</Badge> : st === 'CANCELLED' ? <Badge variant="error">{td('cancelled')}</Badge> : <Badge>{st}</Badge>;
  const paymentBadge = (pst: string | undefined) =>
    pst === 'PAID' ? <Badge variant="success">{td('paid')}</Badge> : pst === 'PARTIALLY_PAID' ? <Badge variant="warning">{td('partial')}</Badge> : <Badge variant="error">{td('unpaid')}</Badge>;

  /** The one next step of a row: finish the draft, or take the money. */
  const nextAction = (inv: InvoiceRow) => {
    if (inv.status === 'DRAFT')
      return (
        <Link href={`/sales/${inv.id}`} className="rd-next-btn">
          {td('continue')}
        </Link>
      );
    if (inv.status === 'POSTED' && inv.paymentStatus !== 'PAID')
      return (
        <button type="button" className="rd-next-btn" onClick={() => setPayInvoice(inv)}>
          <CreditCard size={14} aria-hidden /> {td('takePayment')}
        </button>
      );
    return null;
  };

  const rowMenu = (inv: InvoiceRow) => (
    <ActionsMenu
      label={tl('rowActions')}
      actions={[
        { label: tl('open'), onSelect: () => router.push(`/sales/${inv.id}`) },
        { label: tl('edit'), onSelect: () => router.push(`/sales/${inv.id}?edit=true`) },
        { label: td('return'), onSelect: () => setReturnInvoice(inv), hidden: inv.status !== 'POSTED' },
        { label: tl('delete'), onSelect: () => setDeletingInvoice(inv), danger: true },
      ]}
    />
  );

  const totals = (amount: (r: InvoiceRow) => number) => <CurrencyTotals totals={totalsByCurrency(invoices, (r) => r.currency, amount)} locale={locale} />;

  const columns: Column<InvoiceRow>[] = [
    {
      key: 'number',
      label: isRu ? '№ / Дата' : '№ / Sana',
      primary: true,
      locked: true,
      sortValue: (r) => r.invoiceDate || r.createdAt || '',
      render: (r) => (
        <div>
          <div className="rd-doc-no">{numberOf(r)}</div>
          <div className="rd-sub">{formatDate(r.invoiceDate || r.createdAt)}</div>
        </div>
      ),
      footer: <span>{tl('total')} · {tl('results', { count: invoices.length })}</span>,
    },
    { key: 'customer', label: ts('customer'), sortValue: (r) => r.counterparty?.name ?? '', render: (r) => <span style={{ fontWeight: 'var(--font-medium)' }}>{r.counterparty?.name || '—'}</span> },
    { key: 'warehouse', label: tl('warehouse'), sortValue: (r) => nameOf(r.warehouse?.name), render: (r) => <span style={{ color: 'var(--color-text-secondary)' }}>{nameOf(r.warehouse?.name)}</span> },
    { key: 'amount', label: tl('amount'), numeric: true, sortValue: (r) => Number(r.totalAmount || 0), render: (r) => <strong>{formatCurrency(Number(r.totalAmount || 0), locale, r.currency)}</strong>, footer: totals((r) => Number(r.totalAmount || 0)) },
    { key: 'paid', label: tl('paid'), numeric: true, sortValue: (r) => Number(r.paidAmount || 0), render: (r) => formatCurrency(Number(r.paidAmount || 0), locale, r.currency), footer: totals((r) => Number(r.paidAmount || 0)) },
    {
      key: 'due',
      label: tl('due'),
      numeric: true,
      sortValue: (r) => (r.status === 'POSTED' ? dueOf(r) : 0),
      render: (r) => (r.status === 'POSTED' && dueOf(r) > 0 ? <span className="rd-due">{formatCurrency(dueOf(r), locale, r.currency)}</span> : <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>),
      footer: totals((r) => (r.status === 'POSTED' ? dueOf(r) : 0)),
    },
    {
      key: 'status',
      label: tl('status'),
      sortValue: (r) => `${r.status}-${r.paymentStatus}`,
      render: (r) => (
        // Posted is the normal state: show what matters about it — paid or not.
        <div className="rd-status-stack">{r.status === 'POSTED' ? paymentBadge(r.paymentStatus) : statusBadge(r.status)}</div>
      ),
    },
    {
      key: 'actions',
      label: isRu ? 'Действия' : 'Amallar',
      locked: true,
      render: (r) => (
        <div className="rd-row-actions">
          {nextAction(r)}
          {rowMenu(r)}
        </div>
      ),
    },
  ];

  const customerOptions: SelectOption[] = [{ value: '', label: ts('anyCustomer') }, ...counterparties.map((c) => ({ value: c.id, label: c.name }))];
  const warehouseOptions: SelectOption[] = [{ value: '', label: tl('anyWarehouse') }, ...warehouses.map((w) => ({ value: w.id, label: nameOf(w.name) }))];

  const statusOptions = [
    { value: '', label: tl('all') },
    { value: 'DRAFT', label: td('draft') },
    { value: 'POSTED', label: td('posted') },
    { value: 'CANCELLED', label: td('cancelled') },
  ];
  const paymentOptions = [
    { value: 'UNPAID', label: td('unpaid') },
    { value: 'PARTIALLY_PAID', label: td('partial') },
    { value: 'PAID', label: td('paid') },
  ];

  const active: ActiveFilter[] = [];
  if (debouncedSearch) active.push({ key: 'q', label: `«${debouncedSearch}»`, onClear: () => setSearch('') });
  if (filters.counterpartyId) active.push({ key: 'c', label: counterparties.find((c) => c.id === filters.counterpartyId)?.name ?? ts('customer'), onClear: () => setFilters({ counterpartyId: '' }) });
  if (filters.warehouseId) active.push({ key: 'w', label: nameOf(warehouses.find((w) => w.id === filters.warehouseId)?.name), onClear: () => setFilters({ warehouseId: '' }) });
  const moreCount = (filters.counterpartyId ? 1 : 0) + (filters.warehouseId ? 1 : 0);
  const anyFilter = Boolean(debouncedSearch || filters.status || filters.paymentStatus || filters.counterpartyId || filters.warehouseId || filters.period.key !== 'all');
  const clearAll = () => {
    setSearch('');
    resetFilters();
  };

  const unpaidOnly = filters.status === 'POSTED' && filters.paymentStatus === 'UNPAID';

  return (
    <div className="rd-page">
      <PageHeader
        title={isRu ? 'Продажи' : 'Sotuvlar'}
        subtitle={ts('subtitle')}
        actions={
          <Link href="/sales/new" style={buttonStyle('primary')}>
            <Plus size={18} aria-hidden /> {ts('newSale')}
          </Link>
        }
      />

      {/* Numbers that are also filters */}
      <SignalStrip label={tl('summary')}>
        <Signal
          tone="error"
          label={ts('sigDebt')}
          value={stats?.totalCustomerDebtByCurrency?.some((i) => i.amount !== 0) ? <MultiCurrencyValue items={stats.totalCustomerDebtByCurrency} locale={locale} /> : formatCurrency(0, locale, 'UZS')}
          hint={ts('sigDebtHint', { count: stats?.customersWithDebtCount ?? 0 })}
          active={unpaidOnly}
          onClick={() => setFilters(unpaidOnly ? { status: '', paymentStatus: '' } : { status: 'POSTED', paymentStatus: 'UNPAID' })}
        />
        <Signal
          tone="warning"
          label={ts('sigDrafts')}
          value={draftCount}
          hint={ts('sigDraftsHint')}
          active={filters.status === 'DRAFT'}
          onClick={() => setFilters({ status: filters.status === 'DRAFT' ? '' : 'DRAFT', paymentStatus: '' })}
        />
        <Signal tone="info" label={ts('sigMonth')} value={<MultiCurrencyValue items={stats?.monthlySalesByCurrency} locale={locale} />} hint={ts('sigMonthHint', { count: stats?.monthlySalesCount ?? 0 })} />
        <Signal tone="success" label={ts('sigProfit')} value={<MultiCurrencyValue items={stats?.monthlyGrossProfitByCurrency} locale={locale} />} hint={ts('sigProfitHint', { pct: formatPercent(Number(stats?.monthlyGrossProfitMargin || 0)) })} />
      </SignalStrip>

      {/* Search · status · payment · period · more */}
      <div className="rd-toolbar">
        <div className="rd-toolbar-row">
          <SearchField value={search} onChange={setSearch} placeholder={ts('searchPh')} label={tl('search')} />
          <ColumnChooser columns={columns.map((c) => ({ key: c.key, label: c.label, locked: c.locked }))} hidden={hiddenCols} onChange={setHiddenCols} />
        </div>
        <div className="rd-toolbar-row">
          <ChipGroup label={tl('status')} showLabel options={statusOptions} value={filters.status} onChange={(v) => setFilters({ status: v })} />
          <ChipGroup label={tl('payment')} showLabel options={paymentOptions} value={filters.paymentStatus} onChange={(v) => setFilters({ paymentStatus: v })} />
        </div>
        <div className="rd-toolbar-row">
          <PeriodFilter value={filters.period} onChange={(p) => setFilters({ period: p })} locale={locale} />
          <span className="rd-toolbar-spacer" />
          <MoreFiltersButton open={moreOpen} onToggle={() => setMoreOpen((o) => !o)} activeCount={moreCount} controls="sales-more" />
        </div>
        {moreOpen && (
          <div id="sales-more" className="rd-more-panel">
            <div>
              <span className="rd-field-label">{ts('customer')}</span>
              <Select options={customerOptions} value={filters.counterpartyId} onChange={(v) => setFilters({ counterpartyId: v })} searchable />
            </div>
            <div>
              <span className="rd-field-label">{tl('warehouse')}</span>
              <Select options={warehouseOptions} value={filters.warehouseId} onChange={(v) => setFilters({ warehouseId: v })} />
            </div>
          </div>
        )}
        <ActiveFilters items={active} onClearAll={clearAll} />
      </div>

      <div className="rd-table-card">
        {invoicesQuery.isError ? (
          <LoadError error={invoicesQuery.error} onRetry={() => void invoicesQuery.refetch()} retrying={invoicesQuery.isFetching} />
        ) : (
          <DataTable
            rows={invoices}
            columns={columns}
            rowKey={(r) => r.id}
            hidden={hiddenCols}
            sort={sort}
            onSortChange={setSort}
            onRowClick={(r) => setPreviewId(r.id)}
            selectedKey={previewId}
            loading={invoicesQuery.isPending}
            caption={tl('clickRowHint')}
            empty={
              anyFilter ? (
                <EmptyState icon={ShoppingCart} title={tl('nothingFound')} description={tl('nothingFoundHint')} action={<Button variant="secondary" onClick={clearAll}>{tl('clearFilters')}</Button>} />
              ) : (
                <EmptyState
                  icon={ShoppingCart}
                  title={ts('noSalesYet')}
                  description={ts('noSalesHint')}
                  action={
                    <Link href="/sales/new" style={buttonStyle('primary')}>
                      <Plus size={16} aria-hidden /> {ts('newSale')}
                    </Link>
                  }
                />
              )
            }
          />
        )}
      </div>

      {/* Row preview: check a sale without leaving the list */}
      {preview && (
        <Drawer
          isOpen
          onClose={() => setPreviewId(null)}
          title={ts('previewTitle', { number: numberOf(preview) })}
          description={`${preview.counterparty?.name ?? '—'} · ${formatDate(preview.invoiceDate || preview.createdAt)}`}
          size="lg"
          footer={
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', justifyContent: 'flex-end', width: '100%' }}>
              {preview.status === 'POSTED' && (
                <Button variant="secondary" onClick={() => setReturnInvoice(preview)}>
                  <RotateCcw size={16} aria-hidden /> {td('return')}
                </Button>
              )}
              <Link href={`/sales/${preview.id}`} style={buttonStyle('secondary')}>
                <ExternalLink size={16} aria-hidden /> {tl('openFull')}
              </Link>
              {preview.status === 'POSTED' && preview.paymentStatus !== 'PAID' && (
                <Button onClick={() => setPayInvoice(preview)}>
                  <CreditCard size={16} aria-hidden /> {td('takePayment')}
                </Button>
              )}
              {preview.status === 'DRAFT' && (
                <Link href={`/sales/${preview.id}`} style={buttonStyle('primary')}>
                  {td('continue')}
                </Link>
              )}
            </div>
          }
        >
          <PreviewHead
            badges={
              <>
                {statusBadge(preview.status)}
                {preview.status === 'POSTED' && paymentBadge(preview.paymentStatus)}
              </>
            }
            amount={formatCurrency(Number(preview.totalAmount || 0), locale, preview.currency)}
            caption={
              preview.status === 'POSTED' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <PaidProgress paid={Number(preview.paidAmount || 0)} total={Number(preview.totalAmount || 0)} label={tl('paidShare')} />
                  <span>
                    {tl('paid')}: {formatCurrency(Number(preview.paidAmount || 0), locale, preview.currency)}
                    {dueOf(preview) > 0 && (
                      <>
                        {' · '}
                        <span className="rd-due">
                          {tl('due')}: {formatCurrency(dueOf(preview), locale, preview.currency)}
                        </span>
                      </>
                    )}
                  </span>
                </div>
              ) : undefined
            }
          />
          <Facts
            items={[
              { label: ts('customer'), value: preview.counterparty?.name ?? '—' },
              { label: tl('warehouse'), value: nameOf(preview.warehouse?.name) },
              { label: tl('date'), value: formatDate(preview.invoiceDate || preview.createdAt) },
              { label: td('contract'), value: preview.contractNumber, hidden: !preview.contractNumber },
              { label: td('createdBy'), value: [preview.createdBy?.firstName, preview.createdBy?.lastName].filter(Boolean).join(' '), hidden: !preview.createdBy },
              { label: td('postedAt'), value: formatDateTime(preview.postedAt), hidden: !preview.postedAt },
              { label: tl('comment'), value: preview.comment, hidden: !preview.comment },
            ]}
          />
          <SectionTitle>
            {tl('lines')} ({preview.items?.length ?? 0})
          </SectionTitle>
          {preview.items && preview.items.length > 0 ? (
            <table className="rd-mini-table">
              <thead>
                <tr>
                  <th scope="col">{td('product')}</th>
                  <th scope="col" style={{ textAlign: 'right' }}>{td('qty')}</th>
                  <th scope="col" style={{ textAlign: 'right' }}>{td('price')}</th>
                  <th scope="col" style={{ textAlign: 'right' }}>{td('sum')}</th>
                </tr>
              </thead>
              <tbody>
                {preview.items.map((it) => (
                  <tr key={it.id}>
                    <td>{nameOf(it.product?.name)}</td>
                    <td className="tabular-nums" style={{ textAlign: 'right' }}>{Number(it.quantity)}</td>
                    <td className="tabular-nums" style={{ textAlign: 'right' }}>{formatCurrency(Number(it.unitPrice), locale, preview.currency)}</td>
                    <td className="tabular-nums" style={{ textAlign: 'right', fontWeight: 'var(--font-semibold)' }}>{formatCurrency(Number(it.totalPrice), locale, preview.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>{td('noLines')}</p>
          )}
          <SectionTitle>{td('history')}</SectionTitle>
          <ol className="rd-timeline">
            <li>
              <span>
                {td('created')} · {formatDateTime(preview.createdAt)}
              </span>
            </li>
            {preview.postedAt && (
              <li style={{ ['--rd-dot' as string]: 'var(--color-success-600)' }}>
                <span>
                  {td('postedEvent')} · {formatDateTime(preview.postedAt)}
                </span>
              </li>
            )}
            {Number(preview.paidAmount || 0) > 0 && (
              <li style={{ ['--rd-dot' as string]: 'var(--color-primary-600)' }}>
                <span>{td('paidEvent', { amount: formatCurrency(Number(preview.paidAmount), locale, preview.currency) })}</span>
              </li>
            )}
          </ol>
        </Drawer>
      )}

      {payInvoice && <PaySalesInvoiceModal isOpen onClose={() => setPayInvoice(null)} invoice={payInvoice} onSuccess={refresh} />}
      {returnInvoice && <CreateSalesReturnModal isOpen onClose={() => setReturnInvoice(null)} invoice={returnInvoice} onSuccess={refresh} />}

      {/* Delete confirmation (posted documents are unposted first) */}
      {deletingInvoice && (
        <Modal
          isOpen={true}
          onClose={() => setDeletingInvoice(null)}
          title={
            deletingInvoice.status === 'POSTED'
              ? isRu
                ? 'Удаление проведённого документа'
                : 'Tasdiqlangan hujjatni o‘chirish'
              : deletingInvoice.status === 'CANCELLED'
                ? isRu
                  ? 'Удаление отменённого документа'
                  : 'Bekor qilingan hujjatni o‘chirish'
                : ts('deleteTitleDraft')
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
              {deletingInvoice.status === 'POSTED'
                ? isRu
                  ? `Накладная продажи ${numberOf(deletingInvoice)} уже проведена. Удаление автоматически вернёт товары на склад, отменит проводки и задолженность клиента, после чего удалит документ. Вы уверены?`
                  : `${numberOf(deletingInvoice)} raqamli sotuv hujjati tasdiqlangan (o‘tkazilgan). O‘chirish tovarlarni omborga qaytaradi, buxgalteriya o‘tkazmasi va mijoz qarzini avtomatik bekor qilib, hujjatni o‘chiradi. Davom etasizmi?`
                : isRu
                  ? `Вы действительно хотите удалить накладную ${numberOf(deletingInvoice)}? Это действие необратимо.`
                  : `Haqiqatan ham ${numberOf(deletingInvoice)} raqamli sotuv hujjatini o‘chirmoqchimisiz? Ushbu amalni ortga qaytarib bo‘lmaydi.`}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
              <Button variant="secondary" onClick={() => setDeletingInvoice(null)} disabled={deleteLoading}>
                {isRu ? 'Отмена' : 'Bekor qilish'}
              </Button>
              <Button variant="danger" onClick={handleDeleteInvoice} loading={deleteLoading} loadingText={isRu ? 'Удаление...' : 'O‘chirilmoqda...'}>
                {isRu ? 'Удалить' : 'O‘chirish'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
