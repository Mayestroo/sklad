'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { CreateCounterpartyDrawer } from '@/components/counterparties/CreateCounterpartyDrawer';
import {
  Users,
  Plus,
  Search,
  RefreshCw,
  Eye,
  Folder,
  FolderPlus,
  FolderOpen,
  Edit2,
  Trash2,
  MoveRight,
  Inbox,
  Tag,
} from 'lucide-react';

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
  debtBalance: number;
  createdAt: string;
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

export default function CounterpartiesPage() {
  const { token, company } = useAuth();
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  const [items, setItems] = useState<Counterparty[]>([]);
  const [loading, setLoading] = useState(true);

  // Folder states
  const [folders, setFolders] = useState<CounterpartyFolder[]>([]);
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [activeFolderId, setActiveFolderId] = useState<string>('all');

  // Filter state
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [hasDebtOnly, setHasDebtOnly] = useState(false);

  // Create Counterparty Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<'CUSTOMER' | 'SUPPLIER' | 'BOTH'>('CUSTOMER');
  const [formFolderId, setFormFolderId] = useState<string>('');
  const [formInn, setFormInn] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formBankName, setFormBankName] = useState('');
  const [formBankAccount, setFormBankAccount] = useState('');
  const [formMfo, setFormMfo] = useState('');

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
  const [customerOrdersData, setCustomerOrdersData] = useState<any>(null);
  const [ordersLoading, setOrdersLoading] = useState(false);

  useEffect(() => {
    if (!detailItem || !token || !company) {
      setCustomerOrdersData(null);
      return;
    }
    setOrdersLoading(true);
    apiFetch<any>(`/sales/orders/by-counterparty/${detailItem.id}`, {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then((res) => setCustomerOrdersData(res))
      .catch(console.error)
      .finally(() => setOrdersLoading(false));
  }, [detailItem, token, company, locale]);

  const fetchFolders = () => {
    if (!token || !company) return;
    apiFetch<FoldersResponse>('/sales/counterparties/folders', {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then((res) => {
        if (res) {
          setFolders(res.folders || []);
          setUnassignedCount(res.unassignedCount || 0);
          setTotalCount(res.totalCount || 0);
        }
      })
      .catch(console.error);
  };

  const fetchCounterparties = () => {
    if (!token || !company) return;
    setLoading(true);

    const query = new URLSearchParams();
    if (search) query.append('search', search);
    if (typeFilter) query.append('type', typeFilter);
    if (hasDebtOnly) query.append('hasDebt', 'true');
    if (activeFolderId) query.append('folderId', activeFolderId);

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
    fetchFolders();
  }, [token, company, locale]);

  useEffect(() => {
    fetchCounterparties();
  }, [token, company, locale, activeFolderId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCounterparties();
    }, 300);
    return () => clearTimeout(timer);
  }, [search, typeFilter, hasDebtOnly]);

  // Open Create Modal & Pre-select Active Folder if a specific folder is selected
  const handleOpenCreateModal = () => {
    resetForm();
    if (activeFolderId && activeFolderId !== 'all' && activeFolderId !== 'unassigned') {
      setFormFolderId(activeFolderId);
    } else {
      setFormFolderId('');
    }
    setIsCreateOpen(true);
  };

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
          folderId: formFolderId || undefined,
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
      fetchFolders();
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
    setFormFolderId('');
    setFormInn('');
    setFormPhone('');
    setFormEmail('');
    setFormAddress('');
    setFormBankName('');
    setFormBankAccount('');
    setFormMfo('');
    setFormError('');
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
      fetchFolders();
      fetchCounterparties();
    } catch (err: any) {
      setFolderError(err?.message || (isRu ? 'Ошибка сохранения' : 'Saqlashda xatolik yuz berdi'));
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
      fetchFolders();
      fetchCounterparties();
    } catch (err: any) {
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
      fetchFolders();
      fetchCounterparties();
    } catch (err: any) {
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
            {isRu ? 'База данных клиентов и поставщиков, папки и задолженности' : 'Mijozlar va yetkazib beruvchilar bazasi, guruhlar va qarz balansi'}
          </p>
        </div>
        <Button onClick={handleOpenCreateModal} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={16} />
          {isRu ? 'Новый контрагент' : 'Yangi Kontragent'}
        </Button>
      </div>

      {/* Main Two-Column Content Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(230px, 260px) 1fr', gap: 'var(--space-5)', alignItems: 'start' }}>
        
        {/* Left Sidebar: Folders Panel */}
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
                          backgroundColor: f.color || '#3b82f6',
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
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }}
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

        {/* Right Main Panel: KPIs, Filters, Table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 'var(--space-3)' }}>
            <Card style={{ padding: 'var(--space-3) var(--space-4)' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{isRu ? 'Клиенты' : 'Mijozlar'}</div>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginTop: 4, color: 'var(--color-primary-600)' }}>{totalCustomers}</div>
            </Card>
            <Card style={{ padding: 'var(--space-3) var(--space-4)' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{isRu ? 'Поставщики' : 'Yetkazib beruvchilar'}</div>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginTop: 4, color: '#f59e0b' }}>{totalSuppliers}</div>
            </Card>
            <Card style={{ padding: 'var(--space-3) var(--space-4)' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{isRu ? 'Должники' : 'Qarzdorlar'}</div>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginTop: 4, color: '#ef4444' }}>{totalDebtors}</div>
            </Card>
          </div>

          {/* Filter Toolbar */}
          <Card style={{ padding: 'var(--space-3) var(--space-4)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ flex: '1 1 200px', position: 'relative' }}>
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

              <Checkbox
                checked={hasDebtOnly}
                onChange={(e) => setHasDebtOnly(e.target.checked)}
                label={isRu ? 'Только с долгом' : 'Faqat qarzi borlar'}
                size="sm"
              />
            </div>
          </Card>

          {/* Counterparties Table */}
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
                      <th style={{ padding: '12px 16px', textAlign: 'left', whiteSpace: 'nowrap' }}>{isRu ? 'ТИП' : 'TURI'}</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', whiteSpace: 'nowrap' }}>{isRu ? 'ПАПКА' : 'PAPKA'}</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', whiteSpace: 'nowrap' }}>{isRu ? 'ИНН / STIR' : 'STIR / INN'}</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', whiteSpace: 'nowrap' }}>{isRu ? 'ТЕЛЕФОН' : 'TELEFON'}</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>{isRu ? 'БАЛАНС ДОЛГА' : 'QARZ BALANSI'}</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', whiteSpace: 'nowrap' }}>{isRu ? 'ДЕЙСТВИЯ' : 'AMALLAR'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 600 }}>{item.name}</td>
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>{getTypeBadge(item.type)}</td>
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                          {item.folder ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '3px 8px',
                                borderRadius: 12,
                                fontSize: 'var(--text-xs)',
                                background: `${item.folder.color || '#3b82f6'}15`,
                                color: item.folder.color || '#3b82f6',
                                border: `1px solid ${item.folder.color || '#3b82f6'}40`,
                                fontWeight: 600,
                              }}
                            >
                              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: item.folder.color || '#3b82f6' }} />
                              {item.folder.name}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)' }}>{item.inn || '—'}</td>
                        <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)' }}>{item.phone || '—'}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: Number(item.debtBalance) > 0 ? '#ef4444' : '#10b981' }}>
                          {formatCurrency(Number(item.debtBalance || 0), locale)} UZS
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setMoveItem(item);
                                setTargetFolderId(item.folderId || 'unassigned');
                              }}
                              title={isRu ? 'Переместить в папку' : 'Papkaga ko\'chirish'}
                            >
                              <MoveRight size={14} />
                            </Button>
                            <Button size="sm" variant="secondary" onClick={() => setDetailItem(item)}>
                              <Eye size={14} style={{ marginRight: 4 }} /> {isRu ? 'Просмотр' : 'Ko\'rish'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Create Counterparty Slide-Over Drawer */}
      {isCreateOpen && (
        <CreateCounterpartyDrawer
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          defaultFolderId={formFolderId}
          folders={folders}
          onSuccess={() => {
            fetchFolders();
            fetchCounterparties();
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
              <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: 'var(--text-sm)' }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-4)', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--color-bg-subtle)' }}>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Тип' : 'Turi'}</div>
                <div style={{ marginTop: 4 }}>{getTypeBadge(detailItem.type)}</div>
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Папка' : 'Papka'}</div>
                <div style={{ marginTop: 4 }}>
                  {detailItem.folder ? (
                    <span style={{ color: detailItem.folder.color || '#3b82f6', fontWeight: 600, fontSize: 'var(--text-sm)' }}>
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
                <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', marginTop: 4, color: Number(detailItem.discountPercent || 0) > 0 ? '#10b981' : 'inherit' }}>
                  {Number(detailItem.discountPercent || 0)}%
                </div>
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

            {/* Customer Orders History Section */}
            <div style={{ marginTop: 'var(--space-2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h4 style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                  {isRu ? 'История заказов клиента' : 'Mijozning buyurtmalar tarixi'}
                </h4>
                {customerOrdersData?.summary && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                    {isRu ? 'Всего заказов:' : 'Jami buyurtmalar:'} <strong>{customerOrdersData.summary.totalOrders}</strong> | {isRu ? 'Сумма:' : 'Jami summa:'} <strong>{formatCurrency(customerOrdersData.summary.totalAmount, locale)} UZS</strong>
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
                      {customerOrdersData.orders.map((ord: any) => (
                        <tr key={ord.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                          <td style={{ padding: '6px 8px', fontWeight: 600 }}>{ord.orderNumber}</td>
                          <td style={{ padding: '6px 8px' }}>{formatCurrency(Number(ord.totalAmount), ord.currency)}</td>
                          <td style={{ padding: '6px 8px' }}>{formatCurrency(Number(ord.paidAmount), ord.currency)} ({ord.paymentPercent}%)</td>
                          <td style={{ padding: '6px 8px' }}>
                            <Badge variant={ord.status === 'COMPLETED' ? 'success' : ord.status === 'CANCELLED' ? 'error' : 'warning'}>
                              {ord.status}
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
    </div>
  );
}
