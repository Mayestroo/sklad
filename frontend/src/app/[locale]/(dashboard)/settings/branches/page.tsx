'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, SelectOption } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { toast } from '@/context/ToastContext';
import { GitBranch, Warehouse, Plus, Building2, MapPin, Phone, Edit2, Trash2 } from 'lucide-react';

export default function BranchesPage() {
  const { token, company } = useAuth();
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [warehouseModalOpen, setWarehouseModalOpen] = useState(false);

  // Branch form
  const [branchNameUz, setBranchNameUz] = useState('');
  const [branchNameRu, setBranchNameRu] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchIsMain, setBranchIsMain] = useState(false);

  // Warehouse form
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [warehouseNameUz, setWarehouseNameUz] = useState('');
  const [warehouseNameRu, setWarehouseNameRu] = useState('');
  const [warehouseAddress, setWarehouseAddress] = useState('');
  const [warehousePhone, setWarehousePhone] = useState('');

  // Edit Branch state
  const [editingBranch, setEditingBranch] = useState<any | null>(null);
  const [editBranchNameUz, setEditBranchNameUz] = useState('');
  const [editBranchNameRu, setEditBranchNameRu] = useState('');
  const [editBranchAddress, setEditBranchAddress] = useState('');
  const [editBranchIsMain, setEditBranchIsMain] = useState(false);
  const [editBranchLoading, setEditBranchLoading] = useState(false);

  // Delete Branch state
  const [deletingBranch, setDeletingBranch] = useState<any | null>(null);
  const [deleteBranchLoading, setDeleteBranchLoading] = useState(false);

  // Edit Warehouse state
  const [editingWarehouse, setEditingWarehouse] = useState<any | null>(null);
  const [editWarehouseBranchId, setEditWarehouseBranchId] = useState('');
  const [editWarehouseNameUz, setEditWarehouseNameUz] = useState('');
  const [editWarehouseNameRu, setEditWarehouseNameRu] = useState('');
  const [editWarehouseAddress, setEditWarehouseAddress] = useState('');
  const [editWarehousePhone, setEditWarehousePhone] = useState('');
  const [editWarehouseLoading, setEditWarehouseLoading] = useState(false);

  // Delete Warehouse state
  const [deletingWarehouse, setDeletingWarehouse] = useState<any | null>(null);
  const [deleteWarehouseLoading, setDeleteWarehouseLoading] = useState(false);

  const fetchBranches = async () => {
    if (!token || !company) return;
    setLoading(true);
    try {
      const data = await apiFetch<any[]>('/tenants/branches', { token, tenantId: company.id, locale });
      setBranches(data || []);
      if (data && data.length > 0 && !selectedBranchId) {
        setSelectedBranchId(data[0].id);
      }
    } catch (err) {
      console.error('Failed to load branches:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBranches();
  }, [token, company, locale]);

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !company) return;
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
      toast.success(isRu ? 'Филиал успешно создан' : 'Filial muvaffaqiyatli yaratildi');
    } catch (err: any) {
      toast.error(err?.message || (isRu ? 'Ошибка создания филиала' : 'Filial yaratishda xatolik'));
    }
  };

  const handleOpenEditBranch = (branch: any) => {
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
      toast.success(isRu ? 'Филиал успешно обновлен' : 'Filial muvaffaqiyatli yangilandi');
    } catch (err: any) {
      toast.error(err?.message || (isRu ? 'Ошибка обновления филиала' : 'Filialni tahrirlashda xatolik'));
    } finally {
      setEditBranchLoading(false);
    }
  };

  const handleDeleteBranch = async () => {
    if (!token || !company || !deletingBranch) return;
    setDeleteBranchLoading(true);
    try {
      await apiFetch(`/tenants/branches/${deletingBranch.id}`, {
        method: 'DELETE',
        token,
        tenantId: company.id,
        locale,
      });
      setDeletingBranch(null);
      fetchBranches();
      toast.success(isRu ? 'Филиал успешно удален' : 'Filial muvaffaqiyatli o‘chirildi');
    } catch (err: any) {
      toast.error(err?.message || (isRu ? 'Ошибка при удалении филиала' : 'Filialni o‘chirishda xatolik'));
    } finally {
      setDeleteBranchLoading(false);
    }
  };

  const handleCreateWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !company) return;
    try {
      await apiFetch('/tenants/warehouses', {
        method: 'POST',
        token,
        tenantId: company.id,
        locale,
        body: JSON.stringify({
          branchId: selectedBranchId,
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
      toast.success(isRu ? 'Склад успешно создан' : 'Omborxona muvaffaqiyatli yaratildi');
    } catch (err: any) {
      toast.error(err?.message || (isRu ? 'Ошибка привязки склада' : 'Omborxona yaratishda xatolik'));
    }
  };

  const handleOpenEditWarehouse = (wh: any) => {
    setEditingWarehouse(wh);
    setEditWarehouseBranchId(wh.branchId || selectedBranchId || '');
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
          branchId: editWarehouseBranchId || null,
          name: { uz: editWarehouseNameUz, ru: editWarehouseNameRu || editWarehouseNameUz },
          address: editWarehouseAddress,
          phone: editWarehousePhone,
        }),
      });
      setEditingWarehouse(null);
      fetchBranches();
      toast.success(isRu ? 'Склад успешно обновлен' : 'Omborxona muvaffaqiyatli yangilandi');
    } catch (err: any) {
      toast.error(err?.message || (isRu ? 'Ошибка обновления склада' : 'Omborxonani tahrirlashda xatolik'));
    } finally {
      setEditWarehouseLoading(false);
    }
  };

  const handleDeleteWarehouse = async () => {
    if (!token || !company || !deletingWarehouse) return;
    setDeleteWarehouseLoading(true);
    try {
      await apiFetch(`/tenants/warehouses/${deletingWarehouse.id}`, {
        method: 'DELETE',
        token,
        tenantId: company.id,
        locale,
      });
      setDeletingWarehouse(null);
      fetchBranches();
      toast.success(isRu ? 'Склад успешно удален' : 'Omborxona muvaffaqiyatli o‘chirildi');
    } catch (err: any) {
      toast.error(err?.message || (isRu ? 'Ошибка при удалении склада' : 'Omborxonani o‘chirishda xatolik'));
    } finally {
      setDeleteWarehouseLoading(false);
    }
  };


  const branchOptions: SelectOption[] = branches.map((b) => ({
    value: b.id,
    label: typeof b.name === 'object' ? (b.name[locale] || b.name.uz || b.name.ru) : b.name,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', margin: 0 }}>
            {isRu ? 'Филиалы и склады' : 'Filiallar va omborlar'}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <Button variant="secondary" onClick={() => setBranchModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <GitBranch size={16} /> {isRu ? 'Новый филиал' : 'Yangi Filial'}
          </Button>
          <Button variant="primary" onClick={() => setWarehouseModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Warehouse size={16} /> {isRu ? 'Новый склад' : 'Yangi Omborxona'}
          </Button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <Card style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
          {isRu ? 'Загрузка структуры...' : 'Filiallar yuklanmoqda...'}
        </Card>
      ) : branches.length === 0 ? (
        <Card style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
          {isRu ? 'Филиалы еще не созданы' : 'Hozircha filiallar yaratilmagan.'}
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-4)' }}>
          {branches.map((branch) => (
            <Card key={branch.id} style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Building2 size={20} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {typeof branch.name === 'object' ? (branch.name[locale] || branch.name.uz || branch.name.ru) : branch.name}
                      {branch.isMain && <Badge variant="success">{isRu ? 'Главный' : 'Bosh Filial'}</Badge>}
                    </h3>
                    {branch.address && (
                      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                        <MapPin size={12} /> {branch.address}
                      </p>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '4px' }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenEditBranch(branch)}
                    style={{ padding: '6px', height: 'auto', color: 'var(--color-text-secondary)' }}
                    title={isRu ? 'Редактировать филиал' : 'Filialni tahrirlash'}
                  >
                    <Edit2 size={15} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeletingBranch(branch)}
                    style={{ padding: '6px', height: 'auto', color: '#ef4444' }}
                    title={isRu ? 'Удалить филиал' : 'Filialni o‘chirish'}
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--color-border-light)', paddingTop: 'var(--space-3)' }}>
                <h4 style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Warehouse size={14} /> {isRu ? 'Склады филиала' : 'Filial Omborxonalari'} ({branch.warehouses?.length || 0})
                </h4>
                {branch.warehouses && branch.warehouses.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    {branch.warehouses.map((wh: any) => (
                      <div key={wh.id} style={{ padding: 'var(--space-2) var(--space-3)', backgroundColor: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)' }}>
                            {typeof wh.name === 'object' ? (wh.name[locale] || wh.name.uz || wh.name.ru) : wh.name}
                          </div>
                          {wh.phone && (
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Phone size={10} /> {wh.phone}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {wh.isMain && <Badge variant="neutral">{isRu ? 'Главный склад' : 'Asosiy Ombor'}</Badge>}
                          <button
                            type="button"
                            onClick={() => handleOpenEditWarehouse(wh)}
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', color: 'var(--color-text-secondary)' }}
                            title={isRu ? 'Редактировать склад' : 'Omborxonani tahrirlash'}
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingWarehouse(wh)}
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', color: '#ef4444' }}
                            title={isRu ? 'Удалить склад' : 'Omborxonani o‘chirish'}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
                    {isRu ? 'Склады отсутствуют' : 'Omborxonalar yo\'q'}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add Branch Modal */}
      <Modal isOpen={branchModalOpen} onClose={() => setBranchModalOpen(false)} title={isRu ? 'Создание филиала' : 'Yangi Filial Yaratish'}>
        <form onSubmit={handleCreateBranch} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Input label={isRu ? 'Название филиала (Узбекский)' : "Filial Nomi (O'zbekcha)"} value={branchNameUz} onChange={(e) => setBranchNameUz(e.target.value)} required />
          <Input label={isRu ? 'Название филиала (Русский)' : 'Название Филиала (Русский)'} value={branchNameRu} onChange={(e) => setBranchNameRu(e.target.value)} />
          <Input label={isRu ? 'Адрес' : 'Manzili (Address)'} value={branchAddress} onChange={(e) => setBranchAddress(e.target.value)} />
          <Checkbox
            checked={branchIsMain}
            onChange={(e) => setBranchIsMain(e.target.checked)}
            label={isRu ? 'Отметить как главный филиал' : 'Bosh filial deb belgilash (Main Branch)'}
            size="sm"
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            <Button type="button" variant="outline" onClick={() => setBranchModalOpen(false)}>{isRu ? 'Отмена' : 'Bekor qilish'}</Button>
            <Button type="submit" variant="primary">{isRu ? 'Сохранить' : 'Saqlash'}</Button>
          </div>
        </form>
      </Modal>

      {/* Edit Branch Modal */}
      {editingBranch && (
        <Modal isOpen={Boolean(editingBranch)} onClose={() => setEditingBranch(null)} title={isRu ? 'Редактировать филиал' : 'Filialni Tahrirlash'}>
          <form onSubmit={handleSaveEditBranch} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Input label={isRu ? 'Название филиала (Узбекский)' : "Filial Nomi (O'zbekcha)"} value={editBranchNameUz} onChange={(e) => setEditBranchNameUz(e.target.value)} required />
            <Input label={isRu ? 'Название филиала (Русский)' : 'Название Филиала (Русский)'} value={editBranchNameRu} onChange={(e) => setEditBranchNameRu(e.target.value)} />
            <Input label={isRu ? 'Адрес' : 'Manzili (Address)'} value={editBranchAddress} onChange={(e) => setEditBranchAddress(e.target.value)} />
            <Checkbox
              checked={editBranchIsMain}
              onChange={(e) => setEditBranchIsMain(e.target.checked)}
              label={isRu ? 'Отметить как главный филиал' : 'Bosh filial deb belgilash (Main Branch)'}
              size="sm"
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              <Button type="button" variant="outline" onClick={() => setEditingBranch(null)}>{isRu ? 'Отмена' : 'Bekor qilish'}</Button>
              <Button type="submit" variant="primary" disabled={editBranchLoading}>
                {editBranchLoading ? (isRu ? 'Сохранение...' : 'Saqlanmoqda...') : (isRu ? 'Сохранить' : 'Saqlash')}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Branch Confirm Modal */}
      {deletingBranch && (
        <Modal isOpen={Boolean(deletingBranch)} onClose={() => setDeletingBranch(null)} title={isRu ? 'Удаление филиала' : 'Filialni O‘chirish'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
              {isRu
                ? `Вы уверены, что хотите удалить филиал "${typeof deletingBranch.name === 'object' ? (deletingBranch.name[locale] || deletingBranch.name.ru || deletingBranch.name.uz) : deletingBranch.name}"?`
                : `Haqiqatan ham "${typeof deletingBranch.name === 'object' ? (deletingBranch.name[locale] || deletingBranch.name.uz || deletingBranch.name.ru) : deletingBranch.name}" filialini o‘chirmoqchimisiz?`}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
              <Button type="button" variant="outline" onClick={() => setDeletingBranch(null)}>{isRu ? 'Отмена' : 'Bekor qilish'}</Button>
              <Button type="button" variant="primary" style={{ backgroundColor: '#ef4444' }} onClick={handleDeleteBranch} disabled={deleteBranchLoading}>
                {deleteBranchLoading ? (isRu ? 'Удаление...' : 'O‘chirilmoqda...') : (isRu ? 'Удалить' : 'O‘chirish')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Warehouse Modal */}
      <Modal isOpen={warehouseModalOpen} onClose={() => setWarehouseModalOpen(false)} title={isRu ? 'Привязка нового склада' : 'Yangi Omborxona Biriktirish'}>
        <form onSubmit={handleCreateWarehouse} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Select
            label={isRu ? 'Выберите филиал:' : 'Tegishli Filialni Tanlang:'}
            options={branchOptions}
            value={selectedBranchId}
            onChange={(val) => setSelectedBranchId(val)}
          />
          <Input label={isRu ? 'Название склада (Узбекский)' : "Ombor Nomi (O'zbekcha)"} value={warehouseNameUz} onChange={(e) => setWarehouseNameUz(e.target.value)} required />
          <Input label={isRu ? 'Название склада (Русский)' : 'Название Склада (Русский)'} value={warehouseNameRu} onChange={(e) => setWarehouseNameRu(e.target.value)} />
          <Input label={isRu ? 'Адрес' : 'Manzili (Address)'} value={warehouseAddress} onChange={(e) => setWarehouseAddress(e.target.value)} />
          <Input label={isRu ? 'Телефон' : 'Telefon (Phone)'} value={warehousePhone} onChange={(e) => setWarehousePhone(e.target.value)} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            <Button type="button" variant="outline" onClick={() => setWarehouseModalOpen(false)}>{isRu ? 'Отмена' : 'Bekor qilish'}</Button>
            <Button type="submit" variant="primary">{isRu ? 'Сохранить' : 'Saqlash'}</Button>
          </div>
        </form>
      </Modal>

      {/* Edit Warehouse Modal */}
      {editingWarehouse && (
        <Modal isOpen={Boolean(editingWarehouse)} onClose={() => setEditingWarehouse(null)} title={isRu ? 'Редактировать склад' : 'Omborxonani Tahrirlash'}>
          <form onSubmit={handleSaveEditWarehouse} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Select
              label={isRu ? 'Выберите филиал:' : 'Tegishli Filialni Tanlang:'}
              options={branchOptions}
              value={editWarehouseBranchId}
              onChange={(val) => setEditWarehouseBranchId(val)}
            />
            <Input label={isRu ? 'Название склада (Узбекский)' : "Ombor Nomi (O'zbekcha)"} value={editWarehouseNameUz} onChange={(e) => setEditWarehouseNameUz(e.target.value)} required />
            <Input label={isRu ? 'Название склада (Русский)' : 'Название Склада (Русский)'} value={editWarehouseNameRu} onChange={(e) => setEditWarehouseNameRu(e.target.value)} />
            <Input label={isRu ? 'Адрес' : 'Manzili (Address)'} value={editWarehouseAddress} onChange={(e) => setEditWarehouseAddress(e.target.value)} />
            <Input label={isRu ? 'Телефон' : 'Telefon (Phone)'} value={editWarehousePhone} onChange={(e) => setEditWarehousePhone(e.target.value)} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              <Button type="button" variant="outline" onClick={() => setEditingWarehouse(null)}>{isRu ? 'Отмена' : 'Bekor qilish'}</Button>
              <Button type="submit" variant="primary" disabled={editWarehouseLoading}>
                {editWarehouseLoading ? (isRu ? 'Сохранение...' : 'Saqlanmoqda...') : (isRu ? 'Сохранить' : 'Saqlash')}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Warehouse Confirm Modal */}
      {deletingWarehouse && (
        <Modal isOpen={Boolean(deletingWarehouse)} onClose={() => setDeletingWarehouse(null)} title={isRu ? 'Удаление склада' : 'Omborxonani O‘chirish'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
              {isRu
                ? `Вы уверены, что хотите удалить склад "${typeof deletingWarehouse.name === 'object' ? (deletingWarehouse.name[locale] || deletingWarehouse.name.ru || deletingWarehouse.name.uz) : deletingWarehouse.name}"?`
                : `Haqiqatan ham "${typeof deletingWarehouse.name === 'object' ? (deletingWarehouse.name[locale] || deletingWarehouse.name.uz || deletingWarehouse.name.ru) : deletingWarehouse.name}" omborxonasini o‘chirmoqchimisiz?`}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
              <Button type="button" variant="outline" onClick={() => setDeletingWarehouse(null)}>{isRu ? 'Отмена' : 'Bekor qilish'}</Button>
              <Button type="button" variant="primary" style={{ backgroundColor: '#ef4444' }} onClick={handleDeleteWarehouse} disabled={deleteWarehouseLoading}>
                {deleteWarehouseLoading ? (isRu ? 'Удаление...' : 'O‘chirilmoqda...') : (isRu ? 'Удалить' : 'O‘chirish')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

