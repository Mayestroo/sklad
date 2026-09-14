'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatDate, CURRENCY_OPTIONS, formatCurrency } from '@/lib/utils';
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
  TransactionType,
} from '@shared/types';
import {
  Plus,
  Minus,
  ArrowLeftRight,
  Wallet,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Edit2,
  XCircle,
  TrendingUp,
  TrendingDown,
  Building,
  DollarSign,
  Users,
  FileText,
  Filter,
  RefreshCw,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';

function getPeriodDates(preset: string): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  switch (preset) {
    case 'today':
      return { dateFrom: todayStr, dateTo: todayStr };
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const s = y.toISOString().slice(0, 10);
      return { dateFrom: s, dateTo: s };
    }
    case 'this_week': {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      return { dateFrom: start.toISOString().slice(0, 10), dateTo: todayStr };
    }
    case 'this_month':
      return {
        dateFrom: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
        dateTo: todayStr,
      };
    case 'this_year':
      return { dateFrom: `${now.getFullYear()}-01-01`, dateTo: todayStr };
    default:
      return { dateFrom: '', dateTo: '' };
  }
}

// ─── Main Finance Component ─────────────────────────────────────
export default function FinancePage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token, company } = useAuth();

  // Active Tab: dashboard | journal | income | expense | transfers | debts
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'journal' | 'income' | 'expense' | 'transfers' | 'debts'
  >('dashboard');

  // Debts sub-tab: receivables | payables
  const [debtsSubTab, setDebtsSubTab] = useState<'receivables' | 'payables'>('receivables');

  // Data States
  const [dashboardMetrics, setDashboardMetrics] = useState<FinanceDashboardMetrics | null>(null);
  const [journal, setJournal] = useState<TransactionJournal | null>(null);
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [txTypes, setTxTypes] = useState<TransactionType[]>([]);
  const [counterparties, setCounterparties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // Filters
  const [periodPreset, setPeriodPreset] = useState<string>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [counterpartyFilter, setCounterpartyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modals & Drawers
  const [drawerMode, setDrawerMode] = useState<
    'income' | 'expense' | 'transfer' | 'exchange' | null
  >(null);
  const [prefilledCounterpartyId, setPrefilledCounterpartyId] = useState<string | null>(null);

  // Edit / Storno Modal
  const [editingTx, setEditingTx] = useState<FinanceTransaction | null>(null);
  const [editComment, setEditComment] = useState('');
  const [editTypeId, setEditTypeId] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [stornoTx, setStornoTx] = useState<FinanceTransaction | null>(null);
  const [stornoReason, setStornoReason] = useState('');
  const [stornoLoading, setStornoLoading] = useState(false);

  const handlePeriodChange = (preset: string) => {
    setPeriodPreset(preset);
    if (preset === 'custom') return;
    const { dateFrom: f, dateTo: t } = getPeriodDates(preset);
    setDateFrom(f);
    setDateTo(t);
    setPage(1);
  };

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
        apiFetch<TransactionJournal>(`/finance/transactions?${params}`, opts),
        apiFetch<CashAccount[]>('/finance/accounts', opts),
        apiFetch<TransactionType[]>('/finance/transaction-types', opts),
        apiFetch<any[]>('/sales/counterparties', opts),
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
  const handleOpenDrawer = (mode: 'income' | 'expense' | 'transfer' | 'exchange', cpId?: string) => {
    setDrawerMode(mode);
    setPrefilledCounterpartyId(cpId || null);
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
    } catch (err: any) {
      toast.error(err?.message || (isRu ? 'Ошибка при сохранении' : 'Saqlashda xatolik'));
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
    } catch (err: any) {
      toast.error(err?.message || (isRu ? 'Ошибка при аннулировании' : 'Bekor qilishda xatolik'));
    } finally {
      setStornoLoading(false);
    }
  };

  const totalPages = journal ? Math.ceil(journal.total / journal.limit) : 1;

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 'var(--radius-lg)',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
            }}
          >
            <Wallet size={22} />
          </div>
          <div>
            <h1
              style={{
                fontSize: 'var(--text-2xl)',
                fontWeight: 'var(--font-bold)',
                color: 'var(--color-text-primary)',
                margin: 0,
              }}
            >
              {isRu ? 'Финансы и Касса' : 'Moliya va Kassalar'}
            </h1>
            <p
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-tertiary)',
                margin: '2px 0 0 0',
              }}
            >
              {isRu
                ? 'Управление денежными потоками, взаиморасчетами и кассами по стандарту 1С'
                : '1C mantiqi asosida pul oqimi, kassa qoldiqlari va qarzdorlik boshqaruvi'}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Button
            variant="primary"
            onClick={() => handleOpenDrawer('income')}
            style={{
              backgroundColor: '#10b981',
              borderColor: '#10b981',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Plus size={16} />
            <span>{isRu ? 'Приход (Кирим)' : 'Kirim qo‘shish'}</span>
          </Button>

          <Button
            variant="primary"
            onClick={() => handleOpenDrawer('expense')}
            style={{
              backgroundColor: '#ef4444',
              borderColor: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Minus size={16} />
            <span>{isRu ? 'Расход (Чиким)' : 'Chiqim qo‘shish'}</span>
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

      {/* ─── Dashboard Liquidity Banner (Always Visible) ─────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 'var(--space-4)',
        }}
      >
        {/* Dollar Kassa */}
        <Card
          style={{
            padding: 'var(--space-4)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            borderLeft: '4px solid #10b981',
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#10b981',
              flexShrink: 0,
            }}
          >
            <DollarSign size={20} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              {isRu ? 'Долларовая касса (USD)' : 'Dollar kassa (USD)'}
            </div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: '#10b981' }}>
              {formatCurrency(dashboardMetrics?.balances.dollarKassa || 0, locale, 'USD')}
            </div>
          </div>
        </Card>

        {/* Naqd Kassa */}
        <Card
          style={{
            padding: 'var(--space-4)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            borderLeft: '4px solid #3b82f6',
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#3b82f6',
              flexShrink: 0,
            }}
          >
            <Wallet size={20} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              {isRu ? 'Наличная касса (UZS)' : 'Naqd kassa (UZS)'}
            </div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {formatCurrency(dashboardMetrics?.balances.naqdKassa || 0, locale, 'UZS')}
            </div>
          </div>
        </Card>

        {/* Hisobraqam (Bank) */}
        <Card
          style={{
            padding: 'var(--space-4)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            borderLeft: '4px solid #6366f1',
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(99, 102, 241, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6366f1',
              flexShrink: 0,
            }}
          >
            <Building size={20} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              {isRu ? 'Расчетный счет (Банк)' : 'Hisobraqam (Bank UZS)'}
            </div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {formatCurrency(dashboardMetrics?.balances.hisobRaqam || 0, locale, 'UZS')}
            </div>
          </div>
        </Card>

        {/* Jami Sof Pul Oqimi (Bu oy) */}
        <Card
          style={{
            padding: 'var(--space-4)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            borderLeft: `4px solid ${(dashboardMetrics?.month.netCashFlow || 0) >= 0 ? '#10b981' : '#ef4444'}`,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--radius-md)',
              backgroundColor:
                (dashboardMetrics?.month.netCashFlow || 0) >= 0
                  ? 'rgba(16, 185, 129, 0.1)'
                  : 'rgba(239, 68, 68, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: (dashboardMetrics?.month.netCashFlow || 0) >= 0 ? '#10b981' : '#ef4444',
              flexShrink: 0,
            }}
          >
            {(dashboardMetrics?.month.netCashFlow || 0) >= 0 ? (
              <TrendingUp size={20} />
            ) : (
              <TrendingDown size={20} />
            )}
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              {isRu ? 'Чистый денежный поток (Месяц)' : 'Sof pul oqimi (Shu oy)'}
            </div>
            <div
              style={{
                fontSize: 'var(--text-lg)',
                fontWeight: 700,
                color: (dashboardMetrics?.month.netCashFlow || 0) >= 0 ? '#10b981' : '#ef4444',
              }}
            >
              {formatCurrency(dashboardMetrics?.month.netCashFlow || 0, locale, 'UZS')}
            </div>
          </div>
        </Card>
      </div>

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
          { id: 'dashboard', label: isRu ? 'Дашборд' : 'Dashboard' },
          { id: 'journal', label: isRu ? 'Журнал операций' : 'Operatsiyalar jurnali' },
          { id: 'income', label: isRu ? 'Приходы' : 'Kirimlar' },
          { id: 'expense', label: isRu ? 'Расходы' : 'Chiqimlar' },
          { id: 'transfers', label: isRu ? 'Переводы' : 'O‘tkazmalar' },
          { id: 'debts', label: isRu ? 'Взаиморасчеты (Долги)' : 'Qarzdorlik nazorati' },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as any);
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
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
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

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {/* Today */}
                <div
                  style={{
                    padding: 'var(--space-3)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-bg-subtle)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                      {isRu ? 'Сегодня' : 'Bugun'}:
                    </span>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                      <span style={{ color: '#10b981' }}>
                        +{formatCurrency(dashboardMetrics?.today.income || 0, locale, 'UZS')}
                      </span>
                      <span style={{ margin: '0 6px', color: 'var(--color-text-tertiary)' }}>/</span>
                      <span style={{ color: '#ef4444' }}>
                        -{formatCurrency(dashboardMetrics?.today.expense || 0, locale, 'UZS')}
                      </span>
                    </div>
                  </div>
                  <Badge variant={(dashboardMetrics?.today.netCashFlow || 0) >= 0 ? 'success' : 'error'}>
                    {formatCurrency(dashboardMetrics?.today.netCashFlow || 0, locale, 'UZS')}
                  </Badge>
                </div>

                {/* This Month */}
                <div
                  style={{
                    padding: 'var(--space-3)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-bg-subtle)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                      {isRu ? 'В этом месяце' : 'Shu oyda'}:
                    </span>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                      <span style={{ color: '#10b981' }}>
                        +{formatCurrency(dashboardMetrics?.month.income || 0, locale, 'UZS')}
                      </span>
                      <span style={{ margin: '0 6px', color: 'var(--color-text-tertiary)' }}>/</span>
                      <span style={{ color: '#ef4444' }}>
                        -{formatCurrency(dashboardMetrics?.month.expense || 0, locale, 'UZS')}
                      </span>
                    </div>
                  </div>
                  <Badge variant={(dashboardMetrics?.month.netCashFlow || 0) >= 0 ? 'success' : 'error'}>
                    {formatCurrency(dashboardMetrics?.month.netCashFlow || 0, locale, 'UZS')}
                  </Badge>
                </div>
              </div>
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                {/* Kutilayotgan tushumlar */}
                <div
                  style={{
                    padding: 'var(--space-3)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.2)',
                  }}
                >
                  <div style={{ fontSize: 'var(--text-xs)', color: '#059669', fontWeight: 500 }}>
                    {isRu ? 'Ожидаемые поступления (Дебиторка)' : 'Kutilayotgan tushumlar (Debitorlik)'}
                  </div>
                  <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: '#059669', marginTop: '4px' }}>
                    {formatCurrency(dashboardMetrics?.debts.receivables || 0, locale, 'UZS')}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>
                    {isRu ? 'Клиенты должны нам' : 'Mijozlar bizga to‘lashi kerak'}
                  </div>
                </div>

                {/* To'lanishi kerak bo'lgan qarzlar */}
                <div
                  style={{
                    padding: 'var(--space-3)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                  }}
                >
                  <div style={{ fontSize: 'var(--text-xs)', color: '#dc2626', fontWeight: 500 }}>
                    {isRu ? 'К оплате поставщикам (Кредиторка)' : 'Bizning qarzlarimiz (Kreditorlik)'}
                  </div>
                  <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: '#dc2626', marginTop: '4px' }}>
                    {formatCurrency(dashboardMetrics?.debts.payables || 0, locale, 'UZS')}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>
                    {isRu ? 'Мы должны поставщикам' : 'Ta’minotchilarga to‘lashimiz kerak'}
                  </div>
                </div>
              </div>
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
            />
          </Card>
        </div>
      )}

      {/* ─── Tab Content 2: Transactions Journal ────────────────────── */}
      {(activeTab === 'journal' ||
        activeTab === 'income' ||
        activeTab === 'expense' ||
        activeTab === 'transfers') && (
        <Card style={{ padding: 'var(--space-5)' }}>
          {/* Filters Bar */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--space-3)',
              alignItems: 'center',
              marginBottom: 'var(--space-4)',
              paddingBottom: 'var(--space-3)',
              borderBottom: '1px solid var(--color-border-subtle)',
            }}
          >
            {/* Period selector */}
            <div style={{ minWidth: 160 }}>
              <Select
                options={[
                  { value: '', label: isRu ? 'Все периоды' : 'Barcha davrlar' },
                  { value: 'today', label: isRu ? 'Сегодня' : 'Bugun' },
                  { value: 'yesterday', label: isRu ? 'Вчера' : 'Kecha' },
                  { value: 'this_week', label: isRu ? 'На этой неделе' : 'Shu hafta' },
                  { value: 'this_month', label: isRu ? 'В этом месяце' : 'Shu oy' },
                  { value: 'this_year', label: isRu ? 'В этом году' : 'Shu yil' },
                ]}
                value={periodPreset}
                onChange={handlePeriodChange}
              />
            </div>

            {/* Account filter */}
            <div style={{ minWidth: 180 }}>
              <Select
                options={[
                  { value: '', label: isRu ? 'Все кассы' : 'Barcha kassalar' },
                  ...accounts.map((a) => ({
                    value: a.id,
                    label: `${(a.name as any)[locale] || a.name} (${a.currency})`,
                  })),
                ]}
                value={accountFilter}
                onChange={(val) => {
                  setAccountFilter(val);
                  setPage(1);
                }}
              />
            </div>

            {/* Counterparty filter */}
            <div style={{ minWidth: 200 }}>
              <Select
                options={[
                  { value: '', label: isRu ? 'Все контрагенты' : 'Barcha kontragentlar' },
                  ...counterparties.map((cp) => ({
                    value: cp.id,
                    label: cp.name,
                  })),
                ]}
                value={counterpartyFilter}
                onChange={(val) => {
                  setCounterpartyFilter(val);
                  setPage(1);
                }}
              />
            </div>

            <Button variant="secondary" size="sm" onClick={() => fetchData()}>
              <RefreshCw size={14} />
            </Button>
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
            <button
              onClick={() => setDebtsSubTab('receivables')}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-md)',
                backgroundColor:
                  debtsSubTab === 'receivables' ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                color: debtsSubTab === 'receivables' ? '#059669' : 'var(--color-text-secondary)',
                fontWeight: debtsSubTab === 'receivables' ? 600 : 500,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {isRu ? 'Дебиторка (Нам должны)' : 'Mijozlarimiz qarzi (Debitorlik)'}
            </button>
            <button
              onClick={() => setDebtsSubTab('payables')}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-md)',
                backgroundColor:
                  debtsSubTab === 'payables' ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                color: debtsSubTab === 'payables' ? '#dc2626' : 'var(--color-text-secondary)',
                fontWeight: debtsSubTab === 'payables' ? 600 : 500,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {isRu ? 'Кредиторка (Мы должны)' : 'Bizning qarzlarimiz (Kreditorlik)'}
            </button>
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
                {counterparties
                  .filter((cp) => {
                    const cDebt = Number(cp.customerDebt || 0);
                    const sDebt = Number(cp.supplierDebt || 0);
                    const raw = Number(cp.debtBalance || 0);
                    if (debtsSubTab === 'receivables') {
                      return cDebt > 0 || (cDebt === 0 && sDebt === 0 && raw > 0 && cp.type !== 'SUPPLIER');
                    } else {
                      return sDebt > 0 || (cDebt === 0 && sDebt === 0 && raw > 0 && cp.type === 'SUPPLIER');
                    }
                  })
                  .map((cp) => {
                    const cDebt = Number(cp.customerDebt || 0);
                    const sDebt = Number(cp.supplierDebt || 0);
                    const raw = Number(cp.debtBalance || 0);
                    const displayDebt =
                      debtsSubTab === 'receivables'
                        ? cDebt > 0
                          ? cDebt
                          : raw
                        : sDebt > 0
                        ? sDebt
                        : raw;

                    return (
                      <tr
                        key={cp.id}
                        style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
                      >
                        <td style={{ padding: '12px' }}>
                          <span style={{ fontWeight: 600 }}>{cp.name}</span>
                          {cp.inn && (
                            <span
                              style={{
                                display: 'block',
                                fontSize: 'var(--text-xs)',
                                color: 'var(--color-text-tertiary)',
                              }}
                            >
                              STIR: {cp.inn}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>
                          {cp.phone || '—'}
                        </td>
                        <td
                          style={{
                            padding: '12px',
                            textAlign: 'right',
                            fontWeight: 700,
                            color: debtsSubTab === 'receivables' ? '#059669' : '#dc2626',
                          }}
                        >
                          {formatCurrency(displayDebt, locale, 'UZS')}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          {debtsSubTab === 'receivables' ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleOpenDrawer('income', cp.id)}
                            >
                              <Plus size={14} />
                              <span>{isRu ? 'Приход' : 'Kirim'}</span>
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleOpenDrawer('expense', cp.id)}
                            >
                              <Minus size={14} />
                              <span>{isRu ? 'Оплатить' : 'To‘lov'}</span>
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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
          }}
          onSuccess={() => {
            fetchData();
            toast.success(isRu ? 'Операция успешно проведена' : 'Operatsiya muvaffaqiyatli saqlandi');
          }}
        />
      )}

      {/* ─── Edit Transaction Modal ─────────────────────────────────── */}
      {editingTx && (
        <Modal
          isOpen={true}
          title={isRu ? 'Редактировать операцию' : 'Operatsiyani tahrirlash'}
          onClose={() => setEditingTx(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Select
              label={isRu ? 'Категория' : 'Kategoriya'}
              options={txTypes
                .filter((t) => t.direction === editingTx.direction)
                .map((t) => ({
                  value: t.id,
                  label: (t.name as any)[locale] || t.name,
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
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              <Button variant="secondary" onClick={() => setEditingTx(null)} disabled={savingEdit}>
                {isRu ? 'Отмена' : 'Bekor qilish'}
              </Button>
              <Button variant="primary" onClick={handleSaveEdit} disabled={savingEdit}>
                {savingEdit ? (isRu ? 'Сохранение...' : 'Saqlanmoqda...') : isRu ? 'Сохранить' : 'Saqlash'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── Storno (Cancel) Confirmation Modal ─────────────────────── */}
      {stornoTx && (
        <Modal
          isOpen={true}
          title={isRu ? 'Аннулирование операции (Сторно)' : 'Operatsiyani bekor qilish (Storno)'}
          onClose={() => setStornoTx(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div
              style={{
                padding: '12px 14px',
                background: 'var(--color-error-50)',
                border: '1px solid var(--color-error-100)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-error-600)',
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

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              <Button variant="secondary" onClick={() => setStornoTx(null)} disabled={stornoLoading}>
                {isRu ? 'Назад' : 'Orqaga'}
              </Button>
              <Button
                variant="primary"
                onClick={handleStorno}
                disabled={stornoLoading}
                style={{ backgroundColor: '#ef4444', borderColor: '#ef4444' }}
              >
                {stornoLoading
                  ? isRu
                    ? 'Аннулирование...'
                    : 'Bekor qilinmoqda...'
                  : isRu
                  ? 'Подтвердить Сторно'
                  : 'Bekor qilishni tasdiqlash'}
              </Button>
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
}: {
  transactions: FinanceTransaction[];
  locale: string;
  isRu: boolean;
  onEdit: (tx: FinanceTransaction) => void;
  onStorno: (tx: FinanceTransaction) => void;
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
        {isRu ? 'Операций не найдено' : 'Operatsiyalar mavjud emas'}
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
                    {isIncome && <ArrowUpRight size={16} color="#10b981" />}
                    {isExpense && <ArrowDownLeft size={16} color="#ef4444" />}
                    {!isIncome && !isExpense && <ArrowLeftRight size={16} color="#3b82f6" />}
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
                      {(tx.account?.name as any)?.[locale] || tx.account?.name || '—'}
                    </span>
                    {tx.transferToAccount && (
                      <span style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>
                        {' → '}
                        {(tx.transferToAccount?.name as any)?.[locale] ||
                          tx.transferToAccount?.name}
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
                      ? '#10b981'
                      : isExpense
                      ? '#ef4444'
                      : 'var(--color-text-primary)',
                    textDecoration: isCancelled ? 'line-through' : 'none',
                  }}
                >
                  {isIncome ? '+' : isExpense ? '-' : ''}
                  {formatCurrency(Number(tx.amount), locale, tx.currency)}
                </td>

                <td style={{ padding: '12px' }}>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                    {(tx.transactionType?.name as any)?.[locale] ||
                      tx.transactionType?.name ||
                      (tx.comment ? tx.comment.slice(0, 30) : '—')}
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
                  {!isCancelled && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
                      <Button size="sm" variant="secondary" onClick={() => onEdit(tx)}>
                        <Edit2 size={14} />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onStorno(tx)}
                        style={{ color: '#ef4444' }}
                      >
                        <XCircle size={14} />
                      </Button>
                    </div>
                  )}
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
  accounts: CashAccount[];
  txTypes: TransactionType[];
  counterparties: any[];
  locale: string;
  isRu: boolean;
  token: string | null;
  companyId?: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isTransferOrExchange = mode === 'transfer' || mode === 'exchange';

  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [toAccountId, setToAccountId] = useState(accounts[1]?.id || '');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('UZS');
  const [counterpartyId, setCounterpartyId] = useState(prefilledCounterpartyId || '');
  const [typeId, setTypeId] = useState('');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Multi-currency exchange fields
  const [exchangeRate, setExchangeRate] = useState('12800');
  const [targetAmount, setTargetAmount] = useState('');

  // Document linking fields
  const [sourceDocType, setSourceDocType] = useState<string>('');
  const [sourceDocId, setSourceDocId] = useState<string>('');
  const [openDocuments, setOpenDocuments] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  const fromAccount = accounts.find((a) => a.id === accountId);
  const toAccount = accounts.find((a) => a.id === toAccountId);
  const isMultiCurrency = fromAccount && toAccount && fromAccount.currency !== toAccount.currency;

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
      setLoadingDocs(true);
      try {
        if (mode === 'income') {
          // Fetch open sales invoices
          const invoices = await apiFetch<any[]>(
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
          const receipts = await apiFetch<any[]>(
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
      } finally {
        setLoadingDocs(false);
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

    if (mode === 'expense' && fromAccount && Number(fromAccount.balance) < Number(amount)) {
      setError(
        isRu
          ? `В кассе недостаточно средств. Доступно: ${fromAccount.balance} ${fromAccount.currency}`
          : `Kassada mablag‘ yetarli emas. Mavjud: ${fromAccount.balance} ${fromAccount.currency}`,
      );
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

      const body: any = {
        amount: Number(amount),
        currency: fromAccount ? fromAccount.currency : currency,
        comment: comment.trim() || undefined,
      };

      if (isTransferOrExchange) {
        body.fromAccountId = accountId;
        body.toAccountId = toAccountId;
        if (isMultiCurrency) {
          body.exchangeRate = parseFloat(exchangeRate) || 1;
          body.targetAmount = parseFloat(targetAmount) || Number(amount);
        }
      } else {
        body.accountId = accountId;
        body.counterpartyId = counterpartyId || undefined;
        body.transactionTypeId = typeId || undefined;
        if (sourceDocId) {
          body.sourceDocType = mode === 'income' ? 'SalesInvoice' : 'PurchaseReceipt';
          body.sourceDocId = sourceDocId;
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
    } catch (e: any) {
      setError(e.message || (isRu ? 'Произошла ошибка' : 'Xatolik yuz berdi'));
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

  const colorMap = {
    income: '#10b981',
    expense: '#ef4444',
    transfer: '#3b82f6',
    exchange: '#7c3aed',
  };

  return (
    <Drawer
      isOpen={true}
      title={titleMap[mode]}
      description={
        isRu
          ? 'Оформление кассовой операции и взаиморасчетов по стандартам 1С'
          : '1C mantiqida kassa amaliyoti va hisob-kitoblarni rasmiylashtirish'
      }
      icon={<Wallet size={20} />}
      size="md"
      onClose={onClose}
      onSubmitShortcut={() => handleSubmit()}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {isRu ? 'Отмена (Esc)' : 'Bekor qilish (Esc)'}
          </Button>
          <Button
            variant="primary"
            onClick={() => handleSubmit()}
            disabled={loading}
            style={{
              backgroundColor: colorMap[mode],
              borderColor: colorMap[mode],
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <CheckCircle2 size={16} />
            {loading ? (isRu ? 'Сохранение...' : 'Saqlanmoqda...') : isRu ? 'Провести' : 'Tasdiqlash'}
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
              color: 'var(--color-error-600)',
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
          options={accounts.map((a) => ({
            value: a.id,
            label: `${(a.name as any)[locale] || a.name} — ${formatCurrency(Number(a.balance), locale, a.currency)}`,
          }))}
          value={accountId}
          onChange={(val) => setAccountId(val)}
        />

        {/* Qayerga (Transfer uchun) */}
        {isTransferOrExchange && (
          <Select
            label={isRu ? 'Счёт пополнения (Куда)' : 'Qayerga (Tushuvchi kassa)'}
            options={accounts
              .filter((a) => a.id !== accountId)
              .map((a) => ({
                value: a.id,
                label: `${(a.name as any)[locale] || a.name} — ${formatCurrency(Number(a.balance), locale, a.currency)}`,
              }))}
            value={toAccountId}
            onChange={(val) => setToAccountId(val)}
          />
        )}

        {/* Summa */}
        <div>
          <label
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--font-medium)',
              display: 'block',
              marginBottom: '6px',
            }}
          >
            {isRu ? 'Сумма' : 'Summa'} ({fromAccount?.currency || currency}) *
          </label>
          <Input
            type="number"
            placeholder="0"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              if (isMultiCurrency) {
                const rate = parseFloat(exchangeRate) || 1;
                const amt = parseFloat(e.target.value) || 0;
                setTargetAmount(String(Math.round(amt * rate)));
              }
            }}
          />
        </div>

        {/* Multi-currency Exchange Box */}
        {isMultiCurrency && (
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
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: '#7c3aed' }}>
              {isRu ? 'Конвертация валюты' : 'Valyuta konvertatsiyasi'}
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ fontSize: 'var(--text-xs)', display: 'block', marginBottom: '4px' }}>
                  {isRu ? 'Курс обмена' : 'Valyuta kursi'}
                </label>
                <Input
                  type="number"
                  value={exchangeRate}
                  onChange={(e) => {
                    setExchangeRate(e.target.value);
                    const rate = parseFloat(e.target.value) || 1;
                    const amt = parseFloat(amount) || 0;
                    setTargetAmount(String(Math.round(amt * rate)));
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 'var(--text-xs)', display: 'block', marginBottom: '4px' }}>
                  {isRu ? 'Итоговая сумма' : 'Qabul qilinadigan summa'} ({toAccount?.currency})
                </label>
                <Input
                  type="number"
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Kontragent Selektori (Kirim va Chiqim uchun) */}
        {!isTransferOrExchange && (
          <>
            <Select
              label={
                mode === 'income'
                  ? isRu
                    ? 'Клиент (Контрагент)'
                    : 'Mijoz (Kontragent)'
                  : isRu
                  ? 'Поставщик (Контрагент)'
                  : 'Ta’minotchi (Kontragent)'
              }
              options={[
                { value: '', label: isRu ? '— Не выбран (Прямой доход/расход) —' : '— Tanlanmagan —' },
                ...counterparties
                  .filter((cp) =>
                    mode === 'income'
                      ? cp.type === 'CUSTOMER' || cp.type === 'BOTH'
                      : cp.type === 'SUPPLIER' || cp.type === 'BOTH',
                  )
                  .map((cp) => ({
                    value: cp.id,
                    label: cp.name,
                  })),
              ]}
              value={counterpartyId}
              onChange={(val) => setCounterpartyId(val)}
            />

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
                  ...openDocuments.map((doc) => {
                    const remaining = Number(doc.totalAmount) - Number(doc.paidAmount);
                    return {
                      value: doc.id,
                      label: `${doc.docNumber || doc.invoiceNumber} — ${formatCurrency(remaining, locale, doc.currency)} qoldi`,
                    };
                  }),
                ]}
                value={sourceDocId}
                onChange={(val) => setSourceDocId(val)}
              />
            )}

            {/* Toifa / Kategoriya */}
            <Select
              label={isRu ? 'Категория платежа' : 'To‘lov toifasi / sababi'}
              options={[
                { value: '', label: isRu ? '— Выберите категорию —' : '— Toifani tanlang —' },
                ...txTypes
                  .filter((t) => (mode === 'income' ? t.direction === 'INCOME' : t.direction === 'EXPENSE'))
                  .map((t) => ({
                    value: t.id,
                    label: (t.name as any)[locale] || t.name,
                  })),
              ]}
              value={typeId}
              onChange={(val) => setTypeId(val)}
            />
          </>
        )}

        {/* Izoh */}
        <div>
          <label
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--font-medium)',
              display: 'block',
              marginBottom: '6px',
            }}
          >
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
