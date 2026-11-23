'use client';

import { activateOnKey } from '@/lib/a11y';
import { useState, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale, useTranslations } from 'next-intl';
import { EmptyState } from '@/components/ui/EmptyState';
import { ActionsMenu } from '@/components/production/ActionsMenu';
import { usePersistentState } from '@/lib/usePersistentState';
import { ColumnChooser, FilterBar, useFilterState, type FilterDef } from '@/components/ui/filters';
import { StatCard, StatCardGrid } from '@/components/ui/stats/StatCard';
import { DataTable, type Column, type SortState } from '@/components/ui/list/DataTable';
import { apiFetch } from '@/lib/api';
import { useApiQuery, useInvalidateApi } from '@/lib/query/useApiQuery';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { LoadError } from '@/components/ui/LoadError';
import { formatCurrency, errorMessage } from '@/lib/utils';
import { ORDER_STATUS_LABELS, statusLabel } from '@/lib/constants/statuses';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { MultiCurrencyValue } from '@/components/ui/MultiCurrencyValue';
import { toast } from '@/context/ToastContext';
import { CreateCounterpartyDrawer } from '@/components/counterparties/CreateCounterpartyDrawer';
import { QuickPaymentModal } from '@/components/counterparties/QuickPaymentModal';
import { AktSverkaDrawer } from '@/components/counterparties/AktSverkaDrawer';
import {
  Users,
  Plus,
  Folder,
  FolderPlus,
  FolderOpen,
  Edit2,
  Trash2,
  Inbox,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';

/** GET /sales/orders/by-counterparty/:id */
interface CustomerOrdersData {
  summary: { totalOrders: number; totalsByCurrency: Array<{ currency: string; totalAmount: number }> };
  orders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    currency: string;
    totalAmount: number | string;
    paidAmount: number | string;
    paymentPercent?: number;
  }>;
}

interface CounterpartyFolder {
  id: string;
  name: string;
  color?: string;
  _count?: {
    counterparties: number;
  };
}

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
  folderId?: string | null;
  folder?: CounterpartyFolder | null;
  priceListId?: string | null;
  priceList?: { id: string; name: string | Record<string, string>; currency?: string } | null;
  discountPercent?: number;
  balancesByCurrency?: Array<{
    currency: string;
    customerDebt: number;
    supplierDebt: number;
    netBalance: number;
  }>;
  createdAt: string;
}

/** What the quick payment modal needs to know about a counterparty. */
type PaymentCounterparty = Pick<Counterparty, 'id' | 'name' | 'type' | 'balancesByCurrency'>;

interface CounterpartySummary {
  total_customers: number;
  total_suppliers: number;
  receivables: {
    count: number;
    total_amount: number;
    byCurrency?: Array<{ currency: string; amount: number }>;
  };
  payables: {
    count: number;
    total_amount: number;
    byCurrency?: Array<{ currency: string; amount: number }>;
  };
  customerAdvancesByCurrency?: Array<{ currency: string; amount: number }>;
  supplierAdvancesByCurrency?: Array<{ currency: string; amount: number }>;
}

interface FoldersResponse {
  folders: CounterpartyFolder[];
  unassignedCount: number;
  totalCount: number;
}

const PRESET_COLORS = [
  '#3b82f6', // Blue
  '#10b981', // Green
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#64748b', // Slate
];

const FILTER_DEFAULTS = { balance: '', type: '', hasDebt: '' };

