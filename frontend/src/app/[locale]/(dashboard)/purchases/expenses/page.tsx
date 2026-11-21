'use client';

import { activateOnKey } from '@/lib/a11y';
import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchField } from '@/components/ui/SearchField';
import { EmptyState } from '@/components/ui/EmptyState';
import { ActionsMenu } from '@/components/production/ActionsMenu';
import { usePersistentState } from '@/lib/usePersistentState';
import { totalsByCurrency } from '@/lib/currency-totals';
import { ChipGroup, ColumnChooser, CurrencyTotals, Signal, SignalStrip } from '@/components/ui/list/ListKit';
import { DataTable, type Column, type SortState } from '@/components/ui/list/DataTable';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { LoadError } from '@/components/ui/LoadError';
import { formatCurrency, formatDate, errorMessage } from '@/lib/utils';
import { MultiCurrencyValue, type CurrencyAmountItem } from '@/components/ui/MultiCurrencyValue';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  Receipt,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import { AdditionalExpense, PurchaseDocStatus, ExpenseType } from '@shared/types';
import { useConfirm } from '@/context/ConfirmContext';
import { toast } from '@/context/ToastContext';

interface ExpensesResponse {
  items: AdditionalExpense[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  stats: {
    // ADR 0023: one amount per currency (F8).
    transport: CurrencyAmountItem[];
    customs: CurrencyAmountItem[];
    broker: CurrencyAmountItem[];
    all: CurrencyAmountItem[];
  };
}

export default function ExpensesPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const router = useRouter();
  const { token, company } = useAuth();
  const confirm = useConfirm();

