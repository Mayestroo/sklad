'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, SelectOption } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { Badge } from '@/components/ui/Badge';
import {
  ShoppingCart,
  Plus,
  Eye,
  CheckCircle,
  XCircle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  RotateCcw,
  Filter,
  Search,
  BarChart2,
  AlertTriangle,
  Percent,
} from 'lucide-react';
import { SalesInvoice, SalesSummaryStats } from '@shared/types';
import { CreateSalesInvoiceModal } from '@/components/sales/CreateSalesInvoiceModal';
import { SalesInvoiceDetailModal } from '@/components/sales/SalesInvoiceDetailModal';

interface CounterpartyItem {
  id: string;
  name: string;
}
interface WarehouseItem {
  id: string;
  name: any;
}

const statusBadgeVariant: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  DRAFT: 'warning',
  POSTED: 'success',
  CANCELLED: 'error',
};

const paymentBadgeVariant: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  UNPAID: 'error',
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
};

const statusLabel: Record<string, string> = {
  DRAFT: 'Qoralama',
  POSTED: 'Tasdiqlangan',
  CANCELLED: 'Bekor qilingan',
};

const paymentLabel: Record<string, string> = {
  UNPAID: 'To\'lanmagan',
  PARTIALLY_PAID: 'Qisman to\'langan',
  PAID: 'To\'langan',
};

