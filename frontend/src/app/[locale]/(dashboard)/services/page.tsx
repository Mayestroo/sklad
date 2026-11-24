'use client';

import { totalsByCurrency, type CurrencyTotal } from '@/lib/currency-totals';
import React, { useState, useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ActionsMenu } from '@/components/production/ActionsMenu';
import { usePersistentState } from '@/lib/usePersistentState';
import { ColumnChooser, FilterBar, SegmentedFilter, useFilterState, type FilterDef } from '@/components/ui/filters';
import { StatCard, StatCardGrid } from '@/components/ui/stats/StatCard';
import { DataTable, type Column, type SortState } from '@/components/ui/list/DataTable';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { LoadError } from '@/components/ui/LoadError';
import { formatCurrency, formatDate, errorMessage, getLocalizedName } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ServiceActDrawer } from '@/components/services/ServiceActDrawer';
import { ServiceActDetailsModal } from '@/components/services/ServiceActDetailsModal';
import { ServiceActPrintView } from '@/components/services/ServiceActPrintView';
import { useConfirm } from '@/context/ConfirmContext';
import { toast } from '@/context/ToastContext';
import {
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Printer,
  ChevronLeft,
  ChevronRight,
  FileText,
} from 'lucide-react';
import type { ServiceActDetail } from '@/lib/service-act';

const FILTER_DEFAULTS = { status: '', paymentStatus: '' };

