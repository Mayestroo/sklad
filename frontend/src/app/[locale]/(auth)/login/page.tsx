'use client';

import { useState, FormEvent } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Lock, Mail, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await apiFetch<any>('/auth/login', {
        method: 'POST',
        locale,
        body: JSON.stringify({ email, password }),
      });

      login(response);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--color-bg-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-6)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          backgroundColor: 'var(--color-bg-secondary)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-border-light)',
          boxShadow: 'var(--shadow-lg)',
          padding: 'var(--space-8)',
        }}
      >
        {/* Title */}
        <div style={{ marginBottom: 'var(--space-6)', textAlign: 'center' }}>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            {t('login')}
          </h1>
        </div>

        {/* Error Alert */}
        {error && (
          <div
            style={{
              padding: '12px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-error-50)',
              border: '1px solid var(--color-error-100)',
              color: 'var(--color-error-600)',
              fontSize: 'var(--text-sm)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              marginBottom: 'var(--space-4)',
            }}
          >
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              {t('email')}
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@company.uz"
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 38px',
                  fontSize: 'var(--text-sm)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-bg-primary)',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              {t('password')}
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 38px',
                  fontSize: 'var(--text-sm)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-bg-primary)',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          <Button type="submit" variant="primary" disabled={loading} style={{ width: '100%', marginTop: 'var(--space-2)' }}>
            {loading ? tCommon('loading') : t('login')}
          </Button>
        </form>

        {/* Footer link to Register */}
        <div style={{ marginTop: 'var(--space-6)', textAlign: 'center', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          {t('noAccount')}{' '}
          <Link href="/register" style={{ color: 'var(--color-primary-600)', fontWeight: 'var(--font-semibold)', textDecoration: 'none' }}>
            {t('startTrial')}
          </Link>
        </div>
      </div>
    </div>
  );
}
