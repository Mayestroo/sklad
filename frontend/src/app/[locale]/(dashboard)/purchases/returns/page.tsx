'use client';

import { MultiCurrencyValue } from '@/components/ui/MultiCurrencyValue';
import { totalsByCurrency } from '@/lib/currency-totals';
import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { buttonStyle } from '@/components/ui/Button';
import { ActionsMenu } from '@/components/production/ActionsMenu';
import { usePersistentState } from '@/lib/usePersistentState';
import { CurrencyTotals } from '@/components/ui/list/ListKit';
import { ColumnChooser, FilterBar, periodRange, SegmentedFilter, useFilterState, type FilterDef } from '@/components/ui/filters';
import { StatCard, StatCardGrid } from '@/components/ui/stats/StatCard';
import { DataTable, type Column, type SortState } from '@/components/ui/list/DataTable';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { LoadError } from '@/components/ui/LoadError';
import { formatCurrency, formatDate, errorMessage, type LocalizedName } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import {
  RotateCcw,
  Plus,
  Download,
} from 'lucide-react';
import { PurchaseReturn } from '@shared/types';
import { Link, useRouter } from '@/i18n/navigation';
import { ReturnActModal } from '@/components/purchases/ReturnActModal';
import { useConfirm } from '@/context/ConfirmContext';
import { toast } from '@/context/ToastContext';
import { localIsoDate } from '@/lib/date-range';

const FILTER_DEFAULTS = { status: '', period: '' };

