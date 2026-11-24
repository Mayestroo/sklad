'use client';

import { MoneyInput } from '@/components/ui/MoneyInput';
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Select, SelectOption } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { formatCurrency, errorMessage } from '@/lib/utils';
import { CASH_ACCOUNT_TYPE_LABELS } from '@/lib/constants/statuses';
import { PurchaseReceipt, CashAccount } from '@shared/types';
import { isCashAccountCurrencyValid } from '@shared/types/cash-account-policy';
import { CreditCard, Wallet } from 'lucide-react';
import { localIsoDate } from '@/lib/date-range';

interface PayPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  receipt: PurchaseReceipt | null;
  onSuccess: () => void;
}

export function PayPurchaseModal({
  isOpen,
  onClose,
  receipt,
  onSuccess,
}: PayPurchaseModalProps) {
  const { token, company } = useAuth();
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [cashAccountId, setCashAccountId] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [exchangeRate, setExchangeRate] = useState('');
  const [paymentDate, setPaymentDate] = useState<string>(
    localIsoDate(new Date())
  );
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const remaining = receipt
    ? Math.max(0, Number(receipt.totalAmount) - Number(receipt.paidAmount || 0))
    : 0;

  useEffect(() => {
    if (!isOpen || !token || !company) return;

    // Reset fields
    if (receipt) {
      setAmount(remaining);
      setExchangeRate('');
      setNote('');
      setPaymentDate(localIsoDate(new Date()));
      setError('');
    }

    // Fetch accounts
    apiFetch<CashAccount[]>('/finance/accounts', {
      token: token || undefined,
      tenantId: company?.id ? company.id : undefined,
      locale,
    })
      .then((res) => {
        const list = res || [];
        setAccounts(list);
        const matching = list.find(
          (account) => account.isActive && account.currency === receipt?.currency && isCashAccountCurrencyValid(account),
        );
        setCashAccountId(matching?.id || '');
      })
      .catch((err) => console.error(err));
  }, [isOpen, receipt, token, company, locale]);

  if (!receipt) return null;

  const getAccountName = (acc: CashAccount) => {
    const nameStr =
      typeof acc.name === 'string'
        ? acc.name
        : acc.name[locale] || acc.name.ru || acc.name.uz || '';
    const formattedBal = formatCurrency(Number(acc.balance), locale, acc.currency);
    return `${nameStr} (${CASH_ACCOUNT_TYPE_LABELS[acc.accountType]?.[locale === 'ru' ? 'ru' : 'uz'] ?? acc.accountType}) — ${formattedBal}`;
  };

  const sortedAccounts = accounts.filter(
    (account) => account.isActive && account.currency === receipt.currency && isCashAccountCurrencyValid(account),
  );

  const accountOptions: SelectOption[] = sortedAccounts.map((a) => ({
    value: a.id,
    label: getAccountName(a),
  }));

  const selectedAccount = accounts.find((a) => a.id === cashAccountId);
  const isCurrencyMismatch = !!selectedAccount &&
    (selectedAccount.currency !== receipt.currency || !isCashAccountCurrencyValid(selectedAccount));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !company) return;

    if (!cashAccountId) {
      setError(
        isRu ? 'Выберите кассу для оплаты' : 'To‘lov kassisini tanlang'
      );
      return;
    }

    if (isCurrencyMismatch) {
      setError(
        isRu
          ? `Валюта кассы (${selectedAccount?.currency}) не совпадает с валютой документа (${receipt.currency})`
          : `Kassa valyutasi (${selectedAccount?.currency}) hujjat valyutasiga (${receipt.currency}) mos kelmaydi`
      );
      return;
    }

    if (receipt.currency === 'USD' && (!Number.isFinite(Number(exchangeRate)) || Number(exchangeRate) <= 0)) {
      setError(isRu ? 'Укажите курс оплаты: UZS за 1 USD' : 'To‘lov kursini kiriting: 1 USD uchun UZS');
      return;
    }

    if (!amount || amount <= 0) {
      setError(
        isRu ? 'Укажите корректную сумму оплаты' : 'To‘lov summasini kiriting'
      );
      return;
    }

    if (selectedAccount && Number(selectedAccount.balance) < amount) {
      setError(
        isRu
          ? `Недостаточно средств на кассе. Доступно: ${formatCurrency(Number(selectedAccount.balance), locale, selectedAccount.currency)}`
          : `Kassada mablag‘ yetarli emas. Mavjud: ${formatCurrency(Number(selectedAccount.balance), locale, selectedAccount.currency)}`
      );
      return;
    }

    setLoading(true);
    setError('');

    try {
      await apiFetch(`/purchases/receipts/${receipt.id}/pay`, {
        token: token || undefined,
        tenantId: company?.id ? company.id : undefined,
        locale,
        method: 'POST',
        body: JSON.stringify({
          amount,
          cashAccountId,
          ...(receipt.currency === 'USD' ? { exchangeRate: Number(exchangeRate) } : {}),
          note: note.trim() || undefined,
          paymentDate,
        }),
      });

      onSuccess();
      onClose();
    } catch (err) {
      setError(
        errorMessage(err) || (isRu ? 'Ошибка при проведении оплаты' : 'To‘lovni amalga oshirishda xatolik')
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal icon={<Wallet size={20} />}
      isOpen={isOpen}
      onClose={onClose}
      title={
        isRu
          ? `Оплата по закупке № ${receipt.docNumber}`
          : `Xarid bo‘yicha to‘lov № ${receipt.docNumber}`
      }
      footer={
        <>
          <Button data-dialog-cancel type="button" variant="secondary" onClick={onClose} disabled={loading}>
            {isRu ? 'Отмена' : 'Bekor qilish'}
          </Button>
          <Button type="submit" form="pay-purchase-modal-form" disabled={loading || isCurrencyMismatch} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CreditCard size={16} />
            {loading
              ? isRu
                ? 'Проведение...'
                : 'Bajarilmoqda...'
              : isRu
              ? 'Подтвердить оплату'
              : 'To‘lovni tasdiqlash'}
          </Button>
        </>
      }
      onSubmitShortcut={() => (document.getElementById('pay-purchase-modal-form') as HTMLFormElement | null)?.requestSubmit()}
    >
      <form id="pay-purchase-modal-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {error && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-error-50)',
              border: '1px solid var(--color-error-100)',
              color: 'var(--color-error-700)',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
            }}
          >
            {error}
          </div>
        )}

        {isCurrencyMismatch && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid #f59e0b',
              color: 'var(--color-warning-700)',
              fontSize: 'var(--text-xs)',
              fontWeight: 500,
            }}
          >
            {isRu
              ? `Валюта кассы (${selectedAccount?.currency}) не совпадает с валютой закупки (${receipt.currency}). Выберите кассу в ${receipt.currency}.`
              : `Kassa valyutasi (${selectedAccount?.currency}) xarid valyutasiga (${receipt.currency}) mos kelmaydi. Iltimos, ${receipt.currency} kassasini tanlang.`}
          </div>
        )}

        {/* Info card */}
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            fontSize: 'var(--text-sm)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>
              {isRu ? 'Поставщик:' : 'Yetkazib beruvchi:'}
            </span>
            <strong style={{ color: 'var(--color-text-primary)' }}>
              {receipt.counterparty?.name || '—'}
            </strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>
              {isRu ? 'Общая сумма:' : 'Jami summa:'}
            </span>
            <span style={{ fontWeight: 600 }}>
              {formatCurrency(Number(receipt.totalAmount), locale, receipt.currency)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>
              {isRu ? 'Уже оплачено:' : 'To‘langan:'}
            </span>
            <span style={{ color: 'var(--color-success-700)', fontWeight: 600 }}>
              {formatCurrency(Number(receipt.paidAmount || 0), locale, receipt.currency)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--color-border)', paddingTop: '6px', marginTop: '2px' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>
              {isRu ? 'Остаток долга:' : 'Qarz qoldig‘i:'}
            </span>
            <span style={{ color: 'var(--color-error-700)', fontWeight: 700 }}>
              {formatCurrency(remaining, locale, receipt.currency)}
            </span>
          </div>
        </div>

        {/* Account selection */}
        <div>
          <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
            {isRu ? 'Касса / Счёт для списания *' : 'Chiqim kassa / hisobi *'}
          </label>
          <Select
            options={accountOptions}
            value={cashAccountId}
            onChange={(val) => setCashAccountId(val)}
          />
        </div>

        {receipt.currency === 'USD' && (
          <MoneyInput
            label={isRu ? 'Курс оплаты (1 USD = UZS) *' : 'To‘lov kursi (1 USD = UZS) *'}
            value={exchangeRate}
            onValueChange={setExchangeRate}
            decimals={4}
            placeholder="12,800"
          />
        )}

        {/* Amount input */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
              {isRu ? 'Сумма оплаты *' : 'To‘lov summasi *'}
            </label>
            <button
              type="button"
              onClick={() => setAmount(remaining)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-primary-600)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              {isRu ? 'Вся сумма' : 'Barchasi'}
            </button>
          </div>
          <MoneyInput
            aria-label={isRu ? 'Сумма оплаты' : 'To‘lov summasi'}
            value={amount || ''}
            max={remaining}
            onValueChange={(value) => setAmount(Number(value) || 0)}
          />
        </div>

        {/* Payment date */}
        <div>
          <DatePicker
            label={isRu ? 'Дата оплаты' : 'To‘lov sanasi'}
            value={paymentDate}
            onChange={(val) => setPaymentDate(val)}
          />
        </div>

        {/* Note */}
        <div>
          <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
            {isRu ? 'Комментарий' : 'Izoh'}
          </label>
          <input
            type="text"
            placeholder={isRu ? 'Например: Товар полностью оплачен' : 'Masalan: Tovar to‘liq to‘landi'}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-bg-input)',
              color: 'var(--color-text-primary)',
              fontSize: 'var(--text-sm)',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Submit action */}
      </form>
    </Modal>
  );
}
