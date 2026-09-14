'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Users, Search, DollarSign, Eye, Pencil, Trash2, Plus } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { CreateCounterpartyDrawer } from '@/components/counterparties/CreateCounterpartyDrawer';
import { toast } from '@/context/ToastContext';

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
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchCustomers = () => {
    if (!token || !company) return;
    setLoading(true);
    apiFetch<Customer[]>('/sales/counterparties?type=CUSTOMER', {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then(setCustomers)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const handleDeleteCustomer = async () => {
    if (!deletingCustomer || !token || !company) return;
    setDeleteLoading(true);
    try {
      await apiFetch(`/sales/counterparties/${deletingCustomer.id}`, {
        method: 'DELETE',
        token,
        tenantId: company.id,
        locale,
      });
      setDeletingCustomer(null);
      toast.success(isRu ? 'Клиент успешно удален' : 'Mijoz muvaffaqiyatli o‘chirildi');
      fetchCustomers();
    } catch (err: any) {
      toast.error(err.message || (isRu ? 'Ошибка при удалении клиента' : 'Mijozni o‘chirishda xatolik yuz berdi'));
    } finally {
      setDeleteLoading(false);
    }
  };

  useEffect(() => { fetchCustomers(); }, [token, company, locale]);

  const handleViewProfile = async (customer: Customer) => {
    if (!token || !company) return;
    setSelectedCustomer(customer);
    setProfileLoading(true);
    try {
      const res = await apiFetch<CustomerProfile>(`/sales/customers/${customer.id}/profile`, {
        token: token || undefined,
        tenantId: company.id,
        locale,
      });
      setProfile(res);
    } catch (err) {
      console.error(err);
    } finally {
      setProfileLoading(false);
    }
  };

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      (c.phone && c.phone.toLowerCase().includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q))
    );
  });

  const totalDebt = customers.reduce((sum, c) => sum + Number(c.debtBalance || 0), 0);
  const customersWithDebt = customers.filter((c) => Number(c.debtBalance || 0) > 0).length;

  const tableHeaders = [
    isRu ? 'Имя клиента' : 'Mijoz nomi',
    isRu ? 'Телефон' : 'Telefon',
    isRu ? 'Email' : 'Email',
    isRu ? 'Баланс долга' : 'Qarz balansi',
    isRu ? 'Тип' : 'Tur',
    isRu ? 'Действия' : 'Amallar',
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
            {isRu ? 'Клиенты' : 'Mijozlar'}
          </h1>
        </div>
        <Button
          onClick={() => setIsCreateOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px' }}
        >
          <Plus size={18} /> {isRu ? 'Новый клиент' : 'Yangi Mijoz'}
        </Button>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 'var(--space-4)' }}>
        <Card style={{ padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={18} color="var(--color-primary-600)" />
            </div>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{isRu ? 'Всего клиентов' : 'Jami mijozlar'}</span>
          </div>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>{customers.length}</div>
        </Card>
        <Card style={{ padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DollarSign size={18} color="#f59e0b" />
            </div>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{isRu ? 'Общий долг' : 'Umumiy qarz'}</span>
          </div>
          <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: '#f59e0b' }}>{formatCurrency(totalDebt, locale)}</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 4 }}>{customersWithDebt} {isRu ? 'клиентов' : 'ta mijozda'}</div>
        </Card>
      </div>

      {/* Search */}
      <Card style={{ padding: 'var(--space-4)' }}>
        <div style={{ position: 'relative', maxWidth: 400 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
          <input
            id="customer-search-input"
            placeholder={isRu ? 'Имя, телефон или email...' : 'Ism, telefon yoki email...'}
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
                {tableHeaders.map((h) => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)' }}>{isRu ? 'Загрузка...' : 'Yuklanmoqda...'}</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)' }}>
                    <Users size={36} style={{ margin: '0 auto 10px', opacity: 0.3, display: 'block' }} />
                    {isRu ? 'Клиенты не найдены' : 'Mijozlar topilmadi'}
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
                        {debt > 0 ? formatCurrency(debt, locale, (c as any).currency || 'USD') : '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <Badge variant={c.type === 'BOTH' ? 'warning' : 'neutral'}>
                          {c.type === 'CUSTOMER' ? (isRu ? 'Клиент' : 'Mijoz') : c.type === 'BOTH' ? (isRu ? 'Клиент и Пост.' : 'Mijoz & Yetk.') : c.type}
                        </Badge>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                          <button
                            id={`view-customer-${c.id}`}
                            onClick={() => handleViewProfile(c)}
                            title={isRu ? 'Профиль' : 'Profil'}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '30px', background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-text-primary)' }}
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            id={`edit-customer-${c.id}`}
                            onClick={() => setEditingCustomer(c)}
                            title={isRu ? 'Редактировать' : 'Tahrirlash'}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '30px', background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-text-primary)' }}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            id={`delete-customer-${c.id}`}
                            onClick={() => setDeletingCustomer(c)}
                            title={isRu ? 'Удалить' : 'O‘chirish'}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '30px', background: 'none', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: '#ef4444' }}
                          >
                            <Trash2 size={14} />
                          </button>
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

      {/* Customer Profile Modal */}
      {selectedCustomer && (() => {
        const custCurrency = profile?.invoices?.[0]?.currency || (selectedCustomer as any)?.currency || 'USD';
        return (
          <Modal isOpen={true} onClose={() => { setSelectedCustomer(null); setProfile(null); }} title={`${isRu ? 'Профиль клиента' : 'Mijoz'}: ${selectedCustomer.name}`} size="xl">
            {profileLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)' }}>{isRu ? 'Загрузка...' : 'Yuklanmoqda...'}</div>
            ) : profile ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 'var(--space-3)', background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)' }}>
                  {[
                    { label: isRu ? 'Всего продаж' : 'Jami sotuv', value: formatCurrency(profile.metrics.totalSales, locale, custCurrency), color: undefined },
                    { label: isRu ? 'Оплачено' : 'To\'langan', value: formatCurrency(profile.metrics.totalPaid, locale, custCurrency), color: '#10b981' },
                    { label: isRu ? 'Долг' : 'Qarz', value: formatCurrency(profile.metrics.debtBalance, locale, custCurrency), color: '#f59e0b' },
                    { label: isRu ? 'Возвраты' : 'Qaytarishlar', value: formatCurrency(profile.metrics.totalReturned, locale, custCurrency), color: '#ef4444' },
                    { label: isRu ? 'Валовая прибыль' : 'Yalpi foyda', value: formatCurrency(profile.metrics.grossProfit, locale, custCurrency), color: profile.metrics.grossProfit >= 0 ? '#10b981' : '#ef4444' },
                  ].map((m) => (
                    <div key={m.label} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{m.label}</div>
                      <div style={{ fontWeight: 700, fontSize: 'var(--text-lg)', marginTop: 4, color: m.color }}>{m.value}</div>
                    </div>
                  ))}
                </div>

                {profile.invoices.length > 0 && (
                  <div>
                    <h3 style={{ fontWeight: 600, marginBottom: 10 }}>{isRu ? 'Последние продажи' : 'So\'nggi sotuvlar'}</h3>
                    <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: 'var(--color-bg-subtle)' }}>
                            {[isRu ? '№ Документа' : 'Hujjat №', isRu ? 'Дата' : 'Sana', isRu ? 'Сумма' : 'Summa', isRu ? 'Статус' : 'Holat'].map((h) => (
                              <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--color-border)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {profile.invoices.slice(0, 8).map((inv: any) => (
                            <tr key={inv.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                              <td style={{ padding: '8px 12px', fontSize: 'var(--text-sm)', fontWeight: 600 }}>{inv.invoiceNumber}</td>
                              <td style={{ padding: '8px 12px', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{formatDate(inv.invoiceDate, locale)}</td>
                              <td style={{ padding: '8px 12px', fontSize: 'var(--text-sm)', fontWeight: 600 }}>{formatCurrency(Number(inv.totalAmount), locale, inv.currency || custCurrency)}</td>
                              <td style={{ padding: '8px 12px' }}>
                                <Badge variant={inv.status === 'POSTED' ? 'success' : inv.status === 'DRAFT' ? 'warning' : 'error'}>
                                  {inv.status === 'POSTED' ? (isRu ? 'Проведён' : 'Tasdiqlangan') : inv.status === 'DRAFT' ? (isRu ? 'Черновик' : 'Qoralama') : inv.status}
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
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)' }}>{isRu ? 'Данные не загружены' : 'Ma\'lumot yuklanmadi'}</div>
            )}
          </Modal>
        );
      })()}
      {/* Create Customer Drawer */}
      {isCreateOpen && (
        <CreateCounterpartyDrawer
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          defaultType="CUSTOMER"
          onSuccess={() => fetchCustomers()}
        />
      )}

      {/* Edit Customer Drawer */}
      {editingCustomer && (
        <CreateCounterpartyDrawer
          isOpen={!!editingCustomer}
          onClose={() => setEditingCustomer(null)}
          counterpartyToEdit={editingCustomer}
          defaultType="CUSTOMER"
          onSuccess={() => {
            setEditingCustomer(null);
            fetchCustomers();
          }}
        />
      )}

      {/* Delete Customer Confirmation Modal */}
      {deletingCustomer && (
        <Modal
          isOpen={true}
          onClose={() => setDeletingCustomer(null)}
          title={isRu ? 'Удаление клиента' : 'Mijozni o‘chirish'}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
              {isRu
                ? `Вы действительно хотите удалить клиента "${deletingCustomer.name}"? Если у клиента есть связанные документы или долг, удаление будет отклонено.`
                : `Haqiqatan ham "${deletingCustomer.name}" mijozini o‘chirmoqchimisiz? Agar mijozga bog‘langan hujjatlar yoki qarz bo‘lsa, o‘chirish rad etiladi.`}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
              <Button
                variant="secondary"
                onClick={() => setDeletingCustomer(null)}
                disabled={deleteLoading}
              >
                {isRu ? 'Отмена' : 'Bekor qilish'}
              </Button>
              <Button
                variant="danger"
                onClick={handleDeleteCustomer}
                disabled={deleteLoading}
              >
                {deleteLoading ? (isRu ? 'Удаление...' : 'O‘chirilmoqda...') : (isRu ? 'Удалить' : 'O‘chirish')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