export default function ReturnsPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const tIn = useTranslations('rd.inline');
  const { token, company } = useAuth();
  const confirm = useConfirm();

  // Filters live in the URL and are remembered per user. Search applies once typing pauses; status at once.
  const lf = useFilterState('preturns.list', FILTER_DEFAULTS);
  const debouncedSearch = lf.debouncedSearch;
  const statusFilter = lf.values.status;
  const [startDate] = useState('');
  const [endDate] = useState('');

  const returnsEndpoint = useMemo(() => {
    const queryParams = new URLSearchParams();
    if (debouncedSearch) queryParams.set('search', debouncedSearch);
    if (statusFilter) queryParams.set('status', statusFilter);
    if (startDate) queryParams.set('startDate', startDate);
    if (endDate) queryParams.set('endDate', endDate);
    return `/purchases/returns${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
  }, [debouncedSearch, statusFilter, startDate, endDate]);
  const returnsQuery = useApiQuery<PurchaseReturn[]>(returnsEndpoint);
  const returns = useMemo(() => returnsQuery.data ?? [], [returnsQuery.data]);
  const loading = returnsQuery.isPending;

  // Modals state
  const [selectedReturnForAct, setSelectedReturnForAct] = useState<PurchaseReturn | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Delete state
  const [deleteConfirmReturn, setDeleteConfirmReturn] = useState<PurchaseReturn | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteReturn = async () => {
    if (!token || !company || !deleteConfirmReturn) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await apiFetch(`/purchases/returns/${deleteConfirmReturn.id}`, {
        method: 'DELETE',
        token,
        tenantId: company.id,
        locale,
      });
      setDeleteConfirmReturn(null);
      fetchReturns();
    } catch (err) {
      setDeleteError(errorMessage(err) || (isRu ? 'Ошибка удаления возврата' : "Qaytarishni o'chirishda xatolik"));
    } finally {
      setDeleteLoading(false);
    }
  };

  const fetchReturns = () => void returnsQuery.refetch();


  const getProductName = (name: LocalizedName | null | undefined) => {
    if (!name) return '—';
    if (typeof name === 'string') return name;
    return name[locale] || name.ru || name.uz || Object.values(name)[0] || '—';
  };

  const [activeTab, setActiveTab] = useState<'LIST' | 'ANALYTICS'>('LIST');

  // Approve a draft return
  const handleApprove = async (id: string) => {
    setActionLoadingId(id);
    try {
      await apiFetch(`/purchases/returns/${id}/approve`, {
        token: token || undefined,
        tenantId: company?.id || undefined,
        locale,
        method: 'POST',
      });
      toast.success(isRu ? 'Возврат успешно утвержден' : 'Qaytarish muvaffaqiyatli tasdiqlandi');
      fetchReturns();
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Ошибка при утверждении возврата' : 'Tasdiqlashda xatolik'));
    } finally {
      setActionLoadingId(null);
    }
  };

  // Cancel a return
  const handleCancel = async (id: string) => {
    const confirmed = await confirm({
      title: isRu ? 'Отмена возврата' : 'Qaytarishni bekor qilish',
      description: isRu
        ? 'Вы действительно хотите отменить этот возврат?'
        : 'Ushbu qaytarish hujjatini bekor qilishni tasdiqlaysizmi?',
      variant: 'warning',
      confirmText: isRu ? 'Да' : 'Ha',
      cancelText: isRu ? 'Нет' : 'Yo‘q',
    });
    if (!confirmed) return;

    setActionLoadingId(id);
    try {
      await apiFetch(`/purchases/returns/${id}/cancel`, {
        token: token || undefined,
        tenantId: company?.id || undefined,
        locale,
        method: 'POST',
      });
      toast.success(isRu ? 'Возврат успешно отменен' : 'Qaytarish muvaffaqiyatli bekor qilindi');
      fetchReturns();
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Ошибка при отмене возврата' : 'Bekor qilishda xatolik'));
    } finally {
      setActionLoadingId(null);
    }
  };

  // Metrics
  // Per currency (ADR 0023): a USD and a UZS return are never added together.
  const totalReturnedByCurrency = totalsByCurrency(
    returns.filter((r) => r.status === 'POSTED'),
    (r) => r.currency,
    (r) => r.totalAmount,
  );

  const postedCount = returns.filter((r) => r.status === 'POSTED').length;
  const draftCount = returns.filter((r) => r.status === 'DRAFT').length;

  const handleExportCsv = () => {
    if (returns.length === 0) return;
    const headers = [
      isRu ? 'Номер' : 'Raqami',
      isRu ? 'Номер акта' : 'Akt raqami',
      isRu ? 'Дата' : 'Sana',
      isRu ? 'Поставщик' : 'Yetkazib beruvchi',
      isRu ? 'Документ закупки' : 'Xarid hujjati',
      isRu ? 'Склад' : 'Ombor',
      isRu ? 'Причина' : 'Sababi',
      isRu ? 'Сумма' : 'Summa',
      isRu ? 'Статус' : 'Status',
    ];

    const rows = returns.map((r) => [
      r.returnNumber,
      `"${r.actNumber || ''}"`,
      formatDate(r.returnDate, locale),
      `"${r.counterparty?.name || ''}"`,
      r.receipt?.docNumber || '',
      `"${getProductName(r.warehouse?.name)}"`,
      `"${r.reason || ''}"`,
      Number(r.totalAmount),
      r.status,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `purchase_returns_${localIsoDate(new Date())}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Reason Analytics Breakdown
  // Share by number of returns; amounts stay per currency (ADR 0023).
  const reasonBreakdown: Record<string, { count: number; rows: typeof returns }> = {};
  returns.forEach((r) => {
    const key = r.reason || (isRu ? 'Другое / Не указано' : 'Boshqa / Ko‘rsatilmadi');
    if (!reasonBreakdown[key]) {
      reasonBreakdown[key] = { count: 0, rows: [] };
    }
    reasonBreakdown[key].count += 1;
    reasonBreakdown[key].rows.push(r);
  });

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return <Badge variant="neutral">{isRu ? 'Черновик' : 'Qoralama'}</Badge>;
      case 'UNDER_REVIEW':
        return <Badge variant="warning">{isRu ? 'На проверке' : 'Tekshiruvda'}</Badge>;
      case 'POSTED':
        return <Badge variant="success">{isRu ? 'Проведено' : 'Tasdiqlangan'}</Badge>;
      case 'CANCELLED':
        return <Badge variant="error">{isRu ? 'Отменено' : 'Bekor qilingan'}</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const tl = useTranslations('rd.list');
  const td = useTranslations('rd.doc');
  const tp = useTranslations('rd.preturns');
  const router = useRouter();
  const [hiddenCols, setHiddenCols] = usePersistentState<string[]>('preturns.hidden', []);
  const [sort, setSort] = usePersistentState<SortState | null>('preturns.sort', null);
  const range = periodRange(lf.values.period);
  const shown = returns.filter((r) => {
    const d = (r.returnDate || '').slice(0, 10);
    return (!range.from || d >= range.from) && (!range.to || d <= range.to);
  });
  const openReturn = (r: PurchaseReturn) => router.push(`/purchases/returns/${r.id}`);
  const statusBadge = (st: string) =>
    st === 'POSTED' ? <Badge variant="success">{td('posted')}</Badge> : st === 'CANCELLED' ? <Badge variant="error">{td('cancelled')}</Badge> : <Badge variant="warning">{td('draft')}</Badge>;

  const columns: Column<PurchaseReturn>[] = [
    {
      key: 'number',
      label: isRu ? '№ / Дата' : '№ / Sana',
      primary: true,
      locked: true,
      sortValue: (r) => r.returnDate,
      render: (r) => (
        <div>
          <div className="rd-doc-no">{r.returnNumber}</div>
          <div className="rd-sub">{formatDate(r.returnDate, locale)}{r.actNumber ? ` · ${tp('act')} ${r.actNumber}` : ''}</div>
        </div>
      ),
      footer: <span>{tl('total')} · {tl('results', { count: shown.length })}</span>,
    },
    { key: 'supplier', label: tp('supplier'), sortValue: (r) => r.counterparty?.name ?? '', render: (r) => <span style={{ fontWeight: 'var(--font-medium)' }}>{r.counterparty?.name || '—'}</span> },
    {
      key: 'receipt',
      label: tp('receipt'),
      render: (r) =>
        r.receipt ? (
          <Link href={`/purchases/${r.receipt.id}`} style={{ color: 'var(--color-primary-700)' }}>
            {r.receipt.docNumber}
          </Link>
        ) : (
          '—'
        ),
    },
    { key: 'warehouse', label: tl('warehouse'), render: (r) => getProductName(r.warehouse?.name) },
    {
      key: 'amount',
      label: tl('amount'),
      numeric: true,
      sortValue: (r) => Number(r.totalAmount),
      render: (r) => <strong>{formatCurrency(Number(r.totalAmount), locale, r.currency)}</strong>,
      footer: <CurrencyTotals totals={totalsByCurrency(shown.filter((r) => r.status !== 'CANCELLED'), (r) => r.currency, (r) => Number(r.totalAmount))} locale={locale} />,
    },
    { key: 'status', label: tl('status'), sortValue: (r) => r.status, render: (r) => statusBadge(r.status) },
    { key: 'reason', label: tp('reason'), render: (r) => <span style={{ color: 'var(--color-text-secondary)', display: 'inline-block', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>{r.reason || '—'}</span> },
    {
      key: 'actions',
      label: isRu ? 'Действия' : 'Amallar',
      locked: true,
      render: (r) => (
        <div className="rd-row-actions">
          {r.status === 'DRAFT' && (
            <button type="button" className="rd-next-btn" disabled={actionLoadingId === r.id} onClick={() => void handleApprove(r.id)}>
              {td('post')}
            </button>
          )}
          <ActionsMenu
            label={tl('rowActions')}
            actions={[
              { label: tl('open'), onSelect: () => openReturn(r) },
              { label: tp('actSlip'), onSelect: () => setSelectedReturnForAct(r) },
              { label: isRu ? 'Отменить' : 'Bekor qilish', onSelect: () => void handleCancel(r.id), danger: true, hidden: r.status === 'CANCELLED' },
              { label: tl('delete'), onSelect: () => { setDeleteConfirmReturn(r); setDeleteError(null); }, danger: true, hidden: r.status === 'POSTED' },
            ]}
          />
        </div>
      ),
    },
  ];
  const filterDefs: FilterDef[] = [
    { key: 'status', kind: 'segmented', label: tl('status'), options: [{ value: 'DRAFT', label: td('draft') }, { value: 'POSTED', label: td('posted') }, { value: 'CANCELLED', label: td('cancelled') }] },
    { key: 'period', kind: 'period', label: tl('period') },
  ];
  const anyFilter = Boolean(debouncedSearch || lf.activeCount > 0);
  const clearAll = lf.reset;

  return (
    <div className="rd-page">
      <PageHeader
        title={isRu ? 'Возврат поставщикам' : 'Ta’minotchiga qaytarish'}
        subtitle={tp('subtitle')}
        actions={
          <Link href="/purchases/returns/new" style={buttonStyle('primary')}>
            <Plus size={16} aria-hidden /> {isRu ? 'Новый возврат' : 'Yangi qaytarish'}
          </Link>
        }
      />

      <StatCardGrid label={tl('summary')} count={3}>
        <StatCard label={tp('sigDrafts')} loading={loading} value={draftCount} secondary={tp('sigDraftsHint')} />
        <StatCard label={tIn('jami_qaytarilgan_tasdiqlangan')} loading={loading} value={<MultiCurrencyValue inherit items={totalReturnedByCurrency} locale={locale} />} secondary={tp('postedCount', { count: postedCount })} />
        <StatCard label={tp('sigAll')} loading={loading} value={returns.length} />
      </StatCardGrid>

      {/* View switch (not a filter) and export */}
      <div className="rd-toolbar-row">
        <SegmentedFilter
          name="view"
          label={tp('view')}
          options={[
            { value: 'LIST', label: isRu ? 'Документы' : 'Hujjatlar' },
            { value: 'ANALYTICS', label: isRu ? 'Аналитика причин' : 'Sabablar tahlili' },
          ]}
          value={activeTab}
          onChange={(v) => setActiveTab((v || 'LIST') as 'LIST' | 'ANALYTICS')}
        />
        <span className="rd-toolbar-spacer" />
        <Button variant="ghost" size="sm" onClick={handleExportCsv} disabled={returns.length === 0}>
          <Download size={14} aria-hidden /> CSV
        </Button>
      </div>

      <FilterBar
        state={lf}
        defs={filterDefs}
        searchPlaceholder={tp('searchPh')}
        resultCount={loading ? null : activeTab === 'LIST' ? shown.length : returns.length}
        columns={activeTab === 'LIST' ? <ColumnChooser columns={columns.map((col) => ({ key: col.key, label: col.label, locked: col.locked }))} hidden={hiddenCols} onChange={setHiddenCols} /> : undefined}
      />

      {activeTab === 'LIST' ? (
        <div className="rd-table-card">
          {returnsQuery.isError ? (
            <LoadError error={returnsQuery.error} onRetry={fetchReturns} retrying={returnsQuery.isFetching} />
          ) : (
            <DataTable
              rows={shown}
              columns={columns}
              rowKey={(r) => r.id}
              hidden={hiddenCols}
              sort={sort}
              onSortChange={setSort}
              onRowClick={openReturn}
              loading={loading}
              empty={
                anyFilter ? (
                  <EmptyState icon={RotateCcw} title={tl('nothingFound')} description={tl('nothingFoundHint')} action={<Button variant="secondary" onClick={clearAll}>{tl('clearFilters')}</Button>} />
                ) : (
                  <EmptyState icon={RotateCcw} title={tp('none')} description={tp('noneHint')} action={<Link href="/purchases/returns/new" style={buttonStyle('primary')}><Plus size={16} aria-hidden /> {isRu ? 'Новый возврат' : 'Yangi qaytarish'}</Link>} />
                )
              }
            />
          )}
        </div>
      ) : (
        /* Analytics Tab */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <Card style={{ padding: 'var(--space-6)' }}>
            <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
              {isRu ? 'Распределение возвратов по причинам' : 'Qaytarish sabablari bo‘yicha taqsimot'}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {Object.entries(reasonBreakdown).map(([reasonName, data]) => {
                const percent = returns.length > 0 ? (data.count / returns.length) * 100 : 0;
                return (
                  <div key={reasonName} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
                      <span style={{ fontWeight: 600 }}>{reasonName}</span>
                      <span>
                        <strong>
                          {totalsByCurrency(data.rows, (r) => r.currency, (r) => r.totalAmount)
                            .map((t) => formatCurrency(t.amount, locale, t.currency))
                            .join(' · ')}
                        </strong>{' '}
                        ({data.count} {isRu ? 'операций' : 'ta'})
                      </span>
                    </div>
                    <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--color-bg-subtle)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${Math.min(100, Math.max(2, percent))}%`,
                          height: '100%',
                          backgroundColor: 'var(--color-primary-500)',
                          borderRadius: '4px',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* Return Act Slip Modal */}
      {selectedReturnForAct && (
        <ReturnActModal
          isOpen={!!selectedReturnForAct}
          onClose={() => setSelectedReturnForAct(null)}
          purchaseReturn={selectedReturnForAct}
        />
      )}

      {/* Delete confirmation: shared dialog (role=dialog, Esc, focus kept inside) */}
      <Modal
        isOpen={Boolean(deleteConfirmReturn)}
        onClose={() => { if (!deleteLoading) setDeleteConfirmReturn(null); }}
        title={isRu ? 'Удалить документ возврата?' : 'Qaytarish hujjatini o‘chirish?'}
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setDeleteConfirmReturn(null)} disabled={deleteLoading}>
              {isRu ? 'Отмена' : 'Bekor qilish'}
            </Button>
            <Button type="button" variant="danger" onClick={handleDeleteReturn} loading={deleteLoading} loadingText={isRu ? 'Удаление…' : 'O‘chirilmoqda…'}>
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
          {deleteConfirmReturn && (isRu ? `Возврат № ${deleteConfirmReturn.returnNumber} будет удалён. Это действие нельзя отменить.` : `№ ${deleteConfirmReturn.returnNumber} qaytarish hujjati o‘chiriladi. Bu amalni qaytarib bo‘lmaydi.`)}
        </p>
      </Modal>
    </div>
  );
}
