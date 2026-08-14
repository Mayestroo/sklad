'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { X, Building2, Phone, Mail, FileText, MapPin } from 'lucide-react';

interface QuickAddSupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newSupplier: { id: string; name: string; type: string; debtBalance?: number }) => void;
}

export function QuickAddSupplierModal({ isOpen, onClose, onSuccess }: QuickAddSupplierModalProps) {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token, company } = useAuth();

  const [name, setName] = useState('');
  const [inn, setInn] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(isRu ? 'Введите название поставщика' : 'Yetkazib beruvchi nomini kiriting');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const created = await apiFetch<{ id: string; name: string; type: string; debtBalance: number }>(
        '/sales/counterparties',
        {
          method: 'POST',
          token: token || undefined,
          tenantId: company?.id,
          locale,
          body: JSON.stringify({
            name: name.trim(),
            type: 'SUPPLIER',
            inn: inn.trim() || undefined,
            phone: phone.trim() || undefined,
            email: email.trim() || undefined,
            address: address.trim() || undefined,
          }),
        }
      );

      if (created && created.id) {
        onSuccess(created);
        onClose();
        setName('');
        setInn('');
        setPhone('');
        setEmail('');
        setAddress('');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : undefined;
      setError(msg || (isRu ? 'Ошибка при создании поставщика' : 'Yetkazib beruvchini yaratishda xatolik'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-surface dark:bg-zinc-900 rounded-2xl shadow-2xl border border-border w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-hover/30">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-text-primary text-base">
                {isRu ? 'Быстрое добавление поставщика' : 'Yangi yetkazib beruvchi qo‘shish'}
              </h3>
              <p className="text-xs text-text-muted">
                {isRu ? 'Заполните основные реквизиты' : 'Asosiy ma’lumotlarni kiriting'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="text-text-muted hover:text-text-primary p-1.5 rounded-lg hover:bg-surface-hover transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-danger/10 border border-danger/20 rounded-xl text-danger text-sm font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
              {isRu ? 'Название компании / ФИО *' : 'Kompaniya nomi / F.I.Sh *'}
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isRu ? 'Например: OOO "Data Center"' : 'Masalan: MCHJ "Data Center"'}
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                {isRu ? 'ИНН (СТИР)' : 'INN (STIR)'}
              </label>
              <Input
                value={inn}
                onChange={(e) => setInn(e.target.value)}
                placeholder="123456789"
                maxLength={9}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                {isRu ? 'Телефон' : 'Telefon'}
              </label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+998 90 123 45 67"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                {isRu ? 'Email' : 'Email'}
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="info@supplier.uz"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                {isRu ? 'Адрес' : 'Manzil'}
              </label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={isRu ? 'г. Ташкент' : 'Toshkent sh.'}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              {isRu ? 'Отмена' : 'Bekor qilish'}
            </Button>
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? (isRu ? 'Сохранение...' : 'Saqlanmoqda...') : isRu ? 'Добавить' : 'Qo‘shish'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
