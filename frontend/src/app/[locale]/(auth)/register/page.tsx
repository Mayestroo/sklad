'use client';

import { useState, FormEvent } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { Button } from '@/components/ui/Button';
import { Building2, Mail, Lock, User, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function RegisterPage() {
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const { login } = useAuth();

  const [companyUzName, setCompanyUzName] = useState('');
  const [companyRuName, setCompanyRuName] = useState('');
  const [companySlug, setCompanySlug] = useState('');

  const [adminFirstName, setAdminFirstName] = useState('');
  const [adminLastName, setAdminLastName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSlugChange = (val: string) => {
    // Sanitize slug
    const sanitized = val.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    setCompanySlug(sanitized);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await apiFetch<any>('/auth/register', {
        method: 'POST',
        locale,
        body: JSON.stringify({
          companyName: {
            uz: companyUzName || companyRuName,
            ru: companyRuName || companyUzName,
          },
          companySlug,
          defaultLanguage: locale,
          adminEmail,
          adminPassword,
          adminFirstName,
          adminLastName,
          adminPreferredLanguage: locale,
        }),
      });

      login(response);
    } catch (err: any) {
      setError(err.message || 'Registration failed');
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
        padding: 'var(--space-8) var(--space-4)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          backgroundColor: 'var(--color-bg-secondary)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-border-light)',
          boxShadow: 'var(--shadow-lg)',
          padding: 'var(--space-8)',
        }}
      >
        {/* Top Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-primary-600)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'var(--font-bold)',
                fontSize: 'var(--text-xl)',
              }}
            >
              C
            </div>
            <span style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-lg)' }}>CRM SaaS</span>
          </div>
          <LanguageSwitcher />
        </div>

        {/* Title & Trial Badge */}
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: '4px' }}>
            <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
              {t('startTrial')}
            </h1>
            <span style={{ padding: '2px 8px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-success-50)', color: 'var(--color-success-600)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)' }}>
              {t('trialDays')}
            </span>
          </div>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            Yangi kompaniyangizni yarating va 14 kun bepul ishlating
          </p>
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

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div style={{ borderBottom: '1px solid var(--color-border-light)', paddingBottom: 'var(--space-4)' }}>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)', marginBottom: 'var(--space-3)' }}>
              1. Kompaniya ma&apos;lumotlari
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                  Nomi (O&apos;zbekcha)
                </label>
                <input
                  type="text"
                  required
                  value={companyUzName}
                  onChange={(e) => {
                    setCompanyUzName(e.target.value);
                    if (!companySlug) handleSlugChange(e.target.value);
                  }}
                  placeholder="Navro'z Trade LLC"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: 'var(--text-sm)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                  Название (Русский)
                </label>
                <input
                  type="text"
                  value={companyRuName}
                  onChange={(e) => setCompanyRuName(e.target.value)}
                  placeholder="ООО Навруз Трейд"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: 'var(--text-sm)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            <div style={{ marginTop: 'var(--space-3)' }}>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                Kompaniya kodi (Slug / Subdomain)
              </label>
              <input
                type="text"
                required
                value={companySlug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="navroz-trade"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: 'var(--text-sm)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          <div>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)', marginBottom: 'var(--space-3)' }}>
              2. Administrator ma&apos;lumotlari
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                  {t('firstName')}
                </label>
                <input
                  type="text"
                  required
                  value={adminFirstName}
                  onChange={(e) => setAdminFirstName(e.target.value)}
                  placeholder="Ali"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: 'var(--text-sm)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                  {t('lastName')}
                </label>
                <input
                  type="text"
                  required
                  value={adminLastName}
                  onChange={(e) => setAdminLastName(e.target.value)}
                  placeholder="Valiyev"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: 'var(--text-sm)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 'var(--space-3)' }}>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                {t('email')}
              </label>
              <input
                type="email"
                required
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="ali@navroztrade.uz"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: 'var(--text-sm)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  outline: 'none',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                {t('password')}
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: 'var(--text-sm)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          <Button type="submit" variant="primary" disabled={loading} style={{ width: '100%', marginTop: 'var(--space-4)' }}>
            {loading ? tCommon('loading') : t('startTrial')}
          </Button>
        </form>

        <div style={{ marginTop: 'var(--space-6)', textAlign: 'center', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          {t('alreadyHaveAccount')}{' '}
          <Link href="/login" style={{ color: 'var(--color-primary-600)', fontWeight: 'var(--font-semibold)', textDecoration: 'none' }}>
            {t('login')}
          </Link>
        </div>
      </div>
    </div>
  );
}
