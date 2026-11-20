'use client';

import { useState, useRef, FormEvent } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiFetch, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { AuthCard, AuthError, AuthField } from '@/components/auth/AuthCard';
import { Lock, Mail } from 'lucide-react';
import { errorMessage } from '@/lib/utils';
import type { AuthResponse } from '@shared/types';

export default function LoginPage() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await apiFetch<AuthResponse>('/auth/login', {
        method: 'POST',
        locale,
        body: JSON.stringify({ email: email.trim(), password }),
      });

      login(response);
    } catch (err) {
      // Wrong credentials: our own translated text (the API answers in English).
      setError(err instanceof ApiError && err.status === 401 ? t('loginFailed') : errorMessage(err) || t('loginFailed'));
      // Select the password so retyping replaces it (clearing it could swallow keys typed meanwhile).
      passwordRef.current?.focus();
      passwordRef.current?.select();
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title={t('login')}
      subtitle={t('loginSubtitle')}
      footer={
        <>
          {t('noAccount')}{' '}
          <Link href="/register" style={{ color: 'var(--color-primary-700)', fontWeight: 'var(--font-semibold)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
            {t('startTrial')}
          </Link>
        </>
      }
    >
      <AuthError message={error} />
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <AuthField
          label={t('email')}
          icon={Mail}
          type="email"
          name="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@company.uz"
        />
        <AuthField
          label={t('password')}
          icon={Lock}
          password
          ref={passwordRef}
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" variant="primary" size="lg" loading={loading} loadingText={t('signingIn')} style={{ width: '100%', marginTop: 'var(--space-2)' }}>
          {t('login')}
        </Button>
      </form>
    </AuthCard>
  );
}
