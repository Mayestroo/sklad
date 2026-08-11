'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import type { CashAccount, FinanceTransaction, TransactionJournal, FinanceSummary, TransactionType } from '@shared/types';
import {
  Plus,
  Minus,
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  Wallet,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Calendar,
} from 'lucide-react';

function getPeriodDates(preset: string): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  switch (preset) {
    case 'today':
      return { dateFrom: todayStr, dateTo: todayStr };
    case 'yesterday': {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      const s = y.toISOString().slice(0, 10);
      return { dateFrom: s, dateTo: s };
    }
    case 'this_week': {
      const start = new Date(now); start.setDate(now.getDate() - now.getDay());
      return { dateFrom: start.toISOString().slice(0, 10), dateTo: todayStr };
    }
    case 'last_week': {
      const end = new Date(now); end.setDate(now.getDate() - now.getDay() - 1);
      const start = new Date(end); start.setDate(end.getDate() - 6);
      return { dateFrom: start.toISOString().slice(0, 10), dateTo: end.toISOString().slice(0, 10) };
    }
    case 'this_month':
      return { dateFrom: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, dateTo: todayStr };
    case 'last_month': {
      const d = new Date(now.getFullYear(), now.getMonth(), 0);
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { dateFrom: start.toISOString().slice(0, 10), dateTo: d.toISOString().slice(0, 10) };
    }
    case 'this_year':
      return { dateFrom: `${now.getFullYear()}-01-01`, dateTo: todayStr };
    default:
      return { dateFrom: '', dateTo: '' };
  }
}

function formatAmount(amount: number, currency: string): string {
  const formatted = new Intl.NumberFormat('uz-UZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
  return `${formatted} ${currency}`;
}

// ─── Transaction Row ────────────────────────────────────────────
function TransactionRow({ tx, locale }: { tx: FinanceTransaction; locale: string }) {
  const isIncome = tx.direction === 'INCOME';
  const isExpense = tx.direction === 'EXPENSE';
  const isTransfer = tx.direction === 'TRANSFER';

  return (
    <tr style={{ borderBottom: '1px solid var(--color-border-light)', transition: 'background var(--transition-fast)' }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      <td style={{ padding: '12px 16px', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
        {formatDate(tx.transactionDate, locale)}
      </td>
      <td style={{ padding: '12px 16px', fontSize: 'var(--text-sm)' }}>
        <div style={{ fontWeight: 'var(--font-medium)' }}>
          {(tx.account?.name as any)?.[locale] ?? tx.account?.name ?? '—'}
        </div>
        {isTransfer && tx.transferToAccount && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
            → {(tx.transferToAccount.name as any)?.[locale] ?? tx.transferToAccount.name}
          </div>
        )}
      </td>
      <td style={{ padding: '12px 16px', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
        {tx.counterparty?.name ?? '—'}
      </td>
      <td style={{ padding: '12px 16px' }}>
        {isIncome && <Badge variant="success">Kirim</Badge>}
        {isExpense && <Badge variant="error">Chiqim</Badge>}
        {isTransfer && <Badge variant="info">O'tkazma</Badge>}
      </td>
      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 'var(--font-semibold)', color: 'var(--color-success-600)', fontVariantNumeric: 'tabular-nums' }}>
        {isIncome ? formatAmount(Number(tx.amount), tx.currency) : '—'}
      </td>
      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 'var(--font-semibold)', color: 'var(--color-error-600)', fontVariantNumeric: 'tabular-nums' }}>
        {isExpense ? formatAmount(Number(tx.amount), tx.currency) : '—'}
      </td>
      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: 'var(--text-xs)',
          fontWeight: 'var(--font-semibold)',
          color: 'var(--color-text-secondary)',
          background: 'var(--color-bg-tertiary)',
          borderRadius: 'var(--radius-sm)',
          padding: '2px 8px',
        }}>
          {tx.currency}
        </span>
      </td>
    </tr>
  );
}

