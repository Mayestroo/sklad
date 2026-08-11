'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Building2, Warehouse as WarehouseIcon, Plus, MapPin, Phone, CheckCircle2 } from 'lucide-react';

export default function BranchesSettingsPage() {
  const tCommon = useTranslations('common');
  const locale = useLocale() as 'uz' | 'ru';
  const { token, company } = useAuth();

  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
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
      setBranches(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBranches();
  }, [token, company]);

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !company || !branchNameUz) return;
    try {
      await apiFetch('/tenants/branches', {
        token,
        tenantId: company.id,
        locale,
        method: 'POST',
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
      fetchBranches();
    } catch (err: any) {
      alert(err.message || 'Error creating branch');
    }
  };

  const handleCreateWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !company || !warehouseNameUz) return;
    try {
      await apiFetch('/tenants/warehouses', {
        token,
        tenantId: company.id,
        locale,
        method: 'POST',
        body: JSON.stringify({
          branchId: selectedBranchId || null,
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
    } catch (err: any) {
      alert(err.message || 'Error creating warehouse');
    }
  };

  const branchOptions = [
    { value: '', label: '-- Filialga biriktirmaslik (Mustaqil Ombor) --' },
    ...branches.map((b) => ({ value: b.id, label: b.name[locale] || b.name.uz })),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            Filiallar va Omborxonalar Tuzilmasi (Hierarchy)
          </h1>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <Button variant="outline" onClick={() => setWarehouseModalOpen(true)}>
            <WarehouseIcon size={16} /> Omborxona Qo&apos;shish
          </Button>
          <Button variant="primary" onClick={() => setBranchModalOpen(true)}>
            <Plus size={16} /> Yangi Filial Yaratish
          </Button>
        </div>
      </div>

      {/* Branches List */}
      {loading ? (
        <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
          {tCommon('loading')}
        </div>
      ) : branches.length === 0 ? (
        <Card style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
          <Building2 size={40} style={{ margin: '0 auto var(--space-2)', opacity: 0.4 }} />
          <div>Hozircha filiallar kiritilmagan</div>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-4)' }}>
          {branches.map((branch) => (
            <Card key={branch.id} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', borderTop: branch.isMain ? '4px solid var(--color-primary-600)' : '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <Building2 size={20} style={{ color: 'var(--color-primary-600)' }} />
                  <div>
                    <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)' }}>
                      {branch.name[locale] || branch.name.uz}
                    </h3>
                    {branch.address && (
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                        <MapPin size={12} /> {branch.address}
                      </div>
                    )}
                  </div>
                </div>
                {branch.isMain && <Badge variant="success">Bosh Filial (Main)</Badge>}
              </div>

              {/* Warehouses list under branch */}
              <div style={{ borderTop: '1px solid var(--color-border-light)', paddingTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-tertiary)' }}>
                  BOG&apos;LANGAN OMBORXONALAR ({branch.warehouses?.length || 0}):
                </div>
                {branch.warehouses && branch.warehouses.length > 0 ? (
                  branch.warehouses.map((wh: any) => (
                    <div key={wh.id} style={{ padding: '8px 12px', backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <WarehouseIcon size={16} style={{ color: 'var(--color-text-secondary)' }} />
                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)' }}>{wh.name[locale] || wh.name.uz}</span>
                      </div>
                      {wh.phone && <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>{wh.phone}</span>}
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>Omborxonalar yo&apos;q</div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add Branch Modal */}
      <Modal isOpen={branchModalOpen} onClose={() => setBranchModalOpen(false)} title="Yangi Filial Yaratish">
        <form onSubmit={handleCreateBranch} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Input label="Filial Nomi (O'zbekcha)" value={branchNameUz} onChange={(e) => setBranchNameUz(e.target.value)} required />
          <Input label="Название Филиала (Русский)" value={branchNameRu} onChange={(e) => setBranchNameRu(e.target.value)} />
          <Input label="Manzili (Address)" value={branchAddress} onChange={(e) => setBranchAddress(e.target.value)} />
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>
            <input type="checkbox" checked={branchIsMain} onChange={(e) => setBranchIsMain(e.target.checked)} />
            <span>Bosh filial deb belgilash (Main Branch)</span>
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            <Button type="button" variant="outline" onClick={() => setBranchModalOpen(false)}>Bekor qilish</Button>
            <Button type="submit" variant="primary">Saqlash</Button>
          </div>
        </form>
      </Modal>

      {/* Add Warehouse Modal */}
      <Modal isOpen={warehouseModalOpen} onClose={() => setWarehouseModalOpen(false)} title="Yangi Omborxona Biriktirish">
        <form onSubmit={handleCreateWarehouse} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Select
            label="Tegishli Filialni Tanlang:"
            options={branchOptions}
            value={selectedBranchId}
            onChange={(val) => setSelectedBranchId(val)}
          />
          <Input label="Ombor Nomi (O'zbekcha)" value={warehouseNameUz} onChange={(e) => setWarehouseNameUz(e.target.value)} required />
          <Input label="Название Склада (Русский)" value={warehouseNameRu} onChange={(e) => setWarehouseNameRu(e.target.value)} />
          <Input label="Manzili (Address)" value={warehouseAddress} onChange={(e) => setWarehouseAddress(e.target.value)} />
          <Input label="Telefon (Phone)" value={warehousePhone} onChange={(e) => setWarehousePhone(e.target.value)} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            <Button type="button" variant="outline" onClick={() => setWarehouseModalOpen(false)}>Bekor qilish</Button>
            <Button type="submit" variant="primary">Saqlash</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
