'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatDate, CURRENCY_OPTIONS } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import type { CashAccount, FinanceTransaction, TransactionJournal, FinanceSummary, TransactionType } from '@shared/types';
import {
  Plus,
  Minus,
  ArrowLeftRight,
  ArrowRight,
  Repeat,
  TrendingUp,
  TrendingDown,
  Wallet,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Calendar,
  AlertCircle,
  CheckCircle2,
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
  const isConversion =
    isTransfer &&
    (tx.comment?.includes('Konvertatsiya') ||
      (tx.account && tx.transferToAccount && tx.account.currency !== tx.transferToAccount.currency));

  return (
    <tr
      style={{ borderBottom: '1px solid var(--color-border-light)', transition: 'background var(--transition-fast)' }}
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
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>
            → {(tx.transferToAccount.name as any)?.[locale] ?? tx.transferToAccount.name}
          </div>
        )}
        {tx.comment && (
          <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '2px', fontStyle: 'italic' }}>
            {tx.comment}
          </div>
        )}
      </td>
      <td style={{ padding: '12px 16px', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
        {tx.counterparty?.name ?? '—'}
      </td>
      <td style={{ padding: '12px 16px' }}>
        {isIncome && <Badge variant="success">{locale === 'ru' ? 'Приход' : 'Kirim'}</Badge>}
        {isExpense && <Badge variant="error">{locale === 'ru' ? 'Расход' : 'Chiqim'}</Badge>}
        {isTransfer && isConversion && (
          <Badge variant="warning">{locale === 'ru' ? 'Конвертация' : 'Konvertatsiya'}</Badge>
        )}
        {isTransfer && !isConversion && (
          <Badge variant="info">{locale === 'ru' ? 'Перевод' : "O'tkazma"}</Badge>
        )}
      </td>
      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 'var(--font-semibold)', color: 'var(--color-success-600)', fontVariantNumeric: 'tabular-nums' }}>
        {isIncome ? formatAmount(Number(tx.amount), tx.currency) : '—'}
      </td>
      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 'var(--font-semibold)', color: 'var(--color-error-600)', fontVariantNumeric: 'tabular-nums' }}>
        {isExpense ? formatAmount(Number(tx.amount), tx.currency) : '—'}
      </td>
      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: 'var(--text-xs)',
            fontWeight: 'var(--font-semibold)',
            color: 'var(--color-text-secondary)',
            background: 'var(--color-bg-tertiary)',
            borderRadius: 'var(--radius-sm)',
            padding: '2px 8px',
          }}
        >
          {tx.currency}
        </span>
      </td>
    </tr>
  );
}

