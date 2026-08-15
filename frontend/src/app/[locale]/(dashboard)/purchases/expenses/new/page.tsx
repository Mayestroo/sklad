'use client';

import { useState, useEffect, useMemo } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { Checkbox } from '@/components/ui/Checkbox';
import { Radio } from '@/components/ui/Radio';
import { Badge } from '@/components/ui/Badge';
import {
  ArrowLeft,
  Save,
  CheckCircle2,
  Receipt,
  Truck,
  Calculator,
  Layers,
  AlertCircle,
  Building2,
  Wallet,
} from 'lucide-react';
import {
  PurchaseReceipt,
  ExpenseType,
  ExpenseAllocationMethod,
  AllocationPreviewResult,
} from '@shared/types';

interface Counterparty {
  id: string;
  name: string;
  phone?: string;
  inn?: string;
}

interface CashAccount {
  id: string;
  name: any;
  currency: string;
  balance: number;
}

export default function NewExpensePage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const router = useRouter();
  const { token, company, user } = useAuth();

  // Reference data
  const [receipts, setReceipts] = useState<PurchaseReceipt[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(true);

  // Form State
  const [docDate, setDocDate] = useState(new Date().toISOString().split('T')[0]);
  const [expenseType, setExpenseType] = useState<ExpenseType>('TRANSPORT');
  const [counterpartyId, setCounterpartyId] = useState('');
  const [receiptId, setReceiptId] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [currency, setCurrency] = useState('UZS');
  const [exchangeRate, setExchangeRate] = useState<number>(1);
  const [allocationMethod, setAllocationMethod] = useState<ExpenseAllocationMethod>('BY_AMOUNT');
  const [isPaid, setIsPaid] = useState(false);
  const [cashAccountId, setCashAccountId] = useState('');
  const [comment, setComment] = useState('');

  // Selected items from receipt
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [previewResult, setPreviewResult] = useState<AllocationPreviewResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch reference data
  useEffect(() => {
    if (!token || !company) return;
    setLoadingRefs(true);

    Promise.all([
      apiFetch<PurchaseReceipt[]>('/purchases/receipts?status=POSTED', {
        token: token || undefined,
        tenantId: company?.id || undefined,
        locale,
      }),
      apiFetch<Counterparty[]>('/sales/counterparties', {
        token: token || undefined,
        tenantId: company?.id || undefined,
        locale,
      }),
      apiFetch<CashAccount[]>('/finance/accounts', {
        token: token || undefined,
        tenantId: company?.id || undefined,
        locale,
      }),
    ])
      .then(([receiptsData, counterpartiesData, cashAccountsData]) => {
        setReceipts(receiptsData || []);
        setCounterparties(counterpartiesData || []);
        setCashAccounts(cashAccountsData || []);

        if (cashAccountsData && cashAccountsData.length > 0) {
          setCashAccountId(cashAccountsData[0].id);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoadingRefs(false));
  }, [token, company, locale]);

  // When a receipt is selected, auto-select all its items
  const selectedReceipt = useMemo(() => {
    return receipts.find((r) => r.id === receiptId) || null;
  }, [receipts, receiptId]);

  useEffect(() => {
    if (selectedReceipt?.items) {
      setSelectedItemIds(selectedReceipt.items.map((i) => i.id));
    } else {
      setSelectedItemIds([]);
      setPreviewResult(null);
    }
  }, [selectedReceipt]);

  // Recalculate preview whenever amount, allocationMethod, receipt, or selectedItemIds change
  useEffect(() => {
    if (!token || !company || !receiptId || !amount || Number(amount) <= 0 || selectedItemIds.length === 0) {
      setPreviewResult(null);
      return;
    }

    setIsCalculating(true);
    apiFetch<AllocationPreviewResult>('/purchases/additional-expenses/preview-allocation', {
      token: token || undefined,
      tenantId: company?.id || undefined,
      method: 'POST',
      body: JSON.stringify({
        receiptId,
        amount: Number(amount),
        allocationMethod,
        selectedItemIds,
      }),
      locale,
    })
      .then((res) => setPreviewResult(res))
      .catch((err) => {
        console.error('Allocation calculation error:', err);
        setPreviewResult(null);
      })
      .finally(() => setIsCalculating(false));
  }, [token, company, receiptId, amount, allocationMethod, selectedItemIds, locale]);

  const handleToggleItem = (itemId: string) => {
    if (selectedItemIds.includes(itemId)) {
      setSelectedItemIds(selectedItemIds.filter((id) => id !== itemId));
    } else {
      setSelectedItemIds([...selectedItemIds, itemId]);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked && selectedReceipt?.items) {
      setSelectedItemIds(selectedReceipt.items.map((i) => i.id));
    } else {
      setSelectedItemIds([]);
    }
  };

  const handleSubmit = async (postImmediately: boolean) => {
    setErrorMsg(null);
    if (!counterpartyId) {
      setErrorMsg(isRu ? 'Пожалуйста, выберите поставщика / перевозчика' : 'Iltimos, xizmat ko‘rsatuvchi kontragentni tanlang');
      return;
    }
    if (!receiptId) {
      setErrorMsg(isRu ? 'Пожалуйста, выберите партию закупки' : 'Iltimos, tegishli xarid hujjatini tanlang');
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setErrorMsg(isRu ? 'Сумма расхода должна быть больше 0' : 'Xarajat summasi 0 dan katta bo‘lishi kerak');
      return;
    }
    if (selectedItemIds.length === 0) {
      setErrorMsg(isRu ? 'Выберите хотя бы один товар для распределения' : 'Taqsimlash uchun kamida bitta tovar tanlang');
      return;
    }
    if (isPaid && !cashAccountId) {
      setErrorMsg(isRu ? 'Выберите кассу для списания средств' : 'To‘lov uchun kassa hisobini tanlang');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Create Draft
      const draft = await apiFetch<any>('/purchases/additional-expenses', {
        token: token || undefined,
        tenantId: company?.id || undefined,
        method: 'POST',
        body: JSON.stringify({
          docDate,
          expenseType,
          counterpartyId,
          receiptId,
          amount: Number(amount),
          currency,
          exchangeRate: Number(exchangeRate) || 1,
          allocationMethod,
          isPaid,
          cashAccountId: isPaid ? cashAccountId : undefined,
          comment,
          selectedItemIds,
        }),
        locale,
      });

      // 2. Post if requested
      if (postImmediately && draft?.id) {
        await apiFetch(`/purchases/additional-expenses/${draft.id}/post`, {
          token: token || undefined,
          tenantId: company?.id || undefined,
          method: 'POST',
          locale,
        });
      }

      router.push(`/${locale}/purchases/expenses/${draft.id}`);
    } catch (err: any) {
      setErrorMsg(err.message || (isRu ? 'Произошла ошибка при сохранении' : 'Saqlashda xatolik yuz berdi'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      {/* Top Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/purchases/expenses`)}>
            <ArrowLeft size={16} />
          </Button>
          <div>
            <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
              {isRu ? 'Новый дополнительный расход' : 'Yangi Qo‘shimcha Xarajat Kiritish'}
            </h1>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
              {isRu ? 'Распределение прямых расходов на себестоимость товаров закупки' : 'Transport, bojxona va boshqa xarajatlarni tovarlar tannarxiga taqsimlash'}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <Button variant="outline" disabled={submitting} onClick={() => handleSubmit(false)}>
            <Save size={16} style={{ marginRight: '6px' }} />
            {isRu ? 'Сохранить черновик' : 'Qoralamani saqlash'}
          </Button>
          <Button disabled={submitting} onClick={() => handleSubmit(true)}>
            <CheckCircle2 size={16} style={{ marginRight: '6px' }} />
            {isRu ? 'Провести и распределить' : 'Tasdiqlash va Taqsimlash'}
          </Button>
        </div>
      </div>

      {errorMsg && (
        <div style={{ padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-danger-50)', color: 'var(--color-danger-700)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-sm)' }}>
          <AlertCircle size={18} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Grid: Parameters & Selection */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-5)' }}>
        {/* Card 1: Expense Details */}
        <Card style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: 'var(--space-3)' }}>
            <Receipt size={20} color="var(--color-primary-600)" />
            <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)' }}>
              {isRu ? '1. Параметры расхода' : '1. Xarajat parametrlari'}
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            <div>
              <DatePicker
                label={isRu ? 'Дата расхода' : 'Xarajat sanasi'}
                value={docDate}
                onChange={(val) => setDocDate(val)}
              />
            </div>

            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>
                {isRu ? 'Тип расхода' : 'Xarajat turi'}
              </label>
              <Select
                value={expenseType}
                onChange={(val) => setExpenseType(val as ExpenseType)}
                options={[
                  { value: 'TRANSPORT', label: isRu ? 'Транспорт' : 'Transport' },
                  { value: 'CUSTOMS', label: isRu ? 'Таможня / Пошлина' : 'Bojxona / Boj' },
                  { value: 'BROKER', label: isRu ? 'Брокер' : 'Broker' },
                  { value: 'INSURANCE', label: isRu ? 'Страхование' : 'Sug‘urta' },
                  { value: 'OTHER', label: isRu ? 'Прочее' : 'Boshqa' },
                ]}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>
              {isRu ? 'Поставщик услуг / Перевозчик *' : 'Xizmat ko‘rsatuvchi kontragent *'}
            </label>
            <Select
              value={counterpartyId}
              onChange={(val) => setCounterpartyId(val)}
              placeholder={isRu ? 'Выберите поставщика...' : 'Kontragentni tanlang...'}
              options={counterparties.map((c) => ({
                value: c.id,
                label: `${c.name} ${c.phone ? `(${c.phone})` : ''}`,
              }))}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-3)' }}>
            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>
                {isRu ? 'Сумма расхода *' : 'Xarajat summasi *'}
              </label>
              <Input
                type="number"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </div>

            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>
                {isRu ? 'Валюта' : 'Valyuta'}
              </label>
              <Select
                value={currency}
                onChange={(val) => setCurrency(val)}
                options={[
                  { value: 'UZS', label: 'UZS' },
                  { value: 'USD', label: 'USD' },
                ]}
              />
            </div>
          </div>

          {/* Payment Mode */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--color-border-subtle)' }}>
            <Checkbox
              checked={isPaid}
              onChange={(e) => setIsPaid(e.target.checked)}
              label={isRu ? 'Оплатить сразу из кассы / банка' : 'Kassadan darhol to‘lov qilindi'}
            />

            {isPaid && (
              <div style={{ marginTop: '4px' }}>
                <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>
                  {isRu ? 'Касса для списания средств *' : 'Chiqim qilinadigan kassa hisobi *'}
                </label>
                <Select
                  value={cashAccountId}
                  onChange={(val) => setCashAccountId(val)}
                  options={cashAccounts.map((a) => ({
                    value: a.id,
                    label: `${(a.name as any)?.uz || a.name} (${formatCurrency(a.balance, locale, a.currency)})`,
                  }))}
                />
              </div>
            )}
          </div>

          <div>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>
              {isRu ? 'Комментарий' : 'Izoh'}
            </label>
            <Input placeholder={isRu ? 'Номер накладной, пояснение...' : 'Yuk xati raqami, izoh...'} value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
        </Card>

        {/* Card 2: Target Receipt & Method */}
        <Card style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: 'var(--space-3)' }}>
            <Truck size={20} color="var(--color-warning-600)" />
            <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)' }}>
              {isRu ? '2. Выбор закупки и метода' : '2. Xarid va taqsimot usulini tanlash'}
            </h2>
          </div>

          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>
              {isRu ? 'Партия закупки (Xarid hujjati) *' : 'Tegishli xarid hujjati *'}
            </label>
            <Select
              value={receiptId}
              onChange={(val) => setReceiptId(val)}
              placeholder={isRu ? 'Выберите закупку...' : 'Xaridni tanlang...'}
              options={receipts.map((r) => ({
                value: r.id,
                label: `${r.docNumber} — ${r.counterparty?.name || 'Поставщик'} (${formatDate(r.docDate, locale)}) [${formatCurrency(r.totalAmount, locale, r.currency)}]`,
              }))}
            />
          </div>

          {selectedReceipt && (
            <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-surface-hover)', fontSize: 'var(--text-xs)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div><strong>{isRu ? 'Поставщик:' : 'Yetkazib beruvchi:'}</strong> {selectedReceipt.counterparty?.name}</div>
              <div><strong>{isRu ? 'Склад:' : 'Ombor:'}</strong> {(selectedReceipt.warehouse?.name as any)?.uz || selectedReceipt.warehouse?.name}</div>
              <div><strong>{isRu ? 'Сумма закупки:' : 'Xarid jami summasi:'}</strong> {formatCurrency(selectedReceipt.totalAmount, locale, selectedReceipt.currency)}</div>
              <div><strong>{isRu ? 'Позиций товаров:' : 'Tovarlar soni:'}</strong> {selectedReceipt.items?.length || 0} ta</div>
            </div>
          )}

          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '8px' }}>
              {isRu ? 'Метод распределения расхода' : 'Xarajatni taqsimlash usuli'}
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <Radio
                name="allocMethod"
                value="BY_AMOUNT"
                checked={allocationMethod === 'BY_AMOUNT'}
                onChange={() => setAllocationMethod('BY_AMOUNT')}
                label={isRu ? 'По стоимости' : 'Xarid qiymatiga mutanosib'}
                description={isRu ? 'дорогие товары получают большую долю' : 'qimmatroq tovarlarga ko‘proq ulush'}
                size="sm"
              />

              <Radio
                name="allocMethod"
                value="BY_QUANTITY"
                checked={allocationMethod === 'BY_QUANTITY'}
                onChange={() => setAllocationMethod('BY_QUANTITY')}
                label={isRu ? 'По количеству' : 'Miqdoriga mutanosib'}
                description={isRu ? 'равная доля на каждую штуку' : 'har bir donaga teng taqsimlash'}
                size="sm"
              />

              <Radio
                name="allocMethod"
                value="BY_WEIGHT"
                checked={allocationMethod === 'BY_WEIGHT'}
                onChange={() => setAllocationMethod('BY_WEIGHT')}
                label={isRu ? 'По весу (кг)' : 'Vazniga mutanosib'}
                description={isRu ? 'тяжелые товары получают большую долю' : 'og‘irroq tovarlarga ko‘proq ulush'}
                size="sm"
              />
            </div>
          </div>
        </Card>
      </div>

      {/* Card 3: Interactive Items Table & Preview */}
      <Card style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calculator size={20} color="var(--color-primary-600)" />
            <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)' }}>
              {isRu ? '3. Выбор товаров и предварительный расчет себестоимости' : '3. Tovarlarni tanlash va yangi tannarx hisob-kitobi'}
            </h2>
          </div>

          {selectedReceipt?.items && selectedReceipt.items.length > 0 && (
            <Checkbox
              checked={selectedItemIds.length === selectedReceipt.items.length}
              onChange={(e) => handleSelectAll(e.target.checked)}
              label={isRu ? 'Выбрать все позиции' : 'Barcha tovarlarni belgilash'}
              size="sm"
            />
          )}
        </div>

        {!selectedReceipt ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>
            {isRu ? 'Сначала выберите партию закупки выше' : 'Avval yuqoridan tegishli xarid hujjatini tanlang'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-subtle)', textAlign: 'left', color: 'var(--color-text-secondary)' }}>
                  <th style={{ padding: '8px 12px', width: '40px' }}></th>
                  <th style={{ padding: '8px 12px', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'Товар' : 'Tovar nomi'}</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'Кол-во' : 'Miqdor'}</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'Цена закупки' : 'Xarid narxi'}</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'Сумма' : 'Jami xarid'}</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'Тек. себестоимость' : 'Amaldagi tannarx'}</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'var(--font-semibold)', color: 'var(--color-warning-600)' }}>
                    {isRu ? 'Расход на поз.' : 'Taqsimlangan xarajat'}
                  </th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'var(--font-semibold)', color: 'var(--color-warning-600)' }}>
                    {isRu ? 'Расход / ед.' : 'Xarajat / dona'}
                  </th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'var(--font-bold)', color: 'var(--color-primary-600)' }}>
                    {isRu ? 'Новая себестоимость' : 'Yangi tannarx'}
                  </th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'Прирост %' : 'O‘sish %'}</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'Склад / Продано' : 'Ombor / Sotilgan'}</th>
                </tr>
              </thead>
              <tbody>
                {selectedReceipt.items?.map((item) => {
                  const isSelected = selectedItemIds.includes(item.id);
                  const preview = previewResult?.items.find((p) => p.receiptItemId === item.id);

                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: '1px solid var(--color-border-subtle)',
                        backgroundColor: isSelected ? 'transparent' : 'var(--color-surface-hover)',
                        opacity: isSelected ? 1 : 0.6,
                      }}
                    >
                      <td style={{ padding: '8px 12px' }}>
                        <Checkbox
                          checked={isSelected}
                          onChange={() => handleToggleItem(item.id)}
                          size="sm"
                        />
                      </td>
                      <td style={{ padding: '8px 12px', fontWeight: 'var(--font-medium)' }}>
                        {(item.product?.name as any)?.uz || item.product?.name}
                        <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>{item.product?.sku}</div>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }} className="tabular-nums">
                        {Number(item.quantity)} {item.product?.unitOfMeasure}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }} className="tabular-nums">
                        {formatCurrency(item.unitPrice, locale)}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }} className="tabular-nums">
                        {formatCurrency(item.totalPrice, locale)}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }} className="tabular-nums">
                        {formatCurrency(item.landedCost || item.unitPrice, locale)}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'var(--font-semibold)', color: 'var(--color-warning-700)' }} className="tabular-nums">
                        {preview ? formatCurrency(preview.allocatedAmount, locale) : '—'}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--color-warning-700)' }} className="tabular-nums">
                        {preview ? `+${formatCurrency(preview.allocatedPerUnit, locale)}` : '—'}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'var(--font-bold)', color: 'var(--color-primary-600)' }} className="tabular-nums">
                        {preview ? formatCurrency(preview.newLandedCost, locale) : formatCurrency(item.landedCost || item.unitPrice, locale)}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'var(--font-semibold)' }} className="tabular-nums">
                        {preview && preview.costIncreasePercent > 0 ? `+${preview.costIncreasePercent.toFixed(1)}%` : '0%'}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        {preview ? (
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            <span style={{ color: 'var(--color-success-600)', fontWeight: 'var(--font-medium)' }}>{preview.remainingQuantity} omborda</span>
                            {preview.soldQuantity > 0 && (
                              <span style={{ color: 'var(--color-warning-600)' }}>/ {preview.soldQuantity} sotilgan</span>
                            )}
                          </div>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer Summary */}
        {previewResult && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', backgroundColor: 'var(--color-primary-50)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary-900)' }}>
              <strong>{isRu ? 'Контроль распределения:' : 'Taqsimot nazorati:'}</strong> {isRu ? 'Сумма строго сходится' : 'Taqsimlangan jami summa xarajat summasiga 100% teng'}
            </div>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-bold)', color: 'var(--color-primary-900)' }} className="tabular-nums">
              {isRu ? 'Итого распределено:' : 'Jami taqsimlandi:'} {formatCurrency(previewResult.allocatedTotal, locale)} {currency}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
