'use client';

import { useMemo, useState } from 'react';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { usePersistentState } from '@/lib/usePersistentState';
import { LoadError } from '@/components/ui/LoadError';
import { useLocale, useTranslations } from 'next-intl';
import { ActionsMenu } from '@/components/production/ActionsMenu';
import { QuickPaymentModal } from '@/components/counterparties/QuickPaymentModal';
import { ChipGroup, ColumnChooser, Signal, SignalStrip } from '@/components/ui/list/ListKit';
import { DataTable, type Column, type SortState } from '@/components/ui/list/DataTable';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatCurrency, errorMessage } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { SearchField, matchesSearch } from '@/components/ui/SearchField';
import { MultiCurrencyValue } from '@/components/ui/MultiCurrencyValue';
import { Building2, CreditCard, Plus } from 'lucide-react';
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

  const tl = useTranslations('rd.list');
  const tc = useTranslations('rd.cp');
  const [payFor, setPayFor] = useState<Counterparty | null>(null);
  const [hiddenCols, setHiddenCols] = usePersistentState<string[]>('suppliers.hidden', []);
  // Biggest debt first: the usual question is "whom do we owe most?"
  const [sort, setSort] = usePersistentState<SortState | null>('suppliers.sort', { key: 'debt', dir: 'desc' });
  const debtValue = (s: Counterparty) => (s.balancesByCurrency || []).reduce((m, b) => Math.max(m, b.supplierDebt), 0);
  const owingCount = suppliers.filter(owes).length;
  const newButton = (
    <Button onClick={() => setIsCreateOpen(true)}>
      <Plus size={16} aria-hidden /> {isRu ? 'Новый поставщик' : 'Yangi yetkazib beruvchi'}
    </Button>
  );

  const columns: Column<Counterparty>[] = [
    {
      key: 'name',
      label: isRu ? 'Поставщик' : 'Yetkazib beruvchi',
      primary: true,
      locked: true,
      sortValue: (s) => s.name,
      render: (s) => (
        <div>
          <div className="rd-doc-no">{s.name}</div>
          {s.type === 'BOTH' && <div className="rd-sub">{isRu ? 'Также клиент' : 'Mijoz ham'}</div>}
        </div>
      ),
    },
    { key: 'inn', label: isRu ? 'ИНН' : 'STIR', sortValue: (s) => s.inn ?? '', render: (s) => <span className="tabular-nums">{s.inn || '—'}</span> },
    {
      key: 'contact',
      label: isRu ? 'Телефон и адрес' : 'Telefon va manzil',
      render: (s) => (
        <div style={{ color: 'var(--color-text-secondary)' }}>
          {s.phone ? <a href={`tel:${s.phone}`} style={{ color: 'inherit' }}>{s.phone}</a> : '—'}
          {s.address && <div className="rd-sub">{s.address}</div>}
        </div>
      ),
    },
    {
      key: 'debt',
      label: isRu ? 'Наш долг' : 'Bizning qarzimiz',
      numeric: true,
      sortValue: debtValue,
      render: (s) => {
        const balances = (s.balancesByCurrency || []).filter((b) => b.supplierDebt !== 0);
        return balances.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            {balances.map((b) => (
              <span key={b.currency} style={{ fontWeight: 'var(--font-semibold)', whiteSpace: 'nowrap', color: b.supplierDebt > 0 ? 'var(--color-error-700)' : 'var(--color-info-700)' }}>
                {b.supplierDebt > 0 ? '' : isRu ? 'Аванс ' : 'Avans '}
                {formatCurrency(Math.abs(b.supplierDebt), locale, b.currency)}
              </span>
            ))}
          </div>
        ) : (
          <span style={{ color: 'var(--color-text-tertiary)' }}>{isRu ? 'Нет долга' : 'Qarz yo‘q'}</span>
        );
      },
    },
    {
      key: 'actions',
      label: isRu ? 'Действия' : 'Amallar',
      locked: true,
      render: (s) => (
        <div className="rd-row-actions">
          {owes(s) && (
            <button type="button" className="rd-next-btn" onClick={() => setPayFor(s)}>
              <CreditCard size={14} aria-hidden /> {tc('pay')}
            </button>
          )}
          <ActionsMenu
            label={tl('rowActions')}
            actions={[
              { label: tc('profile'), onSelect: () => setSelectedSupplierId(s.id) },
              { label: tl('edit'), onSelect: () => setEditingSupplier(s) },
              { label: tl('delete'), onSelect: () => void handleDeleteSupplier(s), danger: true },
            ]}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="rd-page">
      <PageHeader
        title={isRu ? 'Поставщики' : 'Yetkazib beruvchilar'}
        subtitle={isRu ? 'У кого вы закупаете: реквизиты, наш долг и история поставок.' : 'Kimdan xarid qilasiz: rekvizitlar, bizning qarzimiz va yetkazib berishlar tarixi.'}
        actions={newButton}
      />

      <SignalStrip label={tl('summary')}>
        <Signal
          tone="error"
          label={isRu ? 'Мы должны' : 'Bizning qarzimiz'}
          value={Object.keys(payablesByCurrency).length > 0 ? <MultiCurrencyValue items={Object.entries(payablesByCurrency).map(([currency, amount]) => ({ currency, amount }))} locale={locale} /> : '—'}
          hint={tc('owedHint', { count: owingCount })}
          active={debtOnly}
          onClick={() => setDebtOnly(!debtOnly)}
        />
        <Signal tone="neutral" label={isRu ? 'Всего поставщиков' : 'Jami yetkazib beruvchilar'} value={suppliers.length} />
      </SignalStrip>

      <div className="rd-toolbar">
        <div className="rd-toolbar-row">
          <SearchField value={search} onChange={setSearch} placeholder={isRu ? 'Название, ИНН, телефон или адрес' : 'Nomi, STIR, telefon yoki manzil'} label={tl('search')} />
          <ChipGroup
            label={tc('show')}
            options={[
              { value: 'all', label: tl('all') },
              { value: 'debt', label: tc('withDebt'), count: owingCount },
            ]}
            value={debtOnly ? 'debt' : 'all'}
            onChange={(v) => setDebtOnly(v === 'debt')}
          />
          <ColumnChooser columns={columns.map((c) => ({ key: c.key, label: c.label, locked: c.locked }))} hidden={hiddenCols} onChange={setHiddenCols} />
        </div>
      </div>

      <div className="rd-table-card">
        {suppliersQuery.isError ? (
          <LoadError error={suppliersQuery.error} onRetry={fetchSuppliers} retrying={suppliersQuery.isFetching} />
        ) : (
          <DataTable
            rows={filteredSuppliers}
            columns={columns}
            rowKey={(s) => s.id}
            hidden={hiddenCols}
            sort={sort}
            onSortChange={setSort}
            onRowClick={(s) => setSelectedSupplierId(s.id)}
            selectedKey={selectedSupplierId}
            loading={loading}
            caption={tc('rowHint')}
            empty={
              suppliers.length === 0 ? (
                <EmptyState
                  icon={Building2}
                  title={isRu ? 'Поставщиков пока нет' : 'Hozircha yetkazib beruvchilar yo‘q'}
                  description={isRu ? 'Добавьте поставщика — его можно будет выбрать в приходе, а наш долг будет считаться сам.' : 'Yetkazib beruvchi qo‘shing — uni kirimda tanlash mumkin bo‘ladi, qarzimiz esa o‘zi hisoblanadi.'}
                  action={newButton}
                />
              ) : (
                <EmptyState compact title={tl('nothingFound')} description={tl('nothingFoundHint')} />
              )
            }
          />
        )}
      </div>

      {payFor && (
        <QuickPaymentModal
          isOpen
          counterparty={payFor as unknown as Parameters<typeof QuickPaymentModal>[0]['counterparty']}
          initialSide="SUPPLIER"
          initialCurrency={payFor.balancesByCurrency?.find((b) => b.supplierDebt > 0)?.currency}
          onClose={() => setPayFor(null)}
          onSuccess={() => {
            setPayFor(null);
            fetchSuppliers();
          }}
        />
      )}

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
