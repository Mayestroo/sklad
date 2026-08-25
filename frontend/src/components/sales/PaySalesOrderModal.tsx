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
import { CreditCard, AlertCircle, Percent } from 'lucide-react';

interface PaySalesOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any | null;
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
  const [cashAccounts, setCashAccounts] = useState<any[]>([]);
  const [method, setMethod] = useState<'CASH' | 'BANK_TRANSFER' | 'CARD' | 'CLICK' | 'PAYME'>('CASH');
  const [amount, setAmount] = useState<number>(0);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const total = Number(order?.totalAmount || 0);
  const paid = Number(order?.paidAmount || 0);
  const remaining = Math.max(0, total - paid);

  // Required min amount for partial
  const minRequired = order?.paymentCondition === 'PARTIAL' && order?.requiredPaymentPercent
    ? (total * Number(order.requiredPaymentPercent)) / 100
    : order?.paymentCondition === 'PREPAID_100'
    ? total
    : 0;

  const minNeededForDispatch = Math.max(0, minRequired - paid);

  useEffect(() => {
    if (!isOpen || !token || !company) return;

    apiFetch<any>('/finance/accounts', {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then((res) => {
        const list = Array.isArray(res) ? res : res?.data || [];
        setCashAccounts(list);
        if (list.length > 0) {
          setCashAccountId(list[0].id);
        }
      })
      .catch((err) => console.error('Failed to load cash accounts:', err));
  }, [isOpen, token, company, locale]);

  useEffect(() => {
    if (!isOpen || !token || !company || !order) return;

    // Default to minNeededForDispatch or remaining
    setAmount(minNeededForDispatch > 0 ? minNeededForDispatch : remaining);
    setNote('');
    setError('');
  }, [isOpen, order, token, company, minNeededForDispatch, remaining]);

  if (!order) return null;

  const cashAccountOptions: SelectOption[] = cashAccounts.length > 0
    ? cashAccounts.map((ca) => {
        const name = typeof ca.name === 'object' ? ca.name[locale] || ca.name.uz || ca.name.ru : ca.name;
        const cur = ca.currency || 'UZS';
        const bal = formatCurrency(Number(ca.balance || 0), locale, cur);
        return {
          value: ca.id,
          label: `${name} (${bal})`,
        };
      })
    : [
        { value: 'CASH_UZS', label: isRu ? 'Наличная касса (UZS)' : 'Naqd kassa (UZS)' },
        { value: 'CASH_USD', label: isRu ? 'Долларовая касса (USD)' : 'Dollar kassa (USD)' },
        { value: 'BANK_ACCOUNT', label: isRu ? 'Расчетный счет (Банк)' : 'Hisobraqam (Bank)' },
      ];

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
          cashAccountId: cashAccountId || undefined,
          method,
          amount: Number(amount),
          comment: note.trim() || undefined,
        }),
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || (isRu ? 'Ошибка при проведении оплаты' : 'To‘lovni amalga oshirishda xatolik yuz berdi'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
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
        </div>

        {/* Payment Method */}
        <div>
          <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
            {isRu ? 'Способ оплаты' : 'To‘lov usuli'}
          </label>
          <Select
            options={methodOptions}
            value={method}
            onChange={(val) => setMethod(val as any)}
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
                  onClick={() => setAmount(minNeededForDispatch)}
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
                  onClick={() => setAmount(remaining)}
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
            onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-xs)', color: '#ef4444', fontWeight: 600, paddingTop: '4px' }}>
          <span>*</span>
          <span>{isRu ? '* Поля, отмеченные (*), обязательны для заполнения' : '* bilan belgilangan maydonlar to‘ldirilishi majburiy'}</span>
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
