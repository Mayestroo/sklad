'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Building2, Eye } from 'lucide-react';
import { SupplierProfileDrawer } from '@/components/purchases/SupplierProfileDrawer';

interface Counterparty {
  id: string;
  name: string;
  type: string;
  inn?: string;
  phone?: string;
  email?: string;
  address?: string;
  debtBalance: number;
}

export default function SuppliersPage() {
  const { token, company } = useAuth();

  const [suppliers, setSuppliers] = useState<Counterparty[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);

  const fetchSuppliers = () => {
    if (!token || !company) return;
    setLoading(true);

    apiFetch<Counterparty[]>('/sales/counterparties', { token, tenantId: company.id })
      .then((res) => {
        const filtered = (res || []).filter(
          (c) => c.type === 'SUPPLIER' || c.type === 'BOTH'
        );
        setSuppliers(filtered);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!token || !company) return;
    fetchSuppliers();
  }, [token, company]);

  const filteredSuppliers = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.inn && s.inn.includes(search)) ||
      (s.phone && s.phone.includes(search))
  );

  const totalDebt = suppliers.reduce((sum, s) => sum + Number(s.debtBalance || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            👥 Yetkazib Beruvchilar Katalogi va Shartnomalar
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
            Barcha yetkazib beruvchilar ro&apos;yxati, rekvizitlari, shartnomalari, xaridlar va o&apos;zaro qarzdorlik balansi
          </p>
        </div>
      </div>

      {/* KPI & Search Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary-600)' }}>
            <Building2 size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>Jami Yetkazib Beruvchilar</div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)' }} className="tabular-nums">
              {suppliers.length} ta
            </div>
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-danger-50)', color: 'var(--color-danger-600)' }}>
            <Building2 size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>Umumiy Bizning Qarzimiz</div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', color: 'var(--color-danger-600)' }} className="tabular-nums">
              {formatCurrency(totalDebt, 'uz')} UZS
            </div>
          </div>
        </Card>
      </div>

      <Card style={{ padding: 'var(--space-4)' }}>
        <Input
          placeholder="Yetkazib beruvchi nomi, STIR, telefon bo'yicha qidiruv..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Card>

      {/* Suppliers Grid / List */}
      <Card>
        {loading ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            Yuklanmoqda...
          </div>
        ) : filteredSuppliers.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            <Building2 size={44} style={{ margin: '0 auto var(--space-2)', opacity: 0.4 }} />
            <div>Yetkazib beruvchilar topilmadi</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-xs)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-tertiary)' }}>
                  <th style={{ padding: '12px' }}>NOMI</th>
                  <th style={{ padding: '12px' }}>STIR (INN)</th>
                  <th style={{ padding: '12px' }}>TELEFON / MANZIL</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>BIZNING QARZIMIZ</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>AMALLAR</th>
                </tr>
              </thead>
              <tbody>
                {filteredSuppliers.map((s) => {
                  const debt = Number(s.debtBalance || 0);
                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                      <td style={{ padding: '12px', fontWeight: 'var(--font-bold)', color: 'var(--color-primary-600)' }}>
                        {s.name}
                        {s.type === 'BOTH' && (
                          <span style={{ marginLeft: '6px' }}>
                            <Badge variant="neutral">Hamkor & Xaridor</Badge>
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px', fontFamily: 'var(--font-mono)' }}>{s.inn || '—'}</td>
                      <td style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>
                        {s.phone || '—'} {s.address ? `(${s.address})` : ''}
                      </td>
                      <td
                        style={{
                          padding: '12px',
                          textAlign: 'right',
                          fontWeight: 'var(--font-bold)',
                          color: debt > 0 ? 'var(--color-danger-600)' : 'var(--color-text-primary)',
                        }}
                        className="tabular-nums"
                      >
                        {formatCurrency(debt, 'uz')} UZS
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <Button size="sm" variant="secondary" onClick={() => setSelectedSupplierId(s.id)}>
                          <Eye size={14} style={{ marginRight: '4px' }} /> Profil va Tarix
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Supplier Profile Drawer */}
      {selectedSupplierId && (
        <SupplierProfileDrawer
          isOpen={!!selectedSupplierId}
          onClose={() => setSelectedSupplierId(null)}
          supplierId={selectedSupplierId}
        />
      )}
    </div>
  );
}
