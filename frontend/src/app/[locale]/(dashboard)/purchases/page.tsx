'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, SelectOption } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import {
  ShoppingBag,
  Plus,
  Filter,
  Eye,
  Truck,
  RotateCcw,
  Building2,
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

  const getDocStatusBadge = (st: string) => {
    switch (st) {
      case 'DRAFT':
        return <Badge variant="neutral">Qoralama</Badge>;
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
        return <Badge variant="neutral">To&apos;lanmagan</Badge>;
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
    { value: '', label: '-- Barcha Yetkazib beruvchilar --' },
    ...counterparties.map((c) => ({ value: c.id, label: c.name })),
  ];

  const warehouseOptions: SelectOption[] = [
    { value: '', label: '-- Barcha Omborlar --' },
    ...warehouses.map((w) => ({ value: w.id, label: getProductName(w.name) })),
  ];

  const statusOptions: SelectOption[] = [
    { value: '', label: '-- Barcha Holatlar --' },
    { value: 'DRAFT', label: 'Qoralama' },
    { value: 'POSTED', label: 'Tasdiqlangan' },
    { value: 'CANCELLED', label: 'Bekor qilingan' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            📦 Xaridlar va Tovar Qabul Qilish (1C / MoySklad)
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
            Yetkazib beruvchilardan tovar kirim qilish, tannarx (`Landed Cost`) shakllantirish va qarzdorlik hisobi
          </p>
        </div>
        <Button onClick={() => { setSelectedReceipt(null); setIsCreateOpen(true); }}>
          <Plus size={16} style={{ marginRight: '6px' }} /> Yangi Xarid Hujjati
        </Button>
      </div>

      {/* Summary KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary-600)' }}>
            <ShoppingBag size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>Shu Oydagi Xaridlar</div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)' }} className="tabular-nums">
              {formatCurrency(stats?.monthlyPurchasesTotal || 0, 'uz')} UZS
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
              {stats?.monthlyPurchasesCount || 0} ta hujjat
            </div>
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-danger-50)', color: 'var(--color-danger-600)' }}>
            <Building2 size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>Yetkazib Beruvchilarga Qarzimiz</div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', color: 'var(--color-danger-600)' }} className="tabular-nums">
              {formatCurrency(stats?.totalSupplierDebt || 0, 'uz')} UZS
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
              {stats?.suppliersWithDebtCount || 0} ta kontragent oldida
            </div>
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-warning-50)', color: 'var(--color-warning-600)' }}>
            <RotateCcw size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>Qaytarishlar (Shu oy)</div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)' }} className="tabular-nums">
              {formatCurrency(stats?.monthlyReturnsTotal || 0, 'uz')} UZS
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
              {stats?.monthlyReturnsCount || 0} ta qaytaruv
            </div>
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-success-50)', color: 'var(--color-success-600)' }}>
            <Truck size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>Faol Yetkazib Beruvchilar</div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)' }} className="tabular-nums">
              {stats?.activeSuppliersCount || 0} ta
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
              Ro&apos;yxatdan o&apos;tgan hamkorlar
            </div>
          </div>
        </Card>
      </div>

      {/* Filter & Search Toolbar */}
      <Card style={{ padding: 'var(--space-4)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3)' }}>
          <div>
            <Input
              placeholder="Qidiruv (Hujjat №, GTD, Izoh...)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div>
            <Select
              options={supplierOptions}
              value={counterpartyId}
              onChange={(val) => setCounterpartyId(val)}
            />
          </div>

          <div>
            <Select
              options={warehouseOptions}
              value={warehouseId}
              onChange={(val) => setWarehouseId(val)}
            />
          </div>

          <div>
            <Select
              options={statusOptions}
              value={status}
              onChange={(val) => setStatus(val)}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="Boshlanish sanasi" />
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="Tugash sanasi" />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" onClick={handleApplyFilter} style={{ flex: 1 }}>
              <Filter size={14} style={{ marginRight: '4px' }} /> Filtr
            </Button>
          </div>
        </div>
      </Card>

      {/* Receipts Table */}
      <Card>
        {loading ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            Yuklanmoqda...
          </div>
        ) : receipts.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            <ShoppingBag size={44} style={{ margin: '0 auto var(--space-2)', opacity: 0.4 }} />
            <div>Xarid hujjatlari topilmadi</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-xs)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-tertiary)' }}>
                  <th style={{ padding: '12px' }}>HUJJAT № / SANA</th>
                  <th style={{ padding: '12px' }}>YETKAZIB BERUVCHI</th>
                  <th style={{ padding: '12px' }}>OMBOR</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>GTD / IMPORT</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>JAMI SUMMA</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>XARAJATLAR</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>HOLATI & TO&apos;LOV</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>AMALLAR</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                    <td style={{ padding: '12px' }}>
                      <div style={{ fontWeight: 'var(--font-bold)', fontFamily: 'var(--font-mono)', color: 'var(--color-primary-600)' }}>
                        {r.docNumber}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                        {formatDate(r.docDate, 'uz')}
                      </div>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <div style={{ fontWeight: 'var(--font-medium)' }}>{r.counterparty?.name || '—'}</div>
                      {r.contractNumber && (
                        <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                          Shartnoma: № {r.contractNumber}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>
                      {getProductName(r.warehouse?.name)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      {r.gtdNumber ? (
                        <Badge variant="warning">{r.gtdNumber}</Badge>
                      ) : (
                        <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'var(--font-bold)' }} className="tabular-nums">
                      {formatCurrency(Number(r.totalAmount), 'uz')} {r.currency}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', color: 'var(--color-warning-700)' }} className="tabular-nums">
                      +{formatCurrency(Number(r.additionalExpensesTotal), 'uz')}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                        {getDocStatusBadge(r.status)}
                        {getPaymentBadge(r.paymentStatus)}
                        {getReturnBadge(r.returnStatus)}
                      </div>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                        <Button size="sm" variant="secondary" onClick={() => setDetailReceipt(r)}>
                          <Eye size={14} style={{ marginRight: '4px' }} /> Ko&apos;rish
                        </Button>
                        {r.status === 'DRAFT' && (
                          <Button
                            size="sm"
                            variant="outline"
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
