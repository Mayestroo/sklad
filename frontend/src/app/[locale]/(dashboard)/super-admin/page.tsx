'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  ShieldCheck,
  Building2,
  Users,
  DollarSign,
  TrendingUp,
  Megaphone,
  LifeBuoy,
  Edit,
  CheckCircle2,
  Lock,
  MessageSquare,
} from 'lucide-react';
import { GlobalMetrics, TenantCompanySummary, SupportTicket } from '@shared/types';

export default function SuperAdminPage() {
  const tCommon = useTranslations('common');
  const locale = useLocale() as 'uz' | 'ru';
  const { token, company } = useAuth();

  const [metrics, setMetrics] = useState<GlobalMetrics | null>(null);
  const [tenants, setTenants] = useState<TenantCompanySummary[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit tenant modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<TenantCompanySummary | null>(null);
  const [tenantStatus, setTenantStatus] = useState<'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'BLOCKED'>('ACTIVE');
  const [tenantPlan, setTenantPlan] = useState<'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE'>('PROFESSIONAL');

  // Announcement modal
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [titleUz, setTitleUz] = useState('');
  const [titleRu, setTitleRu] = useState('');
  const [msgUz, setMsgUz] = useState('');
  const [msgRu, setMsgRu] = useState('');

  // Ticket reply modal
  const [replyModalOpen, setReplyModalOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [replyText, setReplyText] = useState('');

  const fetchSuperAdminData = async () => {
    if (!token || !company) return;
    setLoading(true);
    try {
      const [m, t, tick] = await Promise.all([
        apiFetch<GlobalMetrics>('/super-admin/metrics', { token, tenantId: company.id, locale }),
        apiFetch<TenantCompanySummary[]>('/super-admin/tenants', { token, tenantId: company.id, locale }),
        apiFetch<SupportTicket[]>('/super-admin/tickets', { token, tenantId: company.id, locale }),
      ]);
      setMetrics(m);
      setTenants(t);
      setTickets(tick);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuperAdminData();
  }, [token, company]);

  const handleOpenEditModal = (tenant: TenantCompanySummary) => {
    setSelectedTenant(tenant);
    setTenantStatus(tenant.status);
    setTenantPlan(tenant.plan);
    setEditModalOpen(true);
  };

  const handleSaveTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !company || !selectedTenant) return;
    try {
      await apiFetch(`/super-admin/tenants/${selectedTenant.id}`, {
        token,
        tenantId: company.id,
        locale,
        method: 'PUT',
        body: JSON.stringify({ status: tenantStatus, plan: tenantPlan }),
      });
      setEditModalOpen(false);
      fetchSuperAdminData();
    } catch (err: any) {
      alert(err.message || 'Error updating tenant');
    }
  };

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !company || !titleUz || !msgUz) return;
    try {
      await apiFetch('/super-admin/announcements', {
        token,
        tenantId: company.id,
        locale,
        method: 'POST',
        body: JSON.stringify({
          title: { uz: titleUz, ru: titleRu || titleUz },
          message: { uz: msgUz, ru: msgRu || msgUz },
        }),
      });
      setAnnouncementModalOpen(false);
      setTitleUz('');
      setTitleRu('');
      setMsgUz('');
      setMsgRu('');
      alert('Barcha mijozlarga tizim e\'loni muvaffaqiyatli yuborildi!');
    } catch (err: any) {
      alert(err.message || 'Error sending announcement');
    }
  };

  const handleReplyTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !company || !selectedTicket || !replyText) return;
    try {
      await apiFetch(`/super-admin/tickets/${selectedTicket.id}/reply`, {
        token,
        tenantId: company.id,
        locale,
        method: 'POST',
        body: JSON.stringify({ message: replyText }),
      });
      setReplyModalOpen(false);
      setReplyText('');
      fetchSuperAdminData();
    } catch (err: any) {
      alert(err.message || 'Error replying to ticket');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge variant="success">Faol (ACTIVE)</Badge>;
      case 'TRIAL':
        return <Badge variant="warning">Sinovda (TRIAL)</Badge>;
      case 'SUSPENDED':
        return <Badge variant="neutral">Vaqtinchalik (SUSPENDED)</Badge>;
      case 'BLOCKED':
        return <Badge variant="error">Bloklangan (BLOCKED)</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            Super-Admin Boshqaruv Markazi (SaaS Owner Panel)
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
            Barcha client kompaniyalar, global MRR tushumi, tariflar va texnik yordam boshqaruvi
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <Button variant="primary" onClick={() => setAnnouncementModalOpen(true)}>
            <Megaphone size={16} /> 2 Tilli Tizim E&apos;loni Yuborish
          </Button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
          {tCommon('loading')}
        </div>
      ) : (
        <>
          {/* Global SaaS Metrics Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
            <Card style={{ borderLeft: '4px solid var(--color-primary-600)' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-tertiary)' }}>GLOBAL MRR (OYLIK DOIMIY TUSHUM)</div>
              <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-primary-600)', marginTop: '8px' }} className="tabular-nums">
                {formatCurrency(metrics?.totalMrr || 0, locale)}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                Barcha aktiv obunalar yig&apos;indisi
              </div>
            </Card>

            <Card style={{ borderLeft: '4px solid var(--color-success-600)' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-tertiary)' }}>FAOL KOMPANIYALAR (ACTIVE TENANTS)</div>
              <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-success-600)', marginTop: '8px' }}>
                {metrics?.activeTenantsCount || 0} ta Kompaniya
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                Obunasi to&apos;langan aktiv mijozlar
              </div>
            </Card>

            <Card style={{ borderLeft: '4px solid var(--color-warning-600)' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-tertiary)' }}>SINOV DAVRIDAGI MIJOZLAR (TRIAL)</div>
              <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-warning-600)', marginTop: '8px' }}>
                {metrics?.trialTenantsCount || 0} ta Kompaniya
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                14 kunlik bepul trial ishlatayotganlar
              </div>
            </Card>

            <Card style={{ borderLeft: '4px solid #8b5cf6' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-tertiary)' }}>JAMI FOYDALANUVCHILAR</div>
              <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: '#8b5cf6', marginTop: '8px' }}>
                {metrics?.totalUsersCount || 0} ta Xodim
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                Barcha tizim foydalanuvchilari
              </div>
            </Card>
          </div>

          {/* Client Companies Directory Table */}
          <Card>
            <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-4)' }}>
              Client Kompaniyalar Ro&apos;yxati (Tenants Directory)
            </h3>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>
                    <th style={{ padding: '12px' }}>KOMPANIYA NOMI</th>
                    <th style={{ padding: '12px' }}>SLUG</th>
                    <th style={{ padding: '12px' }}>TARIF REJASI</th>
                    <th style={{ padding: '12px', textAlign: 'center' }}>XODIMLAR</th>
                    <th style={{ padding: '12px' }}>RO&apos;YXATDAN O&apos;TGAN SANA</th>
                    <th style={{ padding: '12px' }}>HOLATI</th>
                    <th style={{ padding: '12px', textAlign: 'right' }}>AMALLAR</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((ten) => (
                    <tr key={ten.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                      <td style={{ padding: '12px', fontWeight: 'bold' }}>
                        {ten.name[locale] || ten.name.uz}
                      </td>
                      <td style={{ padding: '12px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                        {ten.slug}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <Badge variant="neutral">{ten.plan}</Badge>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold' }}>
                        {ten.userCount}
                      </td>
                      <td style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>
                        {formatDate(ten.createdAt, locale)}
                      </td>
                      <td style={{ padding: '12px' }}>{getStatusBadge(ten.status)}</td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <Button size="sm" variant="outline" onClick={() => handleOpenEditModal(ten)}>
                          <Edit size={14} /> Boshqarish
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Support Tickets Section */}
          <Card>
            <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-4)' }}>
              Texnik Yordam Murojaatlari (Support Tickets)
            </h3>

            {tickets.length === 0 ? (
              <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
                Hozircha ochiq murojaatlar mavjud emas
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>
                      <th style={{ padding: '12px' }}>MAVZU</th>
                      <th style={{ padding: '12px' }}>KOMPANIYA</th>
                      <th style={{ padding: '12px' }}>MUHIMLIGI</th>
                      <th style={{ padding: '12px' }}>SANA</th>
                      <th style={{ padding: '12px' }}>HOLATI</th>
                      <th style={{ padding: '12px', textAlign: 'right' }}>AMAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((t) => (
                      <tr key={t.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                        <td style={{ padding: '12px', fontWeight: 'bold' }}>{t.subject}</td>
                        <td style={{ padding: '12px' }}>{t.companyName ? (t.companyName[locale] || t.companyName.uz) : '—'}</td>
                        <td style={{ padding: '12px' }}>
                          <Badge variant={t.priority === 'HIGH' ? 'error' : 'neutral'}>{t.priority}</Badge>
                        </td>
                        <td style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>{formatDate(t.createdAt, locale)}</td>
                        <td style={{ padding: '12px' }}>
                          <Badge variant={t.status === 'RESOLVED' ? 'success' : 'warning'}>{t.status}</Badge>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          <Button size="sm" variant="outline" onClick={() => { setSelectedTicket(t); setReplyModalOpen(true); }}>
                            <MessageSquare size={14} /> Javob berish
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {/* Edit Tenant Modal */}
      <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} title="Kompaniya Status va Tarifini Boshqarish">
        <form onSubmit={handleSaveTenant} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Select
            label="Statusni Tanlang:"
            options={[
              { value: 'ACTIVE', label: 'Faol (ACTIVE)' },
              { value: 'TRIAL', label: 'Sinovda (TRIAL)' },
              { value: 'SUSPENDED', label: 'Vaqtinchalik to\'xtatilgan (SUSPENDED)' },
              { value: 'BLOCKED', label: 'Bloklangan (BLOCKED)' },
            ]}
            value={tenantStatus}
            onChange={(val) => setTenantStatus(val as any)}
          />

          <Select
            label="Tarif Rejasini Tanlang:"
            options={[
              { value: 'STARTER', label: 'Starter (490,000 UZS/mo)' },
              { value: 'PROFESSIONAL', label: 'Professional (990,000 UZS/mo)' },
              { value: 'ENTERPRISE', label: 'Enterprise (1,990,000 UZS/mo)' },
            ]}
            value={tenantPlan}
            onChange={(val) => setTenantPlan(val as any)}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            <Button type="button" variant="outline" onClick={() => setEditModalOpen(false)}>Bekor qilish</Button>
            <Button type="submit" variant="primary">Saqlash</Button>
          </div>
        </form>
      </Modal>

      {/* Broadcast Announcement Modal */}
      <Modal isOpen={announcementModalOpen} onClose={() => setAnnouncementModalOpen(false)} title="2 Tilli Tizim E'lonini Yuborish">
        <form onSubmit={handleCreateAnnouncement} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Input label="E'lon Sarlavhasi (O'zbekcha)" value={titleUz} onChange={(e) => setTitleUz(e.target.value)} required />
          <Input label="Заголовок объявления (Русский)" value={titleRu} onChange={(e) => setTitleRu(e.target.value)} />

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>E&apos;lon Matni (O&apos;zbekcha):</label>
            <textarea
              rows={3}
              value={msgUz}
              onChange={(e) => setMsgUz(e.target.value)}
              required
              style={{ width: '100%', padding: '8px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: 'var(--text-sm)', outline: 'none' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>Текст объявления (Русский):</label>
            <textarea
              rows={3}
              value={msgRu}
              onChange={(e) => setMsgRu(e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: 'var(--text-sm)', outline: 'none' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            <Button type="button" variant="outline" onClick={() => setAnnouncementModalOpen(false)}>Bekor qilish</Button>
            <Button type="submit" variant="primary">Tarqatish (Broadcast)</Button>
          </div>
        </form>
      </Modal>

      {/* Ticket Reply Modal */}
      <Modal isOpen={replyModalOpen} onClose={() => setReplyModalOpen(false)} title="Texnik Murojaatga Javob Berish">
        <form onSubmit={handleReplyTicket} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'bold' }}>
            Mavzu: {selectedTicket?.subject}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>Javob matni:</label>
            <textarea
              rows={4}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              required
              placeholder="Mijozga texnik yordam javobini kiriting..."
              style={{ width: '100%', padding: '8px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: 'var(--text-sm)', outline: 'none' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            <Button type="button" variant="outline" onClick={() => setReplyModalOpen(false)}>Bekor qilish</Button>
            <Button type="submit" variant="primary">Javobni Yuborish</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
