'use client';

import { useState, FormEvent } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ActionsMenu } from '@/components/production/ActionsMenu';
import { DataTable, type Column } from '@/components/ui/list/DataTable';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { LoadError } from '@/components/ui/LoadError';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { toast } from '@/context/ToastContext';
import {
  UserPlus,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import { errorMessage } from '@/lib/utils';

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
  const tCommon = useTranslations('common');
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const tIn = useTranslations('rd.inline');
  const { token, company, hasPermission } = useAuth();

  const usersQuery = useApiQuery<StaffUser[]>('/users/staff');
  const users = usersQuery.data ?? [];
  const loading = usersQuery.isPending;

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

  const fetchUsers = () => void usersQuery.refetch();

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
    } catch (err) {
      setCreateError(errorMessage(err) || (isRu ? 'Ошибка создания сотрудника' : 'Xodim qo‘shishda xatolik'));
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
    } catch (err) {
      setEditError(errorMessage(err) || (isRu ? 'Ошибка обновления' : 'Yangilashda xatolik'));
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
    } catch (err) {
      setDeleteError(errorMessage(err) || (isRu ? 'Ошибка удаления' : "O'chirishda xatolik"));
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
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Ошибка обновления статуса' : 'Holatni yangilab bo‘lmadi'));
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'company_admin':
      case 'super_admin':
        return 'error';
      case 'accountant':
        return 'warning';
      case 'cashier':
        return 'info';
      case 'warehouse_manager':
        return 'info';
      case 'salesperson':
        return 'success';
      default:
        return 'neutral';
    }
  };

  const tu = useTranslations('rd.users');
  const tl = useTranslations('rd.list');
  const ROLES = ['company_admin', 'accountant', 'cashier', 'warehouse_manager', 'salesperson'] as const;
  const roleName = (r: string) => ((ROLES as readonly string[]).includes(r) ? tu(`role_${r}`) : r);
  const inviteAs = (role: string) => {
    setRoleSlug(role);
    setCreateError(null);
    setShowModal(true);
  };
  const initials = (u: StaffUser) => `${u.firstName?.[0] ?? ''}${u.lastName?.[0] ?? ''}`.toUpperCase() || u.email[0]?.toUpperCase();
  const columns: Column<StaffUser>[] = [
    {
      key: 'name',
      label: isRu ? 'Сотрудник' : 'Xodim',
      primary: true,
      locked: true,
      sortValue: (u) => `${u.firstName} ${u.lastName}`,
      render: (u) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: u.isActive ? 1 : 0.6 }}>
          <span className="auth-avatar" style={{ width: 34, height: 34, fontSize: 'var(--text-xs)' }} aria-hidden>{initials(u)}</span>
          <div>
            <div style={{ fontWeight: 'var(--font-semibold)' }}>{u.firstName} {u.lastName}</div>
            <div className="rd-sub">{u.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      label: tIn('roli'),
      sortValue: (u) => u.roles.join(','),
      render: (u) => (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {u.roles.map((r) => (
            <Badge key={r} variant={getRoleBadgeVariant(r)}>{roleName(r)}</Badge>
          ))}
        </div>
      ),
    },
    { key: 'lang', label: tIn('til'), render: (u) => (u.preferredLanguage === 'ru' ? 'Русский' : 'O‘zbekcha') },
    { key: 'status', label: tl('status'), sortValue: (u) => (u.isActive ? 0 : 1), render: (u) => (u.isActive ? <Badge variant="success">{isRu ? 'Активный' : 'Faol'}</Badge> : <Badge variant="neutral">{isRu ? 'Неактивный' : 'Nofaol'}</Badge>) },
    {
      key: 'actions',
      label: tIn('amallar'),
      locked: true,
      render: (u) => (
        <div className="rd-row-actions">
          <ActionsMenu
            label={tl('rowActions')}
            actions={[
              { label: tl('edit'), onSelect: () => handleOpenEdit(u), hidden: !hasPermission('users:edit') },
              { label: u.isActive ? (isRu ? 'Деактивировать' : 'Deaktivatsiya') : isRu ? 'Активировать' : 'Aktivlashtirish', onSelect: () => void toggleUserStatus(u.id, u.isActive), hidden: !hasPermission('users:edit') },
              { label: tl('delete'), onSelect: () => { setDeletingUser(u); setDeleteError(null); }, danger: true, hidden: !hasPermission('users:delete') },
            ]}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="rd-page">
      <PageHeader
        title={tIn('foydalanuvchilar_va_rollar')}
        subtitle={tu('subtitle')}
        actions={
          hasPermission('users:create') ? (
            <Button variant="primary" onClick={() => inviteAs('salesperson')}>
              <UserPlus size={16} aria-hidden /> {isRu ? 'Добавить сотрудника' : 'Xodim qo‘shish'}
            </Button>
          ) : undefined
        }
      />

      {/* Roles explained in words, with who has them and "invite as …" */}
      <section aria-labelledby="roles-title">
        <h2 id="roles-title" className="dash-section-title">{tu('rolesTitle')}</h2>
        <ul className="role-grid">
          {ROLES.map((r) => {
            const count = users.filter((u) => u.roles.includes(r)).length;
            return (
              <li key={r} className="stat-card">
                <span className="stat-label" style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: 8 }}>
                  <Badge variant={getRoleBadgeVariant(r)}>{roleName(r)}</Badge>
                  <span className="tabular-nums">{tu('people', { count })}</span>
                </span>
                <span className="stat-secondary" style={{ marginTop: 4 }}>{tu(`roleDesc_${r}`)}</span>
                {hasPermission('users:create') && (
                  <button type="button" className="rd-linkbtn" style={{ paddingLeft: 0, marginTop: 4 }} onClick={() => inviteAs(r)}>
                    {tu('inviteAs')}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="rd-table-card">
        {usersQuery.isError ? (
          <LoadError error={usersQuery.error} onRetry={fetchUsers} retrying={usersQuery.isFetching} />
        ) : (
          <DataTable
            rows={users}
            columns={columns}
            rowKey={(u) => u.id}
            onRowClick={hasPermission('users:edit') ? (u) => handleOpenEdit(u) : undefined}
            loading={loading}
            empty={<EmptyState title={isRu ? 'Сотрудников пока нет' : 'Hozircha xodimlar yo‘q'} description={tu('emptyHint')} />}
          />
        )}
      </div>

      {/* Invite User Modal */}
      <Modal isOpen={Boolean(showModal)} onClose={() => setShowModal(false)} title={isRu ? 'Добавить нового сотрудника' : 'Yangi xodim biriktirish'} size="md">

        {createError && (
          <div style={{ padding: '10px', backgroundColor: 'var(--color-error-50)', color: 'var(--color-error-700)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-3)' }}>
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
              options={[...ROLES, 'viewer'].map((r) => ({ value: r, label: r === 'viewer' ? tu('role_viewer') : roleName(r), description: r === 'viewer' ? tu('roleDesc_viewer') : tu(`roleDesc_${r}`) }))}
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
              onChange={(val) => setPreferredLanguage(val as typeof preferredLanguage)}
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
      </Modal>

      {/* Edit User Modal */}
      {editingUser && (
      <Modal isOpen={Boolean(editingUser)} onClose={() => setEditingUser(null)} title={isRu ? 'Редактировать сотрудника' : 'Xodimni tahrirlash'} size="md">

        {editError && (
          <div style={{ padding: 'var(--space-3)', backgroundColor: 'var(--color-error-50)', color: 'var(--color-error-700)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
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
              options={[...ROLES, 'viewer'].map((r) => ({ value: r, label: r === 'viewer' ? tu('role_viewer') : roleName(r), description: r === 'viewer' ? tu('roleDesc_viewer') : tu(`roleDesc_${r}`) }))}
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
              onChange={(val) => setEditPreferredLanguage(val as typeof editPreferredLanguage)}
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
      </Modal>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: 'var(--space-4)', color: 'var(--color-error-700)' }}>
              <Trash2 size={24} />
              <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
                {isRu ? 'Удалить сотрудника?' : 'Foydalanuvchini o‘chirish?'}
              </h2>
            </div>

            {deleteError && (
              <div style={{ padding: 'var(--space-3)', backgroundColor: 'var(--color-error-50)', color: 'var(--color-error-700)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
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
              <Button variant="danger"
                type="button"
                onClick={handleDeleteUser}
                disabled={deleteLoading}
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
