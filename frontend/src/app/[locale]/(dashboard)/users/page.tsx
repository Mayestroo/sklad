'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
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
  const locale = useLocale();
  const { token, company, hasPermission } = useAuth();

  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [roleSlug, setRoleSlug] = useState('salesperson');
  const [preferredLanguage, setPreferredLanguage] = useState<'uz' | 'ru'>('uz');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchUsers = async () => {
    if (!token || !company) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<StaffUser[]>('/users', {
        token,
        tenantId: company.id,
        locale,
      });
      setUsers(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [token, company]);

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !company) return;
    setCreateError(null);
    setCreateLoading(true);

    try {
      await apiFetch<any>('/users', {
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
      setCreateError(err.message || 'Failed to create user');
    } finally {
      setCreateLoading(false);
    }
  };

  const toggleUserStatus = async (userId: string, currentStatus: boolean) => {
    if (!token || !company) return;
    try {
      await apiFetch<any>(`/users/${userId}`, {
        method: 'PATCH',
        token,
        tenantId: company.id,
        locale,
        body: JSON.stringify({
          isActive: !currentStatus,
        }),
      });
      fetchUsers();
    } catch (err: any) {
      alert(err.message || 'Status update failed');
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
            Foydalanuvchilar va Rollar
          </h1>
        </div>

        {hasPermission('users:create') && (
          <Button variant="primary" onClick={() => setShowModal(true)}>
            <UserPlus size={16} />
            Xodim qo&apos;shish
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
                  <th style={{ padding: '12px' }}>XODIM</th>
                  <th style={{ padding: '12px' }}>EMAIL</th>
                  <th style={{ padding: '12px' }}>ROLI</th>
                  <th style={{ padding: '12px' }}>TIL</th>
                  <th style={{ padding: '12px' }}>HOLAT</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>AMALLAR</th>
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
                        <Badge variant="success">Faol</Badge>
                      ) : (
                        <Badge variant="error">Nofaol</Badge>
                      )}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      {hasPermission('users:edit') && (
                        <Button
                          variant={user.isActive ? 'outline' : 'secondary'}
                          size="sm"
                          onClick={() => toggleUserStatus(user.id, user.isActive)}
                        >
                          {user.isActive ? 'Deaktivatsiya' : 'Aktivlashtirish'}
                        </Button>
                      )}
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
              <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-semibold)' }}>Yangi xodim biriktirish</h3>
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
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>Ism</label>
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
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>Familiya</label>
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
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>Vaqtinchalik Parol</label>
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
                  label="Tizim Roli"
                  options={[
                    { value: 'company_admin', label: 'Company Admin' },
                    { value: 'accountant', label: 'Buxgalter (Accountant)' },
                    { value: 'warehouse_manager', label: 'Ombor menejeri' },
                    { value: 'salesperson', label: 'Sotuvchi (Salesperson)' },
                    { value: 'viewer', label: 'Faqat ko\'rish (Viewer)' },
                  ]}
                  value={roleSlug}
                  onChange={(val) => setRoleSlug(val)}
                />

                <Select
                  label="Afzal Til"
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
                  {createLoading ? tCommon('loading') : 'Biriktirish'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
