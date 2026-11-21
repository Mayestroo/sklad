'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AlertCircle, Check } from 'lucide-react';
import { AuthCard } from '@/components/auth/AuthCard';
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
  const tr = useTranslations('rd.auth');
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
        color: 'var(--color-error-700)',
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

  const aside = (
    <>
      <h2>{tr('nextStepsTitle')}</h2>
      <ol>
        <li><span className="auth-aside-icon" aria-hidden><Check size={14} /></span>{tr('nextStep1')}</li>
        <li><span className="auth-aside-icon" aria-hidden>2</span><strong style={{ color: 'var(--color-text-primary)' }}>{tr('nextStep2')}</strong></li>
        <li><span className="auth-aside-icon" aria-hidden>3</span>{tr('nextStep3')}</li>
      </ol>
    </>
  );

  return (
    <AuthCard title={t('confirmTitle')} aside={aside} maxWidth={600}
      footer={
        <Link href="/register" style={{ color: 'var(--color-primary-700)', fontWeight: 'var(--font-semibold)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
          {t('registerAgain')}
        </Link>
      }
    >
      {!token ? (
        alert(t('confirmMissingToken'))
      ) : (
        <>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>{t('confirmText')}</p>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>{tr('confirmSteps')}</p>
          {error && alert(error)}
          <Button type="button" variant="primary" size="lg" loading={loading} onClick={confirm} style={{ width: '100%' }}>
            {t('confirmButton')}
          </Button>
        </>
      )}
    </AuthCard>
  );
}
