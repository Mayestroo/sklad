'use client';

import React, { useState } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Building2, UserPlus, AlertCircle, CheckCircle2 } from 'lucide-react';

interface CounterpartyFolder {
  id: string;
  name: string;
}

export interface CreateCounterpartyDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  defaultType?: 'CUSTOMER' | 'SUPPLIER' | 'BOTH';
  defaultFolderId?: string;
  folders?: CounterpartyFolder[];
  onSuccess?: (createdCounterparty: any) => void;
}

export const CreateCounterpartyDrawer: React.FC<CreateCounterpartyDrawerProps> = ({
  isOpen,
  onClose,
  defaultType = 'CUSTOMER',
  defaultFolderId = '',
  folders = [],
  onSuccess,
}) => {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token, company } = useAuth();

  const [name, setName] = useState('');
  const [type, setType] = useState<'CUSTOMER' | 'SUPPLIER' | 'BOTH'>(defaultType);
  const [folderId, setFolderId] = useState<string>(defaultFolderId);
  const [inn, setInn] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [mfo, setMfo] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!name.trim()) {
      setError(isRu ? 'Введите наименование контрагента' : 'Kontragent nomini kiriting');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch('/sales/counterparties', {
        method: 'POST',
        token: token || undefined,
        tenantId: company?.id,
        locale,
        body: JSON.stringify({
          name: name.trim(),
          type,
          folderId: folderId || undefined,
          inn: inn.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          address: address.trim() || undefined,
          bankName: bankName.trim() || undefined,
          bankAccount: bankAccount.trim() || undefined,
          mfo: mfo.trim() || undefined,
        }),
      });

      resetForm();
      if (onSuccess) onSuccess(res);
      onClose();
    } catch (err: any) {
      setError(err?.message || (isRu ? 'Ошибка сохранения' : 'Saqlashda xatolik yuz berdi'));
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setType(defaultType);
    setFolderId(defaultFolderId);
    setInn('');
    setPhone('');
    setEmail('');
    setAddress('');
    setBankName('');
    setBankAccount('');
    setMfo('');
    setError(null);
  };

  const typeOptions = [
    { value: 'CUSTOMER', label: isRu ? 'Покупатель (Клиент)' : 'Xaridor (Mijoz)' },
    { value: 'SUPPLIER', label: isRu ? 'Поставщик' : 'Yetkazib beruvchi' },
    { value: 'BOTH', label: isRu ? 'Поставщик и Покупатель' : 'Hamkor (Ikkisi ham)' },
  ];

  const folderOptions = [
    { value: '', label: isRu ? 'Без папки (Общие)' : 'Papkasiz (Umumiy)' },
    ...folders.map((f) => ({ value: f.id, label: f.name })),
  ];

  return (
    <Drawer
      isOpen={isOpen}
      onClose={() => {
        resetForm();
        onClose();
      }}
      title={
        defaultType === 'SUPPLIER'
          ? isRu
            ? 'Новый поставщик'
            : 'Yangi Yetkazib Beruvchi'
          : isRu
          ? 'Новый контрагент'
          : 'Yangi Kontragent'
      }
      description={
        isRu
          ? 'Заполните реквизиты, контактные данные и банковские счета'
          : 'Rekvizitlar, aloqa ma’lumotlari va bank hisoblarini kiriting'
      }
      icon={<UserPlus size={20} />}
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
                {isRu ? 'Сохранить (Ctrl+Enter)' : 'Saqlash (Ctrl+Enter)'}
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
        {/* Type & Folder */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              {isRu ? 'Тип контрагента *' : 'Kontragent turi *'}
            </label>
            <Select
              options={typeOptions}
              value={type}
              onChange={(val) => setType(val as any)}
            />
          </div>

          {folders.length > 0 && (
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                {isRu ? 'Папка / Группа' : 'Papka / Guruh'}
              </label>
              <Select
                options={folderOptions}
                value={folderId}
                onChange={(val) => setFolderId(val)}
              />
            </div>
          )}
        </div>

        {/* Name */}
        <div>
          <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
            {isRu ? 'Наименование / Ф.И.О *' : 'Nomi / F.I.Sh *'}
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isRu ? 'ООО «Grand Trade» или Иван Иванов' : '«Grand Trade» MCHJ yoki Alisher Zokirov'}
            autoFocus
          />
        </div>

        {/* INN (STIR) & Phone */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              {isRu ? 'ИНН (STIR)' : 'STIR (INN)'}
            </label>
            <Input
              value={inn}
              onChange={(e) => setInn(e.target.value)}
              placeholder="123456789"
              maxLength={12}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              {isRu ? 'Телефон' : 'Telefon raqami'}
            </label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+998 90 123 45 67"
            />
          </div>
        </div>

        {/* Email & Address */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              {isRu ? 'Email' : 'Elektron pochta'}
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="info@partner.uz"
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              {isRu ? 'Юридический адрес' : 'Yuridik manzil'}
            </label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={isRu ? 'г. Ташкент, ул. Навои, 10' : 'Toshkent sh., Navoiy ko‘chasi, 10'}
            />
          </div>
        </div>

        {/* Bank Details Section */}
        <div style={{ borderTop: '1px solid var(--color-border-light)', paddingTop: 'var(--space-3)', marginTop: 'var(--space-1)' }}>
          <h4 style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-3)' }}>
            {isRu ? 'Банковские реквизиты' : 'Bank rekvizitlari'}
          </h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                {isRu ? 'Наименование банка' : 'Bank nomi'}
              </label>
              <Input
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="Kapitalbank ATB"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-3)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                  {isRu ? 'Расчётный счёт (р/с)' : 'Hisob-kitob raqami (h/r)'}
                </label>
                <Input
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                  placeholder="20208000900000123456"
                  maxLength={20}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                  {isRu ? 'МФО (MFO)' : 'MFO'}
                </label>
                <Input
                  value={mfo}
                  onChange={(e) => setMfo(e.target.value)}
                  placeholder="01036"
                  maxLength={5}
                />
              </div>
            </div>
          </div>
        </div>
      </form>
    </Drawer>
  );
};