  const [activeTab, setActiveTab] = useState<'list' | 'analytics'>('list');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);

  // The filters and page are the endpoint (= query key).
  const expensesEndpoint = useMemo(() => {
    const queryParams = new URLSearchParams();
    if (search) queryParams.set('search', search);
    if (statusFilter !== 'ALL') queryParams.set('status', statusFilter);
    if (typeFilter !== 'ALL') queryParams.set('expenseType', typeFilter);
    queryParams.set('page', page.toString());
    queryParams.set('limit', '20');
    return `/purchases/additional-expenses?${queryParams.toString()}`;
  }, [search, statusFilter, typeFilter, page]);
  const expensesQuery = useApiQuery<ExpensesResponse>(expensesEndpoint);
  const data = expensesQuery.data ?? null;
  const loading = expensesQuery.isPending;
  const fetchExpenses = () => void expensesQuery.refetch();

  const handleDeleteDraft = async (item: AdditionalExpense, e: React.MouseEvent) => {
    e.stopPropagation();
    const isPosted = item.status === 'POSTED';
    const confirmed = await confirm({
      title: isRu ? 'Удаление расхода' : 'Xarajatni o‘chirish',
      description: isPosted
        ? isRu
          ? 'Этот расход уже проведен и распределен на себестоимость товаров. При удалении он будет автоматически отменен, распределение себестоимости и долг будут откачены, после чего документ будет удален. Продолжить?'
          : 'Ushbu xarajat tasdiqlangan va tovarlar tannarxiga taqsimlangan. O‘chirish jarayonida u avtomatik bekor qilinadi, tannarx taqsimoti va qarz orqaga qaytariladi, so‘ngra hujjat butunlay o‘chiriladi. Davom ettirasizmi?'
        : isRu
        ? 'Вы уверены, что хотите удалить этот документ расхода?'
        : 'Ushbu xarajat hujjatini o‘chirishni xohlaysizmi?',
      variant: 'danger',
      confirmText: isRu ? 'Удалить' : 'O‘chirish',
      cancelText: isRu ? 'Отмена' : 'Bekor qilish',
    });

    if (!confirmed) {
      return;
    }
    try {
      if (isPosted) {
        await apiFetch(`/purchases/additional-expenses/${item.id}/cancel`, {
          token: token || undefined,
          tenantId: company?.id || undefined,
          method: 'POST',
          locale,
        });
      }
      await apiFetch(`/purchases/additional-expenses/${item.id}`, {
        token: token || undefined,
        tenantId: company?.id || undefined,
        method: 'DELETE',
        locale,
      });
      toast.success(isRu ? 'Расход успешно удален' : 'Xarajat muvaffaqiyatli o‘chirildi');
      fetchExpenses();
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Ошибка при удалении' : 'O‘chirishda xatolik'));
    }
  };

  const getExpenseTypeBadge = (type: ExpenseType) => {
    switch (type) {
      case 'TRANSPORT':
        return <Badge variant="warning">{isRu ? 'Транспорт' : 'Transport'}</Badge>;
      case 'CUSTOMS':
        return <Badge variant="info">{isRu ? 'Таможня' : 'Bojxona'}</Badge>;
      case 'BROKER':
        return <Badge variant="neutral">{isRu ? 'Брокер' : 'Broker'}</Badge>;
      case 'INSURANCE':
        return <Badge variant="success">{isRu ? 'Страхование' : 'Sug‘urta'}</Badge>;
      default:
        return <Badge variant="neutral">{isRu ? 'Прочее' : 'Boshqa'}</Badge>;
    }
  };

  const getStatusBadge = (status: PurchaseDocStatus) => {
    switch (status) {
      case 'DRAFT':
        return (
          <Badge variant="neutral">
            <Clock size={12} style={{ marginRight: '4px' }} />
            {isRu ? 'Черновик' : 'Qoralama'}
          </Badge>
        );
      case 'POSTED':
        return (
          <Badge variant="success">
            <CheckCircle2 size={12} style={{ marginRight: '4px' }} />
            {isRu ? 'Проведен' : 'Tasdiqlangan'}
          </Badge>
        );
      case 'CANCELLED':
        return (
          <Badge variant="error">
            <XCircle size={12} style={{ marginRight: '4px' }} />
            {isRu ? 'Отменен' : 'Bekor qilingan'}
          </Badge>
        );
      default:
        return null;
    }
  };

  const tl = useTranslations('rd.list');
  const te = useTranslations('rd.expenses');
  const td = useTranslations('rd.doc');
  const [hiddenCols, setHiddenCols] = usePersistentState<string[]>('expenses.list.hidden', []);
  const [sort, setSort] = usePersistentState<SortState | null>('expenses.list.sort', null);
  const items = data?.items ?? [];
  const open = (item: AdditionalExpense) => router.push(`/${locale}/purchases/expenses/${item.id}`);
  const kpi = (list: CurrencyAmountItem[] | undefined) => (list && list.some((x) => x.amount !== 0) ? <MultiCurrencyValue items={list} locale={locale} /> : '—');
  const toggleType = (t: string) => {
    setTypeFilter(typeFilter === t ? 'ALL' : t);
    setPage(1);
  };
  const typeLabel: Record<string, string> = {
    TRANSPORT: isRu ? 'Транспорт' : 'Transport',
    CUSTOMS: isRu ? 'Таможня' : 'Bojxona',
    BROKER: isRu ? 'Брокер' : 'Broker',
    INSURANCE: isRu ? 'Страхование' : 'Sug‘urta',
    OTHER: isRu ? 'Прочее' : 'Boshqa',
  };

  const columns: Column<AdditionalExpense>[] = [
    {
      key: 'number',
      label: isRu ? '№ / Дата' : '№ / Sana',
      primary: true,
      locked: true,
      sortValue: (r) => r.docDate,
      render: (r) => (
        <div>
          <div className="rd-doc-no">{r.docNumber}</div>
          <div className="rd-sub">{formatDate(r.docDate, locale)}</div>
        </div>
      ),
      footer: <span>{tl('total')} · {tl('results', { count: items.length })}</span>,
    },
    { key: 'type', label: te('type'), sortValue: (r) => r.expenseType, render: (r) => getExpenseTypeBadge(r.expenseType) },
    { key: 'provider', label: te('provider'), sortValue: (r) => r.counterparty?.name ?? '', render: (r) => <span style={{ fontWeight: 'var(--font-medium)' }}>{r.counterparty?.name || '—'}</span> },
    {
      key: 'receipt',
      label: te('receipt'),
      render: (r) => (
        <div>
          <div>{r.receipt?.docNumber ?? '—'}</div>
          {r.receipt?.counterparty?.name && <div className="rd-sub">{r.receipt.counterparty.name}</div>}
        </div>
      ),
    },
    {
      key: 'amount',
      label: tl('amount'),
      numeric: true,
      sortValue: (r) => Number(r.amount) || 0,
      render: (r) => <strong>{formatCurrency(Number(r.amount) || 0, locale, r.currency)}</strong>,
      footer: <CurrencyTotals totals={totalsByCurrency(items.filter((r) => r.status !== 'CANCELLED'), (r) => r.currency, (r) => Number(r.amount) || 0)} locale={locale} />,
    },
    {
      key: 'status',
      label: tl('status'),
      sortValue: (r) => r.status,
      render: (r) => (
        <div className="rd-status-stack">
          {getStatusBadge(r.status)}
          {r.status === 'POSTED' && (r.isPaid ? <Badge variant="success">{td('paid')}</Badge> : <Badge variant="warning">{te('onCredit')}</Badge>)}
        </div>
      ),
    },
    {
      key: 'actions',
      label: isRu ? 'Действия' : 'Amallar',
      locked: true,
      render: (r) => (
        <div className="rd-row-actions">
          {r.status === 'DRAFT' && (
            <button type="button" className="rd-next-btn" onClick={() => open(r)}>
              {td('continue')}
            </button>
          )}
          <ActionsMenu
            label={tl('rowActions')}
            actions={[
              { label: tl('open'), onSelect: () => open(r) },
              { label: tl('delete'), onSelect: () => void handleDeleteDraft(r, { stopPropagation() {} } as React.MouseEvent), danger: true },
            ]}
          />
        </div>
      ),
    },
  ];

  const anyFilter = Boolean(search || statusFilter !== 'ALL' || typeFilter !== 'ALL');
  const clearAll = () => {
    setSearch('');
    setStatusFilter('ALL');
    setTypeFilter('ALL');
    setPage(1);
  };

  return (
    <div className="rd-page">
      <PageHeader
        title={isRu ? 'Дополнительные расходы' : 'Qo‘shimcha xarajatlar'}
        subtitle={te('subtitle')}
        actions={
          <Button onClick={() => router.push(`/${locale}/purchases/expenses/new`)}>
            <Plus size={16} aria-hidden /> {isRu ? 'Новый расход' : 'Yangi Xarajat'}
          </Button>
        }
      />

      {/* Totals by type — each tile filters the list to that type */}
      <SignalStrip label={tl('summary')}>
        <Signal tone="warning" label={isRu ? 'Транспортные расходы' : 'Transport xarajatlari'} value={kpi(data?.stats.transport)} hint={te('clickToFilter')} active={typeFilter === 'TRANSPORT'} onClick={() => toggleType('TRANSPORT')} />
        <Signal tone="info" label={isRu ? 'Таможенные пошлины' : 'Bojxona to‘lovlari'} value={kpi(data?.stats.customs)} hint={te('clickToFilter')} active={typeFilter === 'CUSTOMS'} onClick={() => toggleType('CUSTOMS')} />
        <Signal tone="neutral" label={isRu ? 'Брокерские услуги' : 'Brokerlik xizmatlari'} value={kpi(data?.stats.broker)} hint={te('clickToFilter')} active={typeFilter === 'BROKER'} onClick={() => toggleType('BROKER')} />
        <Signal tone="success" label={isRu ? 'Всего распределено' : 'Jami taqsimlangan'} value={kpi(data?.stats.all)} hint={te('allHint')} />
      </SignalStrip>

      <div className="rd-toolbar">
        <div className="rd-toolbar-row">
          <SearchField
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder={isRu ? 'Поиск по номеру, поставщику, комментарию...' : 'Raqam, kontragent, izoh bo‘yicha qidiruv...'}
            label={tl('search')}
          />
          <ChipGroup
            label={te('view')}
            options={[
              { value: 'list', label: isRu ? 'Все расходы' : 'Barcha xarajatlar' },
              { value: 'analytics', label: isRu ? 'Влияние на себестоимость' : 'Tannarxga ta’siri' },
            ]}
            value={activeTab}
            onChange={(v) => setActiveTab((v || 'list') as 'list' | 'analytics')}
          />
          {activeTab === 'list' && <ColumnChooser columns={columns.map((c) => ({ key: c.key, label: c.label, locked: c.locked }))} hidden={hiddenCols} onChange={setHiddenCols} />}
        </div>
        {activeTab === 'list' && (
          <div className="rd-toolbar-row">
            <ChipGroup
              label={tl('status')}
              showLabel
              options={[
                { value: '', label: tl('all') },
                { value: 'DRAFT', label: isRu ? 'Черновик' : 'Qoralama' },
                { value: 'POSTED', label: isRu ? 'Проведен' : 'Tasdiqlangan' },
                { value: 'CANCELLED', label: isRu ? 'Отменен' : 'Bekor qilingan' },
              ]}
              value={statusFilter === 'ALL' ? '' : statusFilter}
              onChange={(v) => {
                setStatusFilter(v || 'ALL');
                setPage(1);
              }}
            />
            <ChipGroup
              label={te('type')}
              showLabel
              options={[{ value: '', label: tl('all') }, ...Object.entries(typeLabel).map(([value, label]) => ({ value, label }))]}
              value={typeFilter === 'ALL' ? '' : typeFilter}
              onChange={(v) => {
                setTypeFilter(v || 'ALL');
                setPage(1);
              }}
            />
          </div>
        )}
      </div>

      {activeTab === 'list' && (
        <div className="rd-table-card">
          {expensesQuery.isError ? (
            <LoadError error={expensesQuery.error} onRetry={fetchExpenses} retrying={expensesQuery.isFetching} />
          ) : (
            <DataTable
              rows={items}
              columns={columns}
              rowKey={(r) => r.id}
              hidden={hiddenCols}
              sort={sort}
              onSortChange={setSort}
              onRowClick={open}
              loading={loading}
              empty={
                anyFilter ? (
                  <EmptyState icon={Receipt} title={tl('nothingFound')} description={tl('nothingFoundHint')} action={<Button variant="secondary" onClick={clearAll}>{tl('clearFilters')}</Button>} />
                ) : (
                  <EmptyState icon={Receipt} title={te('none')} description={te('noneHint')} action={<Button onClick={() => router.push(`/${locale}/purchases/expenses/new`)}><Plus size={16} aria-hidden /> {isRu ? 'Новый расход' : 'Yangi Xarajat'}</Button>} />
                )
              }
            />
          )}
          {data && data.totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--color-border-light)' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                {isRu ? `Показано ${data.items.length} из ${data.total}` : `Jami ${data.total} tadan ${data.items.length} tasi ko‘rsatilmoqda`}
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  {isRu ? 'Назад' : 'Oldingi'}
                </Button>
                <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
                  {isRu ? 'Вперед' : 'Keyingi'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'analytics' && (
        <Card style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
              {isRu ? 'Влияние на себестоимость товаров (Landed Cost Breakdown)' : 'Tovarlar tannarxiga qo‘shilgan xarajatlar tahlili'}
            </h2>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
              {isRu
                ? 'Детальная сводка распределения прямых расходов и прирост себестоимости по закупкам'
                : 'Har bir xarid bo‘yicha tovarlar tannarxining dastlabki xarid narxidan qancha oshgani va taqsimlangan xarajatlar'}
            </p>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-subtle)', textAlign: 'left', color: 'var(--color-text-secondary)' }}>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'Закупка' : 'Xarid hujjati'}</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'Поставщик' : 'Yetkazib beruvchi'}</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'Расход' : 'Xarajat hujjati'}</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'Тип' : 'Turi'}</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 'var(--font-semibold)', textAlign: 'right' }}>{isRu ? 'Сумма расхода' : 'Xarajat summasi'}</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 'var(--font-semibold)', textAlign: 'center' }}>{isRu ? 'Метод' : 'Taqsimot usuli'}</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 'var(--font-semibold)', textAlign: 'center' }}>{isRu ? 'Статус' : 'Holati'}</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.filter((it) => it.status === 'POSTED').length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
                      {isRu ? 'Нет проведенных расходов для анализа' : 'Tahlil qilish uchun tasdiqlangan xarajatlar mavjud emas'}
                    </td>
                  </tr>
                ) : (
                  data?.items
                    .filter((it) => it.status === 'POSTED')
                    .map((expense) => (
                      <tr
                        key={expense.id}
                        onClick={() => router.push(`/${locale}/purchases/expenses/${expense.id}`)}
                        tabIndex={0}
                        onKeyDown={activateOnKey(() => router.push(`/${locale}/purchases/expenses/${expense.id}`))}
                        style={{ borderBottom: '1px solid var(--color-border-subtle)', cursor: 'pointer' }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <td style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 'var(--font-medium)' }}>
                          {expense.receipt?.docNumber}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                          {expense.receipt?.counterparty?.name || '—'}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', color: 'var(--color-primary-600)', fontWeight: 'var(--font-semibold)' }}>
                          {expense.docNumber}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                          {getExpenseTypeBadge(expense.expenseType)}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right', fontWeight: 'var(--font-bold)' }} className="tabular-nums">
                          {formatCurrency(Number(expense.amount) || 0, locale, expense.currency)}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                          {expense.allocationMethod === 'BY_AMOUNT' ? (isRu ? 'По стоимости' : 'Qiymatiga mutanosib') : expense.allocationMethod === 'BY_QUANTITY' ? (isRu ? 'По количеству' : 'Miqdoriga mutanosib') : (isRu ? 'По весу' : 'Vazniga mutanosib')}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center' }}>
                          {getStatusBadge(expense.status)}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
