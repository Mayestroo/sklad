'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { toast } from '@/context/ToastContext';
import {
  Users as UsersIcon,
  UserPlus,
  Shield,
  CheckCircle,
  XCircle,
  Mail,
  Lock,
  User,
  Globe,
  AlertCircle,
  X,
  Pencil,
  Trash2,
} from 'lucide-react';

interface StaffUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  preferredLanguage: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  roles: string[];
}

export default function UsersPage() {
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token, company, hasPermission } = useAuth();

  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State - Create
  const [showModal, setShowModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [roleSlug, setRoleSlug] = useState('salesperson');
  const [preferredLanguage, setPreferredLanguage] = useState<'uz' | 'ru'>('uz');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Modal State - Edit
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editRoleSlug, setEditRoleSlug] = useState('salesperson');
  const [editPreferredLanguage, setEditPreferredLanguage] = useState<'uz' | 'ru'>('uz');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Modal State - Delete
  const [deletingUser, setDeletingUser] = useState<StaffUser | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchUsers = async () => {
    if (!token || !company) return;
    setLoading(true);
    try {
      const data = await apiFetch<StaffUser[]>('/users/staff', {
        token,
        tenantId: company.id,
        locale,
      });
      setUsers(data || []);
    } catch (err: any) {
      setError(err.message || (isRu ? 'Ошибка загрузки пользователей' : 'Foydalanuvchilarni yuklashda xatolik'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [token, company, locale]);

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !company) return;
    setCreateLoading(true);
    setCreateError(null);

    try {
      await apiFetch('/users/invite', {
        method: 'POST',
        token,
        tenantId: company.id,
        locale,
        body: JSON.stringify({
          email,
          password,
          firstName,
          lastName,
          roleSlug,
          preferredLanguage,
        }),
      });

      setShowModal(false);
      setEmail('');
      setPassword('');
      setFirstName('');
      setLastName('');
      fetchUsers();
    } catch (err: any) {
      setCreateError(err.message || (isRu ? 'Ошибка создания сотрудника' : 'Xodim qo‘shishda xatolik'));
    } finally {
      setCreateLoading(false);
    }
  };

  const handleOpenEdit = (u: StaffUser) => {
    setEditingUser(u);
    setEditFirstName(u.firstName);
    setEditLastName(u.lastName);
    setEditRoleSlug(u.roles?.[0] || 'salesperson');
    setEditPreferredLanguage((u.preferredLanguage as 'uz' | 'ru') || 'uz');
    setEditError(null);
  };

  const handleUpdateUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !company || !editingUser) return;
    setEditLoading(true);
    setEditError(null);
    try {
      await apiFetch(`/users/${editingUser.id}`, {
        method: 'PATCH',
        token,
        tenantId: company.id,
        locale,
        body: JSON.stringify({
          firstName: editFirstName,
          lastName: editLastName,
          roleSlug: editRoleSlug,
          preferredLanguage: editPreferredLanguage,
        }),
      });
      setEditingUser(null);
      fetchUsers();
      toast.success(isRu ? 'Пользователь успешно обновлен' : 'Foydalanuvchi muvaffaqiyatli yangilandi');
    } catch (err: any) {
      setEditError(err.message || (isRu ? 'Ошибка обновления' : 'Yangilashda xatolik'));
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!token || !company || !deletingUser) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await apiFetch(`/users/${deletingUser.id}`, {
        method: 'DELETE',
        token,
        tenantId: company.id,
        locale,
      });
      setDeletingUser(null);
      fetchUsers();
      toast.success(isRu ? 'Пользователь успешно удален' : 'Foydalanuvchi muvaffaqiyatli o‘chirildi');
    } catch (err: any) {
      setDeleteError(err.message || (isRu ? 'Ошибка удаления' : "O'chirishda xatolik"));
    } finally {
      setDeleteLoading(false);
    }
  };

  const toggleUserStatus = async (userId: string, currentStatus: boolean) => {
    if (!token || !company) return;
    try {
      await apiFetch(`/users/${userId}/status`, {
        method: 'PATCH',
        token,
        tenantId: company.id,
        locale,
        body: JSON.stringify({
          isActive: !currentStatus,
        }),
      });
      fetchUsers();
      toast.success(
        isRu ? 'Статус пользователя успешно изменен' : 'Foydalanuvchi holati muvaffaqiyatli o‘zgartirildi'
      );
    } catch (err: any) {
      toast.error(err.message || (isRu ? 'Ошибка обновления статуса' : 'Status update failed'));
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'company_admin':
      case 'super_admin':
        return 'error';
      case 'accountant':
        return 'warning';
      case 'warehouse_manager':
        return 'info';
      case 'salesperson':
        return 'success';
      default:
        return 'neutral';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            {isRu ? 'Пользователи и Роли' : 'Foydalanuvchilar va Rollar'}
          </h1>
        </div>

        {hasPermission('users:create') && (
          <Button variant="primary" onClick={() => setShowModal(true)}>
            <UserPlus size={16} />
            {isRu ? 'Добавить сотрудника' : 'Xodim qo‘shish'}
          </Button>
        )}
      </div>

      {/* Main Staff List Card */}
      <Card>
        {loading ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            {tCommon('loading')}
          </div>
        ) : error ? (
          <div style={{ padding: 'var(--space-4)', color: 'var(--color-error-600)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>
                  <th style={{ padding: '12px' }}>{isRu ? 'СОТРУДНИК' : 'XODIM'}</th>
                  <th style={{ padding: '12px' }}>EMAIL</th>
                  <th style={{ padding: '12px' }}>{isRu ? 'РОЛЬ' : 'ROLI'}</th>
                  <th style={{ padding: '12px' }}>{isRu ? 'ЯЗЫК' : 'TIL'}</th>
                  <th style={{ padding: '12px' }}>{isRu ? 'СТАТУС' : 'HOLAT'}</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>{isRu ? 'ДЕЙСТВИЯ' : 'AMALLAR'}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                    <td style={{ padding: '12px', fontWeight: 'var(--font-medium)' }}>
                      {user.firstName} {user.lastName}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>
                      {user.email}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {user.roles.map((r) => (
                          <Badge key={r} variant={getRoleBadgeVariant(r)}>
                            {r}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <Badge variant="neutral">{user.preferredLanguage.toUpperCase()}</Badge>
                    </td>
                    <td style={{ padding: '12px' }}>
                      {user.isActive ? (
                        <Badge variant="success">{isRu ? 'Активный' : 'Faol'}</Badge>
                      ) : (
                        <Badge variant="neutral">{isRu ? 'Неактивный' : 'Nofaol'}</Badge>
                      )}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '6px' }}>
                        {hasPermission('users:edit') && (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleOpenEdit(user)}
                              title={isRu ? 'Редактировать' : 'Tahrirlash'}
                              style={{ padding: '4px 8px' }}
                            >
                              <Pencil size={14} />
                            </Button>
                            <Button
                              variant={user.isActive ? 'outline' : 'secondary'}
                              size="sm"
                              onClick={() => toggleUserStatus(user.id, user.isActive)}
                            >
                              {user.isActive ? (isRu ? 'Деактивировать' : 'Deaktivatsiya') : (isRu ? 'Активировать' : 'Aktivlashtirish')}
                            </Button>
                          </>
                        )}
                        {hasPermission('users:delete') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDeletingUser(user);
                              setDeleteError(null);
                            }}
                            style={{ color: '#ef4444', padding: '4px 8px' }}
                            title={isRu ? 'Удалить' : "O'chirish"}
                          >
                            <Trash2 size={15} />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Invite User Modal */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: 'var(--space-4)',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '480px',
              backgroundColor: 'var(--color-bg-secondary)',
              borderRadius: 'var(--radius-xl)',
              boxShadow: 'var(--shadow-xl)',
              padding: 'var(--space-6)',
              position: 'relative',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-semibold)' }}>
                {isRu ? 'Добавить нового сотрудника' : 'Yangi xodim biriktirish'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)' }}
              >
                <X size={20} />
              </button>
            </div>

            {createError && (
              <div style={{ padding: '10px', backgroundColor: 'var(--color-error-50)', color: 'var(--color-error-600)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-3)' }}>
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>
                    {isRu ? 'Имя' : 'Ism'}
                  </label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Jasur"
                    style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>
                    {isRu ? 'Фамилия' : 'Familiya'}
                  </label>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Karimov"
                    style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', outline: 'none' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jasur@company.uz"
                  style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>
                  {isRu ? 'Временный пароль' : 'Vaqtinchalik Parol'}
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <Select
                  label={isRu ? 'Системная роль' : 'Tizim Roli'}
                  options={[
                    { value: 'company_admin', label: 'Company Admin' },
                    { value: 'accountant', label: isRu ? 'Бухгалтер (Accountant)' : 'Buxgalter (Accountant)' },
                    { value: 'warehouse_manager', label: isRu ? 'Менеджер склада' : 'Ombor menejeri' },
                    { value: 'salesperson', label: isRu ? 'Продавец (Salesperson)' : 'Sotuvchi (Salesperson)' },
                    { value: 'viewer', label: isRu ? 'Только чтение (Viewer)' : 'Faqat ko\'rish (Viewer)' },
                  ]}
                  value={roleSlug}
                  onChange={(val) => setRoleSlug(val)}
                />

                <Select
                  label={isRu ? 'Предпочитаемый язык' : 'Afzal Til'}
                  options={[
                    { value: 'uz', label: 'O\'zbekcha (UZ)' },
                    { value: 'ru', label: 'Русский (RU)' },
                  ]}
                  value={preferredLanguage}
                  onChange={(val) => setPreferredLanguage(val as any)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
                <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
                  {tCommon('cancel')}
                </Button>
                <Button type="submit" variant="primary" disabled={createLoading}>
                  {createLoading ? tCommon('loading') : (isRu ? 'Сохранить' : 'Biriktirish')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: 'var(--space-4)',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--color-bg-primary)',
              borderRadius: 'var(--radius-lg)',
              maxWidth: '500px',
              width: '100%',
              padding: 'var(--space-6)',
              boxShadow: 'var(--shadow-xl)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)' }}>
                {isRu ? 'Редактировать сотрудника' : 'Xodimni tahrirlash'}
              </h2>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)' }}
              >
                <X size={20} />
              </button>
            </div>

            {editError && (
              <div style={{ padding: 'var(--space-3)', backgroundColor: 'var(--color-error-50)', color: 'var(--color-error-600)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
                <AlertCircle size={16} />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleUpdateUser} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>
                    {isRu ? 'Имя' : 'Ism'}
                  </label>
                  <input
                    type="text"
                    required
                    value={editFirstName}
                    onChange={(e) => setEditFirstName(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>
                    {isRu ? 'Фамилия' : 'Familiya'}
                  </label>
                  <input
                    type="text"
                    required
                    value={editLastName}
                    onChange={(e) => setEditLastName(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', outline: 'none' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>Email</label>
                <input
                  type="email"
                  disabled
                  value={editingUser.email}
                  style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-subtle)', color: 'var(--color-text-tertiary)', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <Select
                  label={isRu ? 'Системная роль' : 'Tizim Roli'}
                  options={[
                    { value: 'company_admin', label: 'Company Admin' },
                    { value: 'accountant', label: isRu ? 'Бухгалтер (Accountant)' : 'Buxgalter (Accountant)' },
                    { value: 'warehouse_manager', label: isRu ? 'Менеджер склада' : 'Ombor menejeri' },
                    { value: 'salesperson', label: isRu ? 'Продавец (Salesperson)' : 'Sotuvchi (Salesperson)' },
                    { value: 'viewer', label: isRu ? 'Только чтение (Viewer)' : 'Faqat ko\'rish (Viewer)' },
                  ]}
                  value={editRoleSlug}
                  onChange={(val) => setEditRoleSlug(val)}
                />

                <Select
                  label={isRu ? 'Предпочитаемый язык' : 'Afzal Til'}
                  options={[
                    { value: 'uz', label: 'O\'zbekcha (UZ)' },
                    { value: 'ru', label: 'Русский (RU)' },
                  ]}
                  value={editPreferredLanguage}
                  onChange={(val) => setEditPreferredLanguage(val as any)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
                <Button type="button" variant="secondary" onClick={() => setEditingUser(null)}>
                  {tCommon('cancel')}
                </Button>
                <Button type="submit" variant="primary" disabled={editLoading}>
                  {editLoading ? tCommon('loading') : (isRu ? 'Сохранить изменения' : 'O\'zgarishlarni saqlash')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingUser && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
            padding: 'var(--space-4)',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--color-bg-primary)',
              borderRadius: 'var(--radius-lg)',
              maxWidth: '440px',
              width: '100%',
              padding: 'var(--space-6)',
              boxShadow: 'var(--shadow-xl)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: 'var(--space-4)', color: '#ef4444' }}>
              <Trash2 size={24} />
              <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
                {isRu ? 'Удалить сотрудника?' : 'Foydalanuvchini o‘chirish?'}
              </h2>
            </div>

            {deleteError && (
              <div style={{ padding: 'var(--space-3)', backgroundColor: 'var(--color-error-50)', color: 'var(--color-error-600)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
                <AlertCircle size={16} />
                <span>{deleteError}</span>
              </div>
            )}

            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-6)', lineHeight: 1.5 }}>
              {isRu
                ? `Вы действительно хотите удалить сотрудника ${deletingUser.firstName} ${deletingUser.lastName} (${deletingUser.email})? При наличии связанных документов учетная запись будет безопасно деактивирована.`
                : `Haqiqatan ham ${deletingUser.firstName} ${deletingUser.lastName} (${deletingUser.email}) foydalanuvchisini o‘chirmoqchimisiz? Agar foydalanuvchiga tegishli arxiv hujjatlar mavjud bo‘lsa, u xavfsiz faolsizlantiriladi.`}
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
              <Button type="button" variant="secondary" onClick={() => setDeletingUser(null)} disabled={deleteLoading}>
                {tCommon('cancel')}
              </Button>
              <Button
                type="button"
                onClick={handleDeleteUser}
                disabled={deleteLoading}
                style={{ backgroundColor: '#ef4444', color: '#fff' }}
              >
                {deleteLoading ? tCommon('loading') : (isRu ? 'Да, удалить' : 'Ha, o‘chirish')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
