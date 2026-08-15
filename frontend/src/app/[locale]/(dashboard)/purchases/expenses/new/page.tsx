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
  Coins,
  Scale,
  Boxes,
  Percent,
  Check,
  TrendingUp,
  Sparkles,
  RefreshCw,
  HelpCircle,
  FileSpreadsheet,
  ChevronRight,
  ShieldCheck,
  Info,
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

  // Step Completion Checks
  const isStep1Done = Boolean(docDate && expenseType && counterpartyId && amount && Number(amount) > 0);
  const isStep2Done = Boolean(receiptId && allocationMethod);
  const isStep3Done = Boolean(selectedItemIds.length > 0 && previewResult);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', width: '100%', paddingBottom: 'var(--space-8)' }}>
      {/* ─── Header & Toolbar ─── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
          paddingBottom: 'var(--space-2)',
          borderBottom: '1px solid var(--color-border-light)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/${locale}/purchases/expenses`)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <ArrowLeft size={18} /> {isRu ? 'К списку расходов' : 'Xarajatlar ro‘yxatiga'}
          </Button>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
                {isRu ? 'Новый дополнительный расход' : 'Yangi Qo‘shimcha Xarajat Kiritish'}
              </h1>
              <Badge variant="warning">{isRu ? 'Черновик' : 'Qoralama'}</Badge>
            </div>
          </div>
        </div>

        {/* Action Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <Button
            variant="secondary"
            disabled={submitting}
            onClick={() => handleSubmit(false)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Save size={16} /> {isRu ? 'Сохранить черновик' : 'Qoralama saqlash'}
          </Button>
          <Button
            disabled={submitting || !counterpartyId || !receiptId || !amount || Number(amount) <= 0 || selectedItemIds.length === 0}
            onClick={() => handleSubmit(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'var(--color-success-600)',
            }}
          >
            {submitting ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : (
              <CheckCircle2 size={16} />
            )}
            {isRu ? 'Провести и распределить' : 'Tasdiqlash va Taqsimlash'}
          </Button>
        </div>
      </div>


      {errorMsg && (
        <div
          style={{
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-danger-50)',
            border: '1px solid var(--color-danger-100)',
            color: 'var(--color-danger-600)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: 'var(--text-sm)',
            boxShadow: 'var(--shadow-xs)',
          }}
        >
          <AlertCircle size={20} />
          <span style={{ fontWeight: 'var(--font-medium)' }}>{errorMsg}</span>
        </div>
      )}

      {/* ─── Grid: Parameters & Selection ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 'var(--space-5)' }}>
        {/* Card 1: Expense Details */}
        <Card
          style={{
            padding: 'var(--space-5)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
            backgroundColor: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          {/* Card Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border-light)', paddingBottom: 'var(--space-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-primary-50)',
                  border: '1px solid var(--color-primary-100)',
                  color: 'var(--color-primary-600)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Receipt size={18} />
              </div>
              <div>
                <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
                  {isRu ? '1. Параметры расхода' : '1. Xarajat parametrlari'}
                </h2>
                <p style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                  {isRu ? 'Дата, тип, сумма и поставщик услуги' : 'Sana, xarajat turi, summa va kontragent'}
                </p>
              </div>
            </div>
            {isStep1Done && <Badge variant="success">{isRu ? 'Готово' : 'Tayyor'}</Badge>}
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
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '6px' }}>
                {isRu ? 'Тип расхода' : 'Xarajat turi'}
              </label>
              <Select
                value={expenseType}
                onChange={(val) => setExpenseType(val as ExpenseType)}
                options={[
                  { value: 'TRANSPORT', label: isRu ? 'Транспорт / Доставка' : 'Transport / Yetkazish' },
                  { value: 'CUSTOMS', label: isRu ? 'Таможня / Пошлина' : 'Bojxona / Boj' },
                  { value: 'BROKER', label: isRu ? 'Брокерские услуги' : 'Brokerlik xizmati' },
                  { value: 'INSURANCE', label: isRu ? 'Страхование груза' : 'Yuk sug‘urtasi' },
                  { value: 'OTHER', label: isRu ? 'Прочие расходы' : 'Boshqa xarajatlar' },
                ]}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '6px' }}>
              {isRu ? 'Поставщик услуг / Перевозчик *' : 'Xizmat ko‘rsatuvchi kontragent *'}
            </label>
            <Select
              searchable
              value={counterpartyId}
              onChange={(val) => setCounterpartyId(val)}
              placeholder={isRu ? 'Выберите или найдите поставщика...' : 'Kontragentni qidiring yoki tanlang...'}
              options={counterparties.map((c) => ({
                value: c.id,
                label: `${c.name}${c.phone ? ` (${c.phone})` : ''}`,
              }))}
            />
          </div>

          {/* Amount & Currency */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-3)' }}>
            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '6px' }}>
                {isRu ? 'Сумма расхода *' : 'Xarajat summasi *'}
              </label>
              <div style={{ position: 'relative' }}>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  style={{
                    fontSize: 'var(--text-base)',
                    fontWeight: 'var(--font-bold)',
                    color: 'var(--color-text-primary)',
                    letterSpacing: '0.02em',
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '6px' }}>
                {isRu ? 'Валюта' : 'Valyuta'}
              </label>
              <Select
                value={currency}
                onChange={(val) => setCurrency(val)}
                options={[
                  { value: 'UZS', label: 'UZS (So‘m)' },
                  { value: 'USD', label: 'USD ($)' },
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
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '6px' }}>
              {isRu ? 'Комментарий / Номер накладной' : 'Izoh / Yuk xati raqami'}
            </label>
            <Input
              placeholder={isRu ? 'Например: ТТН №48291, рейс Ташкент-Самарканд...' : 'Masalan: TTN №48291, Toshkent-Samarqand reysi...'}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
        </Card>

        {/* Card 2: Target Receipt & Method */}
        <Card
          style={{
            padding: 'var(--space-5)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
            backgroundColor: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          {/* Card Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border-light)', paddingBottom: 'var(--space-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-warning-50)',
                  border: '1px solid var(--color-warning-100)',
                  color: 'var(--color-warning-600)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Truck size={18} />
              </div>
              <div>
                <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
                  {isRu ? '2. Выбор закупки и метода' : '2. Xarid va taqsimot usulini tanlash'}
                </h2>
                <p style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                  {isRu ? 'Целевая партия и формула распределения' : 'Qaysi xaridga va qanday formula bilan taqsimlash'}
                </p>
              </div>
            </div>
            {isStep2Done && <Badge variant="success">{isRu ? 'Tanlandi' : 'Tanlandi'}</Badge>}
          </div>

          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '6px' }}>
              {isRu ? 'Партия закупки (Xarid hujjati) *' : 'Tegishli xarid hujjati *'}
            </label>
            <Select
              searchable
              value={receiptId}
              onChange={(val) => setReceiptId(val)}
              placeholder={isRu ? 'Выберите или найдите партию закупки...' : 'Xarid hujjatini qidiring yoki tanlang...'}
              options={receipts.map((r) => ({
                value: r.id,
                label: `${r.docNumber} — ${r.counterparty?.name || 'Yetkazib beruvchi'} (${formatDate(r.docDate, locale)}) [${formatCurrency(r.totalAmount, locale, r.currency)}]`,
              }))}
            />
          </div>

          {/* Selected Receipt Info Widget */}
          {selectedReceipt ? (
            <div
              style={{
                padding: 'var(--space-3) var(--space-4)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-bg-tertiary)',
                border: '1px solid var(--color-border)',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                fontSize: 'var(--text-xs)',
              }}
            >
              <div>
                <span style={{ color: 'var(--color-text-tertiary)', display: 'block', fontSize: '10px' }}>
                  {isRu ? 'Поставщик' : 'Yetkazib beruvchi'}
                </span>
                <strong style={{ color: 'var(--color-text-primary)' }}>{selectedReceipt.counterparty?.name || '—'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-tertiary)', display: 'block', fontSize: '10px' }}>
                  {isRu ? 'Склад назначения' : 'Ombor'}
                </span>
                <strong style={{ color: 'var(--color-text-primary)' }}>
                  {(selectedReceipt.warehouse?.name as any)?.uz || selectedReceipt.warehouse?.name || 'Asosiy ombor'}
                </strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-tertiary)', display: 'block', fontSize: '10px' }}>
                  {isRu ? 'Сумма закупки' : 'Xarid summasi'}
                </span>
                <strong style={{ color: 'var(--color-primary-600)' }}>
                  {formatCurrency(selectedReceipt.totalAmount, locale, selectedReceipt.currency)}
                </strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-tertiary)', display: 'block', fontSize: '10px' }}>
                  {isRu ? 'Товаров в партии' : 'Tovarlar soni'}
                </span>
                <strong style={{ color: 'var(--color-text-primary)' }}>{selectedReceipt.items?.length || 0} xil tovar</strong>
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-bg-tertiary)',
                border: '1px dashed var(--color-border)',
                color: 'var(--color-text-tertiary)',
                fontSize: '11px',
                textAlign: 'center',
              }}
            >
              <Info size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
              {isRu ? 'Выберите закупку для просмотра товаров' : 'Tovarlarni ko‘rish uchun yuqoridan xarid hujjatini tanlang'}
            </div>
          )}

          {/* Segmented Interactive Allocation Method Selection */}
          <div>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '8px' }}>
              {isRu ? 'Метод распределения расхода' : 'Xarajatni taqsimlash usuli (Formula)'}
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Option 1: BY_AMOUNT */}
              <div
                onClick={() => setAllocationMethod('BY_AMOUNT')}
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: allocationMethod === 'BY_AMOUNT' ? '2px solid var(--color-primary-600)' : '1px solid var(--color-border)',
                  backgroundColor: allocationMethod === 'BY_AMOUNT' ? 'var(--color-primary-50)' : 'var(--color-bg-tertiary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'all var(--transition-fast)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: allocationMethod === 'BY_AMOUNT' ? 'var(--color-primary-600)' : 'var(--color-bg-hover)',
                      color: allocationMethod === 'BY_AMOUNT' ? '#ffffff' : 'var(--color-text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Coins size={16} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
                        {isRu ? 'По стоимости (Xarid qiymatiga mutanosib)' : 'Xarid qiymatiga mutanosib'}
                      </span>
                      <span
                        style={{
                          fontSize: '10px',
                          padding: '1px 6px',
                          borderRadius: 'var(--radius-full)',
                          backgroundColor: 'var(--color-success-50)',
                          color: 'var(--color-success-600)',
                          fontWeight: 'var(--font-bold)',
                        }}
                      >
                        {isRu ? 'Рекомендуется' : 'Tavsiya'}
                      </span>
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '1px' }}>
                      {isRu ? 'Дорогие товары получают большую долю расхода' : 'Qimmatroq tovarlarga qiymatiga qarab ko‘proq ulush'}
                    </p>
                  </div>
                </div>
                {allocationMethod === 'BY_AMOUNT' && (
                  <div style={{ width: '18px', height: '18px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-primary-600)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Check size={12} />
                  </div>
                )}
              </div>

              {/* Option 2: BY_QUANTITY */}
              <div
                onClick={() => setAllocationMethod('BY_QUANTITY')}
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: allocationMethod === 'BY_QUANTITY' ? '2px solid var(--color-primary-600)' : '1px solid var(--color-border)',
                  backgroundColor: allocationMethod === 'BY_QUANTITY' ? 'var(--color-primary-50)' : 'var(--color-bg-tertiary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'all var(--transition-fast)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: allocationMethod === 'BY_QUANTITY' ? 'var(--color-primary-600)' : 'var(--color-bg-hover)',
                      color: allocationMethod === 'BY_QUANTITY' ? '#ffffff' : 'var(--color-text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Boxes size={16} />
                  </div>
                  <div>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
                      {isRu ? 'По количеству (Miqdoriga mutanosib)' : 'Miqdoriga mutanosib'}
                    </span>
                    <p style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '1px' }}>
                      {isRu ? 'Равная доля расхода на каждую единицу/штуку' : 'Har bir donaga / dona hajmiga teng taqsimlash'}
                    </p>
                  </div>
                </div>
                {allocationMethod === 'BY_QUANTITY' && (
                  <div style={{ width: '18px', height: '18px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-primary-600)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Check size={12} />
                  </div>
                )}
              </div>

              {/* Option 3: BY_WEIGHT */}
              <div
                onClick={() => setAllocationMethod('BY_WEIGHT')}
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: allocationMethod === 'BY_WEIGHT' ? '2px solid var(--color-primary-600)' : '1px solid var(--color-border)',
                  backgroundColor: allocationMethod === 'BY_WEIGHT' ? 'var(--color-primary-50)' : 'var(--color-bg-tertiary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'all var(--transition-fast)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: allocationMethod === 'BY_WEIGHT' ? 'var(--color-primary-600)' : 'var(--color-bg-hover)',
                      color: allocationMethod === 'BY_WEIGHT' ? '#ffffff' : 'var(--color-text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Scale size={16} />
                  </div>
                  <div>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
                      {isRu ? 'По весу (Vazniga mutanosib, кг)' : 'Vazniga mutanosib (kg)'}
                    </span>
                    <p style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '1px' }}>
                      {isRu ? 'Тяжелые товары получают большую долю' : 'Og‘irroq tovarlarga ko‘proq ulush'}
                    </p>
                  </div>
                </div>
                {allocationMethod === 'BY_WEIGHT' && (
                  <div style={{ width: '18px', height: '18px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-primary-600)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Check size={12} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* ─── Card 3: Interactive Items Table & Preview ─── */}
      <Card
        style={{
          padding: 'var(--space-5)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
          backgroundColor: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)', borderBottom: '1px solid var(--color-border-light)', paddingBottom: 'var(--space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-primary-50)',
                border: '1px solid var(--color-primary-100)',
                color: 'var(--color-primary-600)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Calculator size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
                {isRu ? '3. Выбор товаров и расчет себестоимости' : '3. Tovarlarni tanlash va yangi tannarx hisob-kitobi'}
              </h2>
              <p style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                {isRu
                  ? 'Выберите позиции, на которые будет распределен расход'
                  : 'Xarajat qaysi tovarlarga taqsimlanishini belgilang va yangi tannarxni ko‘ring'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            {isCalculating && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '3px 10px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'var(--color-warning-50)',
                  color: 'var(--color-warning-600)',
                  fontSize: '11px',
                  fontWeight: 'var(--font-medium)',
                }}
              >
                <RefreshCw size={12} className="animate-spin" />
                {isRu ? 'Пересчет...' : 'Hisoblanmoqda...'}
              </span>
            )}

            {selectedReceipt?.items && selectedReceipt.items.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-bg-tertiary)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <Checkbox
                  checked={selectedItemIds.length === selectedReceipt.items.length}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  label={isRu ? 'Все позиции' : 'Barcha tovarlar'}
                  size="sm"
                />
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 'var(--font-bold)',
                    color: selectedItemIds.length > 0 ? 'var(--color-primary-600)' : 'var(--color-text-tertiary)',
                  }}
                >
                  ({selectedItemIds.length} / {selectedReceipt.items.length})
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Empty State vs Loaded Table */}
        {!selectedReceipt ? (
          <div
            style={{
              padding: 'var(--space-12) var(--space-6)',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'var(--space-3)',
              backgroundColor: 'var(--color-bg-tertiary)',
              borderRadius: 'var(--radius-lg)',
              border: '1px dashed var(--color-border)',
            }}
          >
            <div
              style={{
                width: '60px',
                height: '60px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--color-primary-50)',
                color: 'var(--color-primary-600)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '4px',
              }}
            >
              <FileSpreadsheet size={28} />
            </div>
            <div style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
              {isRu ? 'Сначала выберите партию закупки выше' : 'Avval yuqoridan tegishli xarid hujjatini tanlang'}
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', maxWidth: '480px', lineHeight: 1.5 }}>
              {isRu
                ? 'После выбора закупки здесь появится подробная таблица товаров с автоматическим расчетом прироста себестоимости.'
                : 'Xarid hujjati tanlangach, uning tovarlari va har birining yangi tannarxi ushbu jadvalda real-vaqtda hisoblab ko‘rsatiladi.'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-light)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)', textAlign: 'left' }}>
              <thead>
                <tr
                  style={{
                    backgroundColor: 'var(--color-bg-tertiary)',
                    borderBottom: '1px solid var(--color-border)',
                    color: 'var(--color-text-secondary)',
                    fontWeight: 'var(--font-semibold)',
                  }}
                >
                  <th style={{ padding: '10px 12px', width: '40px', textAlign: 'center' }}>#</th>
                  <th style={{ padding: '10px 12px' }}>{isRu ? 'Товар / Номенклатура' : 'Tovar nomi'}</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>{isRu ? 'Кол-во' : 'Miqdor'}</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>{isRu ? 'Цена закупки' : 'Xarid narxi'}</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>{isRu ? 'Сумма' : 'Jami xarid'}</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>{isRu ? 'Тек. себестоимость' : 'Amaldagi tannarx'}</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--color-warning-600)' }}>
                    {isRu ? '+Расход на поз.' : '+Taqsimlangan xarajat'}
                  </th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--color-warning-600)' }}>
                    {isRu ? '+Расход / ед.' : '+Xarajat / dona'}
                  </th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--color-primary-600)', fontWeight: 'var(--font-bold)' }}>
                    {isRu ? 'Новая себестоимость' : 'Yangi tannarx'}
                  </th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>{isRu ? 'Прирост %' : 'O‘sish %'}</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>{isRu ? 'Остаток / Продано' : 'Ombor / Sotilgan'}</th>
                </tr>
              </thead>
              <tbody>
                {selectedReceipt.items?.map((item, idx) => {
                  const isSelected = selectedItemIds.includes(item.id);
                  const preview = previewResult?.items.find((p) => p.receiptItemId === item.id);

                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: '1px solid var(--color-border-light)',
                        backgroundColor: isSelected ? 'transparent' : 'var(--color-bg-tertiary)',
                        opacity: isSelected ? 1 : 0.45,
                        transition: 'all var(--transition-fast)',
                      }}
                    >
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <Checkbox
                          checked={isSelected}
                          onChange={() => handleToggleItem(item.id)}
                          size="sm"
                        />
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)' }}>
                          {(item.product?.name as any)?.uz || item.product?.name}
                        </div>
                        {item.product?.sku && (
                          <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', marginTop: '1px' }}>
                            SKU: {item.product?.sku}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 'var(--font-medium)' }} className="tabular-nums">
                        {Number(item.quantity)} {item.product?.unitOfMeasure || 'dona'}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--color-text-secondary)' }} className="tabular-nums">
                        {formatCurrency(item.unitPrice, locale)}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--color-text-secondary)' }} className="tabular-nums">
                        {formatCurrency(item.totalPrice, locale)}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--color-text-secondary)' }} className="tabular-nums">
                        {formatCurrency(item.landedCost || item.unitPrice, locale)}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 'var(--font-semibold)', color: 'var(--color-warning-600)' }} className="tabular-nums">
                        {preview ? formatCurrency(preview.allocatedAmount, locale) : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--color-warning-600)', fontWeight: 'var(--font-medium)' }} className="tabular-nums">
                        {preview ? `+${formatCurrency(preview.allocatedPerUnit, locale)}` : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 'var(--font-bold)', color: 'var(--color-primary-600)', fontSize: 'var(--text-sm)' }} className="tabular-nums">
                        {preview ? formatCurrency(preview.newLandedCost, locale) : formatCurrency(item.landedCost || item.unitPrice, locale)}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }} className="tabular-nums">
                        {preview && preview.costIncreasePercent > 0 ? (
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-full)',
                              fontSize: '11px',
                              fontWeight: 'var(--font-bold)',
                              backgroundColor: 'var(--color-warning-50)',
                              color: 'var(--color-warning-600)',
                              border: '1px solid var(--color-warning-100)',
                            }}
                          >
                            +{preview.costIncreasePercent.toFixed(1)}%
                          </span>
                        ) : (
                          <span style={{ color: 'var(--color-text-tertiary)', fontSize: '11px' }}>0%</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        {preview ? (
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' }}>
                            <span
                              style={{
                                padding: '1px 6px',
                                borderRadius: 'var(--radius-sm)',
                                fontSize: '10px',
                                fontWeight: 'var(--font-medium)',
                                backgroundColor: 'var(--color-success-50)',
                                color: 'var(--color-success-600)',
                              }}
                            >
                              {preview.remainingQuantity} omborda
                            </span>
                            {preview.soldQuantity > 0 && (
                              <span
                                style={{
                                  padding: '1px 6px',
                                  borderRadius: 'var(--radius-sm)',
                                  fontSize: '10px',
                                  fontWeight: 'var(--font-medium)',
                                  backgroundColor: 'var(--color-warning-50)',
                                  color: 'var(--color-warning-600)',
                                }}
                              >
                                {preview.soldQuantity} sotilgan
                              </span>
                            )}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ─── Footer Calculation Summary ─── */}
        {previewResult && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 'var(--space-4)',
              padding: 'var(--space-4) var(--space-5)',
              backgroundColor: 'var(--color-primary-50)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-primary-200)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'var(--color-primary-600)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ShieldCheck size={16} />
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)', color: 'var(--color-primary-900)' }}>
                  {isRu ? 'Контроль точности распределения (100%)' : 'Taqsimot aniqligi 100% nazorat ostida'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--color-primary-700)' }}>
                  {isRu
                    ? 'Сумма расхода копейка в копейку распределена на выбранные позиции'
                    : 'Kiritilgan xarajat tovarlarga to‘liq va mutanosib taqsimlandi'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-6)' }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--color-primary-700)', display: 'block' }}>
                  {isRu ? 'Позиций выбрано' : 'Tanlangan tovarlar'}
                </span>
                <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--color-primary-900)' }}>
                  {selectedItemIds.length} ta
                </strong>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '11px', color: 'var(--color-primary-700)', display: 'block' }}>
                  {isRu ? 'Итого распределено' : 'Jami taqsimlandi'}
                </span>
                <strong style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)', color: 'var(--color-primary-900)' }} className="tabular-nums">
                  {formatCurrency(previewResult.allocatedTotal, locale)} {currency}
                </strong>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
