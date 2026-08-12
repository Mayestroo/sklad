'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, SelectOption } from '@/components/ui/Select';
import { PurchaseReceipt } from '@shared/types';

interface CounterpartyOption {
  id: string;
  name: string;
}

interface AllocateExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  receipt: PurchaseReceipt | null;
  onSuccess: () => void;
}

export function AllocateExpenseModal({
  isOpen,
  onClose,
  receipt,
  onSuccess,
}: AllocateExpenseModalProps) {
  const { token, company } = useAuth();
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  const [expenseType, setExpenseType] = useState('TRANSPORT');
  const [supplierId, setSupplierId] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('UZS');
  const [allocationMethod, setAllocationMethod] = useState('BY_AMOUNT');
  const [comment, setComment] = useState('');

  const [counterparties, setCounterparties] = useState<CounterpartyOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token || !company) return;
    apiFetch<CounterpartyOption[]>('/sales/counterparties', { token, tenantId: company.id, locale })
      .then((res) => setCounterparties(res || []))
      .catch((err) => console.error(err));
  }, [token, company, locale]);

  if (!receipt) return null;

  const handleSubmit = async () => {
    setError('');

    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      setError(isRu ? 'Введите сумму расхода' : 'Xarajat summasini kiriting');
      return;
    }

    setLoading(true);

    try {
      await apiFetch('/purchases/expenses', {
        token: token || undefined,
        tenantId: company?.id || undefined,
        locale,
        method: 'POST',
        body: JSON.stringify({
          receiptId: receipt.id,
          expenseType,
          supplierId: supplierId || undefined,
          amount: numAmount,
          currency,
          allocationMethod,
          comment: comment || undefined,
        }),
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || (isRu ? 'Ошибка распределения расхода' : 'Xarajatni taqsimlashda xatolik'));
    } finally {
      setLoading(false);
    }
  };

  const expenseTypeOptions: SelectOption[] = [
    { value: 'TRANSPORT', label: isRu ? 'Транспортные расходы' : 'Transport xarajati' },
    { value: 'CUSTOMS', label: isRu ? 'Таможенные пошлины (Пошлина)' : 'Bojxona to\'lovlari (Boj)' },
    { value: 'BROKER', label: isRu ? 'Услуги брокера' : 'Broker xizmati' },
    { value: 'INSURANCE', label: isRu ? 'Страхование' : 'Sug\'urta' },
    { value: 'OTHER', label: isRu ? 'Прочие доп. расходы' : 'Boshqa qo\'shimcha xarajat' },
  ];

  const supplierOptions: SelectOption[] = [
    { value: '', label: isRu ? '-- Необязательно (Не выбрано) --' : '-- Ixtiyoriy (Tanlanmagan) --' },
    ...counterparties.map((c) => ({ value: c.id, label: c.name })),
  ];

  const currencyOptions: SelectOption[] = [
    { value: 'UZS', label: 'UZS' },
    { value: 'USD', label: 'USD' },
    { value: 'EUR', label: 'EUR' },
  ];

  const allocationOptions: SelectOption[] = [
    { value: 'BY_AMOUNT', label: isRu ? 'По сумме (пропорционально стоимости покупки)' : 'Summa bo\'yicha (Xarid qiymatiga mutanosib)' },
    { value: 'BY_QUANTITY', label: isRu ? 'По количеству (пропорционально кол-ву товара)' : 'Miqdor bo\'yicha (Tovar dona/birligiga mutanosib)' },
    { value: 'BY_WEIGHT', label: isRu ? 'По весу (пропорционально весу товара в кг)' : 'Og\'irlik bo\'yicha (Tovar kg og\'irligiga mutanosib)' },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${isRu ? 'Ввод доп. расхода: Документ №' : 'Qo\'shimcha Xarajat Kiritish: Hujjat №'} ${receipt.docNumber}`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: '550px', width: '100%' }}>
        {error && (
          <div
            style={{
              padding: 'var(--space-3)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-danger-50)',
              color: 'var(--color-danger-700)',
              fontSize: 'var(--text-sm)',
            }}
          >
            {error}
          </div>
        )}

        <div>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px', display: 'block' }}>
            {isRu ? 'Вид расхода *' : 'Xarajat Turi *'}
          </label>
          <Select
            options={expenseTypeOptions}
            value={expenseType}
            onChange={(val) => setExpenseType(val)}
          />
        </div>

        <div>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px', display: 'block' }}>
            {isRu ? 'Поставщик услуг (Транспортная компания)' : 'Xizmat ko\'rsatuvchi Yetkazib beruvchi (Transport kompaniyasi)'}
          </label>
          <Select
            options={supplierOptions}
            value={supplierId}
            onChange={(val) => setSupplierId(val)}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-3)' }}>
          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px', display: 'block' }}>
              {isRu ? 'Сумма расхода *' : 'Xarajat Summasi *'}
            </label>
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={isRu ? 'Например: 800' : 'Masalan: 800'}
            />
          </div>
          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px', display: 'block' }}>
              {isRu ? 'Валюта' : 'Valyuta'}
            </label>
            <Select
              options={currencyOptions}
              value={currency}
              onChange={(val) => setCurrency(val)}
            />
          </div>
        </div>

        <div>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px', display: 'block' }}>
            {isRu ? 'Критерий распределения (Landed Cost Allocation) *' : 'Taqsimlash Mezoni (Landed Cost Allocation) *'}
          </label>
          <Select
            options={allocationOptions}
            value={allocationMethod}
            onChange={(val) => setAllocationMethod(val)}
          />
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>
            {isRu ? 'Этот расход распределится на каждый купленный товар и увеличит его фактическую себестоимость.' : 'Ushbu xarajat xarid qilingan har bir tovarga taqsimlanib, uning haqiqiy tan narxini oshiradi.'}
          </p>
        </div>

        <div>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px', display: 'block' }}>
            {isRu ? 'Комментарий / Описание' : 'Izoh / Tavsif'}
          </label>
          <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder={isRu ? 'Например: Транспорт фуры Ташкент-Самарканд' : 'Masalan: Toshkent-Samarqand fura transporti'} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {isRu ? 'Отмена' : 'Bekor qilish'}
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? (isRu ? 'Распределение...' : 'Taqsimlanmoqda...') : (isRu ? 'Рассчитать и распределить расход' : 'Xarajatni Hisoblab Taqsimlash')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
