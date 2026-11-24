'use client';

import { MoneyInput } from '@/components/ui/MoneyInput';
import { FilterBar, periodRange, SegmentedFilter, useFilterState, type FilterDef } from '@/components/ui/filters';
import { StatCard, StatCardGrid } from '@/components/ui/stats/StatCard';
import { useState, useEffect, useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { financeQuickAction } from '@/lib/finance-quick-action';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatDate, formatCurrency, errorMessage, getLocalizedName } from '@/lib/utils';

/** An open (not fully paid) sales invoice or purchase receipt to settle against. */
interface OpenDocument {
  id: string;
  docNumber?: string;
  invoiceNumber?: string;
  currency: string;
  exchangeRate?: number | string | null;
  totalAmount: number | string;
  paidAmount: number | string;
}
import { MultiCurrencyValue } from '@/components/ui/MultiCurrencyValue';
import { amountForPickedDocument, remainingOnDocument } from '@/lib/open-document';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { toast } from '@/context/ToastContext';
import type {
  CashAccount,
  FinanceTransaction,
  TransactionJournal,
  FinanceDashboardMetrics,
  FinanceAccountFlow,
  TransactionType,
  Counterparty,
} from '@shared/types';
import { isCashAccountCurrencyValid } from '@shared/types/cash-account-policy';
import {
  Plus,
  Minus,
  ArrowLeftRight,
  Wallet,
  AlertCircle,
  CheckCircle2,
  Edit2,
  XCircle,
  Users,
  RefreshCw,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  Trash2,
  RotateCcw, Pencil, Undo2 } from 'lucide-react';


