'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select, SelectOption } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { Badge } from '@/components/ui/Badge';
import {
  ShoppingCart,
  Plus,
  Eye,
  CreditCard,
  RotateCcw,
  Filter,
  Search,
  RefreshCw,
  TrendingUp,
  Users,
  Building2,
  DollarSign,
} from 'lucide-react';
import { SalesInvoice, SalesSummaryStats } from '@shared/types';
import { PaySalesInvoiceModal } from '@/components/sales/PaySalesInvoiceModal';
import { CreateSalesReturnModal } from '@/components/sales/CreateSalesReturnModal';

interface CounterpartyItem {
  id: string;
  name: string;
}

interface WarehouseItem {
  id: string;
  name: any;
}

export default function SalesPage() {
  const { token, company } = useAuth();
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  const [stats, setStats] = useState<SalesSummaryStats | null>(null);
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [counterparties, setCounterparties] = useState<CounterpartyItem[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [counterpartyId, setCounterpartyId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [status, setStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Modals
  const [payInvoice, setPayInvoice] = useState<SalesInvoice | null>(null);
  const [returnInvoice, setReturnInvoice] = useState<SalesInvoice | null>(null);

  const getLocalizedName = (name: any) => {
    if (!name) return '—';
    if (typeof name === 'string') return name;
    return name[locale] || name.ru || name.uz || Object.values(name)[0] || '—';
  };

  const fetchStats = () => {
    if (!token || !company) return;
    apiFetch<SalesSummaryStats>('/sales/summary', {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then(setStats)
      .catch((err) => console.error(err));
  };

  const fetchInvoices = () => {
    if (!token || !company) return;
    setLoading(true);

    const query = new URLSearchParams();
    if (search) query.append('search', search);
    if (counterpartyId) query.append('counterpartyId', counterpartyId);
    if (warehouseId) query.append('warehouseId', warehouseId);
    if (status) query.append('status', status);
    if (paymentStatus) query.append('paymentStatus', paymentStatus);
    if (dateFrom) query.append('dateFrom', dateFrom);
    if (dateTo) query.append('dateTo', dateTo);

    apiFetch<SalesInvoice[]>(`/sales/invoices?${query.toString()}`, {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then((res) => setInvoices(res || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchStats();
    fetchInvoices();
  }, [token, company, locale]);

  useEffect(() => {
    if (!token || !company) return;

    apiFetch<any>('/sales/counterparties', {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then((res) => setCounterparties(res?.data || (Array.isArray(res) ? res : [])))
      .catch((err) => console.error(err));

    apiFetch<any>('/tenants/warehouses', {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then((res) => setWarehouses(res?.data || (Array.isArray(res) ? res : [])))
      .catch((err) => console.error(err));
  }, [token, company, locale]);

  const handleApplyFilter = () => {
    fetchInvoices();
  };

  const handleResetFilters = () => {
    setSearch('');
    setCounterpartyId('');
    setWarehouseId('');
    setStatus('');
    setPaymentStatus('');
    setDateFrom('');
    setDateTo('');
    setTimeout(() => {
      fetchInvoices();
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
        return <Badge variant="warning">{isRu ? 'Частично' : 'Qisman to‘langan'}</Badge>;
      case 'PAID':
        return <Badge variant="success">{isRu ? 'Оплачен' : 'To‘langan'}</Badge>;
      default:
        return null;
    }
  };

  const customerOptions: SelectOption[] = [
    { value: '', label: isRu ? 'Все клиенты' : 'Barcha mijozlar' },
    ...counterparties.map((c) => ({ value: c.id, label: c.name })),
  ];

  const warehouseOptions: SelectOption[] = [
    { value: '', label: isRu ? 'Все склады' : 'Barcha omborlar' },
    ...warehouses.map((w) => ({ value: w.id, label: getLocalizedName(w.name) })),
  ];

  const statusOptions: SelectOption[] = [
    { value: '', label: isRu ? 'Все статусы' : 'Barcha holatlar' },
    { value: 'DRAFT', label: isRu ? 'Черновик' : 'Qoralama' },
    { value: 'POSTED', label: isRu ? 'Проведён' : 'Tasdiqlangan' },
    { value: 'CANCELLED', label: isRu ? 'Отменён' : 'Bekor qilingan' },
  ];

  const paymentStatusOptions: SelectOption[] = [
    { value: '', label: isRu ? 'Любой статус оплаты' : 'Barcha to‘lov holatlari' },
    { value: 'UNPAID', label: isRu ? 'Не оплачен' : 'To‘lanmagan' },
    { value: 'PARTIALLY_PAID', label: isRu ? 'Частично оплачен' : 'Qisman to‘langan' },
    { value: 'PAID', label: isRu ? 'Оплачен' : 'To‘liq to‘langan' },
  ];

  const hasActiveFilters = Boolean(search || counterpartyId || warehouseId || status || paymentStatus || dateFrom || dateTo);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            {isRu ? 'Продажи и Реализация' : 'Sotuvlar va Mahsulot Chiqimi'}
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            {isRu ? 'Накладные продажи, списание остатков со склада по FIFO, взаиморасчеты и валовая прибыль' : 'Sotuv fakturalari, ombordan FIFO bo‘yicha hisobdan chiqarish, mijoz qarzdorligi va yalpi foyda hisobi'}
          </p>
        </div>
        <Link href="/sales/new">
          <Button style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px' }}>
            <Plus size={18} /> {isRu ? 'Новая накладная продажи' : 'Yangi Sotuv Hujjati'}
          </Button>
        </Link>
      </div>

      {/* Summary KPI Cards (Purchases style) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-lg)', backgroundColor: 'rgba(99, 102, 241, 0.12)', color: 'var(--color-primary-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShoppingCart size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-tertiary)' }}>
              {isRu ? 'Продажи за месяц' : 'Shu Oydagi Sotuvlar'}
            </div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', marginTop: '2px' }} className="tabular-nums">
              {formatCurrency(stats?.monthlySalesTotal || 0, locale)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              {stats?.monthlySalesCount || 0} {isRu ? 'накладных' : 'ta faktura'}
            </div>
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-lg)', backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Building2 size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-tertiary)' }}>
              {isRu ? 'Дебиторская задолженность' : 'Mijozlarning Qarzdorligi'}
            </div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: '#ef4444', marginTop: '2px' }} className="tabular-nums">
              {formatCurrency(stats?.totalCustomerDebt || 0, locale)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              {stats?.customersWithDebtCount || 0} {isRu ? 'клиентов' : 'ta mijoz qarzdor'}
            </div>
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
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
              {isRu ? 'Сумма возвратов' : 'Qaytarilgan tovarlar'}
            </div>
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-lg)', backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TrendingUp size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-tertiary)' }}>
              {isRu ? 'Валовая прибыль' : 'Yalpi Foyda (Marja)'}
            </div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: '#10b981', marginTop: '2px' }} className="tabular-nums">
              {formatCurrency(stats?.monthlyGrossProfit || 0, locale)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              {isRu ? 'Маржинальность:' : 'Marja:'} {Number(stats?.monthlyGrossProfitMargin || 0).toFixed(1)}%
            </div>
          </div>
        </Card>
      </div>

      {/* Filter & Search Toolbar (Purchases Style) */}
      <Card style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {/* Row 1: Search Input */}
        <div>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
            {isRu ? 'Поиск (№ Накладной, Договор, Клиент, Комментарий...)' : 'Qidiruv (Hujjat №, Shartnoma, Mijoz, Izoh...)'}
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
            <input
              placeholder={isRu ? 'Введите № накладной, договор или комментарий...' : 'Qidirish uchun faktura raqami yoki izohni kiriting...'}
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
              }}
            />
          </div>
        </div>

        {/* Row 2: Filters Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 'var(--space-3)',
            alignItems: 'end',
            paddingTop: 'var(--space-2)',
            borderTop: '1px solid var(--color-border-light)',
          }}
        >
          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              {isRu ? 'Клиент' : 'Mijoz'}
            </div>
            <Select
              options={customerOptions}
              value={counterpartyId}
              onChange={setCounterpartyId}
            />
          </div>

          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              {isRu ? 'Склад' : 'Ombor'}
            </div>
            <Select
              options={warehouseOptions}
              value={warehouseId}
              onChange={setWarehouseId}
            />
          </div>

          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              {isRu ? 'Статус документа' : 'Hujjat holati'}
            </div>
            <Select
              options={statusOptions}
              value={status}
              onChange={setStatus}
            />
          </div>

          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              {isRu ? 'Статус оплаты' : 'To‘lov holati'}
            </div>
            <Select
              options={paymentStatusOptions}
              value={paymentStatus}
              onChange={setPaymentStatus}
            />
          </div>

          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              {isRu ? 'С даты' : 'Sanadan'}
            </div>
            <DatePicker value={dateFrom} onChange={setDateFrom} placeholder={isRu ? 'С даты...' : 'Sanadan...'} />
          </div>

          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              {isRu ? 'По дату' : 'Sanagacha'}
            </div>
            <DatePicker value={dateTo} onChange={setDateTo} placeholder={isRu ? 'По дату...' : 'Sanagacha...'} />
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

      {/* Invoices Table */}
      <Card style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px', display: 'block' }} />
            <div>{isRu ? 'Загрузка...' : 'Yuklanmoqda...'}</div>
          </div>
        ) : invoices.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            <ShoppingCart size={48} style={{ margin: '0 auto var(--space-3)', opacity: 0.3 }} />
            <div style={{ fontWeight: 600, fontSize: 'var(--text-base)', color: 'var(--color-text-secondary)' }}>
              {isRu ? 'Накладные продаж не найдены' : 'Sotuv fakturalari topilmadi'}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', marginTop: '4px' }}>
              {isRu ? 'Нажмите кнопку выше, чтобы создать новую накладную продажи' : 'Yangi sotuv hujjatini yaratish uchun yuqoridagi tugmani bosing'}
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-light)', backgroundColor: 'var(--color-bg-subtle)' }}>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {isRu ? '№ НАКЛАДНОЙ / ДАТА' : 'FAKTURA № / SANA'}
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {isRu ? 'КЛИЕНТ' : 'MIJOZ'}
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {isRu ? 'СКЛАД' : 'OMBOR'}
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>
                    {isRu ? 'ОБЩАЯ СУММА' : 'JAMI SUMMA'}
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>
                    {isRu ? 'ОПЛАЧЕНО' : 'TO‘LANGAN'}
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>
                    {isRu ? 'СТАТУС' : 'HOLATI'}
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>
                    {isRu ? 'ОПЛАТА' : 'TO‘LOV'}
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>
                    {isRu ? 'ДЕЙСТВИЯ' : 'AMALLAR'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    style={{
                      borderBottom: '1px solid var(--color-border-light)',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <Link href={`/sales/${inv.id}`} style={{ fontWeight: 600, color: 'var(--color-primary-600)', textDecoration: 'none' }}>
                        {inv.invoiceNumber || (inv as any).docNumber}
                      </Link>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>
                        {formatDate(inv.invoiceDate || inv.createdAt)}
                      </div>
                    </td>

                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>
                        {inv.counterparty?.name || '—'}
                      </div>
                    </td>

                    <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)' }}>
                      {getLocalizedName(inv.warehouse?.name)}
                    </td>

                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--color-text-primary)' }} className="tabular-nums">
                      {formatCurrency(Number(inv.totalAmount || 0), locale, inv.currency)}
                    </td>

                    <td style={{ padding: '12px 16px', textAlign: 'right', color: '#10b981', fontWeight: 500 }} className="tabular-nums">
                      {formatCurrency(Number(inv.paidAmount || 0), locale, inv.currency)}
                    </td>

                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      {getDocStatusBadge(inv.status)}
                    </td>

                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      {getPaymentBadge(inv.paymentStatus || 'UNPAID')}
                    </td>

                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                        <Link href={`/sales/${inv.id}`}>
                          <Button variant="secondary" style={{ padding: '4px 8px', height: '30px', fontSize: 'var(--text-xs)' }} title={isRu ? 'Просмотр / Редактирование' : 'Ko‘rish / Tahrirlash'}>
                            <Eye size={14} />
                          </Button>
                        </Link>

                        {inv.status === 'POSTED' && (
                          <>
                            <Button
                              variant="secondary"
                              onClick={() => setPayInvoice(inv)}
                              style={{ padding: '4px 8px', height: '30px', fontSize: 'var(--text-xs)', color: '#10b981' }}
                              title={isRu ? 'Принять оплату' : 'To‘lov olish'}
                            >
                              <CreditCard size={14} />
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() => setReturnInvoice(inv)}
                              style={{ padding: '4px 8px', height: '30px', fontSize: 'var(--text-xs)', color: '#f59e0b' }}
                              title={isRu ? 'Оформить возврат' : 'Qaytaruv'}
                            >
                              <RotateCcw size={14} />
                            </Button>
                          </>
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

      {/* Action Modals */}
      {payInvoice && (
        <PaySalesInvoiceModal
          isOpen={Boolean(payInvoice)}
          onClose={() => setPayInvoice(null)}
          invoice={payInvoice}
          onSuccess={() => {
            fetchStats();
            fetchInvoices();
          }}
        />
      )}

      {returnInvoice && (
        <CreateSalesReturnModal
          isOpen={Boolean(returnInvoice)}
          onClose={() => setReturnInvoice(null)}
          invoice={returnInvoice}
          onSuccess={() => {
            fetchStats();
            fetchInvoices();
          }}
        />
      )}
    </div>
  );
}
