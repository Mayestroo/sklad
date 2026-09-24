'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { CURRENCY_OPTIONS, formatCurrency } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { toast } from '@/context/ToastContext';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';

interface CashAccount {
  id: string;
  name: string;
  type: string;
  currency: string;
  balance: number;
}

interface Counterparty {
  id: string;
  name: string;
  type: 'CUSTOMER' | 'SUPPLIER' | 'BOTH';
  balancesByCurrency?: Array<{
    currency: string;
    customerDebt: number;
    supplierDebt: number;
    netBalance: number;
  }>;
}

interface QuickPaymentModalProps {
  isOpen: boolean;
  counterparty: Counterparty | null;
  initialSide?: 'CUSTOMER' | 'SUPPLIER';
  initialCurrency?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function QuickPaymentModal({
  isOpen,
  counterparty,
  initialSide,
  initialCurrency,
  onClose,
  onSuccess,
}: QuickPaymentModalProps) {
  const { token, company } = useAuth();
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const initialBalance = counterparty?.balancesByCurrency?.find((balance) => balance.currency === initialCurrency);
  const initialSideBalance = initialSide === 'CUSTOMER'
    ? Number(initialBalance?.customerDebt ?? 0)
    : initialSide === 'SUPPLIER'
      ? Number(initialBalance?.supplierDebt ?? 0)
      : 0;

  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [settlementSide, setSettlementSide] = useState<'CUSTOMER' | 'SUPPLIER' | ''>(initialSide ?? '');
  const [currency, setCurrency] = useState(initialCurrency ?? '');
  const [amount, setAmount] = useState(initialSideBalance === 0 ? '' : String(Math.abs(initialSideBalance)));
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [accountsLoaded, setAccountsLoaded] = useState(false);

  const availableSides = ['CUSTOMER', 'SUPPLIER'] as const;
  const currencyBalance = counterparty?.balancesByCurrency?.find((balance) => balance.currency === currency);
  const selectedBalance = settlementSide === 'CUSTOMER'
    ? Number(currencyBalance?.customerDebt ?? 0)
    : settlementSide === 'SUPPLIER'
      ? Number(currencyBalance?.supplierDebt ?? 0)
      : 0;
  const isIncome = settlementSide === 'SUPPLIER'
    ? selectedBalance < 0
    : selectedBalance >= 0;
  const matchingAccounts = accounts.filter((account) => account.currency === currency);
  const selectedAccount = matchingAccounts.find((account) => account.id === selectedAccountId)
    ?? matchingAccounts[0];

  useEffect(() => {
    if (!isOpen || !token || !company) return;

    apiFetch<CashAccount[]>('/finance/accounts', {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then((res) => {
        setAccounts(Array.isArray(res) ? res : []);
      })
      .catch((err) => {
        console.error('Failed to load cash accounts:', err);
      })
      .finally(() => setAccountsLoaded(true));

  }, [isOpen, token, company, locale]);

  const updateSuggestedPayment = (side: 'CUSTOMER' | 'SUPPLIER' | '', selectedCurrency: string) => {
    if (!counterparty || !side || !selectedCurrency) {
      setAmount('');
      setComment('');
      return;
    }

    const balance = counterparty.balancesByCurrency?.find((item) => item.currency === selectedCurrency);
    const amountForSide = Number(side === 'CUSTOMER' ? balance?.customerDebt ?? 0 : balance?.supplierDebt ?? 0);
    const isSelectedSideIncome = side === 'SUPPLIER' ? amountForSide < 0 : amountForSide >= 0;
    setAmount(amountForSide === 0 ? '' : String(Math.abs(amountForSide)));
    setComment(
      isSelectedSideIncome
        ? isRu
          ? `Погашение задолженности от ${counterparty.name}`
          : `${counterparty.name} dan qarz so'ndirish to'lovi`
        : isRu
          ? `Оплата задолженности перед ${counterparty.name}`
          : `${counterparty.name} oldidagi qarzni so'ndirish to'lovi`,
    );
  };

  const handleSettlementSideChange = (value: string) => {
    const nextSide = value as 'CUSTOMER' | 'SUPPLIER' | '';
    setSettlementSide(nextSide);
    updateSuggestedPayment(nextSide, currency);
  };

  const handleCurrencyChange = (value: string) => {
    setCurrency(value);
    setSelectedAccountId('');
    updateSuggestedPayment(settlementSide, value);
  };

  if (!isOpen || !counterparty) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !company) return;

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      toast.error(isRu ? 'Введите корректную сумму' : "To'g'ri summani kiriting");
      return;
    }

    if (!settlementSide || !currency) {
      toast.error(
        isRu
          ? 'Выберите сторону взаиморасчёта и валюту'
          : 'Hisob-kitob tomonini va valyutani tanlang',
      );
      return;
    }

    if (!selectedAccount?.id) {
      toast.error(isRu ? 'Выберите кассу или счет' : 'Kassa yoki hisob raqamni tanlang');
      return;
    }

    setLoading(true);
    try {
      await apiFetch(isIncome ? '/finance/income' : '/finance/expense', {
        method: 'POST',
        token: token || undefined,
        tenantId: company.id,
        locale,
        body: JSON.stringify({
          accountId: selectedAccount.id,
          amount: numAmount,
          currency,
          counterpartyId: counterparty.id,
          settlementSide,
          comment: comment.trim() || undefined,
        }),
      });

      toast.success(
        isIncome
          ? isRu
            ? 'Оплата успешно принята!'
            : "To'lov muvaffaqiyatli qabul qilindi!"
          : isRu
            ? 'Выплата успешно проведена!'
            : "To'lov muvaffaqiyatli amalga oshirildi!",
      );
      onSuccess();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error && err.message
          ? err.message
          : isRu
            ? 'Ошибка проведения оплаты'
            : "To'lovni amalga oshirishda xatolik yuz berdi",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        isIncome
          ? isRu
            ? 'Принять оплату (Приход)'
            : "To'lov qabul qilish (Kirim)"
          : isRu
            ? 'Выплатить долг (Расход)'
            : "Qarzni to'lash (Chiqim)"
      }
      size="md"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <Select
          label={isRu ? 'Сторона взаиморасчёта *' : 'Hisob-kitob tomoni *'}
          value={settlementSide}
          onChange={handleSettlementSideChange}
          options={availableSides.map((side) => ({
            value: side,
            label: side === 'CUSTOMER'
              ? isRu ? 'Клиентская задолженность' : 'Mijoz qarzdorligi'
              : isRu ? 'Задолженность поставщику' : 'Ta’minotchi qarzdorligi',
          }))}
        />

        <Select
          label={isRu ? 'Валюта *' : 'Valyuta *'}
          value={currency}
          onChange={handleCurrencyChange}
          options={CURRENCY_OPTIONS}
        />

        {/* Counterparty & selected currency/side balance */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-md)',
            backgroundColor: !settlementSide || !currency
              ? 'var(--color-bg-subtle)'
              : isIncome ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
            border: `1px solid ${!settlementSide || !currency ? 'var(--color-border)' : isIncome ? '#10b98140' : '#ef444440'}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                backgroundColor: !settlementSide || !currency ? 'var(--color-text-tertiary)' : isIncome ? '#10b981' : '#ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
              }}
            >
              {isIncome ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{counterparty.name}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                  {!settlementSide
                    ? isRu ? 'Выберите сторону взаиморасчёта' : 'Hisob-kitob tomonini tanlang'
                    : settlementSide === 'CUSTOMER'
                      ? isRu ? 'Клиентский баланс' : 'Mijoz balansi'
                      : isRu ? 'Баланс поставщика' : 'Ta’minotchi balansi'}
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              {isRu ? 'Текущий баланс' : 'Joriy balans'}
            </div>
            <div
              style={{
                fontSize: 'var(--text-base)',
                fontWeight: 700,
                color: !settlementSide || !currency ? 'var(--color-text-primary)' : isIncome ? '#10b981' : '#ef4444',
              }}
            >
              {settlementSide && currency ? formatCurrency(selectedBalance, locale, currency) : '—'}
            </div>
          </div>
        </div>

        {/* Amount Input */}
        <div>
          <Input
            label={isRu ? 'Сумма оплаты *' : "To'lov summasi *"}
            type="number"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            required
            autoFocus
          />
        </div>

        {/* Cash Account Select */}
        <div>
          <Select
            label={isRu ? 'Касса / Расчетный счет *' : 'Kassa / Hisob raqam *'}
            value={selectedAccount?.id || ''}
            onChange={(val) => setSelectedAccountId(val)}
            disabled={!accountsLoaded || !currency || matchingAccounts.length === 0}
            options={matchingAccounts.map((acc) => ({
              value: acc.id,
              label: `${acc.name} (${acc.currency}) — ${formatCurrency(acc.balance, locale, acc.currency)}`,
            }))}
          />
          {currency && accountsLoaded && matchingAccounts.length === 0 && (
            <div style={{ fontSize: 'var(--text-xs)', color: '#ef4444', marginTop: 4 }}>
              {isRu
                ? `Нет кассы или счёта в валюте ${currency}`
                : `${currency} valyutasida kassa yoki hisob mavjud emas`}
            </div>
          )}
          {selectedAccount && !isIncome && Number(selectedAccount.balance) < Number(amount || 0) && (
            <div style={{ fontSize: '11px', color: '#ef4444', marginTop: 4 }}>
              {isRu
                ? `Внимание: остаток на счете (${formatCurrency(selectedAccount.balance, locale, selectedAccount.currency)}) меньше суммы выплаты!`
                : `Diqqat: kassadagi qoldiq (${formatCurrency(selectedAccount.balance, locale, selectedAccount.currency)}) to'lov summasidan kam!`}
            </div>
          )}
        </div>

        {/* Comment Input */}
        <div>
          <Input
            label={isRu ? 'Комментарий к платежу' : "To'lov izohi"}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={isRu ? 'Например: Закрытие долга по счету...' : "Mas: Qarz so'ndirish..."}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            {isRu ? 'Отмена' : 'Bekor qilish'}
          </Button>
          <Button
            type="submit"
            disabled={loading || !settlementSide || !currency || !selectedAccount?.id}
            style={{
              backgroundColor: isIncome ? '#10b981' : '#ef4444',
              borderColor: isIncome ? '#10b981' : '#ef4444',
              color: '#fff',
            }}
          >
            {loading
              ? isRu
                ? 'Проведение...'
                : "O'tkazilmoqda..."
              : isIncome
                ? isRu
                  ? 'Принять оплату'
                  : "To'lovni qabul qilish"
                : isRu
                  ? 'Выплатить'
                  : "To'lov qilish"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
