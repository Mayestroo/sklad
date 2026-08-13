'use client';

import { AllocateExpenseModal } from '@/components/purchases/AllocateExpenseModal';
import { CreateReturnModal } from '@/components/purchases/CreateReturnModal';
import { PayPurchaseModal } from '@/components/purchases/PayPurchaseModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DatePicker } from '@/components/ui/DatePicker';
import { Select, SelectOption } from '@/components/ui/Select';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { PurchaseReceipt, PurchaseSummaryStats } from '@shared/types';
import {
  Building2,
  CreditCard,
  Eye,
  Filter,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingBag,
  Truck
} from 'lucide-react';
import { useEffect, useState } from 'react';

interface CounterpartyItem {
  id: string;
  name: string;
}

interface WarehouseItem {
  id: string;
  name: any;
}

export default function PurchasesPage() {
  const { token, company } = useAuth();
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  const [stats, setStats] = useState<PurchaseSummaryStats | null>(null);
  const [receipts, setReceipts] = useState<PurchaseReceipt[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [counterpartyId, setCounterpartyId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [status, setStatus] = useState('');
  const [currency, setCurrency] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Dropdown reference lists
  const [counterparties, setCounterparties] = useState<CounterpartyItem[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);

  // Modals state
  const [expenseReceipt, setExpenseReceipt] = useState<PurchaseReceipt | null>(null);
  const [returnReceipt, setReturnReceipt] = useState<PurchaseReceipt | null>(null);
  const [payReceipt, setPayReceipt] = useState<PurchaseReceipt | null>(null);

  const fetchStats = () => {
    if (!token || !company) return;
    apiFetch<PurchaseSummaryStats>('/purchases/summary', {
      token: token || undefined,
      tenantId: company?.id ? company.id : undefined,
      locale,
    })
      .then(setStats)
      .catch((err) => console.error(err));
  };

  const fetchReceipts = () => {
    if (!token || !company) return;
    setLoading(true);

    const query = new URLSearchParams();
    if (search) query.append('search', search);
    if (counterpartyId) query.append('counterpartyId', counterpartyId);
    if (warehouseId) query.append('warehouseId', warehouseId);
    if (status) query.append('status', status);
    if (currency) query.append('currency', currency);
    if (dateFrom) query.append('dateFrom', dateFrom);
    if (dateTo) query.append('dateTo', dateTo);

    apiFetch<PurchaseReceipt[]>(`/purchases/receipts?${query.toString()}`, {
      token: token || undefined,
      tenantId: company?.id ? company.id : undefined,
      locale,
    })
      .then((res) => setReceipts(res || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchStats();
    fetchReceipts();
  }, [token, company, locale]);

  useEffect(() => {
    if (!token || !company) return;

    apiFetch<CounterpartyItem[]>('/sales/counterparties', {
      token: token || undefined,
      tenantId: company?.id ? company.id : undefined,
      locale,
    })
      .then((res) => setCounterparties(res || []))
      .catch((err) => console.error(err));

    apiFetch<WarehouseItem[]>('/tenants/warehouses', {
      token: token || undefined,
      tenantId: company?.id ? company.id : undefined,
      locale,
    })
      .then((res) => setWarehouses(res || []))
      .catch((err) => console.error(err));
  }, [token, company, locale]);

  const handleApplyFilter = () => {
    fetchReceipts();
  };

  const handleResetFilters = () => {
    setSearch('');
    setCounterpartyId('');
    setWarehouseId('');
    setStatus('');
    setCurrency('');
    setDateFrom('');
    setDateTo('');
    setTimeout(() => {
      fetchReceipts();
    }, 0);
  };

  const getDocStatusBadge = (st: string) => {
    switch (st) {
      case 'DRAFT':
        return <Badge variant="warning">{isRu ? 'Черновик' : 'Qoralama'}</Badge>;
      case 'POSTED':
        return <Badge variant="success">{isRu ? 'Проведён' : 'Tasdiqlangan'}</Badge>;
      case 'CANCELLED':
        return <Badge variant="error">{isRu ? 'Отменён' : 'Bekor qilingan'}</Badge>;
      default:
        return <Badge variant="neutral">{st}</Badge>;
    }
  };

  const getPaymentBadge = (pst: string) => {
    switch (pst) {
      case 'UNPAID':
        return <Badge variant="error">{isRu ? 'Не оплачен' : 'To‘lanmagan'}</Badge>;
      case 'PARTIALLY_PAID':
        return <Badge variant="warning">{isRu ? 'Частично оплачен' : 'Qisman to‘langan'}</Badge>;
      case 'PAID':
        return <Badge variant="success">{isRu ? 'Оплачен' : 'To‘liq to‘langan'}</Badge>;
      default:
        return null;
    }
  };

  const getReturnBadge = (rst: string) => {
    switch (rst) {
      case 'PARTIALLY_RETURNED':
        return <Badge variant="warning">{isRu ? 'Частичный возврат' : 'Qisman qaytarilgan'}</Badge>;
      case 'FULLY_RETURNED':
        return <Badge variant="error">{isRu ? 'Полный возврат' : 'To‘liq qaytarilgan'}</Badge>;
      default:
        return null;
    }
  };

  const getProductName = (name: any) => {
    if (!name) return '—';
    if (typeof name === 'string') return name;
    return name[locale] || name.ru || name.uz || Object.values(name)[0] || '—';
  };

  const supplierOptions: SelectOption[] = [
    { value: '', label: isRu ? 'Все поставщики' : 'Barcha Yetkazib beruvchilar' },
    ...counterparties.map((c) => ({ value: c.id, label: c.name })),
  ];

  const warehouseOptions: SelectOption[] = [
    { value: '', label: isRu ? 'Все склады' : 'Barcha Omborlar' },
    ...warehouses.map((w) => ({ value: w.id, label: getProductName(w.name) })),
  ];

  const statusOptions: SelectOption[] = [
    { value: '', label: isRu ? 'Все статусы' : 'Barcha Holatlar' },
    { value: 'DRAFT', label: isRu ? 'Черновик' : 'Qoralama' },
    { value: 'POSTED', label: isRu ? 'Проведён' : 'Tasdiqlangan' },
    { value: 'CANCELLED', label: isRu ? 'Отменён' : 'Bekor qilingan' },
  ];

  const hasActiveFilters = Boolean(search || counterpartyId || warehouseId || status || dateFrom || dateTo);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            {isRu ? 'Закупки и Приход Товаров' : 'Xaridlar va Tovar Qabul Qilish'}
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            {isRu ? 'Приход товаров от поставщиков, формирование себестоимости (Landed Cost) и учёт задолженности' : 'Yetkazib beruvchilardan tovar kirim qilish, tannarx (`Landed Cost`) shakllantirish va qarzdorlik hisobi'}
          </p>
        </div>
        <Link href="/purchases/new">
          <Button style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px' }}>
            <Plus size={18} /> {isRu ? 'Новый приходный документ' : 'Yangi Xarid Hujjati'}
          </Button>
        </Link>
      </div>

      {/* Summary KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)', transition: 'transform 0.2s ease, box-shadow 0.2s ease' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-lg)', backgroundColor: 'rgba(99, 102, 241, 0.12)', color: 'var(--color-primary-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShoppingBag size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-tertiary)' }}>
              {isRu ? 'Закупки за месяц' : 'Shu Oydagi Xaridlar'}
            </div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', marginTop: '2px' }} className="tabular-nums">
              {formatCurrency(stats?.monthlyPurchasesTotal || 0, locale)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              {stats?.monthlyPurchasesCount || 0} {isRu ? 'документов' : 'ta hujjat'}
            </div>
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)', transition: 'transform 0.2s ease, box-shadow 0.2s ease' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-lg)', backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Building2 size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-tertiary)' }}>
              {isRu ? 'Долг поставщикам' : 'Yetkazib Beruvchilarga Qarzimiz'}
            </div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: '#ef4444', marginTop: '2px' }} className="tabular-nums">
              {formatCurrency(stats?.totalSupplierDebt || 0, locale)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              {stats?.suppliersWithDebtCount || 0} {isRu ? 'контрагентам' : 'ta kontragent oldida'}
            </div>
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)', transition: 'transform 0.2s ease, box-shadow 0.2s ease' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-lg)', backgroundColor: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <RotateCcw size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-tertiary)' }}>
              {isRu ? 'Возвраты (За месяц)' : 'Qaytarishlar (Shu oy)'}
            </div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: '#f59e0b', marginTop: '2px' }} className="tabular-nums">
              {formatCurrency(stats?.monthlyReturnsTotal || 0, locale)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              {stats?.monthlyReturnsCount || 0} {isRu ? 'возвратов' : 'ta qaytaruv'}
            </div>
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)', transition: 'transform 0.2s ease, box-shadow 0.2s ease' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-lg)', backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Truck size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-tertiary)' }}>
              {isRu ? 'Активные поставщики' : 'Faol Yetkazib Beruvchilar'}
            </div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: '#10b981', marginTop: '2px' }} className="tabular-nums">
              {stats?.activeSuppliersCount || 0} {isRu ? 'пост.' : 'ta'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              {isRu ? 'Зарегистрированные партнёры' : 'Ro‘yxatdan o‘tgan hamkorlar'}
            </div>
          </div>
        </Card>
      </div>

      {/* Filter & Search Toolbar */}
      <Card style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {/* Row 1: Search Input */}
        <div>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
            {isRu ? 'Поиск (№ Документа, ГТД, Комментарий...)' : 'Qidiruv (Hujjat №, GTD, Izoh...)'}
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
            <input
              placeholder={isRu ? 'Введите № документа, ГТД или комментарий...' : 'Qidirish uchun hujjat raqami, GTD yoki izohni kiriting...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px 10px 42px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-bg-input)',
                color: 'var(--color-text-primary)',
                fontSize: 'var(--text-sm)',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s ease',
              }}
            />
          </div>
        </div>

        {/* Row 2: Filters Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
            gap: 'var(--space-3)',
            alignItems: 'end',
            paddingTop: 'var(--space-2)',
            borderTop: '1px solid var(--color-border-light)',
          }}
        >
          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              {isRu ? 'Поставщик' : 'Yetkazib beruvchi'}
            </div>
            <Select
              options={supplierOptions}
              value={counterpartyId}
              onChange={(val) => setCounterpartyId(val)}
            />
          </div>

          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              {isRu ? 'Склад' : 'Ombor'}
            </div>
            <Select
              options={warehouseOptions}
              value={warehouseId}
              onChange={(val) => setWarehouseId(val)}
            />
          </div>

          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              {isRu ? 'Статус документа' : 'Hujjat holati'}
            </div>
            <Select
              options={statusOptions}
              value={status}
              onChange={(val) => setStatus(val)}
            />
          </div>

          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              {isRu ? 'С даты' : 'Sanadan'}
            </div>
            <DatePicker value={dateFrom} onChange={(val) => setDateFrom(val)} placeholder={isRu ? 'С даты...' : 'Sanadan...'} />
          </div>

          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              {isRu ? 'По дату' : 'Sanagacha'}
            </div>
            <DatePicker value={dateTo} onChange={(val) => setDateTo(val)} placeholder={isRu ? 'По дату...' : 'Sanagacha...'} />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" onClick={handleApplyFilter} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '38px' }}>
              <Filter size={15} /> {isRu ? 'Фильтр' : 'Filtr'}
            </Button>
            {hasActiveFilters && (
              <Button variant="secondary" onClick={handleResetFilters} title={isRu ? 'Сбросить' : 'Tozalash'} style={{ padding: '0 12px', height: '38px', color: 'var(--color-text-secondary)' }}>
                <RefreshCw size={14} />
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Receipts Table */}
      <Card style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px', display: 'block' }} />
            <div>{isRu ? 'Загрузка...' : 'Yuklanmoqda...'}</div>
          </div>
        ) : receipts.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            <ShoppingBag size={48} style={{ margin: '0 auto var(--space-3)', opacity: 0.3 }} />
            <div style={{ fontWeight: 600, fontSize: 'var(--text-base)', color: 'var(--color-text-secondary)' }}>
              {isRu ? 'Документы закупок не найдены' : 'Xarid hujjatlari topilmadi'}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', marginTop: '4px' }}>
              {isRu ? 'Нажмите кнопку выше, чтобы создать новый документ закупки' : 'Yangi xarid hujjatini yaratish uchun yuqoridagi tugmani bosing'}
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-light)', backgroundColor: 'var(--color-bg-subtle)' }}>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {isRu ? '№ ДОКУМЕНТА / ДАТА' : 'HUJJAT № / SANA'}
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {isRu ? 'ПОСТАВЩИК' : 'YETKAZIB BERUVCHI'}
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {isRu ? 'СКЛАД' : 'OMBOR'}
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>
                    {isRu ? 'ГТД / ИМПОРТ' : 'GTD / IMPORT'}
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>
                    {isRu ? 'ОБЩАЯ СУММА' : 'JAMI SUMMA'}
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>
                    {isRu ? 'ДОП. РАСХОДЫ' : 'XARAJATLAR'}
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>
                    {isRu ? 'СТАТУС И ОПЛАТА' : 'HOLATI & TO‘LOV'}
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>
                    {isRu ? 'ДЕЙСТВИЯ' : 'AMALLAR'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((r) => (
                  <tr
                    key={r.id}
                    style={{
                      borderBottom: '1px solid var(--color-border-light)',
                      transition: 'background-color 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--color-primary-600)' }}>
                        {r.docNumber}
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                        {formatDate(r.docDate, locale)}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{r.counterparty?.name || '—'}</div>
                      {r.contractNumber && (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>
                          {isRu ? 'Договор' : 'Shartnoma'}: № {r.contractNumber}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)' }}>
                      {getProductName(r.warehouse?.name)}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      {r.gtdNumber ? (
                        <Badge variant="warning">{r.gtdNumber}</Badge>
                      ) : (
                        <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--color-text-primary)' }} className="tabular-nums">
                      {formatCurrency(Number(r.totalAmount), locale)} {r.currency}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 500, color: Number(r.additionalExpensesTotal) > 0 ? '#f59e0b' : 'var(--color-text-tertiary)' }} className="tabular-nums">
                      {Number(r.additionalExpensesTotal) > 0 ? `+${formatCurrency(Number(r.additionalExpensesTotal), locale)}` : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                        {getDocStatusBadge(r.status)}
                        {getPaymentBadge(r.paymentStatus)}
                        {getReturnBadge(r.returnStatus)}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                        {r.status === 'POSTED' && r.paymentStatus !== 'PAID' && (
                          <Button
                            size="sm"
                            onClick={() => setPayReceipt(r)}
                            style={{
                              backgroundColor: 'var(--color-success-50)',
                              color: 'var(--color-success-600)',
                              border: '1px solid var(--color-success-100)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <CreditCard size={14} /> {isRu ? 'Оплатить' : 'To‘lash'}
                          </Button>
                        )}
                        <Link href={`/purchases/${r.id}`}>
                          <Button size="sm" variant="secondary" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Eye size={14} /> {isRu ? 'Просмотр' : 'Ko‘rish'}
                          </Button>
                        </Link>
                        {r.status === 'DRAFT' && (
                          <Link href={`/purchases/${r.id}`}>
                            <Button size="sm" variant="secondary">
                              {isRu ? 'Редактировать' : 'Tahrirlash'}
                            </Button>
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modals */}

      {expenseReceipt && (
        <AllocateExpenseModal
          isOpen={!!expenseReceipt}
          onClose={() => setExpenseReceipt(null)}
          receipt={expenseReceipt}
          onSuccess={() => {
            fetchStats();
            fetchReceipts();
          }}
        />
      )}

      {returnReceipt && (
        <CreateReturnModal
          isOpen={!!returnReceipt}
          onClose={() => setReturnReceipt(null)}
          receipt={returnReceipt}
          onSuccess={() => {
            fetchStats();
            fetchReceipts();
          }}
        />
      )}

      {payReceipt && (
        <PayPurchaseModal
          isOpen={!!payReceipt}
          onClose={() => setPayReceipt(null)}
          receipt={payReceipt}
          onSuccess={() => {
            fetchStats();
            fetchReceipts();
          }}
        />
      )}
    </div>
  );
}