// ─── Add Transaction Modal ──────────────────────────────────────
interface AddTxModalProps {
  mode: 'income' | 'expense' | 'transfer' | 'exchange';
  accounts: CashAccount[];
  txTypes: TransactionType[];
  locale: string;
  token: string;
  tenantId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function AddTransactionModal({ mode, accounts, txTypes, locale, token, tenantId, onClose, onSuccess }: AddTxModalProps) {
  const isRu = locale === 'ru';
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [toAccountId, setToAccountId] = useState(
    accounts.find((a) => a.id !== accounts[0]?.id)?.id ?? accounts[0]?.id ?? ''
  );
  const [amount, setAmount] = useState('');
  const [exchangeRate, setExchangeRate] = useState('12800');
  const [targetAmount, setTargetAmount] = useState('');
  const [currency, setCurrency] = useState('UZS');
  const [typeId, setTypeId] = useState('');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fromAccount = accounts.find((a) => a.id === accountId);
  const toAccount = accounts.find((a) => a.id === toAccountId);

  const isTransferOrExchange = mode === 'transfer' || mode === 'exchange';
  const isMultiCurrency =
    isTransferOrExchange &&
    fromAccount &&
    toAccount &&
    fromAccount.currency !== toAccount.currency;

  // Account selection fallback when accounts load
  useEffect(() => {
    if (accounts.length > 0) {
      if (!accountId || !accounts.some((a) => a.id === accountId)) {
        setAccountId(accounts[0].id);
      }
      if (!toAccountId || !accounts.some((a) => a.id === toAccountId)) {
        const other = accounts.find((a) => a.id !== accounts[0]?.id) || accounts[0];
        setToAccountId(other.id);
      }
    }
  }, [accounts, accountId, toAccountId]);

  // Default exchange mode to USD -> UZS if available
  useEffect(() => {
    if (mode === 'exchange' && accounts.length > 1) {
      const usdAcc = accounts.find((a) => a.currency === 'USD');
      const uzsAcc = accounts.find((a) => a.currency === 'UZS');
      if (usdAcc && uzsAcc) {
        setAccountId(usdAcc.id);
        setToAccountId(uzsAcc.id);
      }
    }
  }, [mode, accounts]);

  // Sync currency for income/expense
  useEffect(() => {
    if (fromAccount && (mode === 'income' || mode === 'expense')) {
      setCurrency(fromAccount.currency);
    }
  }, [accountId, fromAccount, mode]);

  // Default exchange rate based on currency pair
  useEffect(() => {
    if (isMultiCurrency && fromAccount && toAccount) {
      if (fromAccount.currency === 'USD' && toAccount.currency === 'UZS') {
        setExchangeRate('12800');
      } else if (fromAccount.currency === 'UZS' && toAccount.currency === 'USD') {
        setExchangeRate('12800');
      }
    }
  }, [isMultiCurrency, fromAccount?.currency, toAccount?.currency]);

  // Recalculate targetAmount when amount or exchangeRate changes
  useEffect(() => {
    if (isMultiCurrency && amount && exchangeRate && fromAccount && toAccount) {
      const amt = parseFloat(amount) || 0;
      const rate = parseFloat(exchangeRate) || 0;
      if (amt > 0 && rate > 0) {
        if (fromAccount.currency === 'USD' && toAccount.currency === 'UZS') {
          setTargetAmount(String(Math.round(amt * rate)));
        } else if (fromAccount.currency === 'UZS' && toAccount.currency === 'USD') {
          setTargetAmount((amt / rate).toFixed(2));
        } else {
          setTargetAmount((amt * rate).toFixed(2));
        }
      }
    }
  }, [amount, exchangeRate, isMultiCurrency, fromAccount, toAccount]);

  const filteredTypes = txTypes.filter((t) => t.direction === mode.toUpperCase());

  const handleSubmit = async () => {
    if (!amount || !accountId) {
      setError(isRu ? 'Укажите сумму и счёт' : 'Miqdor va hisob kiritilishi kerak');
      return;
    }

    if (isTransferOrExchange && (!accountId || !toAccountId || accountId === toAccountId)) {
      setError(isRu ? 'Выберите разные счета' : 'Har xil hisoblarni tanlang');
      return;
    }

    if (mode !== 'income' && fromAccount && Number(fromAccount.balance) < Number(amount)) {
      setError(
        isRu
          ? `Недостаточно средств на счёте. Доступно: ${fromAccount.balance} ${fromAccount.currency}`
          : `Hisobda mablag‘ yetarli emas. Mavjud: ${fromAccount.balance} ${fromAccount.currency}`
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
          const parsedRate = parseFloat(exchangeRate) || 1;
          const parsedTarget = parseFloat(targetAmount) || Number(amount);
          body.exchangeRate = parsedRate;
          body.targetAmount = parsedTarget;
        }
      } else {
        body.accountId = accountId;
        body.transactionTypeId = typeId || undefined;
      }

      await apiFetch(endpoint, { method: 'POST', token, tenantId, body: JSON.stringify(body) });
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e.message ?? (isRu ? 'Произошла ошибка' : 'Xatolik yuz berdi'));
    } finally {
      setLoading(false);
    }
  };

  const titleMap = {
    income: isRu ? 'Добавить приход' : "Kirim qo'shish",
    expense: isRu ? 'Добавить расход' : "Chiqim qo'shish",
    transfer: isRu ? 'Перевод между счетами' : "Hisoblar orasida o'tkazma",
    exchange: isRu ? 'Конвертация валюты (USD ↔ UZS)' : "Valyuta konvertatsiyasi (USD ↔ UZS)",
  };

  const colorMap = {
    income: 'var(--color-success-600)',
    expense: 'var(--color-error-600)',
    transfer: 'var(--color-info-600)',
    exchange: '#7c3aed',
  };

  return (
    <Drawer
      isOpen={true}
      title={titleMap[mode]}
      description={
        isRu
          ? 'Оформление кассовой операции, перемещения средств или конвертации'
          : 'Kassa amaliyoti, pul o‘tkazmasi yoki konvertatsiyani rasmiylashtirish'
      }
      icon={<Wallet size={20} />}
      size="md"
      onClose={onClose}
      onSubmitShortcut={handleSubmit}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {isRu ? 'Отмена (Esc)' : 'Bekor qilish (Esc)'}
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
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
            {loading ? (isRu ? 'Сохранение...' : 'Saqlanmoqda...') : `${titleMap[mode]} (Ctrl+Enter)`}
          </Button>
        </>
      }
    >
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

        <Select
          label={isTransferOrExchange ? (isRu ? 'Счёт списания (Откуда)' : 'Qayerdan (Chiquvchi kassa)') : (isRu ? 'Счёт' : 'Hisob')}
          options={accounts.map((a) => ({
            value: a.id,
            label: `${(a.name as any)[locale] || a.name} — ${a.currency}`,
            description: `Balans: ${formatAmount(Number(a.balance), a.currency)}`,
          }))}
          value={accountId}
          onChange={(val) => setAccountId(val)}
        />

        {isTransferOrExchange && (
          <Select
            label={isRu ? 'Счёт пополнения (Куда)' : 'Qayerga (Tushuvchi kassa)'}
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

        {/* Multi-currency Exchange Rate Box */}
        {isMultiCurrency && fromAccount && toAccount && (
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-xs)', fontWeight: 600, color: '#7c3aed' }}>
              <Repeat size={14} />
              {isRu
                ? `Конвертация: ${fromAccount.currency} ➔ ${toAccount.currency}`
                : `Konvertatsiya: ${fromAccount.currency} ➔ ${toAccount.currency}`}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>
                  {isRu ? `Сумма списания (${fromAccount.currency})` : `Chiquvchi miqdor (${fromAccount.currency})`}
                </label>
                <Input type="number" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>
                  {isRu ? 'Курс конвертации' : 'Konvertatsiya kursi'}
                </label>
                <Input type="number" placeholder="12800" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} />
              </div>
            </div>

            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>
                {isRu ? `Итого зачислится на ${toAccount.currency}` : `${toAccount.currency} hisobiga tushadigan summa`}
              </label>
              <Input
                type="number"
                placeholder="0"
                value={targetAmount}
                onChange={(e) => {
                  setTargetAmount(e.target.value);
                  const tgt = parseFloat(e.target.value) || 0;
                  const src = parseFloat(amount) || 0;
                  if (tgt > 0 && src > 0) {
                    setExchangeRate(String(tgt / src));
                  }
                }}
                style={{ fontWeight: 700, color: '#7c3aed' }}
              />
            </div>

            {amount && targetAmount && (
              <div
                style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  padding: '8px 12px',
                  background: 'var(--color-bg-secondary)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <span>{amount} {fromAccount.currency}</span>
                <span style={{ color: 'var(--color-text-tertiary)', fontSize: '11px' }}>(Kurs: {exchangeRate})</span>
                <ArrowRight size={14} style={{ color: 'var(--color-primary-600)' }} />
                <span style={{ fontWeight: 700, color: 'var(--color-primary-600)' }}>{targetAmount} {toAccount.currency}</span>
              </div>
            )}
          </div>
        )}

        {!isMultiCurrency && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <div>
              <label style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', display: 'block', marginBottom: '6px' }}>Miqdor</label>
              <Input type="number" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            {!isTransferOrExchange ? (
              <Select
                label="Valyuta"
                options={CURRENCY_OPTIONS}
                value={currency}
                onChange={(val) => setCurrency(val)}
              />
            ) : (
              <div>
                <label style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', display: 'block', marginBottom: '6px' }}>Valyuta</label>
                <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-tertiary)', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                  {fromAccount?.currency ?? 'UZS'}
                </div>
              </div>
            )}
          </div>
        )}

        {!isTransferOrExchange && filteredTypes.length > 0 && (
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
    </Drawer>
  );
}