export default function ServicesPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const tIn = useTranslations('rd.inline');
  const confirm = useConfirm();
  const { token, company } = useAuth();

  // Active Tab: PROVIDED vs RECEIVED
  const [activeType, setActiveType] = useState<'PROVIDED' | 'RECEIVED'>('PROVIDED');

  // Filters live in the URL and are remembered per user; a new filter or act type starts again from page 1.
  const lf = useFilterState('services.list', FILTER_DEFAULTS);
  const debouncedSearch = lf.debouncedSearch;
  const { status: statusFilter, paymentStatus: paymentStatusFilter } = lf.values;
  const filterKey = `${activeType}|${debouncedSearch}|${statusFilter}|${paymentStatusFilter}`;
  const [pageAt, setPageAt] = useState({ key: '', page: 1 });
  const page = pageAt.key === filterKey ? pageAt.page : 1;
  const setPage = (next: number | ((p: number) => number)) => setPageAt({ key: filterKey, page: typeof next === 'function' ? next(page) : next });
  const pageSize = 20;


  // Modal / Drawer states
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingAct, setEditingAct] = useState<ServiceActDetail | null>(null);

  const [selectedAct, setSelectedAct] = useState<ServiceActDetail | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const [printAct, setPrintAct] = useState<ServiceActDetail | null>(null);

  // Data: the filters and page are the endpoint (= query key).
  const actsEndpoint = useMemo(() => {
    const params = new URLSearchParams();
    params.append('type', activeType);
    params.append('page', String(page));
    params.append('limit', String(pageSize));
    if (debouncedSearch.trim()) params.append('search', debouncedSearch.trim());
    if (statusFilter) params.append('status', statusFilter);
    if (paymentStatusFilter) params.append('paymentStatus', paymentStatusFilter);
    return `/services?${params.toString()}`;
  }, [activeType, page, debouncedSearch, statusFilter, paymentStatusFilter]);
  const actsQuery = useApiQuery<{ items: ServiceActDetail[]; total: number }>(actsEndpoint, { keepPrevious: true });
  const acts = useMemo(() => actsQuery.data?.items ?? [], [actsQuery.data]);
  const total = actsQuery.data?.total ?? 0;
  const loading = actsQuery.isPending;
  const fetchActs = async () => {
    await actsQuery.refetch();
  };

  // Aggregate Metrics for Active Tab
  // Per currency (ADR 0023): a USD act and a UZS act are never added together.
  const { amountByCurrency, paidByCurrency, debtByCurrency, totalPages } = useMemo(() => {
    const amounts = totalsByCurrency(acts, (a) => a.currency, (a) => a.totalAmount);
    const paid = totalsByCurrency(acts, (a) => a.currency, (a) => a.paidAmount);
    const debt = amounts
      .map((t) => ({
        currency: t.currency,
        amount: Math.max(0, t.amount - (paid.find((p) => p.currency === t.currency)?.amount ?? 0)),
      }))
      .filter((t) => t.amount > 0);
    return {
      amountByCurrency: amounts,
      paidByCurrency: paid,
      debtByCurrency: debt,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }, [acts, total, pageSize]);
  const moneyLines = (totals: CurrencyTotal[]) =>
    totals.length === 0
      ? '0'
      : totals.map((t) => (
          <span key={t.currency} style={{ display: 'block' }}>
            {formatCurrency(t.amount, locale, t.currency)}
          </span>
        ));
  // Share paid compares one currency with itself; with several currencies it is not shown.
  const paidShare =
    amountByCurrency.length === 1 && amountByCurrency[0].amount > 0
      ? `${Math.round(((paidByCurrency[0]?.amount ?? 0) / amountByCurrency[0].amount) * 100)}% ${isRu ? 'погашено' : 'so‘ndirilgan'}`
      : amountByCurrency.length > 1
      ? (isRu ? 'по каждой валюте отдельно' : 'har bir valyuta alohida')
      : '0%';

  const handleOpenCreate = () => {
    setEditingAct(null);
    setIsDrawerOpen(true);
  };

  const handleOpenEdit = (act: ServiceActDetail) => {
    setEditingAct(act);
    setIsDrawerOpen(true);
  };

  const handleOpenDetails = async (act: ServiceActDetail) => {
    try {
      const detailed = await apiFetch<ServiceActDetail>(`/services/${act.id}`, {
        token: token || undefined,
        tenantId: company?.id,
        locale,
      });
      setSelectedAct(detailed);
      setIsDetailsOpen(true);
    } catch {
      setSelectedAct(act);
      setIsDetailsOpen(true);
    }
  };

  const handleEditAct = async (act: ServiceActDetail, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (act.status === 'POSTED') {
      const confirmUnpost = await confirm({
        title: isRu ? 'Отмена проведения' : 'O‘tkazmani bekor qilish',
        description: isRu
          ? 'Этот акт проведён. Для редактирования его проведение будет отменено (с возвратом проводок и задолженности) и он вернётся в черновик. Продолжить?'
          : 'Ushbu akt tasdiqlangan. Tahrirlash uchun uning o‘tkazmasi bekor qilinadi (provodkalar va qarz orqaga qaytariladi) va qoralama holatiga qaytadi. Davom etasizmi?',
        variant: 'warning',
        confirmText: isRu ? 'Продолжить' : 'Davom etish',
        cancelText: isRu ? 'Отмена' : 'Bekor qilish',
      });
      if (!confirmUnpost) return;

      try {
        const unposted = await apiFetch<ServiceActDetail>(`/services/${act.id}/unpost`, {
          method: 'POST',
          token: token || undefined,
          tenantId: company?.id,
          locale,
        });
        await fetchActs();
        toast.success(isRu ? 'Проведение акта отменено' : 'Akt o‘tkazmasi bekor qilindi');
        setEditingAct(unposted || { ...act, status: 'DRAFT' });
        setIsDrawerOpen(true);
      } catch (err) {
        toast.error(errorMessage(err) || (isRu ? 'Ошибка отмены проведения' : 'O‘tkazmani bekor qilishda xatolik'));
      }
    } else {
      setEditingAct(act);
      setIsDrawerOpen(true);
    }
  };

  const handleDeleteAct = async (act: ServiceActDetail, e: React.MouseEvent) => {
    e.stopPropagation();
    const isPosted = act.status === 'POSTED';
    const confirmed = await confirm({
      title: isRu ? 'Удаление акта' : 'Aktni o‘chirish',
      description: isPosted
        ? isRu
          ? 'Этот акт проведён. При удалении он будет автоматически отменён (с откатом проводок и задолженности) и удалён из базы. Продолжить?'
          : 'Ushbu akt tasdiqlangan. O‘chirish jarayonida u avtomatik bekor qilinadi (provodkalar va qarz orqaga qaytariladi) hamda bazadan o‘chiriladi. Davom ettirasizmi?'
        : isRu
        ? `Черновик акта ${act.actNumber} будет удалён.`
        : `${act.actNumber} akt qoralamasi o‘chiriladi.`,
      variant: 'danger',
      confirmText: isRu ? 'Удалить' : 'O‘chirish',
      cancelText: isRu ? 'Отмена' : 'Bekor qilish',
    });

    if (!confirmed) {
      return;
    }

    try {
      if (isPosted) {
        await apiFetch(`/services/${act.id}/cancel`, {
          method: 'POST',
          token: token || undefined,
          tenantId: company?.id,
          locale,
        });
      }
      await apiFetch(`/services/${act.id}`, {
        method: 'DELETE',
        token: token || undefined,
        tenantId: company?.id,
        locale,
      });
      toast.success(isRu ? `Акт ${act.actNumber} удалён` : `${act.actNumber} akti o‘chirildi`);
      fetchActs();
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Ошибка при удалении' : 'O‘chirishda xatolik yuz berdi'));
    }
  };

  const handleResetFilters = () => {
    lf.reset();
  };

  const isFiltered = Boolean(debouncedSearch || lf.activeCount > 0);
  const counterpartyLabel = activeType === 'PROVIDED' ? (isRu ? 'Клиент' : 'Mijoz') : isRu ? 'Поставщик' : 'Yetkazib beruvchi';
  const statusMeta = (s: string) =>
    s === 'POSTED'
      ? { variant: 'success' as const, text: isRu ? 'Проведён' : 'Tasdiqlangan' }
      : s === 'DRAFT'
        ? { variant: 'warning' as const, text: isRu ? 'Черновик' : 'Qoralama' }
        : { variant: 'error' as const, text: isRu ? 'Отменён' : 'Bekor qilingan' };
  const payMeta = (s: string) =>
    s === 'PAID'
      ? { variant: 'success' as const, text: isRu ? 'Оплачен' : 'To‘langan' }
      : s === 'PARTIALLY_PAID'
        ? { variant: 'warning' as const, text: isRu ? 'Частично' : 'Qisman' }
        : { variant: 'neutral' as const, text: isRu ? 'Не оплачен' : 'To‘lanmagan' };
  const pageNote = total > acts.length
    ? isRu ? `по ${acts.length} актам на этой странице из ${total}` : `shu sahifadagi ${acts.length} ta akt bo‘yicha (jami ${total})`
    : isRu ? `актов: ${total}` : `aktlar: ${total}`;

  const tl = useTranslations('rd.list');
  const tsv = useTranslations('rd.services');
  const [hiddenCols, setHiddenCols] = usePersistentState<string[]>('services.hidden', []);
  const [sort, setSort] = usePersistentState<SortState | null>('services.sort', null);
  /** Either kind of act can be started from the header, whatever list is shown. */
  const openCreate = (type: 'PROVIDED' | 'RECEIVED') => {
    if (type !== activeType) setActiveType(type);
    handleOpenCreate();
  };
  const columns: Column<ServiceActDetail>[] = [
    {
      key: 'number',
      label: tIn('sana'),
      primary: true,
      locked: true,
      sortValue: (a) => a.actDate,
      render: (a) => (
        <div>
          <div className="rd-doc-no">{a.actNumber}</div>
          <div className="rd-sub">
            {formatDate(a.actDate, locale)}
            {a.externalNumber ? ` · ${tIn('tashqi')} ${a.externalNumber}` : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'counterparty',
      label: counterpartyLabel,
      sortValue: (a) => a.counterparty?.name ?? '',
      render: (a) => (
        <div>
          <div style={{ fontWeight: 'var(--font-medium)' }}>{a.counterparty?.name || '—'}</div>
          {a.counterparty?.inn && <div className="rd-sub">{isRu ? 'ИНН' : 'STIR'} {a.counterparty.inn}</div>}
        </div>
      ),
    },
    { key: 'amount', label: tl('amount'), numeric: true, sortValue: (a) => Number(a.totalAmount), render: (a) => <strong>{formatCurrency(Number(a.totalAmount), locale, a.currency)}</strong> },
    { key: 'paid', label: tl('paid'), numeric: true, sortValue: (a) => Number(a.paidAmount), render: (a) => formatCurrency(Number(a.paidAmount), locale, a.currency) },
    {
      key: 'status',
      label: tl('status'),
      sortValue: (a) => `${a.status}-${a.paymentStatus}`,
      render: (a) => {
        const st = statusMeta(a.status);
        const pay = payMeta(a.paymentStatus);
        return a.status === 'POSTED' ? <Badge variant={pay.variant === 'neutral' ? 'error' : pay.variant}>{pay.text}</Badge> : <Badge variant={st.variant}>{st.text}</Badge>;
      },
    },
    {
      key: 'actions',
      label: isRu ? 'Действия' : 'Amallar',
      locked: true,
      render: (a) => (
        <div className="rd-row-actions">
          {a.status === 'DRAFT' ? (
            <button type="button" className="rd-next-btn" onClick={(e) => void handleEditAct(a, e)}>
              {tIn('davom_ettirish')}
            </button>
          ) : (
            <button type="button" className="rd-next-btn" onClick={() => setPrintAct(a)}>
              <Printer size={14} aria-hidden /> {isRu ? 'Печать' : 'Chop etish'}
            </button>
          )}
          <ActionsMenu
            label={tl('rowActions')}
            actions={[
              { label: tl('open'), onSelect: () => void handleOpenDetails(a) },
              { label: isRu ? 'Печать' : 'Chop etish', onSelect: () => setPrintAct(a), hidden: a.status !== 'DRAFT' },
              { label: tl('edit'), onSelect: () => void handleEditAct(a) },
              { label: tl('delete'), onSelect: () => void handleDeleteAct(a, { stopPropagation() {} } as React.MouseEvent), danger: true },
            ]}
          />
        </div>
      ),
    },
  ];
  const filterDefs: FilterDef[] = [
    {
      key: 'status',
      kind: 'segmented',
      label: tl('status'),
      options: [
        { value: 'DRAFT', label: isRu ? 'Черновик' : 'Qoralama' },
        { value: 'POSTED', label: isRu ? 'Проведён' : 'Tasdiqlangan' },
        { value: 'CANCELLED', label: isRu ? 'Отменён' : 'Bekor qilingan' },
      ],
    },
    {
      key: 'paymentStatus',
      kind: 'select',
      label: tl('payment'),
      options: [
        { value: 'UNPAID', label: isRu ? 'Не оплачен' : 'To‘lanmagan' },
        { value: 'PARTIALLY_PAID', label: isRu ? 'Частично' : 'Qisman' },
        { value: 'PAID', label: isRu ? 'Оплачен' : 'To‘langan' },
      ],
    },
  ];

  return (
    <div className="rd-page">
      <PageHeader
        title={isRu ? 'Услуги' : 'Xizmatlar'}
        subtitle={isRu ? 'Акты оказанных клиентам и полученных от поставщиков услуг: долг и проводки создаются при проведении.' : 'Mijozlarga ko‘rsatilgan va yetkazib beruvchilardan olingan xizmatlar aktlari: tasdiqlanganda qarz va provodkalar yaratiladi.'}
        actions={
          <>
            <Button variant={activeType === 'RECEIVED' ? 'primary' : 'secondary'} onClick={() => openCreate('RECEIVED')}>
              <ArrowDownRight size={16} aria-hidden /> {tsv('newReceived')}
            </Button>
            <Button variant={activeType === 'PROVIDED' ? 'primary' : 'secondary'} onClick={() => openCreate('PROVIDED')}>
              <ArrowUpRight size={16} aria-hidden /> {tsv('newProvided')}
            </Button>
          </>
        }
      />

      {/* Which acts (not a filter: it also decides the primary "new act" button) */}
      <div className="rd-toolbar-row">
        <SegmentedFilter
          name="type"
          label={isRu ? 'Вид актов' : 'Aktlar turi'}
          options={[
            { value: 'PROVIDED', label: isRu ? 'Оказанные услуги' : 'Ko‘rsatilgan xizmatlar' },
            { value: 'RECEIVED', label: isRu ? 'Полученные услуги' : 'Olingan xizmatlar' },
          ]}
          value={activeType}
          onChange={(v) => v && setActiveType(v as 'PROVIDED' | 'RECEIVED')}
        />
      </div>

      <StatCardGrid label={tl('summary')} count={3}>
        <StatCard label={isRu ? 'Сумма актов' : 'Aktlar summasi'} loading={loading} value={moneyLines(amountByCurrency)} secondary={pageNote} />
        <StatCard label={isRu ? 'Оплачено' : 'To‘langan'} loading={loading} value={moneyLines(paidByCurrency)} secondary={paidShare} />
        <StatCard
          label={activeType === 'PROVIDED' ? (isRu ? 'Должны клиенты' : 'Mijozlar qarzi') : isRu ? 'Мы должны поставщикам' : 'Yetkazib beruvchilarga qarzimiz'}
          loading={loading}
          value={moneyLines(debtByCurrency)}
          secondary={tsv('debtHint')}
        />
      </StatCardGrid>

      <FilterBar
        state={lf}
        defs={filterDefs}
        searchPlaceholder={isRu ? '№ акта, контрагент или заметка' : 'Akt №, kontragent yoki izoh'}
        resultCount={loading ? null : total}
        columns={<ColumnChooser columns={columns.map((col) => ({ key: col.key, label: col.label, locked: col.locked }))} hidden={hiddenCols} onChange={setHiddenCols} />}
      />

      <div className="rd-table-card">
        {actsQuery.isError ? (
          <LoadError error={actsQuery.error} onRetry={() => void fetchActs()} retrying={actsQuery.isFetching} />
        ) : (
          <DataTable
            rows={acts}
            columns={columns}
            rowKey={(a) => a.id}
            hidden={hiddenCols}
            sort={sort}
            onSortChange={setSort}
            onRowClick={(a) => void handleOpenDetails(a)}
            loading={loading}
            caption={tl('clickRowHint')}
            empty={
              isFiltered ? (
                <EmptyState compact title={tl('nothingFound')} description={tl('nothingFoundHint')} action={<Button variant="outline" size="sm" onClick={handleResetFilters}>{tl('clearFilters')}</Button>} />
              ) : (
                <EmptyState
                  icon={FileText}
                  title={activeType === 'PROVIDED' ? (isRu ? 'Актов оказанных услуг пока нет' : 'Hozircha ko‘rsatilgan xizmat aktlari yo‘q') : isRu ? 'Актов полученных услуг пока нет' : 'Hozircha olingan xizmat aktlari yo‘q'}
                  description={activeType === 'PROVIDED' ? (isRu ? 'Оформите акт — после проведения долг клиента появится в расчётах.' : 'Akt rasmiylashtiring — tasdiqlangach mijoz qarzi hisob-kitoblarda paydo bo‘ladi.') : isRu ? 'Оформите акт — после проведения наш долг поставщику появится в расчётах.' : 'Akt rasmiylashtiring — tasdiqlangach yetkazib beruvchiga qarzimiz hisob-kitoblarda paydo bo‘ladi.'}
                  action={<Button onClick={() => openCreate(activeType)}><Plus size={16} aria-hidden /> {activeType === 'PROVIDED' ? tsv('newProvided') : tsv('newReceived')}</Button>}
                />
              )
            }
          />
        )}

        {total > pageSize && (
          <nav aria-label={isRu ? 'Страницы' : 'Sahifalar'} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, padding: '12px 16px', borderTop: '1px solid var(--color-border-light)', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            <span className="tabular-nums">
              {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} {isRu ? 'из' : '/'} {total}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Button aria-label={isRu ? 'Предыдущая страница' : 'Oldingi sahifa'} title={isRu ? 'Предыдущая страница' : 'Oldingi sahifa'} variant="secondary" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                <ChevronLeft size={16} aria-hidden />
              </Button>
              <span className="tabular-nums">{page} / {totalPages}</span>
              <Button aria-label={isRu ? 'Следующая страница' : 'Keyingi sahifa'} title={isRu ? 'Следующая страница' : 'Keyingi sahifa'} variant="secondary" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                <ChevronRight size={16} aria-hidden />
              </Button>
            </div>
          </nav>
        )}
      </div>

      <ServiceActDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} onSuccess={fetchActs} initialData={editingAct} defaultType={activeType} />

      {selectedAct && (
        <ServiceActDetailsModal
          act={selectedAct}
          isOpen={isDetailsOpen}
          onClose={() => {
            setIsDetailsOpen(false);
            setSelectedAct(null);
          }}
          onRefresh={fetchActs}
          onEdit={(act) => handleOpenEdit(act)}
          onPrint={(act) => setPrintAct(act)}
        />
      )}

      {printAct && (
        <ServiceActPrintView act={printAct} companyName={company?.name ? getLocalizedName(company.name, locale) : 'KORXONA'} onClose={() => setPrintAct(null)} locale={locale} />
      )}
    </div>
  );
}
