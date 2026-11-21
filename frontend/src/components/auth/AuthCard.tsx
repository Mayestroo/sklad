'use client';

import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, Eye, EyeOff, Package } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';

/** Centered card used by the sign-in and sign-up screens: brand, language switch, title. */
export function AuthCard({ title, subtitle, badge, children, footer, maxWidth = 440, aside, asideOnPhone = 'show' }: {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: number;
  /** Side panel (desktop: right of the form; phones: below it, or hidden). */
  aside?: ReactNode;
  asideOnPhone?: 'show' | 'hide';
}) {
  const t = useTranslations('auth');
  const card = (
      <main className="auth-card" style={{ maxWidth }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
            <div className="app-sidebar-logo" aria-hidden>
              <Package size={20} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-base)', color: 'var(--color-text-primary)' }}>Sklad</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{t('brandTagline')}</div>
            </div>
          </div>
          <LanguageSwitcher />
        </div>

        <div style={{ marginBottom: 'var(--space-6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', lineHeight: 'var(--leading-tight)' }}>
              {title}
            </h1>
            {badge}
          </div>
          {subtitle && <p style={{ marginTop: 'var(--space-1)', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{subtitle}</p>}
        </div>

        {children}

        {footer && (
          <div style={{ marginTop: 'var(--space-6)', textAlign: 'center', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{footer}</div>
        )}
      </main>
  );
  return (
    <div className="auth-page">
      {aside ? (
        <div className="auth-split">
          {card}
          <aside className="auth-aside" data-phone={asideOnPhone}>
            {aside}
          </aside>
        </div>
      ) : (
        card
      )}
    </div>
  );
}

/** Form-level error, announced to screen readers. */
export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      style={{
        padding: '12px',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--color-error-50)',
        border: '1px solid var(--color-error-200)',
        color: 'var(--color-error-700)',
        fontSize: 'var(--text-sm)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-2)',
        marginBottom: 'var(--space-4)',
      }}
    >
      <AlertCircle size={18} aria-hidden style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{message}</span>
    </div>
  );
}

interface AuthFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
  icon?: LucideIcon;
  hint?: string;
  error?: string | null;
  /** Adds a show/hide toggle and a Caps Lock warning. */
  password?: boolean;
  ref?: React.Ref<HTMLInputElement>;
}

/** Labelled input with optional icon, hint and inline error (wired with aria-describedby). */
export function AuthField({ label, icon: Icon, hint, error, password = false, id, type, required, ref, ...props }: AuthFieldProps) {
  const t = useTranslations('auth');
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const describedBy = [error ? errorId : null, hint || capsLock ? hintId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div>
      <label htmlFor={inputId} style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-primary)', marginBottom: '6px' }}>
        {label}
        {required && <span aria-hidden style={{ color: 'var(--color-error-700)' }}> *</span>}
      </label>
      <div style={{ position: 'relative' }}>
        {Icon && (
          <Icon size={18} aria-hidden style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)', pointerEvents: 'none' }} />
        )}
        <input
          ref={ref}
          id={inputId}
          type={password ? (visible ? 'text' : 'password') : type}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onKeyUp={password ? (e) => setCapsLock(e.getModifierState('CapsLock')) : undefined}
          className="auth-input"
          style={{
            paddingLeft: Icon ? 40 : 12,
            paddingRight: password ? 44 : 12,
            borderColor: error ? 'var(--color-error-600)' : undefined,
          }}
          {...props}
        />
        {password && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? t('hidePassword') : t('showPassword')}
            title={visible ? t('hidePassword') : t('showPassword')}
            aria-pressed={visible}
            style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', width: 36, height: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
          >
            {visible ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
          </button>
        )}
      </div>
      {error && (
        <div id={errorId} style={{ marginTop: 4, fontSize: 'var(--text-xs)', color: 'var(--color-error-700)' }}>
          {error}
        </div>
      )}
      {(hint || capsLock) && (
        <div id={hintId} style={{ marginTop: 4, fontSize: 'var(--text-xs)', color: capsLock ? 'var(--color-warning-700)' : 'var(--color-text-secondary)' }}>
          {capsLock ? t('capsLockOn') : hint}
        </div>
      )}
    </div>
  );
}
