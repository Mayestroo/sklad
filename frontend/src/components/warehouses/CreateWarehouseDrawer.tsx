'use client';

import React, { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Warehouse, Building2, AlertCircle, CheckCircle2 } from 'lucide-react';

interface BranchOption {
  id: string;
  name: any;
}

export interface CreateWarehouseDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (createdWarehouse: any) => void;
}

export const CreateWarehouseDrawer: React.FC<CreateWarehouseDrawerProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token, company } = useAuth();

  const [nameUz, setNameUz] = useState('');
  const [nameRu, setNameRu] = useState('');
  const [branchId, setBranchId] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');

  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !company || !isOpen) return;

    apiFetch<BranchOption[]>('/tenants/branches', { token, tenantId: company.id, locale })
      .then((res) => setBranches(res || []))
      .catch((err) => console.error(err));
  }, [token, company, isOpen, locale]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const finalName = nameUz.trim() || nameRu.trim();
    if (!finalName) {
      setError(isRu ? 'Введите наименование склада' : 'Ombor nomini kiriting');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = {
        name: {
          uz: nameUz.trim() || nameRu.trim(),
          ru: nameRu.trim() || nameUz.trim(),
        },
        branchId: branchId || undefined,
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
      };

      const res = await apiFetch('/tenants/warehouses', {
        method: 'POST',
        token: token || undefined,
        tenantId: company?.id,
        locale,
        body: JSON.stringify(payload),
      });

      resetForm();
      if (onSuccess) onSuccess(res);
      onClose();
    } catch (err: any) {
      setError(err?.message || (isRu ? 'Ошибка сохранения склада' : 'Omborni saqlashda xatolik'));
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setNameUz('');
    setNameRu('');
    setBranchId('');
    setAddress('');
    setPhone('');
    setError(null);
  };

  const branchOptions = [
    { value: '', label: isRu ? '— Без филиала (Главная организация) —' : '— Filialsiz (Bosh tashkilot) —' },
    ...branches.map((b) => ({
      value: b.id,
      label: typeof b.name === 'string' ? b.name : b.name?.[locale] || b.name?.uz || 'Filial',
    })),
  ];

  return (
    <Drawer
      isOpen={isOpen}
      onClose={() => {
        resetForm();
        onClose();
      }}
      title={isRu ? 'Новый склад' : 'Yangi Omborxona'}
      description={
        isRu
          ? 'Создание нового склада или места хранения товаров'
          : 'Yangi ombor, saqlash joyi yoki do‘kon omborini ro‘yxatga olish'
      }
      icon={<Building2 size={20} />}
      size="md"
      onSubmitShortcut={handleSubmit}
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              resetForm();
              onClose();
            }}
            disabled={loading}
          >
            {isRu ? 'Отмена (Esc)' : 'Bekor qilish (Esc)'}
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => handleSubmit()}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {loading ? (
              isRu ? 'Сохранение...' : 'Saqlanmoqda...'
            ) : (
              <>
                <CheckCircle2 size={16} />
                {isRu ? 'Сохранить склад (Ctrl+Enter)' : 'Omborni saqlash (Ctrl+Enter)'}
              </>
            )}
          </Button>
        </>
      }
    >
      {error && (
        <div
          style={{
            padding: '12px 14px',
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid #ef4444',
            color: '#ef4444',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-xs)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertCircle size={16} style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {/* Warehouse Names (UZ & RU) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              Ombor nomi (O‘zbekcha) *
            </label>
            <Input
              value={nameUz}
              onChange={(e) => setNameUz(e.target.value)}
              placeholder="Masalan: Asosiy ombor (Chilonzor)"
              autoFocus
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              Наименование (Русский)
            </label>
            <Input
              value={nameRu}
              onChange={(e) => setNameRu(e.target.value)}
              placeholder="Например: Главный склад (Чиланзар)"
            />
          </div>
        </div>

        {/* Branch Selector */}
        {branches.length > 0 && (
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              {isRu ? 'Филиал / Подразделение' : 'Filial / Bo‘linma'}
            </label>
            <Select
              options={branchOptions}
              value={branchId}
              onChange={(val) => setBranchId(val)}
            />
          </div>
        )}

        {/* Address & Phone */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              {isRu ? 'Адрес склада' : 'Ombor manzili'}
            </label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={isRu ? 'г. Ташкент, ул. Катта Дархон, 4' : 'Toshkent sh., Katta Darxon ko‘chasi, 4'}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              {isRu ? 'Телефон склада' : 'Ombor telefoni'}
            </label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+998 90 999 88 77"
            />
          </div>
        </div>

        {/* Required fields indicator */}
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 'var(--text-xs)', color: '#ef4444', fontWeight: 600, paddingTop: '8px', borderTop: '1px solid var(--color-border-light)' }}>
          <span>* {isRu ? 'поля, обязательные для заполнения' : 'bilan belgilangan maydonlar to‘ldirilishi majburiy'}</span>
        </div>
      </form>
    </Drawer>
  );
};
