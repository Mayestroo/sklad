'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  Receipt,
  Truck,
  Plus,
  Building2,
  TrendingUp,
  Search,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Trash2,
  Filter,
  BarChart3,
  Layers,
} from 'lucide-react';
import { AdditionalExpense, PurchaseDocStatus, ExpenseType } from '@shared/types';

interface ExpensesResponse {
  items: AdditionalExpense[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  stats: {
    totalTransport: number;
    totalCustoms: number;
    totalBroker: number;
    totalAll: number;
  };
}

export default function ExpensesPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const router = useRouter();
  const { token, company } = useAuth();

  const [activeTab, setActiveTab] = useState<'list' | 'analytics'>('list');
  const [data, setData] = useState<ExpensesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);

  const fetchExpenses = () => {
    if (!token || !company) return;
    setLoading(true);

    const queryParams = new URLSearchParams();
    if (search) queryParams.set('search', search);
    if (statusFilter !== 'ALL') queryParams.set('status', statusFilter);
    if (typeFilter !== 'ALL') queryParams.set('expenseType', typeFilter);
    queryParams.set('page', page.toString());
    queryParams.set('limit', '20');

    apiFetch<ExpensesResponse>(`/purchases/additional-expenses?${queryParams.toString()}`, {
      token: token || undefined,
      tenantId: company?.id || undefined,
      locale,
    })
      .then((res) => setData(res))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchExpenses();
  }, [token, company, locale, search, statusFilter, typeFilter, page]);

  const handleDeleteDraft = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(isRu ? 'Вы уверены, что хотите удалить этот черновик?' : 'Ushbu qoralama xarajatni o‘chirishni xohlaysizmi?')) {
      return;
    }
    try {
      await apiFetch(`/purchases/additional-expenses/${id}`, {
        token: token || undefined,
        tenantId: company?.id || undefined,
        method: 'DELETE',
        locale,
      });
      fetchExpenses();
    } catch (err: any) {
      alert(err.message || (isRu ? 'Ошибка при удалении' : 'O‘chirishda xatolik'));
    }
  };

  const getExpenseTypeBadge = (type: ExpenseType) => {
    switch (type) {
      case 'TRANSPORT':
        return <Badge variant="warning">{isRu ? 'Транспорт' : 'Transport'}</Badge>;
      case 'CUSTOMS':
        return <Badge variant="info">{isRu ? 'Таможня' : 'Bojxona'}</Badge>;
      case 'BROKER':
        return <Badge variant="neutral">{isRu ? 'Брокер' : 'Broker'}</Badge>;
      case 'INSURANCE':
        return <Badge variant="success">{isRu ? 'Страхование' : 'Sug‘urta'}</Badge>;
      default:
        return <Badge variant="neutral">{isRu ? 'Прочее' : 'Boshqa'}</Badge>;
    }
  };

  const getStatusBadge = (status: PurchaseDocStatus) => {
    switch (status) {
      case 'DRAFT':
        return (
          <Badge variant="neutral">
            <Clock size={12} style={{ marginRight: '4px' }} />
            {isRu ? 'Черновик' : 'Qoralama'}
          </Badge>
        );
      case 'POSTED':
        return (
          <Badge variant="success">
            <CheckCircle2 size={12} style={{ marginRight: '4px' }} />
            {isRu ? 'Проведен' : 'Tasdiqlangan'}
          </Badge>
        );
      case 'CANCELLED':
        return (
          <Badge variant="error">
            <XCircle size={12} style={{ marginRight: '4px' }} />
            {isRu ? 'Отменен' : 'Bekor qilingan'}
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            {isRu ? 'Дополнительные Расходы и Себестоимость (Landed Cost)' : 'Qo‘shimcha Xarajatlar va Tannarx (Landed Cost)'}
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
            {isRu
              ? 'Распределение транспортных, таможенных и брокерских расходов на себестоимость товаров'
              : 'Transport, bojxona va brokerlik xarajatlarini tovarlar tannarxiga mutanosib taqsimlash'}
          </p>
        </div>
        <Button onClick={() => router.push(`/${locale}/purchases/expenses/new`)}>
          <Plus size={16} style={{ marginRight: '6px' }} />
          {isRu ? 'Новый расход' : 'Yangi Xarajat'}
        </Button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-warning-50)', color: 'var(--color-warning-600)' }}>
            <Truck size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              {isRu ? 'Транспортные расходы' : 'Transport Xarajatlari'}
            </div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)' }} className="tabular-nums">
              {formatCurrency(data?.stats.totalTransport || 0, locale)}
            </div>
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary-600)' }}>
            <Receipt size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              {isRu ? 'Таможенные пошлины' : 'Bojxona To‘lovlari'}
            </div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)' }} className="tabular-nums">
              {formatCurrency(data?.stats.totalCustoms || 0, locale)}
            </div>
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-secondary-100)', color: 'var(--color-text-primary)' }}>
            <Building2 size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              {isRu ? 'Брокерские услуги' : 'Brokerlik Xizmatlari'}
            </div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)' }} className="tabular-nums">
              {formatCurrency(data?.stats.totalBroker || 0, locale)}
            </div>
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-success-50)', color: 'var(--color-success-600)' }}>
            <TrendingUp size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              {isRu ? 'Всего распределено' : 'Jami Taqsimlangan'}
            </div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)' }} className="tabular-nums">
              {formatCurrency(data?.stats.totalAll || 0, locale)}
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: 'var(--space-2)' }}>
        <Button
          variant={activeTab === 'list' ? 'primary' : 'ghost'}
          onClick={() => setActiveTab('list')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <FileText size={16} />
          {isRu ? 'Все расходы' : 'Barcha Xarajatlar'}
        </Button>
        <Button
          variant={activeTab === 'analytics' ? 'primary' : 'ghost'}
          onClick={() => setActiveTab('analytics')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <BarChart3 size={16} />
          {isRu ? 'Влияние на себестоимость' : 'Tannarxga Ta’siri Tahlili'}
        </Button>
      </div>

      {activeTab === 'list' && (
        <Card style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {/* Filters Bar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'center', flex: 1 }}>
              <div style={{ minWidth: '240px', maxWidth: '360px', flex: 1 }}>
                <Input
                  placeholder={isRu ? 'Поиск по номеру, поставщику, комментарию...' : 'Raqam, kontragent, izoh bo‘yicha qidiruv...'}
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>

              {/* Status Select */}
              <div style={{ minWidth: '160px' }}>
                <Select
                  value={statusFilter}
                  onChange={(val) => {
                    setStatusFilter(val);
                    setPage(1);
                  }}
                  options={[
                    { value: 'ALL', label: isRu ? 'Все статусы' : 'Barcha statuslar' },
                    { value: 'DRAFT', label: isRu ? 'Черновик' : 'Qoralama' },
                    { value: 'POSTED', label: isRu ? 'Проведен' : 'Tasdiqlangan' },
                    { value: 'CANCELLED', label: isRu ? 'Отменен' : 'Bekor qilingan' },
                  ]}
                />
              </div>

              {/* Type Select */}
              <div style={{ minWidth: '160px' }}>
                <Select
                  value={typeFilter}
                  onChange={(val) => {
                    setTypeFilter(val);
                    setPage(1);
                  }}
                  options={[
                    { value: 'ALL', label: isRu ? 'Все типы' : 'Barcha turlar' },
                    { value: 'TRANSPORT', label: isRu ? 'Транспорт' : 'Transport' },
                    { value: 'CUSTOMS', label: isRu ? 'Таможня' : 'Bojxona' },
                    { value: 'BROKER', label: isRu ? 'Брокер' : 'Broker' },
                    { value: 'INSURANCE', label: isRu ? 'Страхование' : 'Sug‘urta' },
                    { value: 'OTHER', label: isRu ? 'Прочее' : 'Boshqa' },
                  ]}
                />
              </div>
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-subtle)', textAlign: 'left', color: 'var(--color-text-secondary)' }}>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 'var(--font-semibold)' }}>
                    {isRu ? 'Номер' : 'Hujjat raqami'}
                  </th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 'var(--font-semibold)' }}>
                    {isRu ? 'Дата' : 'Sana'}
                  </th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 'var(--font-semibold)' }}>
                    {isRu ? 'Тип расхода' : 'Xarajat turi'}
                  </th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 'var(--font-semibold)' }}>
                    {isRu ? 'Поставщик / Перевозчик' : 'Xizmat ko‘rsatuvchi'}
                  </th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 'var(--font-semibold)' }}>
                    {isRu ? 'Партия закупки' : 'Tegishli xarid'}
                  </th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 'var(--font-semibold)', textAlign: 'right' }}>
                    {isRu ? 'Сумма' : 'Summa'}
                  </th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 'var(--font-semibold)', textAlign: 'center' }}>
                    {isRu ? 'Оплата' : 'To‘lov'}
                  </th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 'var(--font-semibold)', textAlign: 'center' }}>
                    {isRu ? 'Статус' : 'Status'}
                  </th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right' }}></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
                      {isRu ? 'Загрузка данных...' : 'Ma’lumotlar yuklanmoqda...'}
                    </td>
                  </tr>
                ) : !data?.items.length ? (
                  <tr>
                    <td colSpan={9} style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
                      {isRu ? 'Расходы не найдены' : 'Hech qanday qo‘shimcha xarajat topilmadi'}
                    </td>
                  </tr>
                ) : (
                  data.items.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => router.push(`/${locale}/purchases/expenses/${item.id}`)}
                      style={{
                        borderBottom: '1px solid var(--color-border-subtle)',
                        cursor: 'pointer',
                        transition: 'background-color var(--transition-fast)',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 'var(--font-medium)', color: 'var(--color-primary-600)' }}>
                        {item.docNumber}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                        {formatDate(item.docDate, locale)}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                        {getExpenseTypeBadge(item.expenseType)}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 'var(--font-medium)' }}>
                        {item.counterparty?.name || '—'}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ color: 'var(--color-text-secondary)' }}>{item.receipt?.docNumber}</span>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                            ({item.receipt?.counterparty?.name})
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right', fontWeight: 'var(--font-bold)' }} className="tabular-nums">
                        {formatCurrency(item.amount, locale)} {item.currency}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center' }}>
                        {item.isPaid ? (
                          <Badge variant="success">{isRu ? 'Оплачен' : 'To‘langan'}</Badge>
                        ) : (
                          <Badge variant="warning">{isRu ? 'В долг' : 'Qarz'}</Badge>
                        )}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center' }}>
                        {getStatusBadge(item.status)}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right' }}>
                        {item.status === 'DRAFT' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => handleDeleteDraft(item.id, e)}
                            style={{ color: 'var(--color-danger-500)', padding: '6px' }}
                            title={isRu ? 'Удалить' : 'O‘chirish'}
                          >
                            <Trash2 size={16} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data && data.totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 'var(--space-3)' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                {isRu
                  ? `Показано ${data.items.length} из ${data.total}`
                  : `Jami ${data.total} tadan ${data.items.length} tasi ko‘rsatilmoqda`}
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  {isRu ? 'Назад' : 'Oldingi'}
                </Button>
                <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
                  {isRu ? 'Вперед' : 'Keyingi'}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {activeTab === 'analytics' && (
        <Card style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
              {isRu ? 'Влияние на себестоимость товаров (Landed Cost Breakdown)' : 'Tovarlar tannarxiga qo‘shilgan xarajatlar tahlili'}
            </h2>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
              {isRu
                ? 'Детальная сводка распределения прямых расходов и прирост себестоимости по закупкам'
                : 'Har bir xarid bo‘yicha tovarlar tannarxining dastlabki xarid narxidan qancha oshgani va taqsimlangan xarajatlar'}
            </p>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-subtle)', textAlign: 'left', color: 'var(--color-text-secondary)' }}>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'Закупка' : 'Xarid hujjati'}</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'Поставщик' : 'Yetkazib beruvchi'}</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'Расход' : 'Xarajat hujjati'}</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'Тип' : 'Turi'}</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 'var(--font-semibold)', textAlign: 'right' }}>{isRu ? 'Сумма расхода' : 'Xarajat summasi'}</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 'var(--font-semibold)', textAlign: 'center' }}>{isRu ? 'Метод' : 'Taqsimot usuli'}</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 'var(--font-semibold)', textAlign: 'center' }}>{isRu ? 'Статус' : 'Holati'}</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.filter((it) => it.status === 'POSTED').length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
                      {isRu ? 'Нет проведенных расходов для анализа' : 'Tahlil qilish uchun tasdiqlangan xarajatlar mavjud emas'}
                    </td>
                  </tr>
                ) : (
                  data?.items
                    .filter((it) => it.status === 'POSTED')
                    .map((expense) => (
                      <tr
                        key={expense.id}
                        onClick={() => router.push(`/${locale}/purchases/expenses/${expense.id}`)}
                        style={{ borderBottom: '1px solid var(--color-border-subtle)', cursor: 'pointer' }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-hover)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <td style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 'var(--font-medium)' }}>
                          {expense.receipt?.docNumber}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                          {expense.receipt?.counterparty?.name || '—'}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', color: 'var(--color-primary-600)', fontWeight: 'var(--font-semibold)' }}>
                          {expense.docNumber}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                          {getExpenseTypeBadge(expense.expenseType)}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right', fontWeight: 'var(--font-bold)' }} className="tabular-nums">
                          {formatCurrency(expense.amount, locale)} {expense.currency}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                          {expense.allocationMethod === 'BY_AMOUNT' ? (isRu ? 'По стоимости' : 'Qiymatiga mutanosib') : expense.allocationMethod === 'BY_QUANTITY' ? (isRu ? 'По количеству' : 'Miqdoriga mutanosib') : (isRu ? 'По весу' : 'Vazniga mutanosib')}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center' }}>
                          {getStatusBadge(expense.status)}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