// ─── Add Transaction Modal ──────────────────────────────────────
interface AddTxModalProps {
  mode: 'income' | 'expense' | 'transfer';
  accounts: CashAccount[];
  txTypes: TransactionType[];
  locale: string;
  token: string;
  tenantId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function AddTransactionModal({ mode, accounts, txTypes, locale, token, tenantId, onClose, onSuccess }: AddTxModalProps) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [toAccountId, setToAccountId] = useState(accounts[1]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('UZS');
  const [typeId, setTypeId] = useState('');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const filteredTypes = txTypes.filter((t) => t.direction === mode.toUpperCase());

  const handleSubmit = async () => {
    if (!amount || !accountId) { setError('Miqdor va hisob kiritilishi kerak'); return; }
    setLoading(true);
    setError('');
    try {
      const endpoint = mode === 'income' ? '/finance/income' : mode === 'expense' ? '/finance/expense' : '/finance/transfer';
      const body: any = { amount: Number(amount), currency, comment };
      if (mode === 'transfer') {
        body.fromAccountId = accountId;
        body.toAccountId = toAccountId;
      } else {
        body.accountId = accountId;
        body.transactionTypeId = typeId || undefined;
      }
      await apiFetch(endpoint, { method: 'POST', token, tenantId, body: JSON.stringify(body) });
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  const titleMap = { income: "Kirim qo'shish", expense: "Chiqim qo'shish", transfer: "Hisoblar orasida o'tkazma" };
  const colorMap = { income: 'var(--color-success-600)', expense: 'var(--color-error-600)', transfer: 'var(--color-info-600)' };

  return (
    <Modal isOpen={true} title={titleMap[mode]} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {error && (
          <div style={{ padding: '10px 14px', background: 'var(--color-error-50)', border: '1px solid var(--color-error-100)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', color: 'var(--color-error-600)' }}>
            {error}
          </div>
        )}

        <Select
          label={mode === 'transfer' ? 'Qayerdan' : 'Hisob'}
          options={accounts.map((a) => ({
            value: a.id,
            label: `${(a.name as any)[locale] || a.name} — ${a.currency}`,
            description: `Balans: ${formatAmount(Number(a.balance), a.currency)}`,
          }))}
          value={accountId}
          onChange={(val) => setAccountId(val)}
        />

        {mode === 'transfer' && (
          <Select
            label="Qayerga"
            options={accounts
              .filter((a) => a.id !== accountId)
              .map((a) => ({
                value: a.id,
                label: `${(a.name as any)[locale] || a.name} — ${a.currency}`,
                description: `Balans: ${formatAmount(Number(a.balance), a.currency)}`,
              }))}
            value={toAccountId}
            onChange={(val) => setToAccountId(val)}
          />
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          <div>
            <label style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', display: 'block', marginBottom: '6px' }}>Miqdor</label>
            <Input type="number" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <Select
            label="Valyuta"
            options={[
              { value: 'UZS', label: 'UZS (So\'m)' },
              { value: 'USD', label: 'USD (Dollar)' },
            ]}
            value={currency}
            onChange={(val) => setCurrency(val)}
          />
        </div>

        {mode !== 'transfer' && filteredTypes.length > 0 && (
          <Select
            label="Operatsiya turi"
            placeholder="— Tanlang —"
            options={filteredTypes.map((t) => ({
              value: t.id,
              label: (t.name as any)[locale] || t.name,
            }))}
            value={typeId}
            onChange={(val) => setTypeId(val)}
          />
        )}

        <div>
          <label style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', display: 'block', marginBottom: '6px' }}>Izoh (ixtiyoriy)</label>
          <Input placeholder="Izoh..." value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
          <Button variant="outline" onClick={onClose} disabled={loading}>Bekor qilish</Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={loading}
            style={{ backgroundColor: colorMap[mode], borderColor: colorMap[mode] }}
          >
            {loading ? 'Saqlanmoqda...' : titleMap[mode]}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Main Finance Page ──────────────────────────────────────────
export default function FinancePage() {
  const locale = useLocale() as 'uz' | 'ru';
  const { token, company } = useAuth();

  const [journal, setJournal] = useState<TransactionJournal | null>(null);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [txTypes, setTxTypes] = useState<TransactionType[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // Filters
  const [periodPreset, setPeriodPreset] = useState<string>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [directionFilter, setDirectionFilter] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('');

  const handlePeriodChange = (preset: string) => {
    setPeriodPreset(preset);
    if (preset === 'custom') return;
    const { dateFrom: f, dateTo: t } = getPeriodDates(preset);
    setDateFrom(f);
    setDateTo(t);
    setPage(1);
  };

  // Modal state
  const [modal, setModal] = useState<'income' | 'expense' | 'transfer' | null>(null);

  const fetchData = useCallback(async () => {
    if (!token || !company) return;
    setLoading(true);
    const opts = { token, tenantId: company.id, locale };

    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    if (directionFilter) params.set('direction', directionFilter);
    if (currencyFilter) params.set('currency', currencyFilter);

    try {
      const [acc, summ, jour, types] = await Promise.all([
        apiFetch<CashAccount[]>('/finance/accounts', opts),
        apiFetch<FinanceSummary>(`/finance/summary?${params}`, opts),
        apiFetch<TransactionJournal>(`/finance/transactions?${params}`, opts),
        apiFetch<TransactionType[]>('/finance/transaction-types', opts),
      ]);
      setAccounts(acc);
      setSummary(summ);
      setJournal(jour);
      setTxTypes(types);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [token, company, locale, page, dateFrom, dateTo, directionFilter, currencyFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalPages = journal ? Math.ceil(journal.total / journal.limit) : 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: '4px' }}>
            <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Wallet size={20} color="white" />
            </div>
            <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
              Moliya — Pul oqimi jurnali
            </h1>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button variant="ghost" size="sm" onClick={fetchData}>
            <RefreshCw size={16} />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setModal('transfer')}>
            <ArrowLeftRight size={16} /> O'tkazma
          </Button>
          <Button variant="outline" size="sm" onClick={() => setModal('expense')}
            style={{ borderColor: 'var(--color-error-500)', color: 'var(--color-error-600)' }}>
            <Minus size={16} /> Chiqim
          </Button>
          <Button variant="primary" size="sm" onClick={() => setModal('income')}
            style={{ backgroundColor: 'var(--color-success-600)', borderColor: 'var(--color-success-600)' }}>
            <Plus size={16} /> Kirim
          </Button>
        </div>
      </div>

      {/* Account Balance Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
        {accounts.map((acc) => {
          const typeColors: Record<string, string> = {
            UZS_CASH: 'var(--color-success-600)',
            USD_CASH: 'var(--color-info-600)',
            BANK: 'var(--color-primary-600)',
          };
          const typeBg: Record<string, string> = {
            UZS_CASH: 'var(--color-success-50)',
            USD_CASH: 'var(--color-info-50)',
            BANK: 'var(--color-primary-50)',
          };
          const color = typeColors[acc.accountType] ?? 'var(--color-text-primary)';
          const bg = typeBg[acc.accountType] ?? 'var(--color-bg-tertiary)';

          return (
            <Card key={acc.id}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', backgroundColor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Wallet size={18} style={{ color }} />
                </div>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {acc.currency}
                </span>
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginBottom: '4px' }}>
                {(acc.name as any)[locale]}
              </div>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color, fontVariantNumeric: 'tabular-nums' }}>
                {formatAmount(Number(acc.balance), acc.currency)}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Summary KPIs */}
      {summary && summary.summaryByCurrency.map((s) => (
        <div key={s.currency} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-4)' }}>
          {[
            { label: 'Jami kirim', value: s.totalIncome, color: 'var(--color-success-600)', icon: TrendingUp },
            { label: 'Jami chiqim', value: s.totalExpense, color: 'var(--color-error-600)', icon: TrendingDown },
            { label: "Sof pul oqimi", value: s.netCashFlow, color: s.netCashFlow >= 0 ? 'var(--color-success-600)' : 'var(--color-error-600)', icon: ArrowLeftRight },
          ].map((kpi) => {
            const Icon = kpi.icon;
            return (
              <Card key={kpi.label}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <Icon size={20} style={{ color: kpi.color }} />
                  <div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{kpi.label} ({s.currency})</div>
                    <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', color: kpi.color, fontVariantNumeric: 'tabular-nums' }}>
                      {formatAmount(kpi.value, s.currency)}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ))}

      {/* Filters */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <Filter size={16} style={{ color: 'var(--color-text-tertiary)' }} />

          {/* Period Preset Dropdown */}
          <Select
            options={[
              { value: '', label: 'Barcha vaqt' },
              { value: 'today', label: 'Bugun' },
              { value: 'yesterday', label: 'Kecha' },
              { value: 'this_week', label: 'Bu hafta' },
              { value: 'last_week', label: 'O\'tgan hafta' },
              { value: 'this_month', label: 'Bu oy' },
              { value: 'last_month', label: 'O\'tgan oy' },
              { value: 'this_year', label: 'Bu yil' },
              { value: 'custom', label: 'Boshqa sana...' },
            ]}
            value={periodPreset}
            onChange={handlePeriodChange}
            style={{ width: 160 }}
          />

          {/* Custom Styled DatePicker Controls */}
          <DatePicker
            placeholder="Boshlanish sanasi"
            value={dateFrom}
            onChange={(val) => {
              setDateFrom(val);
              setPeriodPreset('custom');
              setPage(1);
            }}
            style={{ width: 175 }}
          />
          <DatePicker
            placeholder="Tugash sanasi"
            value={dateTo}
            onChange={(val) => {
              setDateTo(val);
              setPeriodPreset('custom');
              setPage(1);
            }}
            style={{ width: 175 }}
          />

          <Select
            options={[
              { value: '', label: 'Barcha turlar' },
              { value: 'INCOME', label: 'Kirim' },
              { value: 'EXPENSE', label: 'Chiqim' },
              { value: 'TRANSFER', label: "O'tkazma" },
            ]}
            value={directionFilter}
            onChange={(val) => { setDirectionFilter(val); setPage(1); }}
            style={{ width: 160 }}
          />
          <Select
            options={[
              { value: '', label: 'Barcha valyutalar' },
              { value: 'UZS', label: 'UZS' },
              { value: 'USD', label: 'USD' },
            ]}
            value={currencyFilter}
            onChange={(val) => { setCurrencyFilter(val); setPage(1); }}
            style={{ width: 160 }}
          />
          {(dateFrom || dateTo || directionFilter || currencyFilter || periodPreset) && (
            <Button variant="ghost" size="sm" onClick={() => { setPeriodPreset(''); setDateFrom(''); setDateTo(''); setDirectionFilter(''); setCurrencyFilter(''); setPage(1); }}>
              Filterni tozalash
            </Button>
          )}
        </div>
      </Card>

      {/* Journal Table */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
          <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)' }}>
            Operatsiyalar jurnali
            {journal && <span style={{ marginLeft: 'var(--space-2)', fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)', fontWeight: 'var(--font-regular)' }}>({journal.total} ta)</span>}
          </h2>
        </div>

        {loading ? (
          <div style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            <div className="animate-pulse">Yuklanmoqda...</div>
          </div>
        ) : !journal || journal.data.length === 0 ? (
          <div style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            <Wallet size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
            <div style={{ fontWeight: 'var(--font-medium)' }}>Operatsiyalar topilmadi</div>
            <div style={{ fontSize: 'var(--text-sm)', marginTop: '4px' }}>Kirim yoki chiqim qo'shing</div>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-border)', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 'var(--font-semibold)' }}>Sana</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 'var(--font-semibold)' }}>Hisob</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 'var(--font-semibold)' }}>Kontragent</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 'var(--font-semibold)' }}>Tur</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 'var(--font-semibold)', color: 'var(--color-success-600)' }}>Kirim</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 'var(--font-semibold)', color: 'var(--color-error-600)' }}>Chiqim</th>
                    <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 'var(--font-semibold)' }}>Valyuta</th>
                  </tr>
                </thead>
                <tbody>
                  {journal.data.map((tx) => (
                    <TransactionRow key={tx.id} tx={tx} locale={locale} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-4)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--color-border-light)' }}>
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft size={16} />
                </Button>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                  {page} / {totalPages}
                </span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight size={16} />
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Modals */}
      {modal && token && company && (
        <AddTransactionModal
          mode={modal}
          accounts={accounts}
          txTypes={txTypes}
          locale={locale}
          token={token}
          tenantId={company.id}
          onClose={() => setModal(null)}
          onSuccess={fetchData}
        />
      )}
    </div>
  );
}
