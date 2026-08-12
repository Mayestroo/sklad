'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, SelectOption } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { GitBranch, Warehouse, Plus, Building2, MapPin, Phone } from 'lucide-react';

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

  const fetchBranches = async () => {
    if (!token || !company) return;
    setLoading(true);
    try {
      const data = await apiFetch<any[]>('/tenants/branches', { token, tenantId: company.id, locale });
      setBranches(data || []);
      if (data && data.length > 0) {
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
    } catch (err) {
      alert(isRu ? 'Ошибка создания филиала' : 'Filial yaratishda xatolik');
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
    } catch (err) {
      alert(isRu ? 'Ошибка привязки склада' : 'Omborxona yaratishda xatolik');
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
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            {isRu ? 'Филиалы и Склады' : 'Filiallar va Omborxonalar'}
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            {isRu ? 'Управление структурой филиалов и складов компании' : 'Kompaniyaning filiallar va omborxonalar tuzilmasini boshqarish'}
          </p>
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
                        {wh.isMain && <Badge variant="neutral">{isRu ? 'Главный склад' : 'Asosiy Ombor'}</Badge>}
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
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>
            <input type="checkbox" checked={branchIsMain} onChange={(e) => setBranchIsMain(e.target.checked)} />
            <span>{isRu ? 'Отметить как главный филиал' : 'Bosh filial deb belgilash (Main Branch)'}</span>
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            <Button type="button" variant="outline" onClick={() => setBranchModalOpen(false)}>{isRu ? 'Отмена' : 'Bekor qilish'}</Button>
            <Button type="submit" variant="primary">{isRu ? 'Сохранить' : 'Saqlash'}</Button>
          </div>
        </form>
      </Modal>

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
    </div>
  );
}
