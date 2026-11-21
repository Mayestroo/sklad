'use client';

import { useEffect, useState, useRef, useSyncExternalStore, FormEvent } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiFetch, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { AuthCard, AuthError, AuthField } from '@/components/auth/AuthCard';
import { Boxes, Languages, Lock, Mail, ShoppingCart, Wallet } from 'lucide-react';
import { errorMessage } from '@/lib/utils';
import { readRemembered, remember } from '@/lib/usePersistentState';
import type { AuthResponse } from '@shared/types';

/** Browser-only convenience: the e-mail of the last sign-in, when the user asked to keep it. */
const REMEMBERED_EMAIL = 'auth.rememberedEmail';
const noSubscribe = () => () => {};

export default function LoginPage() {
  const t = useTranslations('auth');
  const tr = useTranslations('rd.auth');
  const locale = useLocale();
  const { login } = useAuth();

  // Returning user: the remembered e-mail is shown as "Sign in as …" and only
  // the password is asked (one field instead of two).
  // Read after hydration (the server has no browser storage).
  const storedEmail = useSyncExternalStore(
    noSubscribe,
    () => readRemembered<string>(REMEMBERED_EMAIL, ''),
    () => '',
  );
  const [forgotten, setForgotten] = useState(false);
  const rememberedEmail = forgotten ? '' : storedEmail;
  const [email, setEmail] = useState('');
  const [keepEmail, setKeepEmail] = useState(true);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  const forgetEmail = () => {
    remember(REMEMBERED_EMAIL, '');
    setForgotten(true);
    setEmail('');
    setPassword('');
    setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const signInEmail = (rememberedEmail || email).trim();

    try {
      const response = await apiFetch<AuthResponse>('/auth/login', {
        method: 'POST',
        locale,
        body: JSON.stringify({ email: signInEmail, password }),
      });
      remember(REMEMBERED_EMAIL, keepEmail ? signInEmail : '');
      login(response);
    } catch (err) {
      // Wrong credentials / rate limit: our own translated text (the API answers in English).
      const status = err instanceof ApiError ? err.status : 0;
      setError(status === 401 ? t('loginFailed') : status === 429 ? tr('tooManyAttempts') : errorMessage(err) || t('loginFailed'));
      // Select the password so retyping replaces it (clearing it could swallow keys typed meanwhile).
      passwordRef.current?.focus();
      passwordRef.current?.select();
    } finally {
      setLoading(false);
    }
  };

  const aside = (
    <>
      <h2>{tr('asideTitle')}</h2>
      <ul>
        <li>
          <span className="auth-aside-icon" aria-hidden>
            <ShoppingCart size={15} />
          </span>
          {tr('asideSales')}
        </li>
        <li>
          <span className="auth-aside-icon" aria-hidden>
            <Boxes size={15} />
          </span>
          {tr('asideStock')}
        </li>
        <li>
          <span className="auth-aside-icon" aria-hidden>
            <Wallet size={15} />
          </span>
          {tr('asideMoney')}
        </li>
        <li>
          <span className="auth-aside-icon" aria-hidden>
            <Languages size={15} />
          </span>
          {tr('asideLang')}
        </li>
      </ul>
    </>
  );

  const returning = Boolean(rememberedEmail);
  // The remembered e-mail appears after hydration: put the cursor in the password then.
  useEffect(() => {
    if (returning) passwordRef.current?.focus();
  }, [returning]);

  return (
    <AuthCard
      title={returning ? tr('welcomeBack') : t('login')}
      subtitle={returning ? undefined : t('loginSubtitle')}
      aside={aside}
      asideOnPhone="hide"
      maxWidth={600}
      footer={
        <>
          {t('noAccount')}{' '}
          <Link
            href="/register"
            style={{
              color: 'var(--color-primary-700)',
              fontWeight: 'var(--font-semibold)',
              textDecoration: 'underline',
              textUnderlineOffset: 3,
            }}
          >
            {t('startTrial')}
          </Link>
        </>
      }
    >
      <AuthError message={error} />
      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        {returning ? (
          <div className="auth-who">
            <span className="auth-avatar" aria-hidden>
              {rememberedEmail.charAt(0).toUpperCase()}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 'var(--text-sm)',
                  fontWeight: 'var(--font-semibold)',
                  overflowWrap: 'anywhere',
                }}
              >
                {rememberedEmail}
              </div>
              <button type="button" className="rd-linkbtn" style={{ paddingLeft: 0 }} onClick={forgetEmail}>
                {tr('notYou')}
              </button>
            </div>
            {/* Kept for password managers: they pair the password with this username. */}
            <input type="hidden" name="email" autoComplete="username" value={rememberedEmail} readOnly />
          </div>
        ) : (
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
        )}
        <AuthField
          label={t('password')}
          icon={Lock}
          password
          ref={passwordRef}
          name="password"
          autoComplete="current-password"
          autoFocus={returning}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {!returning && (
          <label className="auth-check">
            <input type="checkbox" checked={keepEmail} onChange={(e) => setKeepEmail(e.target.checked)} />
            {tr('rememberEmail')}
          </label>
        )}
        <Button type="submit" variant="primary" size="lg" loading={loading} loadingText={t('signingIn')} style={{ width: '100%' }}>
          {t('login')}
        </Button>
      </form>
    </AuthCard>
  );
}
