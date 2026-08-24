'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { UserCheck, AlertCircle } from 'lucide-react';

interface QuickAddCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newCustomer: { id: string; name: string; phone?: string; debtBalance?: number }) => void;
  initialName?: string;
}

export function QuickAddCustomerModal({
  isOpen,
  onClose,
  onSuccess,
  initialName = '',
}: QuickAddCustomerModalProps) {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token, company } = useAuth();

  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState('');
  const [inn, setInn] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(isRu ? 'Введите имя или название клиента' : 'Mijoz ismini yoki tashkilot nomini kiriting');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const created = await apiFetch<any>('/counterparties', {
        method: 'POST',
        token: token || undefined,
        tenantId: company?.id,
        locale,
        body: JSON.stringify({
          name: name.trim(),
          type: 'CUSTOMER',
          phone: phone.trim() || undefined,
          inn: inn.trim() || undefined,
          address: address.trim() || undefined,
        }),
      });

      if (created && created.id) {
        onSuccess({
          id: created.id,
          name: created.name || name.trim(),
          phone: created.phone,
          debtBalance: 0,
        });
        onClose();
      } else {
        setError(isRu ? 'Ошибка при создании клиента' : 'Mijoz yaratishda xatolik yuz berdi');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || (isRu ? 'Не удалось сохранить клиента' : 'Mijozni saqlab bo‘lmadi'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isRu ? 'Быстрое добавление клиента' : 'Tezkor mijoz qo‘shish'}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {error && (
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius-md)',
              color: '#ef4444',
              fontSize: 'var(--text-sm)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
            {isRu ? 'ФИО / Название организации *' : 'F.I.Sh. / Tashkilot nomi *'}
          </label>
          <Input
            placeholder={isRu ? 'Напр: ООО "Smart Trade" или Алишер Саидов' : 'Masalan: "Smart Trade" MChJ yoki Alisher Saidov'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
              {isRu ? 'Телефон' : 'Telefon raqam'}
            </label>
            <Input
              placeholder="+998 90 123 45 67"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
              {isRu ? 'ИНН (СТИР)' : 'INN (STIR)'}
            </label>
            <Input
              placeholder="123456789"
              value={inn}
              onChange={(e) => setInn(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
            {isRu ? 'Адрес' : 'Manzil'}
          </label>
          <Input
            placeholder={isRu ? 'Город, улица, дом...' : 'Shahar, ko‘cha, uy...'}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)', borderTop: '1px solid var(--color-border-light)', paddingTop: 'var(--space-3)' }}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            {isRu ? 'Отмена' : 'Bekor qilish'}
          </Button>
          <Button type="submit" disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <UserCheck size={16} />
            {loading ? (isRu ? 'Сохранение...' : 'Saqlanmoqda...') : (isRu ? 'Добавить клиента' : 'Mijozni qo‘shish')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
