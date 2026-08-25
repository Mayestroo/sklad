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
import { SalesInvoice, CashAccount } from '@shared/types';
import { CreditCard, DollarSign, Calendar, FileText, AlertCircle } from 'lucide-react';

interface PaySalesInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: SalesInvoice | null;
  onSuccess: () => void;
}

export function PaySalesInvoiceModal({
  isOpen,
  onClose,
  invoice,
  onSuccess,
}: PaySalesInvoiceModalProps) {
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

  const remaining = invoice
    ? Math.max(0, Number(invoice.totalAmount || 0) - Number(invoice.paidAmount || 0))
    : 0;

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
    if (!isOpen || !token || !company || !invoice) return;

    setAmount(remaining);
    setNote('');
    setError('');
  }, [isOpen, invoice, token, company]);

  if (!invoice) return null;

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
          counterpartyId: invoice.counterpartyId,
          invoiceId: invoice.id,
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
      title={isRu ? `Принять оплату — ${invoice.invoiceNumber || (invoice as any).docNumber || ''}` : `To‘lov qabul qilish — ${invoice.invoiceNumber || (invoice as any).docNumber || ''}`}
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

        {/* Invoice Summary Card */}
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
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{isRu ? 'Общая сумма' : 'Jami summa'}</div>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginTop: 2 }} className="tabular-nums">
              {formatCurrency(Number(invoice.totalAmount || 0), locale, invoice.currency)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{isRu ? 'Оплачено' : 'To‘langan'}</div>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: '#10b981', marginTop: 2 }} className="tabular-nums">
              {formatCurrency(Number(invoice.paidAmount || 0), locale, invoice.currency)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{isRu ? 'Остаток долга' : 'Qoldiq qarz'}</div>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: '#ef4444', marginTop: 2 }} className="tabular-nums">
              {formatCurrency(remaining, locale, invoice.currency)}
            </div>
          </div>
        </div>

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
                {isRu ? 'Вся сумма' : 'Barcha qoldiq'} ({formatCurrency(remaining, locale, invoice.currency)})
              </button>
            )}
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
            placeholder={isRu ? 'Например: Оплата через кассу или чек №' : 'Masalan: Kassa orqali to‘landi yoki chek raqami'}
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