export default function SalesPage() {
  const { token, company } = useAuth();
  const locale = useLocale() as 'uz' | 'ru';

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
  const [showFilters, setShowFilters] = useState(false);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [detailInvoice, setDetailInvoice] = useState<SalesInvoice | null>(null);

  // ─── POST / UNPOST ────────────────────────────────────────────
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchStats = () => {
    if (!token || !company) return;
    apiFetch<SalesSummaryStats>('/sales/summary', {
      token: token || undefined,
      tenantId: company.id,
    })
      .then(setStats)
      .catch((err) => console.error('Stats error:', err));
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
    })
      .then(setInvoices)
      .catch((err) => console.error('Invoices error:', err))
      .finally(() => setLoading(false));
  };

  const fetchReferences = () => {
    if (!token || !company) return;
    Promise.all([
      apiFetch<CounterpartyItem[]>('/counterparties?type=CUSTOMER', {
        token: token || undefined,
        tenantId: company.id,
      }).catch(() => [] as CounterpartyItem[]),
      apiFetch<WarehouseItem[]>('/inventory/warehouses', {
        token: token || undefined,
        tenantId: company.id,
      }).catch(() => [] as WarehouseItem[]),
    ]).then(([cp, wh]) => {
      setCounterparties(cp);
      setWarehouses(wh);
    });
  };

  useEffect(() => {
    fetchStats();
    fetchInvoices();
    fetchReferences();
  }, [token, company]);

  useEffect(() => {
    fetchInvoices();
  }, [search, counterpartyId, warehouseId, status, paymentStatus, dateFrom, dateTo]);

  const handlePost = async (invoiceId: string) => {
    if (!token || !company) return;
    setActionLoading(invoiceId);
    try {
      await apiFetch(`/sales/invoices/${invoiceId}/post`, {
        method: 'POST',
        token: token || undefined,
        tenantId: company.id,
      });
      fetchInvoices();
      fetchStats();
    } catch (err: any) {
      alert(err?.message || 'Tasdiqlashda xato yuz berdi');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnpost = async (invoiceId: string) => {
    if (!token || !company) return;
    if (!confirm('Hujjatni bekor qilmoqchimisiz? Ombor qoldig\'i tiklanadi.')) return;
    setActionLoading(invoiceId);
    try {
      await apiFetch(`/sales/invoices/${invoiceId}/unpost`, {
        method: 'POST',
        token: token || undefined,
        tenantId: company.id,
      });
      fetchInvoices();
      fetchStats();
    } catch (err: any) {
      alert(err?.message || 'Bekor qilishda xato');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (invoiceId: string) => {
    if (!token || !company) return;
    if (!confirm('Hujjatni o\'chirmoqchimisiz?')) return;
    setActionLoading(invoiceId);
    try {
      await apiFetch(`/sales/invoices/${invoiceId}`, {
        method: 'DELETE',
        token: token || undefined,
        tenantId: company.id,
      });
      fetchInvoices();
    } catch (err: any) {
      alert(err?.message || 'O\'chirishda xato');
    } finally {
      setActionLoading(null);
    }
  };

  const onCreated = () => {
    setIsCreateOpen(false);
    fetchInvoices();
    fetchStats();
  };

  const margin = stats?.monthlySalesTotal
    ? ((stats.monthlyGrossProfit / stats.monthlySalesTotal) * 100).toFixed(1)
    : '0.0';

  const counterpartyOptions: SelectOption[] = [
    { value: '', label: 'Barcha mijozlar' },
    ...counterparties.map((c) => ({ value: c.id, label: c.name })),
  ];
  const warehouseOptions: SelectOption[] = [
    { value: '', label: 'Barcha omborlar' },
    ...warehouses.map((w) => ({ value: w.id, label: typeof w.name === 'object' ? (w.name[locale] || w.name.uz) : w.name })),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* ── HEADER ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Sotuvlar
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 4 }}>
            Tovar sotish, hujjat tasdiqlash va foydani kuzatish
          </p>
        </div>
        <Button
          id="create-sales-invoice-btn"
          onClick={() => setIsCreateOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Plus size={16} />
          Yangi sotuv
        </Button>
      </div>

      {/* ── STATS CARDS ── */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 'var(--space-4)' }}>
          <Card style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShoppingCart size={18} color="var(--color-primary-600)" />
              </div>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>Oylik sotuv</span>
            </div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>{formatCurrency(stats.monthlySalesTotal, 'UZS')}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 4 }}>{stats.monthlySalesCount} ta hujjat</div>
          </Card>

          <Card style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TrendingUp size={18} color="#10b981" />
              </div>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>Yalpi foyda</span>
            </div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: stats.monthlyGrossProfit >= 0 ? '#10b981' : '#ef4444' }}>
              {formatCurrency(stats.monthlyGrossProfit, 'UZS')}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 4 }}>Marja: {margin}%</div>
          </Card>

          <Card style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <DollarSign size={18} color="#f59e0b" />
              </div>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>Mijozlar qarzi</span>
            </div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: '#f59e0b' }}>{formatCurrency(stats.totalCustomerDebt, 'UZS')}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 4 }}>{stats.customersWithDebtCount} ta mijoz</div>
          </Card>

          <Card style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <RotateCcw size={18} color="#ef4444" />
              </div>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>Qaytarishlar</span>
            </div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: '#ef4444' }}>{formatCurrency(stats.monthlyReturnsTotal, 'UZS')}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 4 }}>Joriy oy</div>
          </Card>

          <Card style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Percent size={18} color="var(--color-primary-600)" />
              </div>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>Foyda marjasi</span>
            </div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>{margin}%</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 4 }}>Yalpi foyda / sotuv</div>
          </Card>
        </div>
      )}

      {/* ── FILTERS ── */}
      <Card style={{ padding: 'var(--space-4)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 220px', position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
            <input
              id="sales-search-input"
              placeholder="Hujjat raqami yoki mijoz..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 34px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-bg-input)',
                color: 'var(--color-text-primary)',
                fontSize: 'var(--text-sm)',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <Button
            variant="secondary"
            id="toggle-sales-filters-btn"
            onClick={() => setShowFilters((v) => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Filter size={15} />
            Filtrlar
          </Button>
        </div>

        {showFilters && (
          <div style={{ marginTop: 'var(--space-3)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--space-3)' }}>
            <Select
              id="sales-counterparty-filter"
              label="Mijoz"
              value={counterpartyId}
              onChange={(value) => setCounterpartyId(value)}
              options={counterpartyOptions}
            />
            <Select
              id="sales-warehouse-filter"
              label="Ombor"
              value={warehouseId}
              onChange={(value) => setWarehouseId(value)}
              options={warehouseOptions}
            />
            <Select
              id="sales-status-filter"
              label="Hujjat holati"
              value={status}
              onChange={(value) => setStatus(value)}
              options={[
                { value: '', label: 'Barchasi' },
                { value: 'DRAFT', label: 'Qoralama' },
                { value: 'POSTED', label: 'Tasdiqlangan' },
                { value: 'CANCELLED', label: 'Bekor qilingan' },
              ]}
            />
            <Select
              id="sales-payment-status-filter"
              label="To'lov holati"
              value={paymentStatus}
              onChange={(value) => setPaymentStatus(value)}
              options={[
                { value: '', label: 'Barchasi' },
                { value: 'UNPAID', label: 'To\'lanmagan' },
                { value: 'PARTIALLY_PAID', label: 'Qisman to\'langan' },
                { value: 'PAID', label: 'To\'langan' },
              ]}
            />
            <DatePicker
              label="Sanadan"
              value={dateFrom}
              onChange={(val) => setDateFrom(val)}
              placeholder="Sanadan..."
            />
            <DatePicker
              label="Sanagacha"
              value={dateTo}
              onChange={(val) => setDateTo(val)}
              placeholder="Sanagacha..."
            />
          </div>
        )}
      </Card>

      {/* ── TABLE ── */}
      <Card>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                {['Hujjat №', 'Sana', 'Mijoz', 'Ombor', 'Summa', 'COGS', 'Yalpi foyda', 'Holat', 'To\'lov', 'Amallar'].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '10px 14px',
                      textAlign: 'left',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 600,
                      color: 'var(--color-text-secondary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-secondary)' }}>
                    Yuklanmoqda...
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-secondary)' }}>
                    <ShoppingCart size={40} style={{ margin: '0 auto 12px', opacity: 0.3, display: 'block' }} />
                    Sotuvlar topilmadi
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => {
                  const grossProfit = Number(inv.grossProfit || 0);
                  const profitColor = grossProfit >= 0 ? '#10b981' : '#ef4444';
                  const isLoading = actionLoading === inv.id;

                  return (
                    <tr
                      key={inv.id}
                      style={{
                        borderBottom: '1px solid var(--color-border-light)',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                    >
                      <td style={{ padding: '12px 14px', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                        {inv.invoiceNumber}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                        {formatDate(inv.invoiceDate)}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 'var(--text-sm)' }}>
                        {(inv as any).counterparty?.name || '—'}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                        {(() => {
                          const wh = (inv as any).warehouse;
                          if (!wh) return '—';
                          return typeof wh.name === 'object' ? (wh.name[locale] || wh.name.uz || '—') : wh.name;
                        })()}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                        {formatCurrency(Number(inv.totalAmount), inv.currency || 'UZS')}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                        {inv.status === 'POSTED' ? formatCurrency(Number(inv.totalCogs || 0), inv.currency || 'UZS') : '—'}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 'var(--text-sm)', fontWeight: 600, color: inv.status === 'POSTED' ? profitColor : 'var(--color-text-secondary)' }}>
                        {inv.status === 'POSTED' ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {grossProfit >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                            {formatCurrency(grossProfit, inv.currency || 'UZS')}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <Badge variant={statusBadgeVariant[inv.status] || 'default'}>
                          {statusLabel[inv.status] || inv.status}
                        </Badge>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <Badge variant={paymentBadgeVariant[inv.paymentStatus] || 'default'}>
                          {paymentLabel[inv.paymentStatus] || inv.paymentStatus}
                        </Badge>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            id={`view-invoice-${inv.id}`}
                            onClick={() => setDetailInvoice(inv)}
                            title="Ko'rish"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary-600)', padding: 4 }}
                          >
                            <Eye size={15} />
                          </button>
                          {inv.status === 'DRAFT' && (
                            <button
                              id={`post-invoice-${inv.id}`}
                              onClick={() => handlePost(inv.id)}
                              disabled={isLoading}
                              title="Tasdiqlash"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#10b981', padding: 4 }}
                            >
                              <CheckCircle size={15} />
                            </button>
                          )}
                          {inv.status === 'POSTED' && (
                            <button
                              id={`unpost-invoice-${inv.id}`}
                              onClick={() => handleUnpost(inv.id)}
                              disabled={isLoading || inv.paymentStatus !== 'UNPAID'}
                              title={inv.paymentStatus !== 'UNPAID' ? 'To\'lov mavjud — bekor qilib bo\'lmaydi' : 'Tasdiqlashni bekor qilish'}
                              style={{ background: 'none', border: 'none', cursor: inv.paymentStatus !== 'UNPAID' ? 'not-allowed' : 'pointer', color: inv.paymentStatus !== 'UNPAID' ? '#9ca3af' : '#f59e0b', padding: 4 }}
                            >
                              <XCircle size={15} />
                            </button>
                          )}
                          {inv.status === 'DRAFT' && (
                            <button
                              id={`delete-invoice-${inv.id}`}
                              onClick={() => handleDelete(inv.id)}
                              disabled={isLoading}
                              title="O'chirish"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}
                            >
                              <XCircle size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── MODALS ── */}
      {isCreateOpen && (
        <CreateSalesInvoiceModal
          onClose={() => setIsCreateOpen(false)}
          onCreated={onCreated}
          counterparties={counterparties}
          warehouses={warehouses}
        />
      )}
      {detailInvoice && (
        <SalesInvoiceDetailModal
          invoice={detailInvoice}
          onClose={() => setDetailInvoice(null)}
          onAction={() => {
            setDetailInvoice(null);
            fetchInvoices();
            fetchStats();
          }}
        />
      )}
    </div>
  );
}
