'use client';

import { useMemo, useState } from 'react';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { usePersistentState } from '@/lib/usePersistentState';
import { LoadError } from '@/components/ui/LoadError';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatCurrency, errorMessage } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Checkbox } from '@/components/ui/Checkbox';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { SearchField, matchesSearch } from '@/components/ui/SearchField';
import { MultiCurrencyValue } from '@/components/ui/MultiCurrencyValue';
import { Building2, Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { SupplierProfileDrawer } from '@/components/purchases/SupplierProfileDrawer';
import { CreateCounterpartyDrawer } from '@/components/counterparties/CreateCounterpartyDrawer';
import { toast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';

interface Counterparty {
  id: string;
  name: string;
  type: string;
  inn?: string;
  phone?: string;
  email?: string;
  address?: string;
  balancesByCurrency?: Array<{ currency: string; customerDebt: number; supplierDebt: number; netBalance: number }>;
}

export default function SuppliersPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token, company } = useAuth();
  const confirm = useConfirm();

  const suppliersQuery = useApiQuery<Counterparty[]>('/sales/counterparties');
  const suppliers = useMemo(
    () => (suppliersQuery.data ?? []).filter((c) => c.type === 'SUPPLIER' || c.type === 'BOTH'),
    [suppliersQuery.data],
  );
  const loading = suppliersQuery.isPending;
  const [search, setSearch] = useState('');
  const [debtOnly, setDebtOnly] = usePersistentState('suppliers.debtOnly', false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<Counterparty | null>(null);

  const fetchSuppliers = () => void suppliersQuery.refetch();

  const handleDeleteSupplier = async (supplier: Counterparty) => {
    if (!token || !company) return;
    const ok = await confirm({
      title: isRu ? 'Удалить поставщика?' : 'Yetkazib beruvchi o‘chirilsinmi?',
      description: isRu
        ? `Поставщик «${supplier.name}» будет удалён. Если у него есть документы или долг, система не даст удалить.`
        : `«${supplier.name}» o‘chiriladi. Unda hujjatlar yoki qarz bo‘lsa, tizim o‘chirishga ruxsat bermaydi.`,
      variant: 'danger',
      confirmText: isRu ? 'Удалить' : 'O‘chirish',
      cancelText: isRu ? 'Отмена' : 'Bekor qilish',
    });
    if (!ok) return;
    try {
      await apiFetch(`/sales/counterparties/${supplier.id}`, { method: 'DELETE', token, tenantId: company.id, locale });
      toast.success(isRu ? `Поставщик «${supplier.name}» удалён` : `«${supplier.name}» o‘chirildi`);
      fetchSuppliers();
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Не удалось удалить поставщика' : 'Yetkazib beruvchini o‘chirib bo‘lmadi'));
    }
  };

  const owes = (s: Counterparty) => Boolean(s.balancesByCurrency?.some((b) => b.supplierDebt > 0));
  const filteredSuppliers = suppliers.filter((s) => (!debtOnly || owes(s)) && matchesSearch(search, s.name, s.inn, s.phone, s.address));

  const payablesByCurrency = suppliers.reduce<Record<string, number>>((totals, supplier) => {
    for (const balance of supplier.balancesByCurrency || []) {
      if (balance.supplierDebt > 0) totals[balance.currency] = (totals[balance.currency] || 0) + balance.supplierDebt;
    }
    return totals;
  }, {});

  const iconBtn = (danger?: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    background: 'none',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    color: danger ? 'var(--color-error-700)' : 'var(--color-text-primary)',
  });
  const th = { padding: '10px 12px', fontWeight: 'var(--font-medium)' } as const;

  const newButton = (
    <Button onClick={() => setIsCreateOpen(true)}>
      <Plus size={16} aria-hidden /> {isRu ? 'Новый поставщик' : 'Yangi yetkazib beruvchi'}
    </Button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ marginBottom: 'calc(-1 * var(--space-5))' }}>
        <PageHeader
          title={isRu ? 'Поставщики' : 'Yetkazib beruvchilar'}
          subtitle={isRu ? 'У кого вы закупаете: реквизиты, наш долг и история поставок.' : 'Kimdan xarid qilasiz: rekvizitlar, bizning qarzimiz va yetkazib berishlar tarixi.'}
          actions={newButton}
        />
      </div>

      <div className="ux-kpi-grid">
        <Card style={{ padding: 'var(--space-4)' }}>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{isRu ? 'Всего поставщиков' : 'Jami yetkazib beruvchilar'}</div>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', marginTop: 4 }} className="tabular-nums">{suppliers.length}</div>
        </Card>
        <Card style={{ padding: 'var(--space-4)' }}>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{isRu ? 'Мы должны' : 'Bizning qarzimiz'}</div>
          <div style={{ marginTop: 4 }}>
            <MultiCurrencyValue items={Object.entries(payablesByCurrency).map(([currency, amount]) => ({ currency, amount }))} locale={locale} color="var(--color-error-700)" />
          </div>
        </Card>
      </div>

      <Card>
        {suppliers.length > 0 && (
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
            <SearchField value={search} onChange={setSearch} placeholder={isRu ? 'Название, ИНН, телефон или адрес' : 'Nomi, STIR, telefon yoki manzil'} style={{ maxWidth: 400 }} />
            <Checkbox checked={debtOnly} onChange={(e) => setDebtOnly(e.target.checked)} label={isRu ? 'Только кому мы должны' : 'Faqat qarzimiz borlar'} />
          </div>
        )}

        {suppliersQuery.isError ? (
          <LoadError error={suppliersQuery.error} onRetry={fetchSuppliers} retrying={suppliersQuery.isFetching} />
        ) : loading ? (
          <SkeletonRows rows={6} columns={5} />
        ) : suppliers.length === 0 ? (
          <EmptyState
            icon={Building2}
            title={isRu ? 'Поставщиков пока нет' : 'Hozircha yetkazib beruvchilar yo‘q'}
            description={isRu ? 'Добавьте поставщика — его можно будет выбрать в приходе, а наш долг будет считаться сам.' : 'Yetkazib beruvchi qo‘shing — uni kirimda tanlash mumkin bo‘ladi, qarzimiz esa o‘zi hisoblanadi.'}
            action={newButton}
          />
        ) : filteredSuppliers.length === 0 ? (
          <EmptyState compact title={isRu ? 'Ничего не найдено' : 'Hech narsa topilmadi'} description={isRu ? 'Измените поиск или фильтр.' : 'Qidiruv yoki filtrni o‘zgartiring.'} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="app-table-stack" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}>
                  <th scope="col" style={th}>{isRu ? 'Поставщик' : 'Yetkazib beruvchi'}</th>
                  <th scope="col" style={th}>{isRu ? 'ИНН' : 'STIR'}</th>
                  <th scope="col" style={th}>{isRu ? 'Телефон и адрес' : 'Telefon va manzil'}</th>
                  <th scope="col" style={{ ...th, textAlign: 'right' }}>{isRu ? 'Наш долг' : 'Bizning qarzimiz'}</th>
                  <th scope="col" style={th}><span className="sr-only">{isRu ? 'Действия' : 'Amallar'}</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredSuppliers.map((s) => {
                  const balances = (s.balancesByCurrency || []).filter((balance) => balance.supplierDebt !== 0);
                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                      <td data-primary style={{ padding: '12px' }}>
                        <button type="button" onClick={() => setSelectedSupplierId(s.id)} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)', cursor: 'pointer', textAlign: 'left' }}>
                          {s.name}
                        </button>
                        {s.type === 'BOTH' && <div style={{ marginTop: 2 }}><Badge variant="neutral">{isRu ? 'Также клиент' : 'Mijoz ham'}</Badge></div>}
                      </td>
                      <td data-label={isRu ? 'ИНН' : 'STIR'} style={{ padding: '12px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{s.inn || '—'}</td>
                      <td data-label={isRu ? 'Телефон и адрес' : 'Telefon va manzil'} style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>
                        {s.phone ? <a href={`tel:${s.phone}`} style={{ color: 'inherit' }}>{s.phone}</a> : '—'}
                        {s.address && <div style={{ fontSize: 'var(--text-xs)' }}>{s.address}</div>}
                      </td>
                      <td data-label={isRu ? 'Наш долг' : 'Bizning qarzimiz'} style={{ padding: '12px', textAlign: 'right' }} className="tabular-nums">
                        {balances.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                            {balances.map((b) => (
                              <span key={b.currency} style={{ fontWeight: 'var(--font-semibold)', whiteSpace: 'nowrap', color: b.supplierDebt > 0 ? 'var(--color-error-700)' : 'var(--color-info-700)' }}>
                                {b.supplierDebt > 0 ? '' : isRu ? 'Аванс ' : 'Avans '}
                                {formatCurrency(Math.abs(b.supplierDebt), locale, b.currency)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--color-text-secondary)' }}>{isRu ? 'Нет долга' : 'Qarz yo‘q'}</span>
                        )}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                          <button type="button" style={iconBtn()} onClick={() => setSelectedSupplierId(s.id)} aria-label={isRu ? `Профиль и история: ${s.name}` : `Profil va tarix: ${s.name}`} title={isRu ? 'Профиль и история' : 'Profil va tarix'}>
                            <Eye size={14} aria-hidden />
                          </button>
                          <button type="button" style={iconBtn()} onClick={() => setEditingSupplier(s)} aria-label={isRu ? `Изменить: ${s.name}` : `Tahrirlash: ${s.name}`} title={isRu ? 'Изменить' : 'Tahrirlash'}>
                            <Pencil size={14} aria-hidden />
                          </button>
                          <button type="button" style={iconBtn(true)} onClick={() => void handleDeleteSupplier(s)} aria-label={isRu ? `Удалить: ${s.name}` : `O‘chirish: ${s.name}`} title={isRu ? 'Удалить' : 'O‘chirish'}>
                            <Trash2 size={14} aria-hidden />
                          </button>
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

      {selectedSupplierId && (
        <SupplierProfileDrawer isOpen={!!selectedSupplierId} onClose={() => setSelectedSupplierId(null)} supplierId={selectedSupplierId} />
      )}
      {isCreateOpen && (
        <CreateCounterpartyDrawer isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} defaultType="SUPPLIER" onSuccess={() => fetchSuppliers()} />
      )}
      {editingSupplier && (
        <CreateCounterpartyDrawer
          isOpen={!!editingSupplier}
          onClose={() => setEditingSupplier(null)}
          counterpartyToEdit={editingSupplier}
          defaultType="SUPPLIER"
          onSuccess={() => {
            setEditingSupplier(null);
            fetchSuppliers();
          }}
        />
      )}
    </div>
  );
}
