'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AlertCircle } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { errorMessage } from '@/lib/utils';
import type { AuthResponse } from '@shared/types';

/**
 * D3, sign-up step 2: the page the emailed link opens. The one-time token is
 * sent only when the user presses the button, so a mail scanner that opens
 * the link does not use it up. On success the new admin is signed in.
 */
export function ConfirmRegistration({ token }: { token: string | null }) {
  const t = useTranslations('auth');
  const locale = useLocale();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const confirm = async () => {
    if (!token) return;
    setError(null);
    setLoading(true);
    try {
      const response = await apiFetch<AuthResponse>('/auth/register/confirm', {
        method: 'POST',
        locale,
        body: JSON.stringify({ token }),
      });
      login(response);
    } catch (err) {
      setError(errorMessage(err) || t('confirmFailed'));
      setLoading(false);
    }
  };

  const alert = (text: string) => (
    <div
      role="alert"
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
      <span>{text}</span>
    </div>
  );

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--color-bg-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-8) var(--space-4)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          backgroundColor: 'var(--color-bg-secondary)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-border-light)',
          boxShadow: 'var(--shadow-lg)',
          padding: 'var(--space-8)',
        }}
      >
        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-3)' }}>
          {t('confirmTitle')}
        </h1>

        {!token ? (
          alert(t('confirmMissingToken'))
        ) : (
          <>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
              {t('confirmText')}
            </p>
            {error && alert(error)}
            <Button type="button" variant="primary" disabled={loading} onClick={confirm} style={{ width: '100%' }}>
              {t('confirmButton')}
            </Button>
          </>
        )}

        <div style={{ marginTop: 'var(--space-6)', textAlign: 'center', fontSize: 'var(--text-sm)' }}>
          <Link href="/register" style={{ color: 'var(--color-primary-600)', fontWeight: 'var(--font-semibold)', textDecoration: 'none' }}>
            {t('registerAgain')}
          </Link>
        </div>
      </div>
    </div>
  );
}