// ─── Main Finance Page ──────────────────────────────────────────
export default function FinancePage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
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
  const [modal, setModal] = useState<'income' | 'expense' | 'transfer' | 'exchange' | null>(null);

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
              {isRu ? 'Финансы — Журнал Движения Денежных Средств' : 'Moliya — Pul oqimi jurnali'}
            </h1>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button variant="ghost" size="sm" onClick={fetchData}>
            <RefreshCw size={16} />
          </Button>
          <Button
            size="sm"
            onClick={() => setModal('exchange')}
            style={{
              backgroundColor: 'var(--color-primary-50)',
              color: 'var(--color-primary-600)',
              border: '1px solid var(--color-primary-100)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 600,
            }}
          >
            <Repeat size={16} /> {isRu ? 'Конвертация' : 'Konvertatsiya'}
          </Button>
          <Button
            size="sm"
            onClick={() => setModal('transfer')}
            style={{
              backgroundColor: 'var(--color-info-50)',
              color: 'var(--color-info-600)',
              border: '1px solid var(--color-info-100)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 600,
            }}
          >
            <ArrowLeftRight size={16} /> {isRu ? 'Перевод' : "O'tkazma"}
          </Button>
          <Button
            size="sm"
            onClick={() => setModal('expense')}
            style={{
              backgroundColor: 'var(--color-error-50)',
              color: 'var(--color-error-600)',
              border: '1px solid var(--color-error-100)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 600,
            }}
          >
            <Minus size={16} /> {isRu ? 'Расход' : 'Chiqim'}
          </Button>
          <Button
            size="sm"
            onClick={() => setModal('income')}
            style={{
              backgroundColor: 'var(--color-success-50)',
              color: 'var(--color-success-600)',
              border: '1px solid var(--color-success-100)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 600,
            }}
          >
            <Plus size={16} /> {isRu ? 'Приход' : 'Kirim'}
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
                {(acc.name as any)[locale] || (acc.name as any).ru || (acc.name as any).uz}
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
            { label: isRu ? 'Всего приход' : 'Jami kirim', value: s.totalIncome, color: 'var(--color-success-600)', icon: TrendingUp },
            { label: isRu ? 'Всего расход' : 'Jami chiqim', value: s.totalExpense, color: 'var(--color-error-600)', icon: TrendingDown },
            { label: isRu ? 'Чистый денежный поток' : 'Sof pul oqimi', value: s.netCashFlow, color: s.netCashFlow >= 0 ? 'var(--color-success-600)' : 'var(--color-error-600)', icon: ArrowLeftRight },
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
              { value: '', label: isRu ? 'Всё время' : 'Barcha vaqt' },
              { value: 'today', label: isRu ? 'Сегодня' : 'Bugun' },
              { value: 'yesterday', label: isRu ? 'Вчера' : 'Kecha' },
              { value: 'this_week', label: isRu ? 'Эта неделя' : 'Bu hafta' },
              { value: 'last_week', label: isRu ? 'Прошлая неделя' : "O'tgan hafta" },
              { value: 'this_month', label: isRu ? 'Этот месяц' : 'Bu oy' },
              { value: 'last_month', label: isRu ? 'Прошлый месяц' : "O'tgan oy" },
              { value: 'this_year', label: isRu ? 'Этот год' : 'Bu yil' },
              { value: 'custom', label: isRu ? 'Другие даты...' : 'Boshqa sana...' },
            ]}
            value={periodPreset}
            onChange={handlePeriodChange}
            style={{ width: 160 }}
          />

          {/* Custom Styled DatePicker Controls */}
          <DatePicker
            placeholder={isRu ? 'Дата начала' : 'Boshlanish sanasi'}
            value={dateFrom}
            onChange={(val) => {
              setDateFrom(val);
              setPeriodPreset('custom');
              setPage(1);
            }}
            style={{ width: 175 }}
          />
          <DatePicker
            placeholder={isRu ? 'Дата окончания' : 'Tugash sanasi'}
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
              { value: '', label: isRu ? 'Все типы' : 'Barcha turlar' },
              { value: 'INCOME', label: isRu ? 'Приход' : 'Kirim' },
              { value: 'EXPENSE', label: isRu ? 'Расход' : 'Chiqim' },
              { value: 'TRANSFER', label: isRu ? 'Перевод' : "O'tkazma" },
            ]}
            value={directionFilter}
            onChange={(val) => { setDirectionFilter(val); setPage(1); }}
            style={{ width: 160 }}
          />
          <Select
            options={[
              { value: '', label: isRu ? 'Все валюты' : 'Barcha valyutalar' },
              ...CURRENCY_OPTIONS,
            ]}
            value={currencyFilter}
            onChange={(val) => { setCurrencyFilter(val); setPage(1); }}
            style={{ width: 160 }}
          />
          {(dateFrom || dateTo || directionFilter || currencyFilter || periodPreset) && (
            <Button variant="ghost" size="sm" onClick={() => { setPeriodPreset(''); setDateFrom(''); setDateTo(''); setDirectionFilter(''); setCurrencyFilter(''); setPage(1); }}>
              {isRu ? 'Сбросить фильтр' : 'Filterni tozalash'}
            </Button>
          )}
        </div>
      </Card>

      {/* Journal Table */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
          <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)' }}>
            {isRu ? 'Журнал операций' : 'Operatsiyalar jurnali'}
            {journal && <span style={{ marginLeft: 'var(--space-2)', fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)', fontWeight: 'var(--font-regular)' }}>({journal.total} {isRu ? 'операций' : 'ta'})</span>}
          </h2>
        </div>

        {loading ? (
          <div style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            <div className="animate-pulse">{isRu ? 'Загрузка...' : 'Yuklanmoqda...'}</div>
          </div>
        ) : !journal || journal.data.length === 0 ? (
          <div style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            <Wallet size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
            <div style={{ fontWeight: 'var(--font-medium)' }}>{isRu ? 'Операции не найдены' : 'Operatsiyalar topilmadi'}</div>
            <div style={{ fontSize: 'var(--text-sm)', marginTop: '4px' }}>{isRu ? 'Добавьте приход или расход' : 'Kirim yoki chiqim qo\'shing'}</div>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-border)', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'ДАТА' : 'Sana'}</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'СЧЁТ' : 'Hisob'}</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'КОНТРАГЕНТ' : 'Kontragent'}</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'ТИП' : 'Tur'}</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 'var(--font-semibold)', color: 'var(--color-success-600)' }}>{isRu ? 'ПРИХОД' : 'Kirim'}</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 'var(--font-semibold)', color: 'var(--color-error-600)' }}>{isRu ? 'РАСХОД' : 'Chiqim'}</th>
                    <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'ВАЛЮТА' : 'Valyuta'}</th>
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
