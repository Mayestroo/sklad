'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, SelectOption } from '@/components/ui/Select';
import { formatCurrency } from '@/lib/utils';
import { CashAccount } from '@shared/types';
import { CreditCard, AlertCircle, Percent } from 'lucide-react';

type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'CLICK' | 'PAYME';
type CashAccountListResponse = CashAccount[] | { data?: CashAccount[] };

interface SalesOrderPaymentData {
  id: string;
  counterpartyId: string;
  orderNumber: string;
  currency: string;
  totalAmount: number;
  paidAmount: number;
  paymentCondition?: 'PREPAID_100' | 'PARTIAL' | 'CREDIT' | null;
  requiredPaymentPercent?: number | string | null;
}

interface AmountOverride {
  version: string;
  value: number;
}

interface PaySalesOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: SalesOrderPaymentData | null;
  onSuccess: () => void;
}

export function PaySalesOrderModal({
  isOpen,
  onClose,
  order,
  onSuccess,
}: PaySalesOrderModalProps) {
  const { token, company } = useAuth();
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  const [cashAccountId, setCashAccountId] = useState<string>('');
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [amountOverride, setAmountOverride] = useState<AmountOverride | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const total = Number(order?.totalAmount ?? 0);
  const paid = Number(order?.paidAmount ?? 0);
  const remaining = Math.max(0, total - paid);

  // Required min amount for partial
  const minRequired = order?.paymentCondition === 'PARTIAL' && order?.requiredPaymentPercent
    ? (total * Number(order.requiredPaymentPercent)) / 100
    : order?.paymentCondition === 'PREPAID_100'
    ? total
    : 0;

  const minNeededForDispatch = Math.max(0, minRequired - paid);
  const orderId = order?.id;
  const orderCurrency = order?.currency;
  const amountVersion = `${orderId ?? ''}:${order?.paidAmount ?? ''}`;
  const defaultAmount = minNeededForDispatch > 0 ? minNeededForDispatch : remaining;
  const amount = amountOverride?.version === amountVersion ? amountOverride.value : defaultAmount;

  const setPaymentAmount = (value: number) => {
    setAmountOverride({ version: amountVersion, value });
  };

  const handleClose = () => {
    setAmountOverride(null);
    setCashAccountId('');
    setNote('');
    setError('');
    onClose();
  };

  useEffect(() => {
    if (!isOpen || !token || !company || !orderId || !orderCurrency) return;

    let isActive = true;
    apiFetch<CashAccountListResponse>('/finance/accounts', {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then((res) => {
        const list = Array.isArray(res) ? res : res.data || [];
        const compatibleAccounts = list.filter((account) => account.currency === orderCurrency);
        if (!isActive) return;
        setCashAccounts(compatibleAccounts);
        setCashAccountId(compatibleAccounts[0]?.id || '');
      })
      .catch((err) => console.error('Failed to load cash accounts:', err));
    return () => {
      isActive = false;
    };
  }, [isOpen, token, company, locale, orderId, orderCurrency]);

  if (!order) return null;

  const cashAccountOptions: SelectOption[] = cashAccounts.map((account) => ({
    value: account.id,
    label: `${account.name[locale] || account.name.uz || account.name.ru} (${formatCurrency(Number(account.balance), locale, account.currency)})`,
  }));

  const methodOptions: SelectOption[] = [
    { value: 'CASH', label: isRu ? 'Наличные (Касса)' : 'Naqd pul (Kassa)' },
    { value: 'BANK_TRANSFER', label: isRu ? 'Банковский перевод (Р/С)' : 'Bank o‘tkazmasi (H/R)' },
    { value: 'CARD', label: isRu ? 'Банковская карта (Терминал)' : 'Bank kartasi (Terminal)' },
    { value: 'CLICK', label: 'Click' },
    { value: 'PAYME', label: 'Payme' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || amount <= 0) {
      setError(isRu ? 'Укажите сумму оплаты' : 'To‘lov summasini kiriting');
      return;
    }
    if (!cashAccountId) {
      setError(isRu ? 'Выберите счет в валюте заказа' : 'Buyurtma valyutasidagi hisobni tanlang');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await apiFetch('/sales/payments', {
        method: 'POST',
        token: token || undefined,
        tenantId: company?.id,
        locale,
        body: JSON.stringify({
          counterpartyId: order.counterpartyId,
          orderId: order.id,
          currency: order.currency,
          cashAccountId,
          method,
          amount: Number(amount),
          comment: note.trim() || undefined,
        }),
      });

      onSuccess();
      onClose();
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error && err.message
        ? err.message
        : isRu ? 'Ошибка при проведении оплаты' : 'To‘lovni amalga oshirishda xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isRu ? `Оплата заказа — ${order.orderNumber}` : `Buyurtma to‘lovi — ${order.orderNumber}`}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {error && (
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius-md)',
              color: '#ef4444',
              fontSize: 'var(--text-sm)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Order Summary Card */}
        <div
          style={{
            padding: 'var(--space-4)',
            backgroundColor: 'var(--color-bg-subtle)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border)',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 'var(--space-2)',
            textAlign: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{isRu ? 'Сумма заказа' : 'Buyurtma summasi'}</div>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginTop: 2 }} className="tabular-nums">
              {formatCurrency(total, locale, order.currency)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{isRu ? 'Оплачено' : 'To‘langan'}</div>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: '#10b981', marginTop: 2 }} className="tabular-nums">
              {formatCurrency(paid, locale, order.currency)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{isRu ? 'Остаток' : 'Qoldiq'}</div>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: '#ef4444', marginTop: 2 }} className="tabular-nums">
              {formatCurrency(remaining, locale, order.currency)}
            </div>
          </div>
        </div>

        {/* Condition Alert */}
        {order.paymentCondition === 'PARTIAL' && (
          <div style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#d97706', fontSize: 'var(--text-xs)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Percent size={14} />
            <span>
              {isRu
                ? `Условие: Предоплата ${order.requiredPaymentPercent}%. Для отправки нужно еще: ${formatCurrency(minNeededForDispatch, locale, order.currency)}`
                : `Shart: ${order.requiredPaymentPercent}% oldindan to‘lov. Jo‘natish uchun yana kerak: ${formatCurrency(minNeededForDispatch, locale, order.currency)}`}
            </span>
          </div>
        )}

        {/* Cash Desk Selector (1C Kassa) */}
        <div>
          <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
            {isRu ? 'Касса / Счет зачисления' : 'Kassa / Hisob (Kirim joyi)'}
          </label>
          <Select
            options={cashAccountOptions}
            value={cashAccountId}
            onChange={(val) => setCashAccountId(val)}
            placeholder={isRu ? 'Выберите кассу' : 'Kassani tanlang'}
          />
          {cashAccountOptions.length === 0 && (
            <div style={{ marginTop: 4, color: 'var(--color-error-600)', fontSize: 'var(--text-xs)' }}>
              {isRu ? 'Нет кассы или счета в валюте заказа' : 'Buyurtma valyutasida kassa yoki hisob topilmadi'}
            </div>
          )}
        </div>

        {/* Payment Method */}
        <div>
          <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
            {isRu ? 'Способ оплаты' : 'To‘lov usuli'}
          </label>
          <Select
            options={methodOptions}
            value={method}
            onChange={(val) => setMethod(val as PaymentMethod)}
          />
        </div>

        {/* Amount */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
              {isRu ? 'Сумма к оплате *' : 'To‘lov summasi *'}
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {minNeededForDispatch > 0 && minNeededForDispatch !== remaining && (
                <button
                  type="button"
                  onClick={() => setPaymentAmount(minNeededForDispatch)}
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-primary-600)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  {isRu ? 'Минимум' : 'Minimal'} ({formatCurrency(minNeededForDispatch, locale, order.currency)})
                </button>
              )}
              {remaining > 0 && (
                <button
                  type="button"
                  onClick={() => setPaymentAmount(remaining)}
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-primary-600)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  {isRu ? 'Вся сумма' : 'Barcha qoldiq'} ({formatCurrency(remaining, locale, order.currency)})
                </button>
              )}
            </div>
          </div>
          <Input
            type="number"
            min={0.01}
            step="any"
            value={amount || ''}
            onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
            required
            autoFocus
          />
        </div>

        {/* Note */}
        <div>
          <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
            {isRu ? 'Примечание / Комментарий' : 'Izoh / Qayd'}
          </label>
          <Input
            placeholder={isRu ? 'Например: Аванс по заказу или чек №' : 'Masalan: Buyurtma bo‘yicha avans to‘lovi yoki chek raqami'}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {/* Required fields indicator */}
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 'var(--text-xs)', color: '#ef4444', fontWeight: 600, paddingTop: '4px' }}>
          <span>* {isRu ? 'поля, обязательные для заполнения' : 'bilan belgilangan maydonlar to‘ldirilishi majburiy'}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)', borderTop: '1px solid var(--color-border-light)', paddingTop: 'var(--space-3)' }}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            {isRu ? 'Отмена' : 'Bekor qilish'}
          </Button>
          <Button type="submit" disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CreditCard size={16} />
            {loading ? (isRu ? 'Проведение...' : 'Bajarilmoqda...') : (isRu ? 'Принять оплату' : 'To‘lovni qabul qilish')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
