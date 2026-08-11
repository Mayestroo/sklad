'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, SelectOption } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { Badge } from '@/components/ui/Badge';
import {
  ShoppingBag,
  Plus,
  Filter,
  Eye,
  Truck,
  RotateCcw,
  Building2,
  Search,
  RefreshCw,
  FileText,
} from 'lucide-react';
import { PurchaseReceipt, PurchaseSummaryStats } from '@shared/types';
import { PurchaseReceiptModal } from '@/components/purchases/PurchaseReceiptModal';
import { PurchaseReceiptDetailModal } from '@/components/purchases/PurchaseReceiptDetailModal';
import { AllocateExpenseModal } from '@/components/purchases/AllocateExpenseModal';
import { CreateReturnModal } from '@/components/purchases/CreateReturnModal';

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
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<PurchaseReceipt | null>(null);
  const [detailReceipt, setDetailReceipt] = useState<PurchaseReceipt | null>(null);
  const [expenseReceipt, setExpenseReceipt] = useState<PurchaseReceipt | null>(null);
  const [returnReceipt, setReturnReceipt] = useState<PurchaseReceipt | null>(null);

  const fetchStats = () => {
    if (!token || !company) return;
    apiFetch<PurchaseSummaryStats>('/purchases/summary', {
      token: token || undefined,
      tenantId: company?.id ? company.id : undefined,
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
    })
      .then((res) => setReceipts(res || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!token || !company) return;

    fetchStats();
    fetchReceipts();

    // Fetch suppliers & warehouses
    apiFetch<CounterpartyItem[]>('/sales/counterparties', {
      token: token || undefined,
      tenantId: company?.id ? company.id : undefined,
    })
      .then((res) => setCounterparties(res || []))
      .catch((err) => console.error(err));

    apiFetch<WarehouseItem[]>('/inventory/warehouses', {
      token: token || undefined,
      tenantId: company?.id ? company.id : undefined,
    })
      .then((res) => setWarehouses(res || []))
      .catch((err) => console.error(err));
  }, [token, company]);

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
    }, 50);
  };

  const getDocStatusBadge = (st: string) => {
    switch (st) {
      case 'DRAFT':
        return <Badge variant="warning">Qoralama</Badge>;
      case 'POSTED':
        return <Badge variant="success">Tasdiqlangan</Badge>;
      case 'CANCELLED':
        return <Badge variant="error">Bekor qilingan</Badge>;
      default:
        return <Badge variant="neutral">{st}</Badge>;
    }
  };

  const getPaymentBadge = (pst: string) => {
    switch (pst) {
      case 'UNPAID':
        return <Badge variant="error">To&apos;lanmagan</Badge>;
      case 'PARTIALLY_PAID':
        return <Badge variant="warning">Qisman to&apos;langan</Badge>;
      case 'PAID':
        return <Badge variant="success">To&apos;liq to&apos;langan</Badge>;
      default:
        return null;
    }
  };

  const getReturnBadge = (rst: string) => {
    switch (rst) {
      case 'PARTIALLY_RETURNED':
        return <Badge variant="warning">Qisman qaytarilgan</Badge>;
      case 'FULLY_RETURNED':
        return <Badge variant="error">To&apos;liq qaytarilgan</Badge>;
      default:
        return null;
    }
  };

  const getProductName = (name: any) => {
    if (!name) return '—';
    if (typeof name === 'string') return name;
    return name.uz || name.ru || Object.values(name)[0] || '—';
  };

  const supplierOptions: SelectOption[] = [
    { value: '', label: 'Barcha Yetkazib beruvchilar' },
    ...counterparties.map((c) => ({ value: c.id, label: c.name })),
  ];

  const warehouseOptions: SelectOption[] = [
    { value: '', label: 'Barcha Omborlar' },
    ...warehouses.map((w) => ({ value: w.id, label: getProductName(w.name) })),
  ];

  const statusOptions: SelectOption[] = [
    { value: '', label: 'Barcha Holatlar' },
    { value: 'DRAFT', label: 'Qoralama' },
    { value: 'POSTED', label: 'Tasdiqlangan' },
    { value: 'CANCELLED', label: 'Bekor qilingan' },
  ];

  const hasActiveFilters = Boolean(search || counterpartyId || warehouseId || status || dateFrom || dateTo);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            Xaridlar va Tovar Qabul Qilish
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            Yetkazib beruvchilardan tovar kirim qilish, tannarx (`Landed Cost`) shakllantirish va qarzdorlik hisobi
          </p>
        </div>
        <Button onClick={() => { setSelectedReceipt(null); setIsCreateOpen(true); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px' }}>
          <Plus size={18} /> Yangi Xarid Hujjati
        </Button>
      </div>

      {/* Summary KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)', transition: 'transform 0.2s ease, box-shadow 0.2s ease' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-lg)', backgroundColor: 'rgba(99, 102, 241, 0.12)', color: 'var(--color-primary-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShoppingBag size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-tertiary)' }}>Shu Oydagi Xaridlar</div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', marginTop: '2px' }} className="tabular-nums">
              {formatCurrency(stats?.monthlyPurchasesTotal || 0, 'uz')} UZS
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              {stats?.monthlyPurchasesCount || 0} ta hujjat
            </div>
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)', transition: 'transform 0.2s ease, box-shadow 0.2s ease' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-lg)', backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Building2 size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-tertiary)' }}>Yetkazib Beruvchilarga Qarzimiz</div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: '#ef4444', marginTop: '2px' }} className="tabular-nums">
              {formatCurrency(stats?.totalSupplierDebt || 0, 'uz')} UZS
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              {stats?.suppliersWithDebtCount || 0} ta kontragent oldida
            </div>
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)', transition: 'transform 0.2s ease, box-shadow 0.2s ease' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-lg)', backgroundColor: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <RotateCcw size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-tertiary)' }}>Qaytarishlar (Shu oy)</div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: '#f59e0b', marginTop: '2px' }} className="tabular-nums">
              {formatCurrency(stats?.monthlyReturnsTotal || 0, 'uz')} UZS
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              {stats?.monthlyReturnsCount || 0} ta qaytaruv
            </div>
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)', transition: 'transform 0.2s ease, box-shadow 0.2s ease' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-lg)', backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Truck size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-tertiary)' }}>Faol Yetkazib Beruvchilar</div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: '#10b981', marginTop: '2px' }} className="tabular-nums">
              {stats?.activeSuppliersCount || 0} ta
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              Ro&apos;yxatdan o&apos;tgan hamkorlar
            </div>
          </div>
        </Card>
      </div>

      {/* Filter & Search Toolbar */}
      <Card style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {/* Row 1: Search Input */}
        <div>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
            Qidiruv (Hujjat №, GTD, Izoh...)
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
            <input
              placeholder="Qidirish uchun hujjat raqami, GTD yoki izohni kiriting..."
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
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Yetkazib beruvchi</div>
            <Select
              options={supplierOptions}
              value={counterpartyId}
              onChange={(val) => setCounterpartyId(val)}
            />
          </div>

          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Ombor</div>
            <Select
              options={warehouseOptions}
              value={warehouseId}
              onChange={(val) => setWarehouseId(val)}
            />
          </div>

          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Hujjat holati</div>
            <Select
              options={statusOptions}
              value={status}
              onChange={(val) => setStatus(val)}
            />
          </div>

          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Sanadan</div>
            <DatePicker value={dateFrom} onChange={(val) => setDateFrom(val)} placeholder="Sanadan..." />
          </div>

          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Sanagacha</div>
            <DatePicker value={dateTo} onChange={(val) => setDateTo(val)} placeholder="Sanagacha..." />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" onClick={handleApplyFilter} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '38px' }}>
              <Filter size={15} /> Filtr
            </Button>
            {hasActiveFilters && (
              <Button variant="secondary" onClick={handleResetFilters} title="Tozalash" style={{ padding: '0 12px', height: '38px', color: 'var(--color-text-secondary)' }}>
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
            <div>Yuklanmoqda...</div>
          </div>
        ) : receipts.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            <ShoppingBag size={48} style={{ margin: '0 auto var(--space-3)', opacity: 0.3 }} />
            <div style={{ fontWeight: 600, fontSize: 'var(--text-base)', color: 'var(--color-text-secondary)' }}>Xarid hujjatlari topilmadi</div>
            <div style={{ fontSize: 'var(--text-xs)', marginTop: '4px' }}>Yangi xarid hujjatini yaratish uchun yuqoridagi tugmani bosing</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-light)', backgroundColor: 'var(--color-bg-subtle)' }}>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>HUJJAT № / SANA</th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>YETKAZIB BERUVCHI</th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>OMBOR</th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>GTD / IMPORT</th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>JAMI SUMMA</th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>XARAJATLAR</th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>HOLATI & TO&apos;LOV</th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>AMALLAR</th>
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
                        {formatDate(r.docDate, 'uz')}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{r.counterparty?.name || '—'}</div>
                      {r.contractNumber && (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>
                          Shartnoma: № {r.contractNumber}
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
                      {formatCurrency(Number(r.totalAmount), 'uz')} {r.currency}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 500, color: Number(r.additionalExpensesTotal) > 0 ? '#f59e0b' : 'var(--color-text-tertiary)' }} className="tabular-nums">
                      {Number(r.additionalExpensesTotal) > 0 ? `+${formatCurrency(Number(r.additionalExpensesTotal), 'uz')}` : '—'}
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
                        <Button size="sm" variant="secondary" onClick={() => setDetailReceipt(r)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Eye size={14} /> Ko&apos;rish
                        </Button>
                        {r.status === 'DRAFT' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setSelectedReceipt(r);
                              setIsCreateOpen(true);
                            }}
                          >
                            Tahrirlash
                          </Button>
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
      {isCreateOpen && (
        <PurchaseReceiptModal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          onSuccess={() => {
            fetchStats();
            fetchReceipts();
          }}
          initialData={selectedReceipt}
        />
      )}

      {detailReceipt && (
        <PurchaseReceiptDetailModal
          isOpen={!!detailReceipt}
          onClose={() => setDetailReceipt(null)}
          receipt={detailReceipt}
          onRefresh={() => {
            fetchStats();
            fetchReceipts();
          }}
          onOpenAddExpense={(r) => {
            setDetailReceipt(null);
            setExpenseReceipt(r);
          }}
          onOpenReturn={(r) => {
            setDetailReceipt(null);
            setReturnReceipt(r);
          }}
        />
      )}

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
    </div>
  );
}