/** One row per cash desk / account: today's and this month's in / out / net (per currency, never summed). */
function AccountFlowTable({ today, month, locale }: { today: FinanceAccountFlow[]; month: FinanceAccountFlow[]; locale: 'uz' | 'ru' }) {
  const tf = useTranslations('rd.finance');
  const key = (a: FinanceAccountFlow) => a.accountId ?? `unassigned-${a.currency}`;
  const rows = [...month, ...today.filter((t) => !month.some((m) => key(m) === key(t)))];
  if (rows.length === 0) return <p className="dash-panel-hint">{tf('noAccounts')}</p>;
  const cell = (a: FinanceAccountFlow | undefined, currency: string) => {
    if (!a || (a.income === 0 && a.expense === 0 && a.transferIn === 0 && a.transferOut === 0)) return <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>;
    const inn = a.income + a.transferIn;
    const out = a.expense + a.transferOut;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
        {inn !== 0 && <span style={{ color: 'var(--color-success-700)' }}>+{formatCurrency(inn, locale, currency)}</span>}
        {out !== 0 && <span style={{ color: 'var(--color-error-700)' }}>−{formatCurrency(out, locale, currency)}</span>}
      </div>
    );
  };
  return (
    <div style={{ overflowX: 'auto' }} role="region" tabIndex={0} aria-label={tf('account')}>
    <table className="rd-mini-table">
      <thead>
        <tr>
          <th scope="col">{tf('account')}</th>
          <th scope="col" style={{ textAlign: 'right' }}>{tf('today')}</th>
          <th scope="col" style={{ textAlign: 'right' }}>{tf('month')}</th>
          <th scope="col" style={{ textAlign: 'right' }}>{tf('monthNet')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const t = today.find((x) => key(x) === key(r));
          const m = month.find((x) => key(x) === key(r));
          return (
            <tr key={key(r)}>
              <td style={{ color: r.accountId ? undefined : 'var(--color-error-700)' }}>{r.name[locale]} <span className="rd-sub">· {r.currency}</span></td>
              <td className="tabular-nums" style={{ textAlign: 'right' }}>{cell(t, r.currency)}</td>
              <td className="tabular-nums" style={{ textAlign: 'right' }}>{cell(m, r.currency)}</td>
              <td className="tabular-nums" style={{ textAlign: 'right', fontWeight: 'var(--font-semibold)', color: (m?.netCashFlow ?? 0) >= 0 ? 'var(--color-success-700)' : 'var(--color-error-700)' }}>
                {m ? formatCurrency(m.netCashFlow, locale, r.currency) : '—'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
    </div>
  );
}

// ─── Main Finance Component ─────────────────────────────────────
/** Transaction views shown as chips inside the Operations tab. */
const FILTER_DEFAULTS = { account: '', counterparty: '', period: '' };
const OPS_VIEWS = ['journal', 'income', 'expense', 'transfers', 'deleted'] as const;

export default function FinancePage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const tIn = useTranslations('rd.inline');
  const tfin = useTranslations('rd.finance');
  const { token, company } = useAuth();

  // Active Tab: dashboard | journal | income | expense | transfers | debts | deleted
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'journal' | 'income' | 'expense' | 'transfers' | 'debts' | 'deleted'
  >('dashboard');

  // Debts sub-tab: receivables | payables
  const [debtsSubTab, setDebtsSubTab] = useState<'receivables' | 'payables'>('receivables');

  // Data States
  const [dashboardMetrics, setDashboardMetrics] = useState<FinanceDashboardMetrics | null>(null);
  const [journal, setJournal] = useState<TransactionJournal | null>(null);
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [txTypes, setTxTypes] = useState<TransactionType[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [, setLoading] = useState(true);
  // Operations filters live in the URL and are remembered per user; a new filter or view starts at page 1.
  const lf = useFilterState('finance.ops', FILTER_DEFAULTS);
  const { account: accountFilter, counterparty: counterpartyFilter } = lf.values;
  const { from: dateFrom, to: dateTo } = periodRange(lf.values.period);
  const filterKey = `${activeTab}|${lf.values.period}|${accountFilter}|${counterpartyFilter}`;
  const [pageAt, setPageAt] = useState({ key: '', page: 1 });
  const page = pageAt.key === filterKey ? pageAt.page : 1;
  const setPage = (next: number | ((p: number) => number)) => setPageAt({ key: filterKey, page: typeof next === 'function' ? next(page) : next });


  // Modals & Drawers
  // `?new=expense` (Sales → Sotuv xarajatlari, B13) opens that drawer.
  const searchParams = useSearchParams();
  const [drawerMode, setDrawerMode] = useState<
    'income' | 'expense' | 'transfer' | 'exchange' | null
  >(() => financeQuickAction(searchParams.get('new')));
  const [prefilledCounterpartyId, setPrefilledCounterpartyId] = useState<string | null>(null);
  const [prefilledSettlement, setPrefilledSettlement] = useState<{
    side: 'CUSTOMER' | 'SUPPLIER';
    currency: string;
  } | null>(null);

  // Edit / Storno Modal
  const [editingTx, setEditingTx] = useState<FinanceTransaction | null>(null);
  const [editComment, setEditComment] = useState('');
  const [editTypeId, setEditTypeId] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [stornoTx, setStornoTx] = useState<FinanceTransaction | null>(null);
  const [stornoReason, setStornoReason] = useState('');
  const [stornoLoading, setStornoLoading] = useState(false);

  const [deletingTx, setDeletingTx] = useState<FinanceTransaction | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [restoringTxId, setRestoringTxId] = useState<string | null>(null);


  // Fetch Core Data
  const fetchData = useCallback(async () => {
    if (!token || !company) return;
    setLoading(true);
    const opts = { token, tenantId: company.id, locale };

    // Determine direction filter based on tab
    let dirParam = '';
    if (activeTab === 'income') dirParam = 'INCOME';
    else if (activeTab === 'expense') dirParam = 'EXPENSE';
    else if (activeTab === 'transfers') dirParam = 'TRANSFER';

    const params = new URLSearchParams({
      page: String(page),
      limit: '25',
    });
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    if (dirParam) params.set('direction', dirParam);
    if (accountFilter) params.set('accountId', accountFilter);
    if (counterpartyFilter) params.set('counterpartyId', counterpartyFilter);

    try {
      const [metrics, jour, accs, types, cps] = await Promise.all([
        apiFetch<FinanceDashboardMetrics>('/finance/dashboard', opts),
        apiFetch<TransactionJournal>(
          `${activeTab === 'deleted' ? '/finance/transactions/deleted' : '/finance/transactions'}?${params}`,
          opts,
        ),
        apiFetch<CashAccount[]>('/finance/accounts', opts),
        apiFetch<TransactionType[]>('/finance/transaction-types', opts),
        apiFetch<Counterparty[]>('/sales/counterparties', opts),
      ]);
      setDashboardMetrics(metrics);
      setJournal(jour);
      setAccounts(accs);
      setTxTypes(types);
      setCounterparties(Array.isArray(cps) ? cps : []);
    } catch (e) {
      console.error('Failed to load finance data:', e);
    } finally {
      setLoading(false);
    }
  }, [token, company, locale, page, dateFrom, dateTo, activeTab, accountFilter, counterpartyFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Open transaction creation
  const handleOpenDrawer = (
    mode: 'income' | 'expense' | 'transfer' | 'exchange',
    cpId?: string,
    side?: 'CUSTOMER' | 'SUPPLIER',
    currency?: string,
  ) => {
    setDrawerMode(mode);
    setPrefilledCounterpartyId(cpId || null);
    setPrefilledSettlement(side && currency ? { side, currency } : null);
  };

  // Handle Edit Transaction
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx || !token || !company) return;
    setSavingEdit(true);
    try {
      await apiFetch(`/finance/transactions/${editingTx.id}`, {
        method: 'PUT',
        token,
        tenantId: company.id,
        locale,
        body: JSON.stringify({
          comment: editComment.trim() || undefined,
          transactionTypeId: editTypeId || undefined,
        }),
      });
      setEditingTx(null);
      fetchData();
      toast.success(isRu ? 'Операция сохранена' : 'Operatsiya muvaffaqiyatli saqlandi');
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Ошибка при сохранении' : 'Saqlashda xatolik'));
    } finally {
      setSavingEdit(false);
    }
  };

  // Handle Storno (Cancel Transaction)
  const handleStorno = async () => {
    if (!stornoTx || !token || !company) return;
    setStornoLoading(true);
    try {
      await apiFetch(`/finance/transactions/${stornoTx.id}/cancel`, {
        method: 'POST',
        token,
        tenantId: company.id,
        locale,
        body: JSON.stringify({
          reason: stornoReason.trim() || undefined,
        }),
      });
      setStornoTx(null);
      setStornoReason('');
      fetchData();
      toast.success(
        isRu
          ? 'Операция успешно аннулирована (Сторно)'
          : 'Operatsiya muvaffaqiyatli bekor qilindi (Storno)',
      );
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Ошибка при аннулировании' : 'Bekor qilishda xatolik'));
    } finally {
      setStornoLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingTx || !token || !company) return;
    setDeleteLoading(true);
    try {
      await apiFetch(`/finance/transactions/${deletingTx.id}`, {
        method: 'DELETE',
        token,
        tenantId: company.id,
        locale,
      });
      setDeletingTx(null);
      await fetchData();
      toast.success(isRu ? 'Операция перемещена в корзину' : 'Operatsiya savatga ko‘chirildi');
    } catch (err: unknown) {
      toast.error(
        err instanceof Error && err.message
          ? err.message
          : isRu
            ? 'Ошибка при удалении операции'
            : 'Operatsiyani o‘chirishda xatolik',
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleRestore = async (tx: FinanceTransaction) => {
    if (!token || !company) return;
    setRestoringTxId(tx.id);
    try {
      await apiFetch(`/finance/transactions/${tx.id}/restore`, {
        method: 'POST',
        token,
        tenantId: company.id,
        locale,
      });
      await fetchData();
      toast.success(
        isRu
          ? 'Операция возвращена в журнал со статусом «Аннулирован»'
          : 'Operatsiya jurnalga bekor qilingan holatda qaytarildi',
      );
    } catch (err: unknown) {
      toast.error(
        err instanceof Error && err.message
          ? err.message
          : isRu
            ? 'Ошибка при восстановлении'
            : 'Qaytarishda xatolik',
      );
    } finally {
      setRestoringTxId(null);
    }
  };

  const totalPages = journal ? Math.ceil(journal.total / journal.limit) : 1;

  const opsFilterDefs: FilterDef[] = [
    { key: 'account', kind: 'select', label: isRu ? 'Касса' : 'Kassa', options: accounts.map((a) => ({ value: a.id, label: `${getLocalizedName(a.name, locale)} (${a.currency})` })) },
    { key: 'counterparty', kind: 'select', label: isRu ? 'Контрагент' : 'Kontragent', searchable: true, options: counterparties.map((cp) => ({ value: cp.id, label: cp.name })) },
    { key: 'period', kind: 'period', label: isRu ? 'Период' : 'Davr' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* ─── Top Header & Action Controls ───────────────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
        }}
      >
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', margin: 0 }}>
            {isRu ? 'Финансы' : 'Moliya'}
          </h1>
          <p style={{ marginTop: 'var(--space-1)', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{tfin('subtitle')}</p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <Button
            variant="primary"
            onClick={() => handleOpenDrawer('income')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Plus size={16} aria-hidden />
            <span>{isRu ? 'Приход' : 'Kirim qo‘shish'}</span>
          </Button>

          <Button
            variant="secondary"
            onClick={() => handleOpenDrawer('expense')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Minus size={16} />
            <span>{isRu ? 'Расход' : 'Chiqim qo‘shish'}</span>
          </Button>

          <Button
            variant="secondary"
            onClick={() => handleOpenDrawer('transfer')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <ArrowLeftRight size={16} />
            <span>{isRu ? 'Перевод / Обмен' : 'O‘tkazma / Konvertatsiya'}</span>
          </Button>
        </div>
      </div>

      {/* ─── Cash balances (always visible) ─────────────── */}
      <StatCardGrid label={isRu ? 'Остатки денег' : 'Pul qoldiqlari'} count={3}>
        <StatCard
          label={isRu ? 'Долларовая касса' : 'Dollar kassa'}
          loading={!dashboardMetrics}
          value={dashboardMetrics ? formatCurrency(dashboardMetrics.balances.dollarKassa, locale, dashboardMetrics.balances.accountCurrencies.dollarKassa) : null}
          negative={Boolean(dashboardMetrics && dashboardMetrics.balances.dollarKassa < 0)}
        />
        <StatCard
          label={isRu ? 'Наличная касса' : 'Naqd kassa'}
          loading={!dashboardMetrics}
          value={dashboardMetrics ? formatCurrency(dashboardMetrics.balances.naqdKassa, locale, dashboardMetrics.balances.accountCurrencies.naqdKassa) : null}
          negative={Boolean(dashboardMetrics && dashboardMetrics.balances.naqdKassa < 0)}
        />
        <StatCard
          label={isRu ? 'Расчетный счет' : 'Hisobraqam'}
          loading={!dashboardMetrics}
          value={dashboardMetrics ? formatCurrency(dashboardMetrics.balances.hisobRaqam, locale, dashboardMetrics.balances.accountCurrencies.hisobRaqam) : null}
          negative={Boolean(dashboardMetrics && dashboardMetrics.balances.hisobRaqam < 0)}
        />
      </StatCardGrid>

      {/* ─── Navigation Tabs ────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          borderBottom: '1px solid var(--color-border-subtle)',
          paddingBottom: '2px',
          overflowX: 'auto',
        }}
      >
        {[
          { id: 'dashboard', label: tfin('overview') },
          { id: 'journal', label: tfin('operations') },
          { id: 'debts', label: isRu ? 'Взаиморасчеты (Долги)' : 'Qarzdorlik nazorati' },
        ].map((tab) => {
          const isActive = tab.id === 'journal' ? OPS_VIEWS.includes(activeTab as (typeof OPS_VIEWS)[number]) : activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              onClick={() => {
                setActiveTab(tab.id as typeof activeTab);
                setPage(1);
              }}
              style={{
                padding: '8px 16px',
                fontSize: 'var(--text-sm)',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
                borderBottom: isActive ? '2px solid var(--color-primary-600)' : '2px solid transparent',
                background: 'none',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ─── Tab Content 1: Dashboard View ──────────────────────────── */}
      {activeTab === 'dashboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {/* Activity Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
              gap: 'var(--space-4)',
            }}
          >
            {/* Bugungi va Oylik Ko'rsatkichlar */}
            <Card style={{ padding: 'var(--space-5)' }}>
              <div
                style={{
                  fontSize: 'var(--text-base)',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  marginBottom: 'var(--space-4)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Clock size={18} color="var(--color-primary-500)" />
                <span>{isRu ? 'Динамика поступлений и списаний' : 'Kirim va Chiqim dinamikasi'}</span>
              </div>

              <AccountFlowTable today={dashboardMetrics?.today.byAccount ?? []} month={dashboardMetrics?.month.byAccount ?? []} locale={locale} />
            </Card>

            {/* Qarzdorlik Balansi (Segregated Debts) */}
            <Card style={{ padding: 'var(--space-5)' }}>
              <div
                style={{
                  fontSize: 'var(--text-base)',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  marginBottom: 'var(--space-4)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Users size={18} color="var(--color-primary-500)" />
                <span>
                  {isRu ? 'Взаиморасчеты с контрагентами' : 'Kontragentlar bilan qarzdorlik'}
                </span>
              </div>

              <StatCardGrid label={isRu ? 'Взаиморасчеты' : 'Qarzdorlik'} count={2}>
                <StatCard
                  label={isRu ? 'Ожидаемые поступления (Дебиторка)' : 'Kutilayotgan tushumlar (Debitorlik)'}
                  loading={!dashboardMetrics}
                  value={<MultiCurrencyValue inherit items={dashboardMetrics?.debts.receivablesByCurrency} locale={locale} />}
                  secondary={
                    (dashboardMetrics?.debts.customerAdvancesByCurrency.length ?? 0) > 0 ? (
                      <>
                        {isRu ? 'Авансы клиентов' : 'Mijozlar avansi'}: <MultiCurrencyValue inherit items={dashboardMetrics?.debts.customerAdvancesByCurrency} locale={locale} />
                      </>
                    ) : isRu ? 'Клиенты должны нам' : 'Mijozlar bizga to‘lashi kerak'
                  }
                />
                <StatCard
                  label={isRu ? 'К оплате поставщикам (Кредиторка)' : 'Bizning qarzlarimiz (Kreditorlik)'}
                  loading={!dashboardMetrics}
                  value={<MultiCurrencyValue inherit items={dashboardMetrics?.debts.payablesByCurrency} locale={locale} />}
                  secondary={
                    (dashboardMetrics?.debts.supplierAdvancesByCurrency.length ?? 0) > 0 ? (
                      <>
                        {isRu ? 'Авансы поставщикам' : 'Ta’minotchilarga avanslar'}: <MultiCurrencyValue inherit items={dashboardMetrics?.debts.supplierAdvancesByCurrency} locale={locale} />
                      </>
                    ) : isRu ? 'Мы должны поставщикам' : 'Ta’minotchilarga to‘lashimiz kerak'
                  }
                />
              </StatCardGrid>
            </Card>
          </div>

          {/* So'nggi amallar jadvali */}
          <Card style={{ padding: 'var(--space-5)' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 'var(--space-4)',
              }}
            >
              <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, margin: 0 }}>
                {isRu ? 'Последние финансовые операции' : 'So‘nggi moliyaviy amallar'}
              </h3>
              <Button variant="secondary" size="sm" onClick={() => setActiveTab('journal')}>
                {isRu ? 'Смотреть все' : 'Barchasini ko‘rish'}
              </Button>
            </div>

            <TransactionsTable
              transactions={journal?.data.slice(0, 10) || []}
              locale={locale}
              isRu={isRu}
              onEdit={(tx) => {
                setEditingTx(tx);
                setEditComment(tx.comment || '');
                setEditTypeId(tx.transactionTypeId || '');
              }}
              onStorno={(tx) => {
                setStornoTx(tx);
                setStornoReason('');
              }}
              onDelete={setDeletingTx}
              onRestore={handleRestore}
              isDeletedView={false}
              restoringTxId={restoringTxId}
            />
          </Card>
        </div>
      )}

      {/* ─── Tab Content 2: Transactions Journal ────────────────────── */}
      {(activeTab === 'journal' ||
        activeTab === 'income' ||
        activeTab === 'expense' ||
        activeTab === 'transfers' ||
        activeTab === 'deleted') && (
        <Card style={{ padding: 'var(--space-5)' }}>
          {/* Which operations: all / income / expense / transfers / deleted (same views as the old tabs) */}
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <div className="rd-toolbar-row">
              <SegmentedFilter
                name="operations"
                label={tfin('operations')}
                value={activeTab}
                onChange={(v) => setActiveTab((v || 'journal') as typeof activeTab)}
                options={[
                  { value: 'journal', label: tIn('hammasi') },
                  { value: 'income', label: isRu ? 'Приходы' : 'Kirimlar' },
                  { value: 'expense', label: isRu ? 'Расходы' : 'Chiqimlar' },
                  { value: 'transfers', label: isRu ? 'Переводы' : 'O‘tkazmalar' },
                  { value: 'deleted', label: isRu ? 'Удалённые' : 'O‘chirilganlar' },
                ]}
              />
              <span className="rd-toolbar-spacer" />
              <Button aria-label={isRu ? 'Обновить' : 'Yangilash'} title={isRu ? 'Обновить' : 'Yangilash'} variant="secondary" size="sm" onClick={() => fetchData()}>
                <RefreshCw size={14} />
              </Button>
            </div>
          </div>
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <FilterBar state={lf} defs={opsFilterDefs} resultCount={journal ? (journal.total ?? journal.data?.length ?? null) : null} />
          </div>

          <TransactionsTable
            transactions={journal?.data || []}
            locale={locale}
            isRu={isRu}
            onEdit={(tx) => {
              setEditingTx(tx);
              setEditComment(tx.comment || '');
              setEditTypeId(tx.transactionTypeId || '');
            }}
            onStorno={(tx) => {
              setStornoTx(tx);
              setStornoReason('');
            }}
            onDelete={setDeletingTx}
            onRestore={handleRestore}
            isDeletedView={activeTab === 'deleted'}
            restoringTxId={restoringTxId}
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 'var(--space-4)',
                paddingTop: 'var(--space-3)',
                borderTop: '1px solid var(--color-border-subtle)',
              }}
            >
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                {isRu ? 'Всего записей' : 'Jami yozuvlar'}: {journal?.total}
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {isRu ? 'Назад' : 'Oldingi'}
                </Button>
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: 'var(--text-xs)',
                    padding: '0 8px',
                  }}
                >
                  {page} / {totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  {isRu ? 'Вперед' : 'Keyingi'}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ─── Tab Content 3: Debts Center (Qarzdorlik Nazorati) ────────── */}
      {activeTab === 'debts' && (
        <Card style={{ padding: 'var(--space-5)' }}>
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-3)',
              marginBottom: 'var(--space-4)',
              borderBottom: '1px solid var(--color-border-subtle)',
              paddingBottom: '8px',
            }}
          >
            <SegmentedFilter
              name="debts"
              label={isRu ? 'Чьи долги' : 'Kimning qarzi'}
              value={debtsSubTab}
              onChange={(v) => v && setDebtsSubTab(v as 'receivables' | 'payables')}
              options={[
                { value: 'receivables', label: isRu ? 'Дебиторка (Нам должны)' : 'Mijozlarimiz qarzi (Debitorlik)' },
                { value: 'payables', label: isRu ? 'Кредиторка (Мы должны)' : 'Bizning qarzlarimiz (Kreditorlik)' },
              ]}
            />
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-subtle)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 12px' }}>{isRu ? 'Контрагент' : 'Kontragent'}</th>
                  <th style={{ padding: '10px 12px' }}>{isRu ? 'Телефон' : 'Telefon'}</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>
                    {debtsSubTab === 'receivables'
                      ? isRu
                        ? 'Сумма долга нам'
                        : 'Bizga to‘lashi kerak'
                      : isRu
                      ? 'Сумма нашего долга'
                      : 'Biz to‘lashimiz kerak'}
                  </th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>
                    {isRu ? 'Действие' : 'Amal'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {counterparties.flatMap((cp) =>
                  (cp.balancesByCurrency || [])
                    .filter((balance: { customerDebt: number; supplierDebt: number }) =>
                      debtsSubTab === 'receivables' ? balance.customerDebt > 0 : balance.supplierDebt > 0,
                    )
                    .map((balance: { currency: string; customerDebt: number; supplierDebt: number }) => {
                      const settlementSide = debtsSubTab === 'receivables' ? 'CUSTOMER' : 'SUPPLIER';
                      const amount = settlementSide === 'CUSTOMER' ? balance.customerDebt : balance.supplierDebt;
                      return (
                        <tr key={`${cp.id}:${balance.currency}`} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                          <td style={{ padding: '12px' }}>
                            <span style={{ fontWeight: 600 }}>{cp.name}</span>
                            {cp.inn && <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>STIR: {cp.inn}</span>}
                          </td>
                          <td style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>{cp.phone || '—'}</td>
                          <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: debtsSubTab === 'receivables' ? 'var(--color-success-700)' : 'var(--color-error-700)' }}>
                            {formatCurrency(amount, locale, balance.currency)}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleOpenDrawer(
                                debtsSubTab === 'receivables' ? 'income' : 'expense',
                                cp.id,
                                settlementSide,
                                balance.currency,
                              )}
                            >
                              {debtsSubTab === 'receivables' ? <Plus size={14} /> : <Minus size={14} />}
                              <span>{debtsSubTab === 'receivables' ? isRu ? 'Приход' : 'Kirim' : isRu ? 'Оплатить' : 'To‘lov'}</span>
                            </Button>
                          </td>
                        </tr>
                      );
                    }),
                )}
                {!counterparties.some((cp) =>
                  (cp.balancesByCurrency || []).some((balance: { customerDebt: number; supplierDebt: number }) =>
                    debtsSubTab === 'receivables' ? balance.customerDebt > 0 : balance.supplierDebt > 0,
                  ),
                ) && (
                  <tr>
                    <td colSpan={4} style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
                      {debtsSubTab === 'receivables'
                        ? isRu ? 'Никто нам не должен.' : 'Hozircha bizga hech kim qarzdor emas.'
                        : isRu ? 'У нас нет долгов перед контрагентами.' : 'Hozircha kontragentlar oldida qarzimiz yo‘q.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ─── Unified Transaction Drawer (Income / Expense / Transfer) ── */}
      {drawerMode && (
        <FinanceTransactionDrawer
          mode={drawerMode}
          prefilledCounterpartyId={prefilledCounterpartyId}
          prefilledSettlement={prefilledSettlement}
          accounts={accounts}
          txTypes={txTypes}
          counterparties={counterparties}
          locale={locale}
          isRu={isRu}
          token={token}
          companyId={company?.id}
          onClose={() => {
            setDrawerMode(null);
            setPrefilledCounterpartyId(null);
            setPrefilledSettlement(null);
          }}
          onSuccess={() => {
            fetchData();
            toast.success(isRu ? 'Операция успешно проведена' : 'Operatsiya muvaffaqiyatli saqlandi');
          }}
        />
      )}

      {/* ─── Edit Transaction Modal ─────────────────────────────────── */}
      {editingTx && (
        <Modal icon={<Pencil size={20} />}
          isOpen={true}
          title={isRu ? 'Редактировать операцию' : 'Operatsiyani tahrirlash'}
          onClose={() => setEditingTx(null)}
          footer={
            <>
              <Button data-dialog-cancel variant="secondary" onClick={() => setEditingTx(null)} disabled={savingEdit}>
                {isRu ? 'Отмена' : 'Bekor qilish'}
              </Button>
              <Button variant="primary" onClick={handleSaveEdit} disabled={savingEdit}>
                {savingEdit ? (isRu ? 'Сохранение...' : 'Saqlanmoqda...') : isRu ? 'Сохранить' : 'Saqlash'}
              </Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Select
              label={isRu ? 'Категория' : 'Kategoriya'}
              options={txTypes
                .filter((t) => t.direction === editingTx.direction)
                .map((t) => ({
                  value: t.id,
                  label: getLocalizedName(t.name, locale),
                }))}
              value={editTypeId}
              onChange={(val) => setEditTypeId(val)}
            />
            <div>
              <label
                style={{
                  fontSize: 'var(--text-sm)',
                  fontWeight: 'var(--font-medium)',
                  display: 'block',
                  marginBottom: '6px',
                }}
              >
                {isRu ? 'Примечание' : 'Izoh'}
              </label>
              <Input
                placeholder={isRu ? 'Примечание...' : 'Izoh...'}
                value={editComment}
                onChange={(e) => setEditComment(e.target.value)}
              />
            </div>
          </div>
        </Modal>
      )}

      {/* ─── Storno (Cancel) Confirmation Modal ─────────────────────── */}
      {stornoTx && (
        <Modal icon={<Undo2 size={20} />} tone="warning"
          isOpen={true}
          title={isRu ? 'Сторнирование операции' : 'Operatsiyani stornolash'}
          onClose={() => setStornoTx(null)}
          footer={
            <>
              <Button data-dialog-cancel variant="secondary" onClick={() => setStornoTx(null)} disabled={stornoLoading}>
                {isRu ? 'Назад' : 'Orqaga'}
              </Button>
              <Button
                variant="danger"
                onClick={handleStorno}
                disabled={stornoLoading}
              >
                {stornoLoading
                  ? isRu
                    ? 'Аннулирование...'
                    : 'Bekor qilinmoqda...'
                  : isRu
                  ? 'Подтвердить Сторно'
                  : 'Bekor qilishni tasdiqlash'}
              </Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div
              style={{
                padding: '12px 14px',
                background: 'var(--color-error-50)',
                border: '1px solid var(--color-error-100)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-error-700)',
                fontSize: 'var(--text-sm)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <AlertCircle size={20} style={{ flexShrink: 0 }} />
              <div>
                <strong>{isRu ? 'Внимание!' : 'Diqqat!'}</strong>
                <p style={{ margin: '4px 0 0 0' }}>
                  {isRu
                    ? 'Сторнирование восстановит остатки кассы и задолженности контрагентов в исходное состояние.'
                    : 'Ushbu operatsiya bekor qilinadi (Storno). Kassa qoldig‘i va kontragent qarzlari avvalgi holatiga qaytariladi.'}
                </p>
              </div>
            </div>

            <div>
              <label
                style={{
                  fontSize: 'var(--text-sm)',
                  fontWeight: 'var(--font-medium)',
                  display: 'block',
                  marginBottom: '6px',
                }}
              >
                {isRu ? 'Причина отмены (обязательно)' : 'Bekor qilish sababi'}
              </label>
              <Input
                placeholder={isRu ? 'Укажите причину...' : 'Sababini yozing...'}
                value={stornoReason}
                onChange={(e) => setStornoReason(e.target.value)}
              />
            </div>
          </div>
        </Modal>
      )}

      {/* ─── Move Transaction to Trash Confirmation Modal ───────────── */}
      {deletingTx && (
        <Modal icon={<Trash2 size={20} />} tone="error"
          isOpen={true}
          title={isRu ? 'Переместить операцию в корзину?' : 'Operatsiyani savatga ko‘chirish?'}
          onClose={() => {
            if (!deleteLoading) setDeletingTx(null);
          }}
          footer={
            <>
              <Button data-dialog-cancel
                variant="secondary"
                onClick={() => setDeletingTx(null)}
                disabled={deleteLoading}
              >
                {isRu ? 'Отмена' : 'Bekor qilish'}
              </Button>
              <Button variant="danger" onClick={handleDelete} disabled={deleteLoading}>
                {deleteLoading
                  ? isRu
                    ? 'Перемещение...'
                    : 'Ko‘chirilmoqda...'
                  : isRu
                    ? 'Переместить в корзину'
                    : 'Savatga ko‘chirish'}
              </Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div
              style={{
                padding: '12px 14px',
                background: 'var(--color-error-50)',
                border: '1px solid var(--color-error-100)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-error-700)',
                fontSize: 'var(--text-sm)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <AlertCircle size={20} style={{ flexShrink: 0 }} />
              <p style={{ margin: 0 }}>
                {deletingTx.status === 'POSTED'
                  ? isRu
                    ? 'Финансовый эффект будет отменён, а операция перемещена в корзину.'
                    : 'Moliyaviy ta’siri qaytariladi va operatsiya savatga ko‘chiriladi.'
                  : isRu
                    ? 'Операция будет только перемещена в корзину; финансовые проводки не изменятся.'
                    : 'Operatsiya faqat savatga ko‘chiriladi; moliyaviy harakatlar o‘zgarmaydi.'}
              </p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Transactions Table Sub-Component ───────────────────────────
function TransactionsTable({
  transactions,
  locale,
  isRu,
  onEdit,
  onStorno,
  onDelete,
  onRestore,
  isDeletedView = false,
  restoringTxId,
}: {
  transactions: FinanceTransaction[];
  locale: string;
  isRu: boolean;
  onEdit: (tx: FinanceTransaction) => void;
  onStorno: (tx: FinanceTransaction) => void;
  onDelete: (tx: FinanceTransaction) => void;
  onRestore: (tx: FinanceTransaction) => void;
  isDeletedView?: boolean;
  restoringTxId: string | null;
}) {
  if (transactions.length === 0) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: 'var(--space-8)',
          color: 'var(--color-text-tertiary)',
          fontSize: 'var(--text-sm)',
        }}
      >
        {isDeletedView
          ? isRu
            ? 'Корзина пуста'
            : 'Savat bo‘sh'
          : isRu
            ? 'Операций не найдено'
            : 'Operatsiyalar mavjud emas'}
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--color-border-subtle)', textAlign: 'left' }}>
            <th style={{ padding: '10px 12px' }}>{isRu ? 'Дата' : 'Sana'}</th>
            <th style={{ padding: '10px 12px' }}>{isRu ? 'Тип' : 'Turi'}</th>
            <th style={{ padding: '10px 12px' }}>{isRu ? 'Счёт' : 'Kassa / Hisob'}</th>
            <th style={{ padding: '10px 12px' }}>{isRu ? 'Контрагент' : 'Kontragent'}</th>
            <th style={{ padding: '10px 12px', textAlign: 'right' }}>{isRu ? 'Сумма' : 'Summa'}</th>
            <th style={{ padding: '10px 12px' }}>{isRu ? 'Категория' : 'Kategoriya'}</th>
            <th style={{ padding: '10px 12px' }}>{isRu ? 'Статус' : 'Holat'}</th>
            <th style={{ padding: '10px 12px', textAlign: 'center' }}>{isRu ? 'Действия' : 'Amallar'}</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => {
            const isIncome = tx.direction === 'INCOME';
            const isExpense = tx.direction === 'EXPENSE';
            const isCancelled = tx.status === 'CANCELLED';
            const displayExchangeRate = tx.transferExchangeRate
              ?? (tx.currency === 'USD' ? tx.exchangeRate : null);

            return (
              <tr
                key={tx.id}
                style={{
                  borderBottom: '1px solid var(--color-border-subtle)',
                  opacity: isCancelled ? 0.6 : 1,
                  backgroundColor: isCancelled ? 'rgba(239, 68, 68, 0.03)' : 'transparent',
                }}
              >
                <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                  {formatDate(tx.transactionDate, locale)}
                </td>

                <td style={{ padding: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {isIncome && <ArrowUpRight size={16} color="var(--color-success-700)" />}
                    {isExpense && <ArrowDownLeft size={16} color="var(--color-error-700)" />}
                    {!isIncome && !isExpense && <ArrowLeftRight size={16} color="var(--color-info-700)" />}
                    <span style={{ fontWeight: 500 }}>
                      {isIncome
                        ? isRu
                          ? 'Приход'
                          : 'Kirim'
                        : isExpense
                        ? isRu
                          ? 'Расход'
                          : 'Chiqim'
                        : isRu
                        ? 'Перевод'
                        : 'O‘tkazma'}
                    </span>
                  </div>
                </td>

                <td style={{ padding: '12px' }}>
                  <div>
                    <span style={{ fontWeight: 500 }}>
                      {getLocalizedName(tx.account?.name, locale)}
                    </span>
                    {tx.transferToAccount && (
                      <span style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>
                        {' → '}
                        {getLocalizedName(tx.transferToAccount?.name, locale)}
                      </span>
                    )}
                  </div>
                </td>

                <td style={{ padding: '12px' }}>
                  {tx.counterparty?.name || (
                    <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
                  )}
                </td>

                <td
                  style={{
                    padding: '12px',
                    textAlign: 'right',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    color: isCancelled
                      ? 'var(--color-text-tertiary)'
                      : isIncome
                      ? 'var(--color-success-700)'
                      : isExpense
                      ? 'var(--color-error-700)'
                      : 'var(--color-text-primary)',
                    textDecoration: isCancelled ? 'line-through' : 'none',
                  }}
                >
                  {tx.direction === 'TRANSFER' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
                      <span style={{ color: 'var(--color-error-700)' }}>
                        −{formatCurrency(Number(tx.amount), locale, tx.currency)}
                      </span>
                      {tx.transferToAccount && tx.transferToAmount != null ? (
                        <span style={{ color: 'var(--color-success-700)' }}>
                          +{formatCurrency(Number(tx.transferToAmount), locale, tx.transferToAccount.currency)}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-error-700)', fontSize: 'var(--text-xs)' }}>
                          {isRu ? 'Нет суммы зачисления' : 'Kirim summasi aniqlanmagan'}
                        </span>
                      )}
                      {displayExchangeRate != null && (
                        <span style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>
                          1 USD = {Number(displayExchangeRate)} UZS
                        </span>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
                      <span>
                        {isIncome ? '+' : isExpense ? '-' : ''}
                        {formatCurrency(Number(tx.amount), locale, tx.currency)}
                      </span>
                      {tx.currency === 'USD' && (
                        <span style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>
                          1 USD = {Number(tx.exchangeRate)} UZS
                        </span>
                      )}
                    </div>
                  )}
                </td>

                <td style={{ padding: '12px' }}>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                    {tx.transactionType?.name
                      ? getLocalizedName(tx.transactionType.name, locale)
                      : tx.comment
                        ? tx.comment.slice(0, 30)
                        : '—'}
                  </span>
                </td>

                <td style={{ padding: '12px' }}>
                  {isCancelled ? (
                    <Badge variant="error">{isRu ? 'Аннулирован' : 'Bekor qilingan'}</Badge>
                  ) : (
                    <Badge variant="success">{isRu ? 'Проведено' : 'Tasdiqlangan'}</Badge>
                  )}
                </td>

                <td style={{ padding: '12px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
                    {isDeletedView ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onRestore(tx)}
                        disabled={restoringTxId === tx.id}
                        aria-label={
                          restoringTxId === tx.id
                            ? isRu
                              ? 'Восстановление...'
                              : 'Qaytarilmoqda...'
                            : isRu
                              ? 'Вернуть в журнал'
                              : 'Jurnalga qaytarish'
                        }
                      >
                        <RotateCcw size={14} />
                        {restoringTxId === tx.id
                          ? isRu
                            ? 'Восстановление...'
                            : 'Qaytarilmoqda...'
                          : isRu
                            ? 'Вернуть в журнал'
                            : 'Jurnalga qaytarish'}
                      </Button>
                    ) : (
                      <>
                        {tx.status === 'POSTED' && (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => onEdit(tx)}
                              aria-label={isRu ? 'Редактировать операцию' : 'Operatsiyani tahrirlash'}
                            >
                              <Edit2 size={14} />
                            </Button>
                            <Button
                              size="sm"
                              variant="danger-outline"
                              onClick={() => onStorno(tx)}
                              aria-label={isRu ? 'Аннулировать операцию' : 'Operatsiyani bekor qilish'}
                            >
                              <XCircle size={14} />
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="danger-outline"
                          onClick={() => onDelete(tx)}
                          aria-label={isRu ? 'Переместить в корзину' : 'Savatga ko‘chirish'}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Unified Drawer: Income, Expense & Transfer ─────────────────
function FinanceTransactionDrawer({
  mode,
  prefilledCounterpartyId,
  prefilledSettlement,
  accounts,
  txTypes,
  counterparties,
  locale,
  isRu,
  token,
  companyId,
  onClose,
  onSuccess,
}: {
  mode: 'income' | 'expense' | 'transfer' | 'exchange';
  prefilledCounterpartyId?: string | null;
  prefilledSettlement?: { side: 'CUSTOMER' | 'SUPPLIER'; currency: string } | null;
  accounts: CashAccount[];
  txTypes: TransactionType[];
  counterparties: Counterparty[];
  locale: string;
  isRu: boolean;
  token: string | null;
  companyId?: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isTransferOrExchange = mode === 'transfer' || mode === 'exchange';
  const preferredAccount = accounts.find((account) => account.currency === prefilledSettlement?.currency);
  const initialFromAccount = preferredAccount ?? accounts[0];
  // A transfer starts with a same-currency target; a currency exchange with the other currency.
  const wantsSameCurrencyTarget = mode !== 'exchange';
  const initialToAccount = accounts.find((account) =>
    account.id !== initialFromAccount?.id
    && (account.currency === initialFromAccount?.currency) === wantsSameCurrencyTarget,
  ) ?? accounts.find((account) => account.id !== initialFromAccount?.id);

  const [accountId, setAccountId] = useState(initialFromAccount?.id || '');
  const [toAccountId, setToAccountId] = useState(initialToAccount?.id || '');
  const [amount, setAmount] = useState('');
  // F8 / ADR 0022: the currency is the chosen cash account's (or the settlement's), never a tenant-level guess.
  const [currency, setCurrency] = useState(prefilledSettlement?.currency || initialFromAccount?.currency || '');
  const [counterpartyId, setCounterpartyId] = useState(prefilledCounterpartyId || '');
  const [settlementSide, setSettlementSide] = useState<'CUSTOMER' | 'SUPPLIER' | ''>(prefilledSettlement?.side || '');
  const [typeId, setTypeId] = useState('');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Multi-currency exchange fields
  const [exchangeRate, setExchangeRate] = useState('');
  const [targetAmount, setTargetAmount] = useState('');

  // Document linking fields
  const [sourceDocId, setSourceDocId] = useState<string>('');
  const [openDocuments, setOpenDocuments] = useState<OpenDocument[]>([]);

  const fromAccount = accounts.find((a) => a.id === accountId);
  const toAccount = accounts.find((a) => a.id === toAccountId);
  const validAccounts = accounts.filter(isCashAccountCurrencyValid);
  // The currency follows the chosen account. Filtering by the current currency
  // locked the selector to whichever currency the first account had, so e.g.
  // a UZS income could not be booked when the USD kassa came first. Only a
  // debt opened from the debts tab pins the currency of its settlement.
  const availableAccounts = isTransferOrExchange || !prefilledSettlement?.currency
    ? validAccounts
    : validAccounts.filter((account) => account.currency === prefilledSettlement.currency);
  const compatibleOpenDocuments = openDocuments.filter((document) => !fromAccount || document.currency === fromAccount.currency);
  const selectedSourceDocument = compatibleOpenDocuments.find((document) => document.id === sourceDocId);
  const settlementSideOptions: Array<'CUSTOMER' | 'SUPPLIER'> = ['CUSTOMER', 'SUPPLIER'];
  const isMultiCurrency = fromAccount && toAccount && fromAccount.currency !== toAccount.currency;
  const targetAmountAtRate = (
    sourceAmount: number,
    usdToUzsRate: number,
    sourceCurrency = fromAccount?.currency,
    destinationCurrency = toAccount?.currency,
  ) => {
    if (!sourceCurrency || !destinationCurrency || sourceCurrency === destinationCurrency
      || !Number.isFinite(usdToUzsRate) || usdToUzsRate <= 0) return '';
    const rate = Math.round(usdToUzsRate * 10000) / 10000;
    const targetAmount = sourceCurrency === 'USD'
      ? sourceAmount * rate
      : sourceAmount / rate;
    return String(Math.round(targetAmount * 100) / 100);
  };

  // Sync currency with chosen account
  useEffect(() => {
    if (fromAccount && !isTransferOrExchange) {
      setCurrency(fromAccount.currency);
    }
  }, [fromAccount, isTransferOrExchange]);

  // Fetch open documents when counterparty changes
  useEffect(() => {
    if (!counterpartyId || isTransferOrExchange || !token || !companyId) {
      setOpenDocuments([]);
      setSourceDocId('');
      return;
    }

    const fetchDocs = async () => {
      try {
        if (mode === 'income') {
          // Fetch open sales invoices
          const invoices = await apiFetch<OpenDocument[]>(
            `/sales/invoices?counterpartyId=${counterpartyId}&status=POSTED`,
            { token, tenantId: companyId, locale },
          );
          setOpenDocuments(
            Array.isArray(invoices)
              ? invoices.filter((i) => Number(i.paidAmount) < Number(i.totalAmount))
              : [],
          );
        } else if (mode === 'expense') {
          // Fetch open purchase receipts
          const receipts = await apiFetch<OpenDocument[]>(
            `/purchases/receipts?counterpartyId=${counterpartyId}&status=POSTED`,
            { token, tenantId: companyId, locale },
          );
          setOpenDocuments(
            Array.isArray(receipts)
              ? receipts.filter((r) => Number(r.paidAmount) < Number(r.totalAmount))
              : [],
          );
        }
      } catch (e) {
        console.error('Failed to load open documents:', e);
      }
    };

    fetchDocs();
  }, [counterpartyId, mode, isTransferOrExchange, token, companyId, locale]);

  // Submit Handler
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!amount || Number(amount) <= 0) {
      setError(isRu ? 'Введите корректную сумму' : 'Iltimos, to‘g‘ri summa kiriting');
      return;
    }

    if (counterpartyId && !sourceDocId && !settlementSide) {
      setError(
        isRu
          ? 'Выберите сторону взаиморасчёта: клиент или поставщик'
          : 'Hisob-kitob tomonini tanlang: mijoz yoki ta’minotchi',
      );
      return;
    }

    if (mode === 'expense' && fromAccount && Number(fromAccount.balance) < Number(amount)) {
      setError(
        isRu
          ? `В кассе недостаточно средств. Доступно: ${formatCurrency(Number(fromAccount.balance), locale, fromAccount.currency)}`
          : `Kassada mablag‘ yetarli emas. Mavjud: ${formatCurrency(Number(fromAccount.balance), locale, fromAccount.currency)}`,
      );
      return;
    }

    if (selectedSourceDocument) {
      const remaining = remainingOnDocument(selectedSourceDocument);
      if (Number(amount) > remaining + 0.000001) {
        const remainingText = formatCurrency(remaining, locale, selectedSourceDocument.currency);
        setError(
          isRu
            ? `Сумма больше остатка документа (${remainingText}). Уменьшите сумму или оставьте авто-закрытие по FIFO — излишек станет авансом.`
            : `Summa hujjat qoldig‘idan (${remainingText}) katta. Summani kamaytiring yoki FIFO bo‘yicha avtomatik yopishni tanlang — ortiqchasi avans bo‘ladi.`,
        );
        return;
      }
    }

    if (!accountId || !fromAccount || (isTransferOrExchange && !toAccountId)) {
      setError(isRu ? 'Выберите оба счёта для операции' : 'Amaliyot uchun hisoblarni tanlang');
      return;
    }

    if (isMultiCurrency) {
      const hasRate = Number.isFinite(Number(exchangeRate)) && Number(exchangeRate) > 0;
      const hasTargetAmount = Number.isFinite(Number(targetAmount)) && Number(targetAmount) > 0;
      if (!hasRate && !hasTargetAmount) {
        setError(isRu ? 'Укажите курс или сумму зачисления' : 'Kurs yoki qabul qilinadigan summani kiriting');
        return;
      }
    }
    if (
      !isTransferOrExchange &&
      fromAccount?.currency === 'USD' &&
      (!Number.isFinite(Number(exchangeRate)) || Number(exchangeRate) <= 0)
    ) {
      setError(isRu ? 'Укажите курс UZS за 1 USD' : '1 USD uchun UZS kursini kiriting');
      return;
    }
    if (
      isTransferOrExchange &&
      fromAccount?.currency === 'USD' &&
      !isMultiCurrency &&
      (!Number.isFinite(Number(exchangeRate)) || Number(exchangeRate) <= 0)
    ) {
      setError(isRu ? 'Укажите курс UZS за 1 USD' : '1 USD uchun UZS kursini kiriting');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const endpoint =
        mode === 'income'
          ? '/finance/income'
          : mode === 'expense'
          ? '/finance/expense'
          : '/finance/transfer';

      const body: Record<string, string | number | undefined> = {
        amount: Number(amount),
        currency: fromAccount.currency,
        comment: comment.trim() || undefined,
      };

      if (isTransferOrExchange) {
        body.fromAccountId = accountId;
        body.toAccountId = toAccountId;
        if (isMultiCurrency) {
          const rate = Number(exchangeRate);
          const receivingAmount = Number(targetAmount);
          if (Number.isFinite(rate) && rate > 0) body.exchangeRate = rate;
          if (Number.isFinite(receivingAmount) && receivingAmount > 0) body.targetAmount = receivingAmount;
        } else if (fromAccount?.currency === 'USD') {
          body.exchangeRate = Number(exchangeRate);
        }
      } else {
        body.accountId = accountId;
        if (fromAccount?.currency === 'USD') body.exchangeRate = Number(exchangeRate);
        body.counterpartyId = counterpartyId || undefined;
        body.transactionTypeId = typeId || undefined;
        if (sourceDocId) {
          body.sourceDocType = mode === 'income' ? 'SalesInvoice' : 'PurchaseReceipt';
          body.sourceDocId = sourceDocId;
        } else if (counterpartyId) {
          body.settlementSide = settlementSide;
        }
      }

      await apiFetch(endpoint, {
        method: 'POST',
        token: token || undefined,
        tenantId: companyId,
        locale,
        body: JSON.stringify(body),
      });

      onSuccess();
      onClose();
    } catch (e) {
      setError(errorMessage(e) || (isRu ? 'Произошла ошибка' : 'Xatolik yuz berdi'));
    } finally {
      setLoading(false);
    }
  };

  const titleMap = {
    income: isRu ? 'Добавить приход' : 'Kirim qo‘shish',
    expense: isRu ? 'Добавить расход' : 'Chiqim qo‘shish',
    transfer: isRu ? 'Перевод между счетами' : 'Kassalararo o‘tkazma',
    exchange: isRu ? 'Конвертация валюты (USD ↔ UZS)' : 'Valyuta konvertatsiyasi',
  };


  return (
    <Drawer
      isOpen={true}
      title={titleMap[mode]}
      description={
        isRu
          ? 'После проведения сразу меняются остаток кассы и долг контрагента'
          : 'Tasdiqlangach kassa qoldig‘i va kontragent qarzi darhol o‘zgaradi'
      }
      icon={<Wallet size={20} />}
      size="md"
      onClose={onClose}
      onSubmitShortcut={() => handleSubmit()}
      footer={
        <>
          <Button data-dialog-cancel variant="secondary" onClick={onClose} disabled={loading}>
            {isRu ? 'Отмена' : 'Bekor qilish'}
          </Button>
          <Button
            variant="primary"
            onClick={() => handleSubmit()}
            disabled={loading}
            title="Ctrl+Enter"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <CheckCircle2 size={16} aria-hidden />
            {loading ? (isRu ? 'Сохранение…' : 'Saqlanmoqda…') : isRu ? 'Провести' : 'Tasdiqlash'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {error && (
          <div
            style={{
              padding: '10px 14px',
              background: 'var(--color-error-50)',
              border: '1px solid var(--color-error-100)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-error-700)',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Kassa Selektori */}
        <Select
          label={
            isTransferOrExchange
              ? isRu
                ? 'Счёт списания (Откуда)'
                : 'Qayerdan (Chiquvchi kassa)'
              : isRu
              ? 'Касса / Счёт'
              : 'Kassa / Hisob'
          }
          options={availableAccounts.map((a) => ({
            value: a.id,
            label: `${getLocalizedName(a.name, locale)} — ${formatCurrency(Number(a.balance), locale, a.currency)}`,
          }))}
           value={accountId}
           onChange={(val) => {
             const selectedSource = validAccounts.find((account) => account.id === val);
             setAccountId(val);
             setToAccountId((currentId) => {
               const currentTarget = validAccounts.find((account) => account.id === currentId);
               if (currentTarget && currentTarget.id !== val && currentTarget.currency === selectedSource?.currency) return currentId;
               return (validAccounts.find((account) => account.id !== val && account.currency === selectedSource?.currency)
                 ?? validAccounts.find((account) => account.id !== val))?.id ?? '';
             });
             setSourceDocId('');
             setTargetAmount('');
             setExchangeRate('');
           }}
        />

        {/* Qayerga (Transfer uchun) */}
        {isTransferOrExchange && (
          <Select
            label={isRu ? 'Счёт пополнения (Куда)' : 'Qayerga (Tushuvchi kassa)'}
            options={validAccounts
              .filter((a) => a.id !== accountId)
              .map((a) => ({
                value: a.id,
                label: `${getLocalizedName(a.name, locale)} — ${formatCurrency(Number(a.balance), locale, a.currency)}`,
              }))}
            value={toAccountId}
            onChange={(val) => {
              const selectedTarget = validAccounts.find((account) => account.id === val);
              setToAccountId(val);
              setTargetAmount(targetAmountAtRate(
                Number(amount) || 0,
                Number(exchangeRate),
                fromAccount?.currency,
                selectedTarget?.currency,
              ));
            }}
          />
        )}

        {/* Summa */}
        <div>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>
            {isRu ? 'Сумма' : 'Summa'} ({fromAccount?.currency || currency}) *
          </label>
          <MoneyInput
            aria-label={isRu ? 'Сумма' : 'Summa'}
            value={amount}
            onValueChange={(value) => {
              setAmount(value);
              if (isMultiCurrency) {
                setTargetAmount(targetAmountAtRate(Number(value) || 0, Number(exchangeRate)));
              }
            }}
          />
        </div>

        {!isTransferOrExchange && fromAccount?.currency === 'USD' && (
          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>
              {isRu ? 'Курс (1 USD = UZS) *' : 'Kurs (1 USD = UZS) *'}
            </label>
            <MoneyInput
              aria-label={isRu ? 'Курс' : 'Kurs'}
              value={exchangeRate}
              onValueChange={setExchangeRate}
              decimals={4}
              placeholder="12,800"
              disabled={Boolean(sourceDocId && selectedSourceDocument?.exchangeRate)}
            />
          </div>
        )}

        {isTransferOrExchange && !isMultiCurrency && fromAccount?.currency === 'USD' && (
          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>
              {isRu ? 'Учётный курс (1 USD = UZS) *' : 'Hisob kursi (1 USD = UZS) *'}
            </label>
            <MoneyInput
              aria-label={isRu ? 'Учётный курс' : 'Hisob kursi'}
              value={exchangeRate}
              onValueChange={setExchangeRate}
              decimals={4}
              placeholder="12,800"
            />
          </div>
        )}

        {/* Multi-currency Exchange Box (transfers only: income/expense do not send it) */}
        {isTransferOrExchange && isMultiCurrency && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(124, 58, 237, 0.08)',
              border: '1px solid rgba(124, 58, 237, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-primary-700)' }}>
              {isRu ? 'Конвертация валюты' : 'Valyuta konvertatsiyasi'}
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>
                  {isRu ? 'Курс (1 USD = UZS)' : 'Kurs (1 USD = UZS)'}
                </label>
                <MoneyInput
                  aria-label={isRu ? 'Курс' : 'Kurs'}
                  value={exchangeRate}
                  decimals={4}
                  placeholder="12,800"
                  onValueChange={(value) => {
                    setExchangeRate(value);
                    setTargetAmount(targetAmountAtRate(parseFloat(amount) || 0, Number(value)));
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>
                  {isRu ? 'Итоговая сумма' : 'Qabul qilinadigan summa'} ({toAccount?.currency})
                </label>
                <MoneyInput
                  aria-label={isRu ? 'Итоговая сумма' : 'Qabul qilinadigan summa'}
                  value={targetAmount}
                  onValueChange={(value) => {
                    setTargetAmount(value);
                    const sourceAmount = Number(amount);
                    const receivingAmount = Number(value);
                    if (sourceAmount > 0 && receivingAmount > 0 && fromAccount) {
                      const impliedRate = fromAccount.currency === 'USD'
                        ? receivingAmount / sourceAmount
                        : sourceAmount / receivingAmount;
                      setExchangeRate(String(Math.round(impliedRate * 10000) / 10000));
                    }
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Kontragent Selektori (Kirim va Chiqim uchun) */}
        {!isTransferOrExchange && (
          <>
            <Select
              label={isRu ? 'Контрагент' : 'Kontragent'}
              options={[
                { value: '', label: isRu ? 'Не выбран (прямой доход/расход)' : 'Tanlanmagan' },
                ...counterparties.map((cp) => ({
                  value: cp.id,
                  label: cp.name,
                })),
              ]}
              value={counterpartyId}
              onChange={(val) => {
                setCounterpartyId(val);
                setSettlementSide('');
                setSourceDocId('');
                setExchangeRate('');
              }}
            />

            {counterpartyId && !sourceDocId && (
              <Select
                label={isRu ? 'Сторона взаиморасчёта *' : 'Hisob-kitob tomoni *'}
                options={settlementSideOptions.map((side) => ({
                  value: side,
                  label: side === 'CUSTOMER'
                    ? isRu ? 'Клиентская задолженность' : 'Mijoz qarzdorligi'
                    : isRu ? 'Задолженность поставщику' : 'Ta’minotchi qarzdorligi',
                }))}
                value={settlementSide}
                onChange={(val) => setSettlementSide(val as 'CUSTOMER' | 'SUPPLIER' | '')}
              />
            )}

            {/* Bog'langan Hujjat */}
            {counterpartyId && (
              <Select
                label={
                  mode === 'income'
                    ? isRu
                      ? 'Привязать к счет-фактуре'
                      : 'Sotuv fakturasiga bog‘lash'
                    : isRu
                    ? 'Привязать к документу закупки'
                    : 'Xarid hujjatiga bog‘lash'
                }
                options={[
                  {
                    value: '',
                    label: isRu
                      ? '— Авто-закрытие по FIFO (или Аванс) —'
                      : '— FIFO bo‘yicha avtomatik yopish (yoki Avans) —',
                  },
                  ...compatibleOpenDocuments.map((doc) => {
                    const remaining = remainingOnDocument(doc);
                    return {
                      value: doc.id,
                      label: `${doc.docNumber || doc.invoiceNumber} — ${formatCurrency(remaining, locale, doc.currency)} qoldi`,
                    };
                  }),
                ]}
                value={sourceDocId}
                onChange={(val) => {
                  setSourceDocId(val);
                  const selectedDocument = compatibleOpenDocuments.find((document) => document.id === val);
                  setExchangeRate(selectedDocument?.exchangeRate == null ? '' : String(selectedDocument.exchangeRate));
                  if (val) {
                    setSettlementSide('');
                    // The amount is what is still owed on the picked document (editable for a partial payment).
                    setAmount(amountForPickedDocument(selectedDocument));
                  }
                }}
              />
            )}

            {/* Toifa / Kategoriya */}
            <Select
              label={isRu ? 'Категория платежа' : 'To‘lov toifasi / sababi'}
              options={[
                { value: '', label: isRu ? 'Выберите категорию' : 'Toifani tanlang' },
                ...txTypes
                  .filter((t) => (mode === 'income' ? t.direction === 'INCOME' : t.direction === 'EXPENSE'))
                  .map((t) => ({
                    value: t.id,
                    label: getLocalizedName(t.name, locale),
                  })),
              ]}
              value={typeId}
              onChange={(val) => setTypeId(val)}
            />
          </>
        )}

        {/* Izoh */}
        <div>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>
            {isRu ? 'Примечание (необязательно)' : 'Izoh (ixtiyoriy)'}
          </label>
          <Input
            placeholder={isRu ? 'Примечание...' : 'Izoh...'}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>
      </div>
    </Drawer>
  );
}
