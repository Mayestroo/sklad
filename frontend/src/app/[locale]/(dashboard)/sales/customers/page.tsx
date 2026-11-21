'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale, useTranslations } from 'next-intl';
import { ActionsMenu } from '@/components/production/ActionsMenu';
import { QuickPaymentModal } from '@/components/counterparties/QuickPaymentModal';
import { ChipGroup, ColumnChooser, Signal, SignalStrip } from '@/components/ui/list/ListKit';
import { DataTable, type Column, type SortState } from '@/components/ui/list/DataTable';
import { Link } from '@/i18n/navigation';
import { apiFetch } from '@/lib/api';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { usePersistentState } from '@/lib/usePersistentState';
import { LoadError } from '@/components/ui/LoadError';
import { formatCurrency, formatDate, errorMessage } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { SearchField, matchesSearch } from '@/components/ui/SearchField';
import { DocumentStatusBadge } from '@/components/ui/DocumentStatusBadge';
import { Users, Plus, CreditCard } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { MultiCurrencyValue } from '@/components/ui/MultiCurrencyValue';
import { CreateCounterpartyDrawer } from '@/components/counterparties/CreateCounterpartyDrawer';
import { toast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';

interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  type: string;
  balancesByCurrency?: Array<{ currency: string; customerDebt: number; supplierDebt: number; netBalance: number }>;
}

interface CustomerProfile {
  customer: Customer;
  metrics: {
    totalSales: number;
    totalPaid: number;
    totalReturned: number;
    totalSalesByCurrency: Array<{ currency: string; amount: number }>;
    totalPaidByCurrency: Array<{ currency: string; amount: number }>;
    totalReturnedByCurrency: Array<{ currency: string; amount: number }>;
    balancesByCurrency: NonNullable<Customer['balancesByCurrency']>;
    customerAdvancesByCurrency: Array<{ currency: string; amount: number }>;
    totalCogs: number;
    grossProfit: number;
  };
  invoices: Array<{ id: string; invoiceNumber: string; invoiceDate: string; status: string; currency: string; totalAmount: number | string }>;
  returns: unknown[];
  payments: unknown[];
}

/** Debt per currency: positive = the customer owes us, negative = an advance we hold. */
function DebtLines({ balances, locale }: { balances: NonNullable<Customer['balancesByCurrency']>; locale: 'uz' | 'ru' }) {
  const isRu = locale === 'ru';
  const lines = balances.filter((b) => b.customerDebt !== 0);
  if (lines.length === 0) return <span style={{ color: 'var(--color-text-secondary)' }}>{isRu ? 'Нет долга' : 'Qarz yo‘q'}</span>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
      {lines.map((b) => (
        <span key={b.currency} className="tabular-nums" style={{ fontWeight: 'var(--font-semibold)', color: b.customerDebt > 0 ? 'var(--color-warning-700)' : 'var(--color-info-700)', whiteSpace: 'nowrap' }}>
          {b.customerDebt > 0 ? '' : isRu ? 'Аванс ' : 'Avans '}
          {formatCurrency(Math.abs(b.customerDebt), locale, b.currency)}
        </span>
      ))}
    </div>
  );
}

