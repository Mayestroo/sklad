'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, SelectOption } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import {
  Users,
  UserCheck,
  Building2,
  Plus,
  Search,
  Eye,
  Phone,
  Mail,
  MapPin,
  FileText,
  DollarSign,
  RefreshCw,
} from 'lucide-react';

interface Counterparty {
  id: string;
  type: 'CUSTOMER' | 'SUPPLIER' | 'BOTH';
  name: string;
  inn?: string;
  mfo?: string;
  bankAccount?: string;
  bankName?: string;
  phone?: string;
  email?: string;
  address?: string;
  debtBalance: number;
  createdAt: string;
  _count?: {
    salesInvoices?: number;
    deals?: number;
    payments?: number;
  };
}

export default function CounterpartiesPage() {
  const { token, company } = useAuth();

  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<Counterparty | null>(null);

  // Form state
  const [formType, setFormType] = useState<'CUSTOMER' | 'SUPPLIER' | 'BOTH'>('CUSTOMER');
  const [formName, setFormName] = useState('');
  const [formInn, setFormInn] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formBankName, setFormBankName] = useState('');
  const [formBankAccount, setFormBankAccount] = useState('');
  const [formMfo, setFormMfo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchCounterparties = () => {
    if (!token || !company) return;
    setLoading(true);

    const query = new URLSearchParams();
    if (typeFilter) query.append('type', typeFilter);

    apiFetch<Counterparty[]>(`/sales/counterparties?${query.toString()}`, {
      token: token || undefined,
      tenantId: company.id,
    })
      .then((res) => setCounterparties(res || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCounterparties();
  }, [token, company, typeFilter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Kontragent nomini kiritish majburiy');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      await apiFetch('/sales/counterparties', {
        method: 'POST',
        token: token || undefined,
        tenantId: company?.id ? company.id : undefined,
        body: JSON.stringify({
          type: formType,
          name: formName.trim(),
          inn: formInn.trim() || undefined,
          phone: formPhone.trim() || undefined,
          email: formEmail.trim() || undefined,
          address: formAddress.trim() || undefined,
          bankName: formBankName.trim() || undefined,
          bankAccount: formBankAccount.trim() || undefined,
          mfo: formMfo.trim() || undefined,
        }),
      });

      setIsCreateOpen(false);
      resetForm();
      fetchCounterparties();
    } catch (err: any) {
      setFormError(err?.message || 'Xatolik yuz berdi');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormType('CUSTOMER');
    setFormName('');
    setFormInn('');
    setFormPhone('');
    setFormEmail('');
    setFormAddress('');
    setFormBankName('');
    setFormBankAccount('');
    setFormMfo('');
    setFormError(null);
  };

  const filtered = counterparties.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.inn && c.inn.toLowerCase().includes(q)) ||
      (c.phone && c.phone.toLowerCase().includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q))
    );
  });

  // KPI Calculations
  const totalCount = counterparties.length;
  const customersCount = counterparties.filter((c) => c.type === 'CUSTOMER' || c.type === 'BOTH').length;
  const suppliersCount = counterparties.filter((c) => c.type === 'SUPPLIER' || c.type === 'BOTH').length;
  const totalDebt = counterparties.reduce((sum, c) => sum + Number(c.debtBalance || 0), 0);

  const typeOptions: SelectOption[] = [
    { value: '', label: 'Barcha turlar' },
    { value: 'CUSTOMER', label: 'Mijozlar' },
    { value: 'SUPPLIER', label: 'Yetkazib beruvchilar' },
    { value: 'BOTH', label: 'Mijoz & Yetkazib beruvchi' },
  ];

  const getTypeBadge = (t: string) => {
    switch (t) {
      case 'CUSTOMER':
        return <Badge variant="info">Mijoz</Badge>;
      case 'SUPPLIER':
        return <Badge variant="warning">Yetkazib beruvchi</Badge>;
      case 'BOTH':
        return <Badge variant="success">Mijoz & Yetkazib beruvchi</Badge>;
      default:
        return <Badge variant="neutral">{t}</Badge>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            Kontragentlar
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            Yagona kontragentlar katalogi: Mijozlar, yetkazib beruvchilar va hamkorlar ma'lumotlar bazasi
          </p>
        </div>
        <Button onClick={() => { resetForm(); setIsCreateOpen(true); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px' }}>
          <Plus size={18} /> Yangi Kontragent
        </Button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-lg)', backgroundColor: 'rgba(99, 102, 241, 0.12)', color: 'var(--color-primary-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Users size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-tertiary)' }}>Jami Kontragentlar</div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', marginTop: '2px' }} className="tabular-nums">
              {totalCount} ta
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>Tizimdagi barcha hamkorlar</div>
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-lg)', backgroundColor: 'rgba(14, 165, 233, 0.12)', color: '#0ea5e9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UserCheck size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-tertiary)' }}>Mijozlar</div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: '#0ea5e9', marginTop: '2px' }} className="tabular-nums">
              {customersCount} ta
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>Xaridor va buyurtmachilar</div>
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-lg)', backgroundColor: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Building2 size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-tertiary)' }}>Yetkazib Beruvchilar</div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: '#f59e0b', marginTop: '2px' }} className="tabular-nums">
              {suppliersCount} ta
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>Tovar yetkazib beruvchilar</div>
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-lg)', backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <DollarSign size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-tertiary)' }}>Umumiy Qarz Balansi</div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: totalDebt >= 0 ? '#10b981' : '#ef4444', marginTop: '2px' }} className="tabular-nums">
              {formatCurrency(totalDebt, 'uz')} UZS
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>Balans holati</div>
          </div>
        </Card>
      </div>

      {/* Filter & Search Card */}
      <Card style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {/* Row 1: Search */}
        <div>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
            Qidiruv (Ism, STIR, Telefon, Email)
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
            <input
              placeholder="Kontragent nomi, STIR (INN), telefon yoki email bo'yicha qidirish..."
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

        {/* Row 2: Type Filter */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--space-3)', alignItems: 'end', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--color-border-light)' }}>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Kontragent Turi</div>
            <Select
              options={typeOptions}
              value={typeFilter}
              onChange={(val) => setTypeFilter(val)}
            />
          </div>
        </div>
      </Card>

      {/* Counterparties Table */}
      <Card style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px', display: 'block' }} />
            <div>Yuklanmoqda...</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            <Users size={48} style={{ margin: '0 auto var(--space-3)', opacity: 0.3 }} />
            <div style={{ fontWeight: 600, fontSize: 'var(--text-base)', color: 'var(--color-text-secondary)' }}>Kontragentlar topilmadi</div>
            <div style={{ fontSize: 'var(--text-xs)', marginTop: '4px' }}>Yangi kontragent qo'shish uchun yuqoridagi tugmani bosing</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-light)', backgroundColor: 'var(--color-bg-subtle)' }}>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>KONTRAGENT NOMI / STIR</th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>TURI</th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>TELEFON / EMAIL</th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>MANZIL</th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>QARZ BALANSI</th>
                  <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>AMALLAR</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    style={{ borderBottom: '1px solid var(--color-border-light)', transition: 'background-color 0.15s ease' }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{c.name}</div>
                      {c.inn && (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                          STIR: {c.inn}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>{getTypeBadge(c.type)}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)' }}>
                      {c.phone && <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={12} /> {c.phone}</div>}
                      {c.email && <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}><Mail size={12} /> {c.email}</div>}
                      {!c.phone && !c.email && '—'}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}>
                      {c.address ? <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={12} /> {c.address}</div> : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: Number(c.debtBalance) > 0 ? '#ef4444' : Number(c.debtBalance) < 0 ? '#10b981' : 'var(--color-text-secondary)' }} className="tabular-nums">
                      {formatCurrency(Number(c.debtBalance || 0), 'uz')} UZS
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <Button size="sm" variant="secondary" onClick={() => setDetailItem(c)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Eye size={14} /> Profil
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create Modal */}
      {isCreateOpen && (
        <Modal isOpen={true} onClose={() => setIsCreateOpen(false)} title="Yangi Kontragent Yaratish" size="lg">
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {formError && (
              <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: 'var(--text-sm)' }}>
                {formError}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Kontragent Turi *</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as any)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg-input)', color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)' }}
                >
                  <option value="CUSTOMER">Mijoz (Xaridor)</option>
                  <option value="SUPPLIER">Yetkazib beruvchi</option>
                  <option value="BOTH">Mijoz & Yetkazib beruvchi</option>
                </select>
              </div>

              <div>
                <Input label="Kontragent Nomi *" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Mas: 'Mega Textile' MCHJ" required />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <Input label="STIR / INN" value={formInn} onChange={(e) => setFormInn(e.target.value)} placeholder="9 xonali STIR kodi" />
              <Input label="Telefon" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="+998 90 123 45 67" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <Input label="Email" type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="info@company.uz" />
              <Input label="Yuridik Manzil" value={formAddress} onChange={(e) => setFormAddress(e.target.value)} placeholder="Toshkent sh., Chilonzor t." />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--color-border-light)' }}>
              <Input label="Bank Nomi" value={formBankName} onChange={(e) => setFormBankName(e.target.value)} placeholder="Kapitalbank ATB" />
              <Input label="Hisob Raqam (IBAN)" value={formBankAccount} onChange={(e) => setFormBankAccount(e.target.value)} placeholder="20208000..." />
              <Input label="MFO" value={formMfo} onChange={(e) => setFormMfo(e.target.value)} placeholder="00980" />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
              <Button type="button" variant="secondary" onClick={() => setIsCreateOpen(false)} disabled={submitting}>Bekor qilish</Button>
              <Button type="submit" disabled={submitting}>{submitting ? 'Saqlanmoqda...' : 'Saqlash'}</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Detail Modal */}
      {detailItem && (
        <Modal isOpen={true} onClose={() => setDetailItem(null)} title={`Kontragent Profili: ${detailItem.name}`} size="lg">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--color-bg-subtle)' }}>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>Turi</div>
                <div style={{ marginTop: 4 }}>{getTypeBadge(detailItem.type)}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>STIR / INN</div>
                <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', marginTop: 4 }}>{detailItem.inn || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>Telefon</div>
                <div style={{ fontSize: 'var(--text-sm)', marginTop: 4 }}>{detailItem.phone || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>Email</div>
                <div style={{ fontSize: 'var(--text-sm)', marginTop: 4 }}>{detailItem.email || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>Manzil</div>
                <div style={{ fontSize: 'var(--text-sm)', marginTop: 4 }}>{detailItem.address || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>Qarz Balansi</div>
                <div style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)', marginTop: 4, color: Number(detailItem.debtBalance) > 0 ? '#ef4444' : '#10b981' }}>
                  {formatCurrency(Number(detailItem.debtBalance || 0), 'uz')} UZS
                </div>
              </div>
            </div>

            {/* Bank requisites */}
            {(detailItem.bankName || detailItem.bankAccount || detailItem.mfo) && (
              <div style={{ padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-light)' }}>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Bank Rekvizitlari</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div><strong>Bank:</strong> {detailItem.bankName || '—'}</div>
                  <div><strong>Hisob raqam:</strong> {detailItem.bankAccount || '—'}</div>
                  <div><strong>MFO:</strong> {detailItem.mfo || '—'}</div>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
