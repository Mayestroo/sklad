'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { LoadError } from '@/components/ui/LoadError';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, SelectOption } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { toast } from '@/context/ToastContext';
import { GitBranch, Warehouse, Building2, MapPin, Phone, Edit2, Trash2, Plus } from 'lucide-react';
import { useConfirm } from '@/context/ConfirmContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { errorMessage } from '@/lib/utils';

/** GET /tenants/branches: branches with their warehouses. */
interface WarehouseRow {
  id: string;
  branchId: string | null;
  name: { uz: string; ru: string };
  address?: string | null;
  phone?: string | null;
}

interface BranchRow {
  id: string;
  name: { uz: string; ru: string };
  address: string | null;
  isMain: boolean;
  warehouses: WarehouseRow[];
}

const NO_BRANCH = 'none';

export default function BranchesPage() {
  const { token, company } = useAuth();
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  const confirm = useConfirm();
  const nameOf = (n: BranchRow['name'] | string) => (typeof n === 'object' ? n[locale] || n.uz || n.ru : n);

  const branchesQuery = useApiQuery<BranchRow[]>('/tenants/branches');
  const branches = branchesQuery.data ?? [];
  // Warehouses without a branch are not inside any branch row: list them separately.
  const warehousesQuery = useApiQuery<WarehouseRow[]>('/tenants/warehouses');
  const unassigned = (warehousesQuery.data ?? []).filter((w) => !w.branchId);
  const loading = branchesQuery.isPending || warehousesQuery.isPending;
  const hasAny = branches.length > 0 || unassigned.length > 0;

  // Modals state
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [warehouseModalOpen, setWarehouseModalOpen] = useState(false);

  // Branch form
  const [branchNameUz, setBranchNameUz] = useState('');
  const [branchNameRu, setBranchNameRu] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchIsMain, setBranchIsMain] = useState(false);

  // Warehouse form
  const [pickedBranchId, setSelectedBranchId] = useState('');
  // The new-warehouse form starts on the first branch until one is picked.
  const selectedBranchId = pickedBranchId || branches[0]?.id || NO_BRANCH;
  const [warehouseNameUz, setWarehouseNameUz] = useState('');
  const [warehouseNameRu, setWarehouseNameRu] = useState('');
  const [warehouseAddress, setWarehouseAddress] = useState('');
  const [warehousePhone, setWarehousePhone] = useState('');

  // Edit Branch state
  const [editingBranch, setEditingBranch] = useState<BranchRow | null>(null);
  const [editBranchNameUz, setEditBranchNameUz] = useState('');
  const [editBranchNameRu, setEditBranchNameRu] = useState('');
  const [editBranchAddress, setEditBranchAddress] = useState('');
  const [editBranchIsMain, setEditBranchIsMain] = useState(false);
  const [editBranchLoading, setEditBranchLoading] = useState(false);
  const [createBranchLoading, setCreateBranchLoading] = useState(false);
  const [createWarehouseLoading, setCreateWarehouseLoading] = useState(false);

  // Edit Warehouse state
  const [editingWarehouse, setEditingWarehouse] = useState<WarehouseRow | null>(null);
  const [editWarehouseBranchId, setEditWarehouseBranchId] = useState('');
  const [editWarehouseNameUz, setEditWarehouseNameUz] = useState('');
  const [editWarehouseNameRu, setEditWarehouseNameRu] = useState('');
  const [editWarehouseAddress, setEditWarehouseAddress] = useState('');
  const [editWarehousePhone, setEditWarehousePhone] = useState('');
  const [editWarehouseLoading, setEditWarehouseLoading] = useState(false);

  const fetchBranches = () => {
    void branchesQuery.refetch();
    void warehousesQuery.refetch();
  };

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !company || createBranchLoading) return;
    setCreateBranchLoading(true);
    try {
      await apiFetch('/tenants/branches', {
        method: 'POST',
        token,
        tenantId: company.id,
        locale,
        body: JSON.stringify({
          name: { uz: branchNameUz, ru: branchNameRu || branchNameUz },
          address: branchAddress,
          isMain: branchIsMain,
        }),
      });
      setBranchModalOpen(false);
      setBranchNameUz('');
      setBranchNameRu('');
      setBranchAddress('');
      setBranchIsMain(false);
      fetchBranches();
      toast.success(isRu ? 'Филиал создан' : 'Filial yaratildi');
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Ошибка создания филиала' : 'Filial yaratishda xatolik'));
    } finally {
      setCreateBranchLoading(false);
    }
  };

  const handleOpenEditBranch = (branch: BranchRow) => {
    setEditingBranch(branch);
    const uz = typeof branch.name === 'object' ? (branch.name.uz || '') : branch.name || '';
    const ru = typeof branch.name === 'object' ? (branch.name.ru || '') : branch.name || '';
    setEditBranchNameUz(uz);
    setEditBranchNameRu(ru);
    setEditBranchAddress(branch.address || '');
    setEditBranchIsMain(Boolean(branch.isMain));
  };

  const handleSaveEditBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !company || !editingBranch) return;
    setEditBranchLoading(true);
    try {
      await apiFetch(`/tenants/branches/${editingBranch.id}`, {
        method: 'PATCH',
        token,
        tenantId: company.id,
        locale,
        body: JSON.stringify({
          name: { uz: editBranchNameUz, ru: editBranchNameRu || editBranchNameUz },
          address: editBranchAddress,
          isMain: editBranchIsMain,
        }),
      });
      setEditingBranch(null);
      fetchBranches();
      toast.success(isRu ? 'Филиал сохранён' : 'Filial saqlandi');
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Ошибка обновления филиала' : 'Filialni tahrirlashda xatolik'));
    } finally {
      setEditBranchLoading(false);
    }
  };

  const handleDeleteBranch = async (branch: BranchRow) => {
    if (!token || !company) return;
    const ok = await confirm({
      title: isRu ? 'Удалить филиал?' : 'Filial o‘chirilsinmi?',
      description: isRu
        ? `Филиал «${nameOf(branch.name)}» будет удалён. Если в нём есть склады или документы, система не даст удалить.`
        : `«${nameOf(branch.name)}» filiali o‘chiriladi. Unda omborlar yoki hujjatlar bo‘lsa, tizim o‘chirishga ruxsat bermaydi.`,
      variant: 'danger',
      confirmText: isRu ? 'Удалить' : 'O‘chirish',
      cancelText: isRu ? 'Отмена' : 'Bekor qilish',
    });
    if (!ok) return;
    try {
      await apiFetch(`/tenants/branches/${branch.id}`, { method: 'DELETE', token, tenantId: company.id, locale });
      fetchBranches();
      toast.success(isRu ? `Филиал «${nameOf(branch.name)}» удалён` : `«${nameOf(branch.name)}» filiali o‘chirildi`);
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Не удалось удалить филиал' : 'Filialni o‘chirib bo‘lmadi'));
    }
  };

  const handleCreateWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !company || createWarehouseLoading) return;
    setCreateWarehouseLoading(true);
    try {
      await apiFetch('/tenants/warehouses', {
        method: 'POST',
        token,
        tenantId: company.id,
        locale,
        body: JSON.stringify({
          branchId: selectedBranchId === NO_BRANCH ? null : selectedBranchId,
          name: { uz: warehouseNameUz, ru: warehouseNameRu || warehouseNameUz },
          address: warehouseAddress,
          phone: warehousePhone,
        }),
      });
      setWarehouseModalOpen(false);
      setWarehouseNameUz('');
      setWarehouseNameRu('');
      setWarehouseAddress('');
      setWarehousePhone('');
      fetchBranches();
      toast.success(isRu ? 'Склад создан' : 'Ombor yaratildi');
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Не удалось создать склад' : 'Omborni yaratib bo‘lmadi'));
    } finally {
      setCreateWarehouseLoading(false);
    }
  };

  const handleOpenEditWarehouse = (wh: WarehouseRow) => {
    setEditingWarehouse(wh);
    setEditWarehouseBranchId(wh.branchId || NO_BRANCH);
    const uz = typeof wh.name === 'object' ? (wh.name.uz || '') : wh.name || '';
    const ru = typeof wh.name === 'object' ? (wh.name.ru || '') : wh.name || '';
    setEditWarehouseNameUz(uz);
    setEditWarehouseNameRu(ru);
    setEditWarehouseAddress(wh.address || '');
    setEditWarehousePhone(wh.phone || '');
  };

  const handleSaveEditWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !company || !editingWarehouse) return;
    setEditWarehouseLoading(true);
    try {
      await apiFetch(`/tenants/warehouses/${editingWarehouse.id}`, {
        method: 'PATCH',
        token,
        tenantId: company.id,
        locale,
        body: JSON.stringify({
          branchId: editWarehouseBranchId && editWarehouseBranchId !== NO_BRANCH ? editWarehouseBranchId : null,
          name: { uz: editWarehouseNameUz, ru: editWarehouseNameRu || editWarehouseNameUz },
          address: editWarehouseAddress,
          phone: editWarehousePhone,
        }),
      });
      setEditingWarehouse(null);
      fetchBranches();
      toast.success(isRu ? 'Склад сохранён' : 'Ombor saqlandi');
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Не удалось сохранить склад' : 'Omborni saqlab bo‘lmadi'));
    } finally {
      setEditWarehouseLoading(false);
    }
  };

  const handleDeleteWarehouse = async (wh: WarehouseRow) => {
    if (!token || !company) return;
    const ok = await confirm({
      title: isRu ? 'Удалить склад?' : 'Ombor o‘chirilsinmi?',
      description: isRu
        ? `Склад «${nameOf(wh.name)}» будет удалён. Если на нём есть остатки или документы, система не даст удалить.`
        : `«${nameOf(wh.name)}» ombori o‘chiriladi. Unda qoldiq yoki hujjatlar bo‘lsa, tizim o‘chirishga ruxsat bermaydi.`,
      variant: 'danger',
      confirmText: isRu ? 'Удалить' : 'O‘chirish',
      cancelText: isRu ? 'Отмена' : 'Bekor qilish',
    });
    if (!ok) return;
    try {
      await apiFetch(`/tenants/warehouses/${wh.id}`, { method: 'DELETE', token, tenantId: company.id, locale });
      fetchBranches();
      toast.success(isRu ? `Склад «${nameOf(wh.name)}» удалён` : `«${nameOf(wh.name)}» ombori o‘chirildi`);
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Не удалось удалить склад' : 'Omborni o‘chirib bo‘lmadi'));
    }
  };

  const branchOptions: SelectOption[] = [
    ...branches.map((b) => ({ value: b.id, label: nameOf(b.name) })),
    { value: NO_BRANCH, label: isRu ? 'Без филиала' : 'Filialsiz' },
  ];

  const openNewWarehouse = (branchId?: string) => {
    if (branchId) setSelectedBranchId(branchId);
    setWarehouseModalOpen(true);
  };

  const iconBtn = (danger?: boolean): React.CSSProperties => ({
    width: 32,
    height: 32,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    background: 'transparent',
    cursor: 'pointer',
    color: danger ? 'var(--color-error-700)' : 'var(--color-text-secondary)',
  });

  const branchFields = (
    v: { uz: string; ru: string; address: string; isMain: boolean },
    set: { uz: (s: string) => void; ru: (s: string) => void; address: (s: string) => void; isMain: (b: boolean) => void },
  ) => (
    <>
      <Input autoFocus label={isRu ? 'Название филиала (по-узбекски)' : 'Filial nomi (o‘zbekcha)'} value={v.uz} onChange={(e) => set.uz(e.target.value)} required />
      <Input label={isRu ? 'Название филиала (по-русски)' : 'Filial nomi (ruscha)'} placeholder={isRu ? 'Если пусто — как по-узбекски' : 'Bo‘sh bo‘lsa — o‘zbekchadagidek'} value={v.ru} onChange={(e) => set.ru(e.target.value)} />
      <Input label={isRu ? 'Адрес' : 'Manzil'} value={v.address} onChange={(e) => set.address(e.target.value)} />
      <Checkbox
        checked={v.isMain}
        onChange={(e) => set.isMain(e.target.checked)}
        label={isRu ? 'Главный филиал' : 'Bosh filial'}
        description={isRu ? 'Подставляется по умолчанию в новых документах.' : 'Yangi hujjatlarda sukut bo‘yicha tanlanadi.'}
        size="sm"
      />
    </>
  );

  const warehouseFields = (
    v: { branchId: string; uz: string; ru: string; address: string; phone: string },
    set: { branchId: (s: string) => void; uz: (s: string) => void; ru: (s: string) => void; address: (s: string) => void; phone: (s: string) => void },
  ) => (
    <>
      <Select label={isRu ? 'Филиал' : 'Filial'} options={branchOptions} value={v.branchId} onChange={(val) => set.branchId(val)} />
      <Input autoFocus label={isRu ? 'Название склада (по-узбекски)' : 'Ombor nomi (o‘zbekcha)'} value={v.uz} onChange={(e) => set.uz(e.target.value)} required />
      <Input label={isRu ? 'Название склада (по-русски)' : 'Ombor nomi (ruscha)'} placeholder={isRu ? 'Если пусто — как по-узбекски' : 'Bo‘sh bo‘lsa — o‘zbekchadagidek'} value={v.ru} onChange={(e) => set.ru(e.target.value)} />
      <Input label={isRu ? 'Адрес' : 'Manzil'} value={v.address} onChange={(e) => set.address(e.target.value)} />
      <Input type="tel" autoComplete="tel" label={isRu ? 'Телефон' : 'Telefon'} placeholder="+998 90 123 45 67" value={v.phone} onChange={(e) => set.phone(e.target.value)} />
    </>
  );

  const formFooter = (formId: string, onCancel: () => void, loading: boolean) => (
    <>
      <Button type="button" variant="outline" onClick={onCancel}>{isRu ? 'Отмена' : 'Bekor qilish'}</Button>
      <Button type="submit" form={formId} variant="primary" loading={loading} loadingText={isRu ? 'Сохранение…' : 'Saqlanmoqda…'}>
        {isRu ? 'Сохранить' : 'Saqlash'}
      </Button>
    </>
  );

  const warehouseList = (list: WarehouseRow[]) => (
    <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {list.map((wh) => {
        const wName = nameOf(wh.name);
        return (
          <li key={wh.id} style={{ padding: 'var(--space-2) var(--space-3)', backgroundColor: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)' }}>{wName}</div>
              {(wh.phone || wh.address) && (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {wh.phone && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Phone size={10} aria-hidden /> {wh.phone}</span>}
                  {wh.address && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin size={10} aria-hidden /> {wh.address}</span>}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
              <button type="button" style={iconBtn()} onClick={() => handleOpenEditWarehouse(wh)} aria-label={isRu ? `Изменить склад «${wName}»` : `«${wName}» omborini tahrirlash`} title={isRu ? 'Изменить' : 'Tahrirlash'}>
                <Edit2 size={14} aria-hidden />
              </button>
              <button type="button" style={iconBtn(true)} onClick={() => void handleDeleteWarehouse(wh)} aria-label={isRu ? `Удалить склад «${wName}»` : `«${wName}» omborini o‘chirish`} title={isRu ? 'Удалить' : 'O‘chirish'}>
                <Trash2 size={14} aria-hidden />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );

  const newBranchButton = (
    <Button variant={hasAny ? 'outline' : 'primary'} onClick={() => setBranchModalOpen(true)}>
      <GitBranch size={16} aria-hidden /> {isRu ? 'Новый филиал' : 'Yangi filial'}
    </Button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ marginBottom: 'calc(-1 * var(--space-5))' }}>
        <PageHeader
          title={isRu ? 'Филиалы и склады' : 'Filiallar va omborlar'}
          subtitle={isRu ? 'Где хранится товар: у каждого филиала свои склады, остатки ведутся по складам.' : 'Tovar qayerda saqlanadi: har bir filialning o‘z omborlari bor, qoldiqlar ombor bo‘yicha yuritiladi.'}
          actions={
            hasAny ? (
              <>
                {newBranchButton}
                <Button variant="primary" onClick={() => openNewWarehouse()}>
                  <Warehouse size={16} aria-hidden /> {isRu ? 'Новый склад' : 'Yangi ombor'}
                </Button>
              </>
            ) : undefined
          }
        />
      </div>

      {branchesQuery.isError ? (
        <Card>
          <LoadError error={branchesQuery.error} onRetry={fetchBranches} retrying={branchesQuery.isFetching} />
        </Card>
      ) : loading ? (
        <div role="status" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 'var(--space-4)' }}>
          <span className="sr-only">{isRu ? 'Загрузка…' : 'Yuklanmoqda…'}</span>
          {[0, 1].map((i) => (
            <Card key={i}><Skeleton height={18} width="50%" /><Skeleton height={36} style={{ marginTop: 16 }} /><Skeleton height={36} style={{ marginTop: 8 }} /></Card>
          ))}
        </div>
      ) : !hasAny ? (
        <Card>
          <EmptyState
            icon={Building2}
            title={isRu ? 'Филиалов пока нет' : 'Hozircha filiallar yo‘q'}
            description={isRu ? 'Создайте филиал, затем добавьте в него склад — после этого можно принимать товар.' : 'Filial yarating, keyin unga ombor qo‘shing — shundan so‘ng tovar qabul qilish mumkin.'}
            action={newBranchButton}
          />
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 'var(--space-4)', alignItems: 'start' }}>
          {branches.map((branch) => {
            const bName = nameOf(branch.name);
            return (
              <Card key={branch.id} style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
                    <div aria-hidden style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary-700)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Building2 size={20} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {bName}
                        {branch.isMain && <Badge variant="success">{isRu ? 'Главный' : 'Bosh filial'}</Badge>}
                      </h2>
                      {branch.address && (
                        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                          <MapPin size={12} aria-hidden /> {branch.address}
                        </p>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                    <button type="button" style={iconBtn()} onClick={() => handleOpenEditBranch(branch)} aria-label={isRu ? `Изменить филиал «${bName}»` : `«${bName}» filialini tahrirlash`} title={isRu ? 'Изменить' : 'Tahrirlash'}>
                      <Edit2 size={15} aria-hidden />
                    </button>
                    <button type="button" style={iconBtn(true)} onClick={() => void handleDeleteBranch(branch)} aria-label={isRu ? `Удалить филиал «${bName}»` : `«${bName}» filialini o‘chirish`} title={isRu ? 'Удалить' : 'O‘chirish'}>
                      <Trash2 size={15} aria-hidden />
                    </button>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--color-border-light)', paddingTop: 'var(--space-3)' }}>
                  <h3 style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Warehouse size={14} aria-hidden /> {isRu ? 'Склады' : 'Omborlar'} ({branch.warehouses?.length || 0})
                  </h3>
                  {branch.warehouses && branch.warehouses.length > 0 ? (
                    warehouseList(branch.warehouses)
                  ) : (
                    <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                      {isRu ? 'Складов нет — без склада сюда нельзя принять товар.' : 'Ombor yo‘q — omborsiz bu filialga tovar qabul qilib bo‘lmaydi.'}
                    </p>
                  )}
                  <Button variant="ghost" size="sm" style={{ marginTop: 'var(--space-2)' }} onClick={() => openNewWarehouse(branch.id)}>
                    <Plus size={14} aria-hidden /> {isRu ? 'Добавить склад' : 'Ombor qo‘shish'}
                  </Button>
                </div>
              </Card>
            );
          })}
          {unassigned.length > 0 && (
            <Card style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div>
                <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Warehouse size={18} aria-hidden style={{ color: 'var(--color-text-secondary)' }} />
                  {isRu ? 'Склады без филиала' : 'Filialga biriktirilmagan omborlar'} ({unassigned.length})
                </h2>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  {isRu ? 'Работают как обычно. Чтобы привязать к филиалу, нажмите «Изменить».' : 'Odatdagidek ishlaydi. Filialga biriktirish uchun «Tahrirlash»ni bosing.'}
                </p>
              </div>
              {warehouseList(unassigned)}
            </Card>
          )}
        </div>
      )}

      <Modal isOpen={branchModalOpen} onClose={() => setBranchModalOpen(false)} title={isRu ? 'Новый филиал' : 'Yangi filial'} footer={formFooter('branch-create-form', () => setBranchModalOpen(false), createBranchLoading)}>
        <form id="branch-create-form" onSubmit={handleCreateBranch} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {branchFields(
            { uz: branchNameUz, ru: branchNameRu, address: branchAddress, isMain: branchIsMain },
            { uz: setBranchNameUz, ru: setBranchNameRu, address: setBranchAddress, isMain: setBranchIsMain },
          )}
        </form>
      </Modal>

      {editingBranch && (
        <Modal isOpen onClose={() => setEditingBranch(null)} title={isRu ? 'Изменить филиал' : 'Filialni tahrirlash'} footer={formFooter('branch-edit-form', () => setEditingBranch(null), editBranchLoading)}>
          <form id="branch-edit-form" onSubmit={handleSaveEditBranch} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {branchFields(
              { uz: editBranchNameUz, ru: editBranchNameRu, address: editBranchAddress, isMain: editBranchIsMain },
              { uz: setEditBranchNameUz, ru: setEditBranchNameRu, address: setEditBranchAddress, isMain: setEditBranchIsMain },
            )}
          </form>
        </Modal>
      )}

      <Modal isOpen={warehouseModalOpen} onClose={() => setWarehouseModalOpen(false)} title={isRu ? 'Новый склад' : 'Yangi ombor'} footer={formFooter('warehouse-create-form', () => setWarehouseModalOpen(false), createWarehouseLoading)}>
        <form id="warehouse-create-form" onSubmit={handleCreateWarehouse} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {warehouseFields(
            { branchId: selectedBranchId, uz: warehouseNameUz, ru: warehouseNameRu, address: warehouseAddress, phone: warehousePhone },
            { branchId: setSelectedBranchId, uz: setWarehouseNameUz, ru: setWarehouseNameRu, address: setWarehouseAddress, phone: setWarehousePhone },
          )}
        </form>
      </Modal>

      {editingWarehouse && (
        <Modal isOpen onClose={() => setEditingWarehouse(null)} title={isRu ? 'Изменить склад' : 'Omborni tahrirlash'} footer={formFooter('warehouse-edit-form', () => setEditingWarehouse(null), editWarehouseLoading)}>
          <form id="warehouse-edit-form" onSubmit={handleSaveEditWarehouse} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {warehouseFields(
              { branchId: editWarehouseBranchId, uz: editWarehouseNameUz, ru: editWarehouseNameRu, address: editWarehouseAddress, phone: editWarehousePhone },
              { branchId: setEditWarehouseBranchId, uz: setEditWarehouseNameUz, ru: setEditWarehouseNameRu, address: setEditWarehouseAddress, phone: setEditWarehousePhone },
            )}
          </form>
        </Modal>
      )}
    </div>
  );
}
