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
  ClipboardList,
  Plus,
  Eye,
  CreditCard,
  RotateCcw,
  Filter,
  Search,
  RefreshCw,
  Factory,
  Truck,
  CheckCircle,
  Clock,
  Layers,
  ShoppingBag,
} from 'lucide-react';
import { ORDER_STATUS_LABELS } from '@/components/sales/SalesOrderForm';
import { PaySalesOrderModal } from '@/components/sales/PaySalesOrderModal';

interface CounterpartyItem {
  id: string;
  name: string;
}

interface SellerItem {
  id: string;
  firstName: string;
  lastName: string;
}

export default function SalesOrdersPage() {
  const { token, company } = useAuth();
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  const [orders, setOrders] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [counterparties, setCounterparties] = useState<CounterpartyItem[]>([]);
  const [sellers, setSellers] = useState<SellerItem[]>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [counterpartyId, setCounterpartyId] = useState('');
  const [status, setStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [assignedSellerId, setAssignedSellerId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Modals
  const [payOrder, setPayOrder] = useState<any | null>(null);

  const fetchStats = () => {
    if (!token || !company) return;
    apiFetch<any>('/sales/orders/stats', {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then(setStats)
      .catch((err) => console.error(err));
  };

  const fetchOrders = () => {
    if (!token || !company) return;
    setLoading(true);

    const query = new URLSearchParams();
    if (search) query.append('search', search);
    if (counterpartyId) query.append('counterpartyId', counterpartyId);
    if (status) query.append('status', status);
    if (paymentStatus) query.append('paymentStatus', paymentStatus);
    if (assignedSellerId) query.append('assignedSellerId', assignedSellerId);
    if (dateFrom) query.append('dateFrom', dateFrom);
    if (dateTo) query.append('dateTo', dateTo);

    apiFetch<any>(`/sales/orders?${query.toString()}`, {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then((res) => {
        const list = res?.data || (Array.isArray(res) ? res : []);
        setOrders(list);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchStats();
    fetchOrders();
  }, [token, company, locale]);

  useEffect(() => {
    if (!token || !company) return;

    apiFetch<any>('/sales/counterparties', {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then((res) => setCounterparties(res?.data || (Array.isArray(res) ? res : [])))
      .catch(console.error);

    apiFetch<any>('/users', {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then((res) => {
        const userList = (res?.data || res || []).map((u: any) => ({
          id: u.id,
          firstName: u.firstName,
          lastName: u.lastName,
        }));
        setSellers(userList);
      })
      .catch(console.error);
  }, [token, company, locale]);

  const handleApplyFilter = () => {
    fetchOrders();
  };

  const handleResetFilters = () => {
    setSearch('');
    setCounterpartyId('');
    setStatus('');
    setPaymentStatus('');
    setAssignedSellerId('');
    setDateFrom('');
    setDateTo('');
    setTimeout(() => {
      fetchOrders();
    }, 0);
  };

  const customerOptions: SelectOption[] = [
    { value: '', label: isRu ? 'Все клиенты' : 'Barcha mijozlar' },
    ...counterparties.map((c) => ({ value: c.id, label: c.name })),
  ];

  const sellerOptions: SelectOption[] = [
    { value: '', label: isRu ? 'Все продавцы' : 'Barcha sotuvchilar' },
    ...sellers.map((s) => ({ value: s.id, label: `${s.firstName} ${s.lastName}` })),
  ];

  const statusOptions: SelectOption[] = [
    { value: '', label: isRu ? 'Все статусы' : 'Barcha holatlar' },
    ...Object.entries(ORDER_STATUS_LABELS).map(([k, v]) => ({
      value: k,
      label: isRu ? v.ru : v.uz,
    })),
  ];

  const hasActiveFilters = Boolean(search || counterpartyId || status || paymentStatus || assignedSellerId || dateFrom || dateTo);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            {isRu ? 'Заказы покупателей' : 'Mijoz Buyurtmalari'}
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            {isRu ? '13-этапный пайплайн, предварительные обязательства, производство и контроль отгрузки' : '13 bosqichli jarayon, majburiyatlar, ishlab chiqarish va jo‘natish nazorati'}
          </p>
        </div>
        <Link href="/sales/orders/new">
          <Button style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px' }}>
            <Plus size={18} /> {isRu ? 'Новый заказ' : 'Yangi Buyurtma'}
          </Button>
        </Link>
      </div>

      {/* Summary KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-lg)', backgroundColor: 'rgba(99, 102, 241, 0.12)', color: 'var(--color-primary-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ClipboardList size={22} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-tertiary)' }}>
              {isRu ? 'Новые / Согласование' : 'Yangi / Tasdiqlashda'}
            </div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', marginTop: '2px' }} className="tabular-nums">
              {(stats?.new || 0) + (stats?.pendingApproval || 0)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              {isRu ? 'Требуют внимания' : 'E’tibor talab qiladi'}
            </div>
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-lg)', backgroundColor: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Factory size={22} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-tertiary)' }}>
              {isRu ? 'В производстве' : 'Ishlab chiqarilmoqda'}
            </div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: '#f59e0b', marginTop: '2px' }} className="tabular-nums">
              {(stats?.inProduction || 0) + (stats?.sentToProduction || 0)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              {isRu ? 'Изготовление' : 'Tayyorlanmoqda'}
            </div>
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-lg)', backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Truck size={22} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-tertiary)' }}>
              {isRu ? 'Готовы к отгрузке' : 'Jo‘natishga tayyor'}
            </div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: '#10b981', marginTop: '2px' }} className="tabular-nums">
              {stats?.readyToShip || 0}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              {isRu ? 'Оплата подтверждена' : 'To‘lov tasdiqlangan'}
            </div>
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-lg)', backgroundColor: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle size={22} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-tertiary)' }}>
              {isRu ? 'Завершено' : 'Bajarilgan'}
            </div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: '#3b82f6', marginTop: '2px' }} className="tabular-nums">
              {stats?.completed || 0}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              {isRu ? 'Закрытые сделки' : 'Yopilgan shartnomalar'}
            </div>
          </div>
        </Card>
      </div>

      {/* Filter Toolbar */}
      <Card style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {/* Search */}
        <div>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
            {isRu ? 'Поиск (№ Заказа, Клиент, Комментарий...)' : 'Qidiruv (Buyurtma №, Mijoz, Izoh...)'}
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
            <input
              placeholder={isRu ? 'Введите № заказа или имя клиента...' : 'Qidirish uchun buyurtma raqami yoki mijoz ismini kiriting...'}
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

        {/* Filter grid */}
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
              {isRu ? 'Статус заказа' : 'Buyurtma holati'}
            </div>
            <Select
              options={statusOptions}
              value={status}
              onChange={setStatus}
            />
          </div>

          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              {isRu ? 'Ответственный продавец' : 'Mas’ul sotuvchi'}
            </div>
            <Select
              options={sellerOptions}
              value={assignedSellerId}
              onChange={setAssignedSellerId}
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

      {/* Orders Table */}
      <Card style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px', display: 'block' }} />
            <div>{isRu ? 'Загрузка...' : 'Yuklanmoqda...'}</div>
          </div>
        ) : orders.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            <ClipboardList size={48} style={{ margin: '0 auto var(--space-3)', opacity: 0.3 }} />
            <div style={{ fontWeight: 600, fontSize: 'var(--text-base)', color: 'var(--color-text-secondary)' }}>
              {isRu ? 'Заказы не найдены' : 'Buyurtmalar topilmadi'}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', marginTop: '4px' }}>
              {isRu ? 'Нажмите кнопку выше, чтобы создать новый заказ' : 'Yangi buyurtma yaratish uchun yuqoridagi tugmani bosing'}
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-light)', backgroundColor: 'var(--color-bg-subtle)' }}>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {isRu ? '№ ЗАКАЗА / ДАТА' : 'BUYURTMA № / SANA'}
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {isRu ? 'КЛИЕНТ' : 'MIJOZ'}
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>
                    {isRu ? 'СТАТУС' : 'HOLAT'}
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {isRu ? 'УСЛОВИЕ ОПЛАТЫ' : 'TO‘LOV SHARTI'}
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>
                    {isRu ? 'СУММА ЗАКАЗА' : 'JAMI SUMMA'}
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>
                    {isRu ? 'ОПЛАЧЕНО' : 'TO‘LANGAN'}
                  </th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>
                    {isRu ? 'ДЕЙСТВИЯ' : 'AMALLAR'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.map((ord) => {
                  const meta = ORDER_STATUS_LABELS[ord.status] || { uz: ord.status, ru: ord.status, variant: 'neutral' };
                  return (
                    <tr
                      key={ord.id}
                      style={{
                        borderBottom: '1px solid var(--color-border-light)',
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      <td style={{ padding: '12px 16px' }}>
                        <Link href={`/sales/orders/${ord.id}`} style={{ fontWeight: 600, color: 'var(--color-primary-600)', textDecoration: 'none' }}>
                          {ord.orderNumber}
                        </Link>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>
                          {formatDate(ord.createdAt)}
                        </div>
                      </td>

                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>
                          {ord.counterparty?.name || '—'}
                        </div>
                      </td>

                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <Badge variant={meta.variant as any}>
                          {isRu ? meta.ru : meta.uz}
                        </Badge>
                      </td>

                      <td style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                        {ord.paymentCondition === 'PREPAID_100' ? (isRu ? '100% Предоплата' : '100% Oldindan') : ord.paymentCondition === 'PARTIAL' ? `${ord.requiredPaymentPercent}% ${isRu ? 'Предоплата' : 'Avans'}` : (isRu ? 'Кредит' : 'Kredit')}
                      </td>

                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--color-text-primary)' }} className="tabular-nums">
                        {formatCurrency(Number(ord.totalAmount || 0), locale, ord.currency)}
                      </td>

                      <td style={{ padding: '12px 16px', textAlign: 'right', color: '#10b981', fontWeight: 500 }} className="tabular-nums">
                        {formatCurrency(Number(ord.paidAmount || 0), locale, ord.currency)}
                      </td>

                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                          <Link href={`/sales/orders/${ord.id}`}>
                            <Button variant="secondary" style={{ padding: '4px 8px', height: '30px', fontSize: 'var(--text-xs)' }} title={isRu ? 'Просмотр / Управление' : 'Ko‘rish / Boshqarish'}>
                              <Eye size={14} />
                            </Button>
                          </Link>

                          {ord.status !== 'CANCELLED' && ord.status !== 'COMPLETED' && (
                            <Button
                              variant="secondary"
                              onClick={() => setPayOrder(ord)}
                              style={{ padding: '4px 8px', height: '30px', fontSize: 'var(--text-xs)', color: '#10b981' }}
                              title={isRu ? 'Принять оплату' : 'To‘lov qabul qilish'}
                            >
                              <CreditCard size={14} />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Action Modal */}
      {payOrder && (
        <PaySalesOrderModal
          isOpen={Boolean(payOrder)}
          onClose={() => setPayOrder(null)}
          order={payOrder}
          onSuccess={() => {
            fetchStats();
            fetchOrders();
          }}
        />
      )}
    </div>
  );
}