export default function CounterpartiesPage() {
  const { token, company } = useAuth();
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const tIn = useTranslations('rd.inline');

  const invalidateApi = useInvalidateApi();
  // List, summary and folders all live under /sales/counterparties.
  const refreshCounterparties = () => void invalidateApi('/sales/counterparties');
  const summary = useApiQuery<CounterpartySummary>('/sales/counterparties/summary').data ?? null;
  const foldersData = useApiQuery<FoldersResponse>('/sales/counterparties/folders').data;

  // Folder states
  const folders = foldersData?.folders ?? [];
  const unassignedCount = foldersData?.unassignedCount ?? 0;
  const totalCount = foldersData?.totalCount ?? 0;
  const [activeFolderId, setActiveFolderId] = useState<string>('all');

  // Filter state
  // Filters live in the URL and are remembered per user; the folder is navigation and stays outside.
  const lf = useFilterState('counterparties.list', FILTER_DEFAULTS);
  const search = lf.debouncedSearch;
  const { type: typeFilter, balance: balanceFilter } = lf.values;
  const hasDebtOnly = lf.values.hasDebt === '1';

  // Typed filters apply 300 ms after the last change; the folder at once.
  const filterParams = useMemo(() => {
    const query = new URLSearchParams();
    if (search) query.append('search', search);
    if (typeFilter) query.append('type', typeFilter);
    if (hasDebtOnly) query.append('hasDebt', 'true');
    if (balanceFilter) query.append('balanceFilter', balanceFilter);
    return query.toString();
  }, [search, typeFilter, hasDebtOnly, balanceFilter]);
  const debouncedFilterParams = useDebouncedValue(filterParams, 300);
  const listEndpoint = useMemo(() => {
    const query = new URLSearchParams(debouncedFilterParams);
    if (activeFolderId) query.append('folderId', activeFolderId);
    return `/sales/counterparties?${query.toString()}`;
  }, [debouncedFilterParams, activeFolderId]);
  const listQuery = useApiQuery<Counterparty[]>(listEndpoint);
  const items = listQuery.data ?? [];

  // Quick Payment & Akt Sverka Drawer states
  const [paymentCounterparty, setPaymentCounterparty] = useState<PaymentCounterparty | null>(null);
  const [paymentSide, setPaymentSide] = useState<'CUSTOMER' | 'SUPPLIER' | undefined>();
  const [paymentCurrency, setPaymentCurrency] = useState<string | undefined>();
  const [statementCounterpartyId, setStatementCounterpartyId] = useState<string | null>(null);

  // Create Counterparty Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCounterparty, setEditingCounterparty] = useState<Counterparty | null>(null);
  const [deletingCounterparty, setDeletingCounterparty] = useState<Counterparty | null>(null);
  const [deleteCounterpartyLoading, setDeleteCounterpartyLoading] = useState(false);
  const [, setFormName] = useState('');
  const [, setFormType] = useState<'CUSTOMER' | 'SUPPLIER' | 'BOTH'>('CUSTOMER');
  const [formFolderId, setFormFolderId] = useState<string>('');
  const [, setFormInn] = useState('');
  const [, setFormPhone] = useState('');
  const [, setFormEmail] = useState('');
  const [, setFormAddress] = useState('');
  const [, setFormBankName] = useState('');
  const [, setFormBankAccount] = useState('');
  const [, setFormMfo] = useState('');

  // Folder Modal state
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [folderModalMode, setFolderModalMode] = useState<'create' | 'edit'>('create');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState('');
  const [folderColor, setFolderColor] = useState('#3b82f6');
  const [folderSubmitting, setFolderSubmitting] = useState(false);
  const [folderError, setFolderError] = useState('');

  // Move Modal state
  const [moveItem, setMoveItem] = useState<Counterparty | null>(null);
  const [targetFolderId, setTargetFolderId] = useState<string>('');
  const [moveSubmitting, setMoveSubmitting] = useState(false);

  // Delete Folder Confirm Modal state
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // Detail Modal state
  const [detailItem, setDetailItem] = useState<Counterparty | null>(null);
  const ordersQuery = useApiQuery<CustomerOrdersData>(
    detailItem ? `/sales/orders/by-counterparty/${detailItem.id}` : null,
  );
  const customerOrdersData = detailItem ? (ordersQuery.data ?? null) : null;
  const ordersLoading = Boolean(detailItem) && ordersQuery.isPending;

  const handleDeleteCounterparty = async () => {
    if (!deletingCounterparty || !token || !company) return;
    setDeleteCounterpartyLoading(true);
    try {
      await apiFetch(`/sales/counterparties/${deletingCounterparty.id}`, {
        method: 'DELETE',
        token: token || undefined,
        tenantId: company.id,
        locale,
      });
      setDeletingCounterparty(null);
      refreshCounterparties();
      toast.success(isRu ? 'Контрагент успешно удален' : 'Kontragent muvaffaqiyatli o‘chirildi');
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Ошибка при удалении контрагента' : 'Kontragentni o‘chirishda xatolik'));
    } finally {
      setDeleteCounterpartyLoading(false);
    }
  };

  // Open Create Modal & Pre-select Active Folder if a specific folder is selected
  const handleOpenCreateModal = () => {
    resetForm();
    setEditingCounterparty(null);
    if (activeFolderId && activeFolderId !== 'all' && activeFolderId !== 'unassigned') {
      setFormFolderId(activeFolderId);
    } else {
      setFormFolderId('');
    }
    setIsCreateOpen(true);
  };

  const resetForm = () => {
    setFormName('');
    setFormType('CUSTOMER');
    setFormFolderId('');
    setFormInn('');
    setFormPhone('');
    setFormEmail('');
    setFormAddress('');
    setFormBankName('');
    setFormBankAccount('');
    setFormMfo('');
  };

  // Folder modal handlers
  const handleOpenCreateFolder = () => {
    setFolderModalMode('create');
    setEditingFolderId(null);
    setFolderName('');
    setFolderColor('#3b82f6');
    setFolderError('');
    setIsFolderModalOpen(true);
  };

  const handleOpenEditFolder = (f: CounterpartyFolder, e: React.MouseEvent) => {
    e.stopPropagation();
    setFolderModalMode('edit');
    setEditingFolderId(f.id);
    setFolderName(f.name);
    setFolderColor(f.color || '#3b82f6');
    setFolderError('');
    setIsFolderModalOpen(true);
  };

  const handleSaveFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderName.trim()) {
      setFolderError(isRu ? 'Введите название папки' : 'Papka nomini kiriting');
      return;
    }

    setFolderSubmitting(true);
    setFolderError('');

    try {
      if (folderModalMode === 'create') {
        await apiFetch('/sales/counterparties/folders', {
          method: 'POST',
          token: token || undefined,
          tenantId: company?.id,
          locale,
          body: JSON.stringify({ name: folderName, color: folderColor }),
        });
      } else if (editingFolderId) {
        await apiFetch(`/sales/counterparties/folders/${editingFolderId}`, {
          method: 'PATCH',
          token: token || undefined,
          tenantId: company?.id,
          locale,
          body: JSON.stringify({ name: folderName, color: folderColor }),
        });
      }

      setIsFolderModalOpen(false);
      refreshCounterparties();
    } catch (err) {
      setFolderError(errorMessage(err) || (isRu ? 'Ошибка сохранения' : 'Saqlashda xatolik yuz berdi'));
    } finally {
      setFolderSubmitting(false);
    }
  };

  const handleDeleteFolder = async () => {
    if (!deleteFolderId) return;
    setDeleteSubmitting(true);

    try {
      await apiFetch(`/sales/counterparties/folders/${deleteFolderId}`, {
        method: 'DELETE',
        token: token || undefined,
        tenantId: company?.id,
        locale,
      });

      if (activeFolderId === deleteFolderId) {
        setActiveFolderId('all');
      }
      setDeleteFolderId(null);
      refreshCounterparties();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // Move Counterparty handler
  const handleMoveCounterparty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!moveItem) return;

    setMoveSubmitting(true);
    try {
      await apiFetch(`/sales/counterparties/${moveItem.id}`, {
        method: 'PATCH',
        token: token || undefined,
        tenantId: company?.id,
        locale,
        body: JSON.stringify({
          folderId: targetFolderId === 'unassigned' || !targetFolderId ? null : targetFolderId,
        }),
      });

      setMoveItem(null);
      refreshCounterparties();
    } catch (err) {
      console.error(err);
    } finally {
      setMoveSubmitting(false);
    }
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


  const tl = useTranslations('rd.list');
  const tc = useTranslations('rd.cp');
  const [cpHidden, setCpHidden] = usePersistentState<string[]>('cp.hidden', ['inn', 'folder']);
  const [cpSort, setCpSort] = usePersistentState<SortState | null>('cp.sort', { key: 'balance', dir: 'desc' });
  const absBalance = (c: Counterparty) => (c.balancesByCurrency || []).reduce((m, b) => Math.max(m, Math.abs(Number(b.netBalance) || 0)), 0);
  const cpColumns: Column<Counterparty>[] = [
    {
      key: 'name',
      label: isRu ? 'Наименование' : 'Kontragent nomi',
      primary: true,
      locked: true,
      sortValue: (c) => c.name,
      render: (c) => (
        <div>
          <div className="rd-doc-no">{c.name}</div>
          <div className="rd-sub" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>{getTypeBadge(c.type)}{c.phone ? <span>{c.phone}</span> : null}</div>
        </div>
      ),
    },
    { key: 'folder', label: isRu ? 'Папка' : 'Papka', sortValue: (c) => c.folder?.name ?? '', render: (c) => c.folder?.name ?? '—' },
    { key: 'inn', label: isRu ? 'ИНН / STIR' : 'STIR / INN', sortValue: (c) => c.inn ?? '', render: (c) => <span className="tabular-nums">{c.inn || '—'}</span> },
    {
      key: 'balance',
      label: isRu ? 'Баланс расчётов' : 'Qarz balansi',
      numeric: true,
      sortValue: absBalance,
      render: (c) => {
        const balances = (c.balancesByCurrency || []).filter((b) => Number(b.netBalance) !== 0);
        if (balances.length === 0) return <span style={{ color: 'var(--color-text-tertiary)' }}>{isRu ? 'Расчёты закрыты' : 'Hisob yopiq'}</span>;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            {balances.map((b) => {
              const net = Number(b.netBalance) || 0;
              return (
                <span key={b.currency} style={{ whiteSpace: 'nowrap' }}>
                  <span className="rd-sub" style={{ marginRight: 6 }}>{net > 0 ? (isRu ? 'Нам должны' : 'Bizga qarz') : isRu ? 'Мы должны' : 'Bizning qarz'}</span>
                  <strong className="tabular-nums" style={{ color: net > 0 ? 'var(--color-success-700)' : 'var(--color-error-700)' }}>{formatCurrency(Math.abs(net), locale, b.currency)}</strong>
                </span>
              );
            })}
          </div>
        );
      },
    },
    {
      key: 'actions',
      label: tIn('amallar'),
      locked: true,
      render: (c) => {
        const owesUs = (c.balancesByCurrency || []).find((b) => b.customerDebt > 0);
        const weOwe = (c.balancesByCurrency || []).find((b) => b.supplierDebt > 0);
        return (
          <div className="rd-row-actions">
            {owesUs && (
              <button type="button" className="rd-next-btn" onClick={() => openQuickPayment(c, 'CUSTOMER', owesUs.currency)}>
                <ArrowDownLeft size={14} aria-hidden /> {tc('collect')}
              </button>
            )}
            {weOwe && (
              <button type="button" className="rd-next-btn" onClick={() => openQuickPayment(c, 'SUPPLIER', weOwe.currency)}>
                <ArrowUpRight size={14} aria-hidden /> {tc('pay')}
              </button>
            )}
            <ActionsMenu
              label={tl('rowActions')}
              actions={[
                { label: isRu ? 'Акт сверки' : 'Akt sverka', onSelect: () => setStatementCounterpartyId(c.id) },
                { label: tIn('kartochka'), onSelect: () => setDetailItem(c) },
                { label: tc('anyPayment'), onSelect: () => openQuickPayment(c) },
                { label: tIn('papkaga_kochirish'), onSelect: () => { setMoveItem(c); setTargetFolderId(c.folderId || ''); } },
                { label: tl('edit'), onSelect: () => setEditingCounterparty(c) },
                { label: tl('delete'), onSelect: () => setDeletingCounterparty(c), danger: true },
              ]}
            />
          </div>
        );
      },
    },
  ];
  const totalCustomers = items.filter((i) => i.type === 'CUSTOMER' || i.type === 'BOTH').length;
  const totalSuppliers = items.filter((i) => i.type === 'SUPPLIER' || i.type === 'BOTH').length;
  const openQuickPayment = (
    counterparty: PaymentCounterparty,
    side?: 'CUSTOMER' | 'SUPPLIER',
    currency?: string,
  ) => {
    setPaymentSide(side);
    setPaymentCurrency(currency);
    setPaymentCounterparty(counterparty);
  };

  const closeQuickPayment = () => {
    setPaymentCounterparty(null);
    setPaymentSide(undefined);
    setPaymentCurrency(undefined);
  };

  const filterDefs: FilterDef[] = [
    {
      key: 'balance',
      kind: 'segmented',
      label: isRu ? 'Расчёты' : 'Hisob-kitob',
      options: [
        { value: 'receivables', label: isRu ? 'Нам должны' : 'Haqdorlar', count: summary?.receivables.count },
        { value: 'payables', label: isRu ? 'Наш долг' : 'Qarzdorlar', count: summary?.payables.count },
        { value: 'settled', label: isRu ? 'Расчет окончен' : 'Hisob-kitob yopilgan' },
      ],
    },
    {
      key: 'type',
      kind: 'select',
      label: isRu ? 'Тип' : 'Turi',
      options: [
        { value: 'CUSTOMER', label: isRu ? 'Только клиенты' : 'Faqat mijozlar' },
        { value: 'SUPPLIER', label: isRu ? 'Только поставщики' : 'Faqat yetkazib beruvchilar' },
        { value: 'BOTH', label: isRu ? 'Клиент и Поставщик' : 'Mijoz va yetkazib beruvchi' },
      ],
    },
    { key: 'hasDebt', kind: 'toggle', label: isRu ? 'Только с долгом' : 'Faqat qarzi borlar' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
            {isRu ? 'Контрагенты' : 'Kontragentlar'}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {folders.length === 0 && (
            <Button variant="secondary" onClick={handleOpenCreateFolder}>
              <FolderPlus size={16} aria-hidden /> {isRu ? 'Создать папку' : 'Papka yaratish'}
            </Button>
          )}
          <Button onClick={handleOpenCreateModal} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Plus size={16} />
            {isRu ? 'Новый контрагент' : 'Yangi kontragent'}
          </Button>
        </div>
      </div>

      {/* Main Two-Column Content Layout */}
      <div className={folders.length > 0 ? 'cp-layout' : undefined}>
        
        {/* Left Sidebar: Folders Panel (only once folders exist) */}
        {folders.length > 0 && (
        <Card style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 'var(--space-2)', borderBottom: '1px solid var(--color-border-light)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
              <Folder size={18} style={{ color: 'var(--color-primary-600)' }} />
              {isRu ? 'Папки' : 'Papkalar'}
            </div>
            <button
              onClick={handleOpenCreateFolder}
              title={isRu ? 'Создать папку' : 'Papka yaratish'}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg-subtle)',
                color: 'var(--color-text-primary)',
                cursor: 'pointer',
              }}
            >
              <FolderPlus size={15} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {/* All Counterparties */}
            <button
              onClick={() => setActiveFolderId('all')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                background: activeFolderId === 'all' ? 'var(--color-primary-50, rgba(59, 130, 246, 0.1))' : 'transparent',
                color: activeFolderId === 'all' ? 'var(--color-primary-700, #2563eb)' : 'var(--color-text-primary)',
                border: 'none',
                fontWeight: activeFolderId === 'all' ? 600 : 400,
                fontSize: 'var(--text-sm)',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FolderOpen size={16} />
                <span>{isRu ? 'Все контрагенты' : 'Barcha kontragentlar'}</span>
              </div>
              <span style={{ fontSize: 'var(--text-xs)', opacity: 0.7, background: 'var(--color-bg-subtle)', padding: '2px 6px', borderRadius: 10 }}>
                {totalCount}
              </span>
            </button>

            {/* Unassigned Counterparties */}
            <button
              onClick={() => setActiveFolderId('unassigned')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                background: activeFolderId === 'unassigned' ? 'var(--color-primary-50, rgba(59, 130, 246, 0.1))' : 'transparent',
                color: activeFolderId === 'unassigned' ? 'var(--color-primary-700, #2563eb)' : 'var(--color-text-secondary)',
                border: 'none',
                fontWeight: activeFolderId === 'unassigned' ? 600 : 400,
                fontSize: 'var(--text-sm)',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Inbox size={16} />
                <span>{isRu ? 'Без папки' : 'Papkada bo\'lmaganlar'}</span>
              </div>
              <span style={{ fontSize: 'var(--text-xs)', opacity: 0.7, background: 'var(--color-bg-subtle)', padding: '2px 6px', borderRadius: 10 }}>
                {unassignedCount}
              </span>
            </button>

            <div style={{ height: 1, backgroundColor: 'var(--color-border-light)', margin: '4px 0' }} />

            {/* Custom Folders */}
            {folders.length === 0 ? (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', padding: '12px 8px', textAlign: 'center' }}>
                {isRu ? 'Папок пока нет' : 'Hozircha papkalar yo\'q'}
              </div>
            ) : (
              folders.map((f) => {
                const isActive = activeFolderId === f.id;
                return (
                  <div
                    key={f.id}
                    onClick={() => setActiveFolderId(f.id)}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isActive}
                    onKeyDown={activateOnKey(() => setActiveFolderId(f.id))}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderRadius: 'var(--radius-md)',
                      background: isActive ? 'var(--color-primary-50, rgba(59, 130, 246, 0.1))' : 'transparent',
                      color: isActive ? 'var(--color-primary-700, #2563eb)' : 'var(--color-text-primary)',
                      fontWeight: isActive ? 600 : 400,
                      fontSize: 'var(--text-sm)',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          backgroundColor: f.color || 'var(--color-info-500)',
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {f.name}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                      <span style={{ fontSize: 'var(--text-xs)', opacity: 0.7, background: 'var(--color-bg-subtle)', padding: '2px 6px', borderRadius: 10 }}>
                        {f._count?.counterparties ?? 0}
                      </span>
                      <button
                        onClick={(e) => handleOpenEditFolder(f, e)}
                        title={isRu ? 'Редактировать' : 'Tahrirlash'}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: 2 }}
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteFolderId(f.id);
                        }}
                        title={isRu ? 'Удалить' : 'O\'chirish'}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-error-700)', padding: 2 }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
        )}

        {/* Right Main Panel: KPIs, Filters, Table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', minWidth: 0 }}>
          <StatCardGrid label={isRu ? 'Сводка' : 'Qisqacha'} count={4}>
            <StatCard label={isRu ? 'Клиенты' : 'Mijozlar'} value={summary?.total_customers ?? totalCustomers} secondary={isRu ? 'активных клиентов' : 'ta faol mijoz'} />
            <StatCard label={isRu ? 'Поставщики' : 'Yetkazib beruvchilar'} value={summary?.total_suppliers ?? totalSuppliers} secondary={isRu ? 'активных поставщиков' : 'ta yetkazib beruvchi'} />
            <StatCard
              label={isRu ? 'Нам должны' : 'Bizga qarzdorlar'}
              value={<MultiCurrencyValue inherit items={summary?.receivables.byCurrency} locale={locale} />}
              secondary={isRu ? `Клиентов: ${summary?.receivables.count ?? 0}` : `${summary?.receivables.count ?? 0} ta mijoz`}
            />
            <StatCard
              label={isRu ? 'Наш долг' : 'Bizning qarzimiz'}
              value={<MultiCurrencyValue inherit items={summary?.payables.byCurrency} locale={locale} />}
              secondary={isRu ? `Поставщиков: ${summary?.payables.count ?? 0}` : `${summary?.payables.count ?? 0} ta yetkazib beruvchi`}
            />
          </StatCardGrid>

          <FilterBar
            state={lf}
            defs={filterDefs}
            searchPlaceholder={isRu ? 'Наименование, ИНН, телефон' : 'Nomi, STIR yoki telefon'}
            resultCount={listQuery.isPending ? null : items.length}
            columns={<ColumnChooser columns={cpColumns.map((c) => ({ key: c.key, label: c.label, locked: c.locked }))} hidden={cpHidden} onChange={setCpHidden} />}
          />

          {/* Counterparties table: biggest balance first, one money action per side, the rest in ⋯ */}
          <div className="rd-table-card">
            {listQuery.isError ? (
              <LoadError error={listQuery.error} onRetry={() => void listQuery.refetch()} retrying={listQuery.isFetching} />
            ) : (
              <DataTable
                rows={items}
                columns={cpColumns}
                rowKey={(c) => c.id}
                hidden={cpHidden}
                sort={cpSort}
                onSortChange={setCpSort}
                onRowClick={(c) => setStatementCounterpartyId(c.id)}
                selectedKey={statementCounterpartyId}
                loading={listQuery.isPending}
                caption={tc('rowHint')}
                empty={<EmptyState icon={Users} title={isRu ? 'Контрагенты не найдены' : 'Kontragentlar topilmadi'} description={tl('nothingFoundHint')} />}
              />
            )}
          </div>
        </div>
      </div>

      {/* Create / Edit Counterparty Slide-Over Drawer */}
      {isCreateOpen && (
        <CreateCounterpartyDrawer
          isOpen={isCreateOpen}
          counterpartyToEdit={editingCounterparty}
          onClose={() => {
            setIsCreateOpen(false);
            setEditingCounterparty(null);
          }}
          defaultFolderId={formFolderId}
          folders={folders}
          onSuccess={() => {
            setIsCreateOpen(false);
            setEditingCounterparty(null);
            refreshCounterparties();
          }}
        />
      )}

      {/* Create / Edit Folder Modal */}
      {isFolderModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsFolderModalOpen(false)}
          title={folderModalMode === 'create' ? (isRu ? 'Создание папки' : 'Yangi papka yaratish') : (isRu ? 'Редактирование папки' : 'Papkani tahrirlash')}
        >
          <form onSubmit={handleSaveFolder} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {folderError && (
              <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--color-error-700)', fontSize: 'var(--text-sm)' }}>
                {folderError}
              </div>
            )}

            <Input
              label={isRu ? 'Название папки *' : 'Papka Nomi *'}
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder={isRu ? 'Например: VIP Клиенты' : 'Mas: VIP Mijozlar'}
              required
            />

            <div>
              <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 8 }}>
                {isRu ? 'Цветовая метка' : 'Papka Rangi'}
              </label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setFolderColor(c)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      backgroundColor: c,
                      border: folderColor === c ? '3px solid var(--color-text-primary)' : 'none',
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
              <Button type="button" variant="secondary" onClick={() => setIsFolderModalOpen(false)} disabled={folderSubmitting}>
                {isRu ? 'Отмена' : 'Bekor qilish'}
              </Button>
              <Button type="submit" disabled={folderSubmitting}>
                {folderSubmitting ? (isRu ? 'Сохранение...' : 'Saqlanmoqda...') : (isRu ? 'Сохранить' : 'Saqlash')}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Folder Modal */}
      {deleteFolderId && (
        <Modal isOpen={true} onClose={() => setDeleteFolderId(null)} title={isRu ? 'Удаление папки' : 'Papkani o\'chirish'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
              {isRu
                ? 'Вы действительно хотите удалить эту папку? Контрагенты внутри нее НЕ будут удалены, а перейдут в раздел "Без папки".'
                : 'Ushbu papkani o\'chirishni tasdiqlaysizmi? Ichidagi kontragentlar o\'chib ketmaydi, "Papkada bo\'lmaganlar" bo\'limiga o\'tadi.'}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
              <Button variant="secondary" onClick={() => setDeleteFolderId(null)} disabled={deleteSubmitting}>
                {isRu ? 'Отмена' : 'Bekor qilish'}
              </Button>
              <Button variant="danger" onClick={handleDeleteFolder} disabled={deleteSubmitting}>
                {deleteSubmitting ? (isRu ? 'Удаление...' : 'O\'chirilmoqda...') : (isRu ? 'Удалить папку' : 'Papkani o\'chirish')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Counterparty Modal */}
      {deletingCounterparty && (
        <Modal
          isOpen={true}
          onClose={() => setDeletingCounterparty(null)}
          title={isRu ? 'Удаление контрагента' : 'Kontragentni o\'chirish'}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
              {isRu
                ? `Вы действительно хотите удалить контрагента "${deletingCounterparty.name}"? Если с этим контрагентом связаны документы или операции, система отклонит удаление.`
                : `Haqiqatan ham "${deletingCounterparty.name}" kontragentini o'chirmoqchimisiz? Agar ushbu kontragent bo'yicha operatsiyalar yoki hujjatlar mavjud bo'lsa, tizim o'chirishga ruxsat bermaydi.`}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
              <Button
                variant="secondary"
                onClick={() => setDeletingCounterparty(null)}
                disabled={deleteCounterpartyLoading}
              >
                {isRu ? 'Отмена' : 'Bekor qilish'}
              </Button>
              <Button
                variant="danger"
                onClick={handleDeleteCounterparty}
                disabled={deleteCounterpartyLoading}
              >
                {deleteCounterpartyLoading
                  ? (isRu ? 'Удаление...' : 'O\'chirilmoqda...')
                  : (isRu ? 'Удалить' : 'O\'chirish')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Move Counterparty Modal */}
      {moveItem && (
        <Modal isOpen={true} onClose={() => setMoveItem(null)} title={`${isRu ? 'Переместить:' : 'Papkaga ko\'chirish:'} ${moveItem.name}`}>
          <form onSubmit={handleMoveCounterparty} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Select
              label={isRu ? 'Выберите целевую папку' : 'Maqsaddagi papkani tanlang'}
              value={targetFolderId}
              onChange={(val) => setTargetFolderId(val)}
              options={[
                { value: 'unassigned', label: isRu ? '— Без папки —' : '— Papkasiz (Guruhlanmagan) —' },
                ...folders.map((f) => ({ value: f.id, label: f.name })),
              ]}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
              <Button type="button" variant="secondary" onClick={() => setMoveItem(null)} disabled={moveSubmitting}>
                {isRu ? 'Отмена' : 'Bekor qilish'}
              </Button>
              <Button type="submit" disabled={moveSubmitting}>
                {moveSubmitting ? (isRu ? 'Сохранение...' : 'Saqlanmoqda...') : (isRu ? 'Ko\'chirish' : 'Переместить')}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Detail Modal */}
      {detailItem && (
        <Modal isOpen={true} onClose={() => setDetailItem(null)} title={`${isRu ? 'Профиль:' : 'Kontragent Profili:'} ${detailItem.name}`} size="lg">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 'var(--space-4)', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--color-bg-subtle)' }}>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Тип' : 'Turi'}</div>
                <div style={{ marginTop: 4 }}>{getTypeBadge(detailItem.type)}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Папка' : 'Papka'}</div>
                <div style={{ marginTop: 4 }}>
                  {detailItem.folder ? (
                    <span style={{ color: detailItem.folder.color || 'var(--color-info-700)', fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                      {detailItem.folder.name}
                    </span>
                  ) : (
                    '—'
                  )}
                </div>
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
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Прайс-лист' : 'Narx jadvali'}</div>
                <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', marginTop: 4, color: 'var(--color-primary-600)' }}>
                  {detailItem.priceList ? (typeof detailItem.priceList.name === 'object' ? (detailItem.priceList.name[locale] || detailItem.priceList.name.ru || detailItem.priceList.name.uz) : detailItem.priceList.name) : (isRu ? 'Основной' : 'Standart')}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Постоянная скидка' : 'Doimiy chegirma'}</div>
                <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', marginTop: 4, color: Number(detailItem.discountPercent || 0) > 0 ? 'var(--color-success-700)' : 'inherit' }}>
                  {Number(detailItem.discountPercent || 0)}%
                </div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Баланс по валютам и сторонам' : 'Valyuta va tomonlar bo‘yicha balans'}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                  {(detailItem.balancesByCurrency || []).length > 0
                    ? detailItem.balancesByCurrency?.map((balance) => (
                        <div key={balance.currency} style={{ fontSize: 'var(--text-xs)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <strong>{balance.currency} · {isRu ? 'Нетто' : 'Net'} {formatCurrency(balance.netBalance, locale, balance.currency)}</strong>
                          <span style={{ color: 'var(--color-success-700)' }}>{isRu ? 'Клиент' : 'Mijoz'}: {formatCurrency(balance.customerDebt, locale, balance.currency)}</span>
                          <span style={{ color: 'var(--color-error-700)' }}>{isRu ? 'Поставщик' : 'Ta’minotchi'}: {formatCurrency(balance.supplierDebt, locale, balance.currency)}</span>
                        </div>
                      ))
                    : <span style={{ color: 'var(--color-text-secondary)' }}>—</span>}
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

            {/* Customer Orders History Section */}
            <div style={{ marginTop: 'var(--space-2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h4 style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                  {isRu ? 'История заказов клиента' : 'Mijozning buyurtmalar tarixi'}
                </h4>
                {customerOrdersData?.summary && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                    {isRu ? 'Всего заказов:' : 'Jami buyurtmalar:'} <strong>{customerOrdersData.summary.totalOrders}</strong> | {isRu ? 'Сумма:' : 'Jami summa:'} <strong>{customerOrdersData.summary.totalsByCurrency.length > 0 ? customerOrdersData.summary.totalsByCurrency.map((t) => formatCurrency(t.totalAmount, locale, t.currency)).join(' · ') : '—'}</strong>
                  </span>
                )}
              </div>

              {ordersLoading ? (
                <div style={{ padding: '16px', textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                  {isRu ? 'Загрузка заказов...' : 'Buyurtmalar yuklanmoqda...'}
                </div>
              ) : !customerOrdersData?.orders || customerOrdersData.orders.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-md)' }}>
                  {isRu ? 'У данного клиента нет заказов' : 'Ushbu mijozda hali buyurtmalar mavjud emas'}
                </div>
              ) : (
                <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--color-border-light)', borderRadius: 'var(--radius-md)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
                    <thead>
                      <tr style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border-light)', textAlign: 'left' }}>
                        <th style={{ padding: '6px 8px' }}>№</th>
                        <th style={{ padding: '6px 8px' }}>{isRu ? 'Сумма' : 'Summa'}</th>
                        <th style={{ padding: '6px 8px' }}>{isRu ? 'Оплачено' : 'To‘langan'}</th>
                        <th style={{ padding: '6px 8px' }}>{isRu ? 'Статус' : 'Holat'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerOrdersData.orders.map((ord) => (
                        <tr key={ord.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                          <td style={{ padding: '6px 8px', fontWeight: 600 }}>{ord.orderNumber}</td>
                          <td style={{ padding: '6px 8px' }}>{formatCurrency(Number(ord.totalAmount), locale, ord.currency)}</td>
                          <td style={{ padding: '6px 8px' }}>{formatCurrency(Number(ord.paidAmount), locale, ord.currency)} ({ord.paymentPercent}%)</td>
                          <td style={{ padding: '6px 8px' }}>
                            <Badge variant={statusLabel(ORDER_STATUS_LABELS, ord.status, locale).variant}>
                              {statusLabel(ORDER_STATUS_LABELS, ord.status, locale).text}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Quick Payment Modal */}
      {paymentCounterparty && (
        <QuickPaymentModal
          isOpen={true}
          counterparty={paymentCounterparty}
          initialSide={paymentSide}
          initialCurrency={paymentCurrency}
          onClose={closeQuickPayment}
          onSuccess={() => {
            closeQuickPayment();
            refreshCounterparties();
          }}
        />
      )}

      {/* Akt Sverka Statement Drawer */}
      {statementCounterpartyId && (
        <AktSverkaDrawer
          isOpen={true}
          counterpartyId={statementCounterpartyId}
          onClose={() => setStatementCounterpartyId(null)}
          onOpenPayment={(cp, side, currency) => {
            setStatementCounterpartyId(null);
            openQuickPayment(cp, side, currency);
          }}
        />
      )}
    </div>
  );
}
