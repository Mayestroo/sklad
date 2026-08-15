'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { CURRENCY_OPTIONS } from '@/lib/utils';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, SelectOption } from '@/components/ui/Select';
import { PurchaseReceipt } from '@shared/types';
import { Truck, AlertCircle, CheckCircle2 } from 'lucide-react';

interface CounterpartyOption {
  id: string;
  name: string;
}

export interface AllocateExpenseModalProps {
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

  const currencyOptions = CURRENCY_OPTIONS;

  const allocationOptions: SelectOption[] = [
    { value: 'BY_AMOUNT', label: isRu ? 'По сумме (пропорционально стоимости покупки)' : 'Summa bo\'yicha (Xarid qiymatiga mutanosib)' },
    { value: 'BY_QUANTITY', label: isRu ? 'По количеству (пропорционально кол-ву товара)' : 'Miqdor bo\'yicha (Tovar dona/birligiga mutanosib)' },
    { value: 'BY_WEIGHT', label: isRu ? 'По весу (пропорционально весу товара в кг)' : 'Og\'irlik bo\'yicha (Tovar kg og\'irligiga mutanosib)' },
  ];

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={`${isRu ? 'Расход: Документ №' : 'Xarajat: Hujjat №'} ${receipt.docNumber}`}
      description={
        isRu
          ? 'Распределение прямых расходов на себестоимость товаров (Landed Cost)'
          : 'To‘g‘ridan-to‘g‘ri xarajatlarni tovarlar tannarxiga taqsimlash'
      }
      icon={<Truck size={20} />}
      size="md"
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
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {loading ? (
              isRu ? 'Распределение...' : 'Taqsimlanmoqda...'
            ) : (
              <>
                <CheckCircle2 size={16} />
                {isRu ? 'Рассчитать и распределить (Ctrl+Enter)' : 'Hisoblab taqsimlash (Ctrl+Enter)'}
              </>
            )}
          </Button>
        </>
      }
    >
      {error && (
        <div
          style={{
            padding: '12px 14px',
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid #ef4444',
            color: '#ef4444',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-xs)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertCircle size={16} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px', display: 'block' }}>
            {isRu ? 'Вид расхода *' : 'Xarajat Turi *'}
          </label>
          <Select
            options={expenseTypeOptions}
            value={expenseType}
            onChange={(val) => setExpenseType(val)}
          />
        </div>

        <div>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px', display: 'block' }}>
            {isRu ? 'Поставщик услуг (Транспортная компания)' : 'Xizmat ko\'rsatuvchi Yetkazib beruvchi'}
          </label>
          <Select
            options={supplierOptions}
            value={supplierId}
            onChange={(val) => setSupplierId(val)}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-3)' }}>
          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px', display: 'block' }}>
              {isRu ? 'Сумма расхода *' : 'Xarajat Summasi *'}
            </label>
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="500 000"
              autoFocus
            />
          </div>
          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px', display: 'block' }}>
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
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px', display: 'block' }}>
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
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px', display: 'block' }}>
            {isRu ? 'Комментарий / Описание' : 'Izoh / Tavsif'}
          </label>
          <Input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={isRu ? 'Например: Транспорт фуры Ташкент-Самарканд' : 'Masalan: Toshkent-Samarqand fura transporti'}
          />
        </div>
      </form>
    </Drawer>
  );
}
