'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Users, Search, DollarSign, Eye } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';

interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  type: string;
  debtBalance: number;
}

interface CustomerProfile {
  customer: Customer;
  metrics: {
    totalSales: number;
    totalPaid: number;
    totalReturned: number;
    debtBalance: number;
    totalCogs: number;
    grossProfit: number;
  };
  invoices: any[];
  returns: any[];
  payments: any[];
}

export default function CustomersPage() {
  const { token, company } = useAuth();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const fetchCustomers = () => {
    if (!token || !company) return;
    setLoading(true);
    apiFetch<Customer[]>('/counterparties?type=CUSTOMER', {
      token: token || undefined,
      tenantId: company.id,
    })
      .then(setCustomers)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchCustomers(); }, [token, company]);

  const handleViewProfile = async (customer: Customer) => {
    if (!token || !company) return;
    setSelectedCustomer(customer);
    setProfileLoading(true);
    try {
      const data = await apiFetch<CustomerProfile>(`/sales/customers/${customer.id}/profile`, {
        token: token || undefined,
        tenantId: company.id,
      });
      setProfile(data);
    } catch (err) {
      console.error(err);
      setProfile(null);
    } finally {
      setProfileLoading(false);
    }
  };

  const filtered = customers.filter((c) =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  );

  const totalDebt = customers.reduce((s, c) => s + Number(c.debtBalance || 0), 0);
  const customersWithDebt = customers.filter((c) => Number(c.debtBalance) > 0).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
          Mijozlar
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', marginTop: 4 }}>
          Mijozlar ro'yxati, qarz holati va sotuv tarixi
        </p>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 'var(--space-4)' }}>
        <Card style={{ padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={18} color="var(--color-primary-600)" />
            </div>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>Jami mijozlar</span>
          </div>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>{customers.length}</div>
        </Card>
        <Card style={{ padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DollarSign size={18} color="#f59e0b" />
            </div>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>Umumiy qarz</span>
          </div>
          <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: '#f59e0b' }}>{formatCurrency(totalDebt, 'UZS')}</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 4 }}>{customersWithDebt} ta mijozda</div>
        </Card>
      </div>

      {/* Search */}
      <Card style={{ padding: 'var(--space-4)' }}>
        <div style={{ position: 'relative', maxWidth: 400 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
          <input
            id="customer-search-input"
            placeholder="Ism, telefon yoki email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: '8px 12px 8px 34px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-input)', color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)', boxSizing: 'border-box' }}
          />
        </div>
      </Card>

      {/* Table */}
      <Card>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                {['Mijoz nomi', 'Telefon', 'Email', 'Qarz balansi', 'Tur', 'Amallar'].map((h) => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)' }}>Yuklanmoqda...</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)' }}>
                    <Users size={36} style={{ margin: '0 auto 10px', opacity: 0.3, display: 'block' }} />
                    Mijozlar topilmadi
                  </td>
                </tr>
              ) : (
                filtered.map((c) => {
                  const debt = Number(c.debtBalance || 0);
                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                      <td style={{ padding: '12px 14px', fontSize: 'var(--text-sm)', fontWeight: 600 }}>{c.name}</td>
                      <td style={{ padding: '12px 14px', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{c.phone || '—'}</td>
                      <td style={{ padding: '12px 14px', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{c.email || '—'}</td>
                      <td style={{ padding: '12px 14px', fontSize: 'var(--text-sm)', fontWeight: debt > 0 ? 600 : 400, color: debt > 0 ? '#f59e0b' : 'var(--color-text-secondary)' }}>
                        {debt > 0 ? formatCurrency(debt, 'UZS') : '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <Badge variant={c.type === 'BOTH' ? 'warning' : 'neutral'}>
                          {c.type === 'CUSTOMER' ? 'Mijoz' : c.type === 'BOTH' ? 'Mijoz & Yetk.' : c.type}
                        </Badge>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <button
                          id={`view-customer-${c.id}`}
                          onClick={() => handleViewProfile(c)}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '5px 10px', cursor: 'pointer', color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)' }}
                        >
                          <Eye size={13} /> Profil
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Customer Profile Modal */}
      {selectedCustomer && (
        <Modal isOpen={true} onClose={() => { setSelectedCustomer(null); setProfile(null); }} title={`Mijoz: ${selectedCustomer.name}`} size="xl">
          {profileLoading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)' }}>Yuklanmoqda...</div>
          ) : profile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 'var(--space-3)', background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)' }}>
                {[
                  { label: 'Jami sotuv', value: formatCurrency(profile.metrics.totalSales, 'UZS'), color: undefined },
                  { label: 'To\'langan', value: formatCurrency(profile.metrics.totalPaid, 'UZS'), color: '#10b981' },
                  { label: 'Qarz', value: formatCurrency(profile.metrics.debtBalance, 'UZS'), color: '#f59e0b' },
                  { label: 'Qaytarishlar', value: formatCurrency(profile.metrics.totalReturned, 'UZS'), color: '#ef4444' },
                  { label: 'Yalpi foyda', value: formatCurrency(profile.metrics.grossProfit, 'UZS'), color: profile.metrics.grossProfit >= 0 ? '#10b981' : '#ef4444' },
                ].map((m) => (
                  <div key={m.label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{m.label}</div>
                    <div style={{ fontWeight: 700, fontSize: 'var(--text-lg)', marginTop: 4, color: m.color }}>{m.value}</div>
                  </div>
                ))}
              </div>

              {profile.invoices.length > 0 && (
                <div>
                  <h3 style={{ fontWeight: 600, marginBottom: 10 }}>So'nggi sotuvlar</h3>
                  <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'var(--color-bg-subtle)' }}>
                          {['Hujjat №', 'Sana', 'Summa', 'Holat'].map((h) => (
                            <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--color-border)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {profile.invoices.slice(0, 8).map((inv: any) => (
                          <tr key={inv.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                            <td style={{ padding: '8px 12px', fontSize: 'var(--text-sm)', fontWeight: 600 }}>{inv.invoiceNumber}</td>
                            <td style={{ padding: '8px 12px', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{formatDate(inv.invoiceDate)}</td>
                            <td style={{ padding: '8px 12px', fontSize: 'var(--text-sm)', fontWeight: 600 }}>{formatCurrency(Number(inv.totalAmount), inv.currency || 'UZS')}</td>
                            <td style={{ padding: '8px 12px' }}>
                              <Badge variant={inv.status === 'POSTED' ? 'success' : inv.status === 'DRAFT' ? 'warning' : 'error'}>
                                {inv.status === 'POSTED' ? 'Tasdiqlangan' : inv.status === 'DRAFT' ? 'Qoralama' : inv.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)' }}>Ma'lumot yuklanmadi</div>
          )}
        </Modal>
      )}
    </div>
  );
}