export default function CustomersPage() {
  const { token, company } = useAuth();
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const tIn = useTranslations('rd.inline');
  const confirm = useConfirm();

  const customersQuery = useApiQuery<Customer[]>('/sales/counterparties?type=CUSTOMER');
  const customers = useMemo(() => customersQuery.data ?? [], [customersQuery.data]);
  const loading = customersQuery.isPending;
  const [search, setSearch] = useState('');
  const [debtOnly, setDebtOnly] = usePersistentState('customers.debtOnly', false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const profileQuery = useApiQuery<CustomerProfile>(selectedCustomer ? `/sales/customers/${selectedCustomer.id}/profile` : null);
  const profile = profileQuery.data ?? null;
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const fetchCustomers = () => void customersQuery.refetch();

  const handleDeleteCustomer = async (customer: Customer) => {
    if (!token || !company) return;
    const ok = await confirm({
      title: isRu ? 'Удалить клиента?' : 'Mijoz o‘chirilsinmi?',
      description: isRu
        ? `Клиент «${customer.name}» будет удалён. Если у него есть документы или долг, система не даст удалить.`
        : `«${customer.name}» mijozi o‘chiriladi. Unda hujjatlar yoki qarz bo‘lsa, tizim o‘chirishga ruxsat bermaydi.`,
      variant: 'danger',
      confirmText: isRu ? 'Удалить' : 'O‘chirish',
      cancelText: isRu ? 'Отмена' : 'Bekor qilish',
    });
    if (!ok) return;
    try {
      await apiFetch(`/sales/counterparties/${customer.id}`, { method: 'DELETE', token, tenantId: company.id, locale });
      toast.success(isRu ? `Клиент «${customer.name}» удалён` : `«${customer.name}» mijozi o‘chirildi`);
      fetchCustomers();
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Не удалось удалить клиента' : 'Mijozni o‘chirib bo‘lmadi'));
    }
  };

  const hasDebt = (c: Customer) => Boolean(c.balancesByCurrency?.some((b) => b.customerDebt > 0));
  const filtered = customers.filter((c) => (!debtOnly || hasDebt(c)) && matchesSearch(search, c.name, c.phone, c.email));

  const receivablesByCurrency = customers.reduce<Record<string, number>>((totals, customer) => {
    for (const balance of customer.balancesByCurrency || []) {
      if (balance.customerDebt > 0) totals[balance.currency] = (totals[balance.currency] || 0) + balance.customerDebt;
    }
    return totals;
  }, {});
  const customersWithDebt = customers.filter(hasDebt).length;

  const tl = useTranslations('rd.list');
  const tc = useTranslations('rd.cp');
  const th = { padding: '10px 14px', textAlign: 'left' as const, fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)' };
  const [collectFor, setCollectFor] = useState<Customer | null>(null);
  const [hiddenCols, setHiddenCols] = usePersistentState<string[]>('customers.hidden', []);
  // Biggest debt first: "who owes us most?"
  const [sort, setSort] = usePersistentState<SortState | null>('customers.sort', { key: 'debt', dir: 'desc' });
  const debtValue = (c: Customer) => (c.balancesByCurrency || []).reduce((m, b) => Math.max(m, b.customerDebt), 0);
  const formatByCurrency = (items: Array<{ currency: string; amount: number }>) =>
    items.length > 0 ? items.map((item) => formatCurrency(item.amount, locale, item.currency)).join(' · ') : '—';
  const newButton = (
    <Button onClick={() => setIsCreateOpen(true)}>
      <Plus size={16} aria-hidden /> {isRu ? 'Новый клиент' : 'Yangi mijoz'}
    </Button>
  );

  const columns: Column<Customer>[] = [
    {
      key: 'name',
      label: isRu ? 'Клиент' : 'Mijoz',
      primary: true,
      locked: true,
      sortValue: (c) => c.name,
      render: (c) => (
        <div>
          <div className="rd-doc-no">{c.name}</div>
          {c.type === 'BOTH' && <div className="rd-sub">{isRu ? 'Также поставщик' : 'Yetkazib beruvchi ham'}</div>}
        </div>
      ),
    },
    {
      key: 'contact',
      label: tIn('telefon_va_e_pochta'),
      render: (c) => (
        <div style={{ color: 'var(--color-text-secondary)' }}>
          {c.phone ? <a href={`tel:${c.phone}`} style={{ color: 'inherit' }}>{c.phone}</a> : '—'}
          {c.email && <div className="rd-sub">{c.email}</div>}
        </div>
      ),
    },
    { key: 'debt', label: tIn('mijoz_qarzi'), numeric: true, sortValue: debtValue, render: (c) => <DebtLines balances={c.balancesByCurrency || []} locale={locale} /> },
    {
      key: 'actions',
      label: isRu ? 'Действия' : 'Amallar',
      locked: true,
      render: (c) => (
        <div className="rd-row-actions">
          {hasDebt(c) && (
            <button type="button" className="rd-next-btn" onClick={() => setCollectFor(c)}>
              <CreditCard size={14} aria-hidden /> {tc('collect')}
            </button>
          )}
          <ActionsMenu
            label={tl('rowActions')}
            actions={[
              { label: tc('profile'), onSelect: () => setSelectedCustomer(c) },
              { label: tl('edit'), onSelect: () => setEditingCustomer(c) },
              { label: tl('delete'), onSelect: () => void handleDeleteCustomer(c), danger: true },
            ]}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="rd-page">
      <PageHeader
        title={isRu ? 'Клиенты' : 'Mijozlar'}
        subtitle={tIn('kimga_sotasiz_aloqa_qarz_va_xari')}
        actions={newButton}
      />

      <SignalStrip label={tl('summary')}>
        <Signal
          tone="warning"
          label={isRu ? 'Нам должны' : 'Bizga qarz'}
          value={Object.keys(receivablesByCurrency).length > 0 ? <MultiCurrencyValue items={Object.entries(receivablesByCurrency).map(([currency, amount]) => ({ currency, amount }))} locale={locale} /> : '—'}
          hint={tc('owesUsHint', { count: customersWithDebt })}
          active={debtOnly}
          onClick={() => setDebtOnly(!debtOnly)}
        />
        <Signal tone="neutral" label={isRu ? 'Всего клиентов' : 'Jami mijozlar'} value={customers.length} />
      </SignalStrip>

      <div className="rd-toolbar">
        <div className="rd-toolbar-row">
          <SearchField value={search} onChange={setSearch} placeholder={tIn('ism_telefon_yoki_e_pochta')} label={tl('search')} />
          <ChipGroup
            label={tc('show')}
            options={[
              { value: 'all', label: tl('all') },
              { value: 'debt', label: tc('withDebt'), count: customersWithDebt },
            ]}
            value={debtOnly ? 'debt' : 'all'}
            onChange={(v) => setDebtOnly(v === 'debt')}
          />
          <ColumnChooser columns={columns.map((c) => ({ key: c.key, label: c.label, locked: c.locked }))} hidden={hiddenCols} onChange={setHiddenCols} />
        </div>
      </div>

      <div className="rd-table-card">
        {customersQuery.isError ? (
          <LoadError error={customersQuery.error} onRetry={fetchCustomers} retrying={customersQuery.isFetching} />
        ) : (
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(c) => c.id}
            hidden={hiddenCols}
            sort={sort}
            onSortChange={setSort}
            onRowClick={(c) => setSelectedCustomer(c)}
            selectedKey={selectedCustomer?.id}
            loading={loading}
            caption={tc('rowHint')}
            empty={
              customers.length === 0 ? (
                <EmptyState icon={Users} title={isRu ? 'Клиентов пока нет' : 'Hozircha mijozlar yo‘q'} description={tIn('mijoz_qoshing_uni_sotuvda_tanlas')} action={newButton} />
              ) : (
                <EmptyState compact title={tl('nothingFound')} description={tl('nothingFoundHint')} />
              )
            }
          />
        )}
      </div>

      {collectFor && (
        <QuickPaymentModal
          isOpen
          counterparty={collectFor as unknown as Parameters<typeof QuickPaymentModal>[0]['counterparty']}
          initialSide="CUSTOMER"
          initialCurrency={collectFor.balancesByCurrency?.find((b) => b.customerDebt > 0)?.currency}
          onClose={() => setCollectFor(null)}
          onSuccess={() => {
            setCollectFor(null);
            fetchCustomers();
          }}
        />
      )}

      {selectedCustomer && (
        <Modal isOpen onClose={() => setSelectedCustomer(null)} title={selectedCustomer.name} size="xl">
          {profileQuery.isError ? (
            <LoadError error={profileQuery.error} onRetry={() => void profileQuery.refetch()} retrying={profileQuery.isFetching} />
          ) : profileQuery.isPending || !profile ? (
            <SkeletonRows rows={4} columns={4} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
              <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 'var(--space-3)', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)' }}>
                {[
                  { label: isRu ? 'Продано' : 'Sotildi', value: formatByCurrency(profile.metrics.totalSalesByCurrency) },
                  { label: isRu ? 'Оплачено' : 'To‘landi', value: formatByCurrency(profile.metrics.totalPaidByCurrency) },
                  {
                    label: isRu ? 'Долг' : 'Qarz',
                    value: <DebtLines balances={profile.metrics.balancesByCurrency} locale={locale} />,
                  },
                  { label: isRu ? 'Возвраты' : 'Qaytarishlar', value: formatByCurrency(profile.metrics.totalReturnedByCurrency) },
                  {
                    label: isRu ? 'Валовая прибыль' : 'Yalpi foyda',
                    value: formatCurrency(profile.metrics.grossProfit, locale, 'UZS'),
                    color: profile.metrics.grossProfit < 0 ? 'var(--color-error-700)' : undefined,
                  },
                ].map((m) => (
                  <div key={m.label}>
                    <dt style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{m.label}</dt>
                    <dd style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-base)', marginTop: 4, color: m.color, display: 'flex' }} className="tabular-nums">{m.value}</dd>
                  </div>
                ))}
              </dl>

              <div>
                <h3 style={{ fontWeight: 'var(--font-semibold)', marginBottom: 10 }}>{isRu ? 'Последние продажи' : 'So‘nggi sotuvlar'}</h3>
                {profile.invoices.length === 0 ? (
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{isRu ? 'Продаж этому клиенту ещё не было.' : 'Bu mijozga hali sotuv bo‘lmagan.'}</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="app-table-stack" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <th scope="col" style={th}>{isRu ? '№ документа' : 'Hujjat №'}</th>
                          <th scope="col" style={th}>{isRu ? 'Дата' : 'Sana'}</th>
                          <th scope="col" style={{ ...th, textAlign: 'right' }}>{isRu ? 'Сумма' : 'Summa'}</th>
                          <th scope="col" style={th}>{isRu ? 'Статус' : 'Holati'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profile.invoices.slice(0, 8).map((inv) => (
                          <tr key={inv.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                            <td data-primary style={{ padding: '8px 14px', fontWeight: 'var(--font-semibold)' }}>
                              <Link href={`/sales/${inv.id}`} style={{ color: 'var(--color-primary-700)' }}>{inv.invoiceNumber}</Link>
                            </td>
                            <td data-label={isRu ? 'Дата' : 'Sana'} style={{ padding: '8px 14px', color: 'var(--color-text-secondary)' }}>{formatDate(inv.invoiceDate, locale)}</td>
                            <td data-label={isRu ? 'Сумма' : 'Summa'} style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 'var(--font-semibold)' }} className="tabular-nums">{formatCurrency(Number(inv.totalAmount), locale, inv.currency)}</td>
                            <td data-label={isRu ? 'Статус' : 'Holati'} style={{ padding: '8px 14px' }}><DocumentStatusBadge status={inv.status} locale={locale} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </Modal>
      )}

      {isCreateOpen && (
        <CreateCounterpartyDrawer isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} defaultType="CUSTOMER" onSuccess={() => fetchCustomers()} />
      )}
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
    </div>
  );
}
