'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { toast } from '@/context/ToastContext';
import { ArrowDownLeft, ArrowUpRight, DollarSign, Wallet } from 'lucide-react';

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
  netBalance?: number;
  debtBalance: number;
  customerDebt?: number;
  supplierDebt?: number;
}

interface QuickPaymentModalProps {
  isOpen: boolean;
  counterparty: Counterparty | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function QuickPaymentModal({
  isOpen,
  counterparty,
  onClose,
  onSuccess,
}: QuickPaymentModalProps) {
  const { token, company } = useAuth();
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingAccounts, setFetchingAccounts] = useState(false);

  const net =
    counterparty?.netBalance !== undefined
      ? Number(counterparty.netBalance)
      : counterparty?.type === 'SUPPLIER'
      ? -Number(counterparty?.debtBalance || 0)
      : Number(counterparty?.debtBalance || 0);

  // If net > 0: customer owes us money => INCOME
  // If net < 0: we owe supplier/customer => EXPENSE
  const isIncome = net >= 0;

  useEffect(() => {
    if (!isOpen || !token || !company) return;

    setFetchingAccounts(true);
    apiFetch<CashAccount[]>('/finance/accounts', {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then((res) => {
        if (Array.isArray(res) && res.length > 0) {
          setAccounts(res);
          setSelectedAccountId(res[0].id);
        }
      })
      .catch((err) => {
        console.error('Failed to load cash accounts:', err);
      })
      .finally(() => setFetchingAccounts(false));

    if (counterparty) {
      const defaultAmt = Math.abs(net);
      setAmount(defaultAmt > 0 ? String(defaultAmt) : '');
      setComment(
        isIncome
          ? isRu
            ? `Погашение задолженности от ${counterparty.name}`
            : `${counterparty.name} dan qarz so'ndirish to'lovi`
          : isRu
            ? `Оплата задолженности перед ${counterparty.name}`
            : `${counterparty.name} oldidagi qarzni so'ndirish to'lovi`,
      );
    }
  }, [isOpen, counterparty, token, company, locale, isIncome, net]);

  if (!isOpen || !counterparty) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !company) return;

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      toast.error(isRu ? 'Введите корректную сумму' : "To'g'ri summani kiriting");
      return;
    }

    if (!selectedAccountId) {
      toast.error(isRu ? 'Выберите кассу или счет' : 'Kassa yoki hisob raqamni tanlang');
      return;
    }

    setLoading(true);
    try {
      await apiFetch('/finance/transactions', {
        method: 'POST',
        token: token || undefined,
        tenantId: company.id,
        locale,
        body: JSON.stringify({
          accountId: selectedAccountId,
          direction: isIncome ? 'INCOME' : 'EXPENSE',
          amount: numAmount,
          counterpartyId: counterparty.id,
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
    } catch (err: any) {
      toast.error(err?.message || (isRu ? 'Ошибка проведения оплаты' : "To'lovni amalga oshirishda xatolik yuz berdi"));
    } finally {
      setLoading(false);
    }
  };

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

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
        {/* Counterparty & Net Position Card */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-md)',
            backgroundColor: isIncome ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
            border: `1px solid ${isIncome ? '#10b98140' : '#ef444440'}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                backgroundColor: isIncome ? '#10b981' : '#ef4444',
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
                {isIncome
                  ? isRu
                    ? 'Дебитор (Нам должны)'
                    : 'Debitor (Bizga qarzdor)'
                  : isRu
                    ? 'Кредитор (Наш долг)'
                    : 'Kreditor (Bizning qarzimiz)'}
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
                color: isIncome ? '#10b981' : '#ef4444',
              }}
            >
              {isIncome ? '+' : '-'} {formatCurrency(Math.abs(net), locale, selectedAccount?.currency || company?.settings?.sales?.defaultCurrency || 'UZS')}
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
            value={selectedAccountId}
            onChange={(val) => setSelectedAccountId(val)}
            disabled={fetchingAccounts || accounts.length === 0}
            options={accounts.map((acc) => ({
              value: acc.id,
              label: `${acc.name} (${acc.currency}) — ${formatCurrency(acc.balance, locale, acc.currency)}`,
            }))}
          />
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
            disabled={loading}
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
