'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, SelectOption } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Users, Plus, Search, Filter, Phone, Mail, Building, Eye, RefreshCw } from 'lucide-react';

interface Counterparty {
  id: string;
  name: string;
  type: 'CUSTOMER' | 'SUPPLIER' | 'BOTH';
  inn?: string;
  kpp?: string;
  mfo?: string;
  bankAccount?: string;
  bankName?: string;
  phone?: string;
  email?: string;
  address?: string;
  debtBalance: number;
  createdAt: string;
}

export default function CounterpartiesPage() {
  const { token, company } = useAuth();
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  const [items, setItems] = useState<Counterparty[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [hasDebtOnly, setHasDebtOnly] = useState(false);

  // Create Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<'CUSTOMER' | 'SUPPLIER' | 'BOTH'>('CUSTOMER');
  const [formInn, setFormInn] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formBankName, setFormBankName] = useState('');
  const [formBankAccount, setFormBankAccount] = useState('');
  const [formMfo, setFormMfo] = useState('');

  // Detail Modal state
  const [detailItem, setDetailItem] = useState<Counterparty | null>(null);

  const fetchCounterparties = () => {
    if (!token || !company) return;
    setLoading(true);

    const query = new URLSearchParams();
    if (search) query.append('search', search);
    if (typeFilter) query.append('type', typeFilter);
    if (hasDebtOnly) query.append('hasDebt', 'true');

    apiFetch<Counterparty[]>(`/sales/counterparties?${query.toString()}`, {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then((res) => setItems(res || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCounterparties();
  }, [token, company, locale]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCounterparties();
    }, 300);
    return () => clearTimeout(timer);
  }, [search, typeFilter, hasDebtOnly]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError(isRu ? 'Введите наименование' : 'Kontragent nomini kiriting');
      return;
    }

    setSubmitting(true);
    setFormError('');

    try {
      await apiFetch('/sales/counterparties', {
        method: 'POST',
        token: token || undefined,
        tenantId: company?.id,
        locale,
        body: JSON.stringify({
          name: formName,
          type: formType,
          inn: formInn || undefined,
          phone: formPhone || undefined,
          email: formEmail || undefined,
          address: formAddress || undefined,
          bankName: formBankName || undefined,
          bankAccount: formBankAccount || undefined,
          mfo: formMfo || undefined,
        }),
      });

      setIsCreateOpen(false);
      resetForm();
      fetchCounterparties();
    } catch (err: any) {
      setFormError(err?.message || (isRu ? 'Ошибка сохранения' : 'Saqlashda xatolik yuz berdi'));
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormName('');
    setFormType('CUSTOMER');
    setFormInn('');
    setFormPhone('');
    setFormEmail('');
    setFormAddress('');
    setFormBankName('');
    setFormBankAccount('');
    setFormMfo('');
    setFormError('');
  };

  const getTypeBadge = (t: string) => {
    switch (t) {
      case 'CUSTOMER':
        return <Badge variant="info">{isRu ? 'Клиент' : 'Mijoz'}</Badge>;
      case 'SUPPLIER':
        return <Badge variant="warning">{isRu ? 'Поставщик' : 'Yetkazib beruvchi'}</Badge>;
      case 'BOTH':
        return <Badge variant="success">{isRu ? 'Клиент и Поставщик' : 'Mijoz & Yetkazib beruvchi'}</Badge>;
      default:
        return <Badge variant="neutral">{t}</Badge>;
    }
  };

  const totalCustomers = items.filter((i) => i.type === 'CUSTOMER' || i.type === 'BOTH').length;
  const totalSuppliers = items.filter((i) => i.type === 'SUPPLIER' || i.type === 'BOTH').length;
  const totalDebtors = items.filter((i) => Number(i.debtBalance) > 0).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {isRu ? 'Контрагенты' : 'Kontragentlar'}
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: 4 }}>
            {isRu ? 'База данных клиентов и поставщиков компании, баланс задолженности' : 'Kompaniya mijozlari va yetkazib beruvchilar bazasi, qarz balansi'}
          </p>
        </div>
        <Button onClick={() => { resetForm(); setIsCreateOpen(true); }} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={16} />
          {isRu ? 'Новый контрагент' : 'Yangi Kontragent'}
        </Button>
      </div>

      {/* Summary KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
        <Card style={{ padding: 'var(--space-4)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{isRu ? 'Клиенты' : 'Mijozlar'}</div>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, marginTop: 4, color: 'var(--color-primary-600)' }}>{totalCustomers}</div>
        </Card>
        <Card style={{ padding: 'var(--space-4)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{isRu ? 'Поставщики' : 'Yetkazib beruvchilar'}</div>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, marginTop: 4, color: '#f59e0b' }}>{totalSuppliers}</div>
        </Card>
        <Card style={{ padding: 'var(--space-4)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{isRu ? 'Должники' : 'Qarzdorlar'}</div>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, marginTop: 4, color: '#ef4444' }}>{totalDebtors}</div>
        </Card>
      </div>

      {/* Filter toolbar */}
      <Card style={{ padding: 'var(--space-4)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 220px', position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
            <input
              placeholder={isRu ? 'Наименование, ИНН, телефон...' : 'Nomi, STIR, telefon...'}
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

          <Select
            value={typeFilter}
            onChange={(val) => setTypeFilter(val)}
            options={[
              { value: '', label: isRu ? 'Все типы' : 'Barcha turlar' },
              { value: 'CUSTOMER', label: isRu ? 'Только клиенты' : 'Faqat mijozlar' },
              { value: 'SUPPLIER', label: isRu ? 'Только поставщики' : 'Faqat yetkazib beruvchilar' },
              { value: 'BOTH', label: isRu ? 'Клиент и Поставщик' : 'Mijoz va yetkazib beruvchi' },
            ]}
          />

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 'var(--text-sm)' }}>
            <input
              type="checkbox"
              checked={hasDebtOnly}
              onChange={(e) => setHasDebtOnly(e.target.checked)}
              style={{ accentColor: 'var(--color-primary-600)' }}
            />
            {isRu ? 'Только с долгом' : 'Faqat qarzi borlar'}
          </label>
        </div>
      </Card>

      {/* Table */}
      <Card style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px', display: 'block' }} />
            {isRu ? 'Загрузка...' : 'Yuklanmoqda...'}
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            <Users size={40} style={{ margin: '0 auto 12px', opacity: 0.3, display: 'block' }} />
            {isRu ? 'Контрагенты не найдены' : 'Kontragentlar topilmadi'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-light)', backgroundColor: 'var(--color-bg-subtle)' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>{isRu ? 'НАИМЕНОВАНИЕ' : 'KONTRAGENT NOMI'}</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>{isRu ? 'ТИП' : 'TURI'}</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>{isRu ? 'ИНН / STIR' : 'STIR / INN'}</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left' }}>{isRu ? 'ТЕЛЕФОН' : 'TELEFON'}</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>{isRu ? 'БАЛАНС ДОЛГА' : 'QARZ BALANSI'}</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>{isRu ? 'ДЕЙСТВИЯ' : 'AMALLAR'}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>{item.name}</td>
                    <td style={{ padding: '12px 16px' }}>{getTypeBadge(item.type)}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)' }}>{item.inn || '—'}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)' }}>{item.phone || '—'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: Number(item.debtBalance) > 0 ? '#ef4444' : '#10b981' }}>
                      {formatCurrency(Number(item.debtBalance || 0), locale)} UZS
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <Button size="sm" variant="secondary" onClick={() => setDetailItem(item)}>
                        <Eye size={14} style={{ marginRight: 4 }} /> {isRu ? 'Просмотр' : 'Ko\'rish'}
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
        <Modal isOpen={true} onClose={() => setIsCreateOpen(false)} title={isRu ? 'Создание контрагента' : 'Yangi Kontragent Yaratish'} size="lg">
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {formError && (
              <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: 'var(--text-sm)' }}>
                {formError}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <Select
                label={isRu ? 'Тип контрагента *' : 'Kontragent Turi *'}
                value={formType}
                onChange={(val) => setFormType(val as any)}
                options={[
                  { value: 'CUSTOMER', label: isRu ? 'Клиент (Покупатель)' : 'Mijoz (Xaridor)' },
                  { value: 'SUPPLIER', label: isRu ? 'Поставщик' : 'Yetkazib beruvchi' },
                  { value: 'BOTH', label: isRu ? 'Клиент и Поставщик' : 'Mijoz & Yetkazib beruvchi' },
                ]}
              />

              <div>
                <Input label={isRu ? 'Наименование контрагента *' : 'Kontragent Nomi *'} value={formName} onChange={(e) => setFormName(e.target.value)} placeholder={isRu ? "Например: ООО 'Mega Textile'" : "Mas: 'Mega Textile' MCHJ"} required />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <Input label={isRu ? 'ИНН' : 'STIR / INN'} value={formInn} onChange={(e) => setFormInn(e.target.value)} placeholder={isRu ? '9-значный код ИНН' : '9 xonali STIR kodi'} />
              <Input label={isRu ? 'Телефон' : 'Telefon'} value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="+998 90 123 45 67" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <Input label="Email" type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="info@company.uz" />
              <Input label={isRu ? 'Юридический адрес' : 'Yuridik Manzil'} value={formAddress} onChange={(e) => setFormAddress(e.target.value)} placeholder={isRu ? 'г. Ташкент, Чиланзарский р-н' : 'Toshkent sh., Chilonzor t.'} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--color-border-light)' }}>
              <Input label={isRu ? 'Наименование банка' : 'Bank Nomi'} value={formBankName} onChange={(e) => setFormBankName(e.target.value)} placeholder={isRu ? 'АКБ Капиталбанк' : 'Kapitalbank ATB'} />
              <Input label={isRu ? 'Расчётный счёт' : 'Hisob Raqam (IBAN)'} value={formBankAccount} onChange={(e) => setFormBankAccount(e.target.value)} placeholder="20208000..." />
              <Input label="MFO" value={formMfo} onChange={(e) => setFormMfo(e.target.value)} placeholder="00980" />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
              <Button type="button" variant="secondary" onClick={() => setIsCreateOpen(false)} disabled={submitting}>
                {isRu ? 'Отмена' : 'Bekor qilish'}
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (isRu ? 'Сохранение...' : 'Saqlanmoqda...') : (isRu ? 'Сохранить' : 'Saqlash')}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Detail Modal */}
      {detailItem && (
        <Modal isOpen={true} onClose={() => setDetailItem(null)} title={`${isRu ? 'Профиль контрагента:' : 'Kontragent Profili:'} ${detailItem.name}`} size="lg">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--color-bg-subtle)' }}>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Тип' : 'Turi'}</div>
                <div style={{ marginTop: 4 }}>{getTypeBadge(detailItem.type)}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'ИНН' : 'STIR / INN'}</div>
                <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', marginTop: 4 }}>{detailItem.inn || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Телефон' : 'Telefon'}</div>
                <div style={{ fontSize: 'var(--text-sm)', marginTop: 4 }}>{detailItem.phone || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>Email</div>
                <div style={{ fontSize: 'var(--text-sm)', marginTop: 4 }}>{detailItem.email || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Адрес' : 'Manzil'}</div>
                <div style={{ fontSize: 'var(--text-sm)', marginTop: 4 }}>{detailItem.address || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Баланс долга' : 'Qarz Balansi'}</div>
                <div style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)', marginTop: 4, color: Number(detailItem.debtBalance) > 0 ? '#ef4444' : '#10b981' }}>
                  {formatCurrency(Number(detailItem.debtBalance || 0), locale)} UZS
                </div>
              </div>
            </div>

            {/* Bank requisites */}
            {(detailItem.bankName || detailItem.bankAccount || detailItem.mfo) && (
              <div style={{ padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-light)' }}>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                  {isRu ? 'Банковские реквизиты' : 'Bank Rekvizitlari'}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div><strong>{isRu ? 'Банк:' : 'Bank:'}</strong> {detailItem.bankName || '—'}</div>
                  <div><strong>{isRu ? 'Расчётный счёт:' : 'Hisob raqam:'}</strong> {detailItem.bankAccount || '—'}</div>
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
