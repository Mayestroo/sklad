'use client';

import { useState, FormEvent } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { AuthCard, AuthError, AuthField } from '@/components/auth/AuthCard';
import { Building2, Lock, Mail, MailCheck, User } from 'lucide-react';
import { errorMessage } from '@/lib/utils';
import type { RegistrationPendingResponse } from '@shared/types';

/** Company code from a name: latin letters, digits and dashes. */
function slugFromName(val: string): string {
  return val
    .toLowerCase()
    .replace(/[‘’ʻʼ`']/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const sectionTitle: React.CSSProperties = {
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--font-semibold)',
  color: 'var(--color-text-primary)',
  marginBottom: 'var(--space-3)',
};

export default function RegisterPage() {
  const t = useTranslations('auth');
  const tr = useTranslations('rd.auth');
  const locale = useLocale();

  const [companyUzName, setCompanyUzName] = useState('');
  const [companyRuName, setCompanyRuName] = useState('');
  const [companySlug, setCompanySlug] = useState('');
  /** The code follows the company name until the user edits it by hand. */
  const [slugTouched, setSlugTouched] = useState(false);

  const [adminFirstName, setAdminFirstName] = useState('');
  const [adminLastName, setAdminLastName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** D3: the email the confirmation link was sent to (sign-up step 1 done). */
  const [sentTo, setSentTo] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await apiFetch<RegistrationPendingResponse>('/auth/register', {
        method: 'POST',
        locale,
        body: JSON.stringify({
          companyName: {
            uz: companyUzName || companyRuName,
            ru: companyRuName || companyUzName,
          },
          companySlug,
          defaultLanguage: locale,
          adminEmail: adminEmail.trim(),
          adminPassword,
          adminFirstName,
          adminLastName,
          adminPreferredLanguage: locale,
        }),
      });

      setSentTo(adminEmail.trim());
    } catch (err) {
      setError(errorMessage(err) || t('registerFailed'));
    } finally {
      setLoading(false);
    }
  };

  const companyName = companyUzName.trim() || companyRuName.trim();
  const adminName = [adminFirstName.trim(), adminLastName.trim()].filter(Boolean).join(' ');
  const aside = (
    <>
      <dl className="auth-summary" aria-live="polite">
        <div>
          <dt>{tr('summaryCompany')}</dt>
          <dd>{companyName || <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}>{tr('notFilled')}</span>}</dd>
          {companySlug && (
            <dd
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-secondary)',
                fontWeight: 400,
              }}
            >
              {tr('codePreview', { code: companySlug })}
            </dd>
          )}
        </div>
        <div>
          <dt>{tr('summaryAdmin')}</dt>
          <dd>
            {adminName || adminEmail.trim() ? (
              [adminName, adminEmail.trim()].filter(Boolean).join(' · ')
            ) : (
              <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}>{tr('notFilled')}</span>
            )}
          </dd>
        </div>
      </dl>
      <h2>{tr('nextStepsTitle')}</h2>
      <ol>
        <li>
          <span className="auth-aside-icon" aria-hidden>
            1
          </span>
          {tr('nextStep1')}
        </li>
        <li>
          <span className="auth-aside-icon" aria-hidden>
            2
          </span>
          {tr('nextStep2')}
        </li>
        <li>
          <span className="auth-aside-icon" aria-hidden>
            3
          </span>
          {tr('nextStep3')}
        </li>
      </ol>
    </>
  );

  return (
    <AuthCard
      aside={aside}
      maxWidth={600}
      title={t('startTrial')}
      subtitle={t('registerSubtitle')}
      badge={
        <span
          style={{
            padding: '2px 8px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'var(--color-success-50)',
            color: 'var(--color-success-700)',
            fontSize: 'var(--text-xs)',
            fontWeight: 'var(--font-semibold)',
          }}
        >
          {t('trialDays')}
        </span>
      }
      footer={
        <>
          {t('alreadyHaveAccount')}{' '}
          <Link
            href="/login"
            style={{
              color: 'var(--color-primary-700)',
              fontWeight: 'var(--font-semibold)',
              textDecoration: 'underline',
              textUnderlineOffset: 3,
            }}
          >
            {t('login')}
          </Link>
        </>
      }
    >
      {/* D3: the account is created when the emailed link is confirmed. */}
      {sentTo ? (
        <div
          role="status"
          style={{
            padding: 'var(--space-4)',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-success-50)',
            border: '1px solid var(--color-success-200)',
            color: 'var(--color-text-primary)',
            fontSize: 'var(--text-sm)',
            display: 'flex',
            gap: 'var(--space-3)',
          }}
        >
          <MailCheck size={22} aria-hidden style={{ color: 'var(--color-success-700)', flexShrink: 0 }} />
          <div>
            <div
              style={{
                fontWeight: 'var(--font-semibold)',
                marginBottom: '4px',
              }}
            >
              {t('checkInboxTitle')}
            </div>
            <div>{t('checkInboxText', { email: sentTo })}</div>
            <div
              style={{
                marginTop: 'var(--space-2)',
                color: 'var(--color-text-secondary)',
              }}
            >
              {tr('openMail')}
            </div>
            <button type="button" className="rd-linkbtn" style={{ paddingLeft: 0, fontSize: 'var(--text-sm)' }} onClick={() => setSentTo(null)}>
              {tr('changeData')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <AuthError message={error} />
          <form
            onSubmit={handleSubmit}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-5)',
            }}
          >
            <fieldset
              style={{
                border: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-3)',
              }}
            >
              <legend style={sectionTitle}>{t('companySection')}</legend>
              <AuthField
                label={t('companyNameUz')}
                icon={Building2}
                required
                autoFocus
                autoComplete="organization"
                value={companyUzName}
                onChange={(e) => {
                  setCompanyUzName(e.target.value);
                  if (!slugTouched) setCompanySlug(slugFromName(e.target.value));
                }}
                placeholder="Navro'z Trade LLC"
              />
              <details className="auth-more">
                <summary>{tr('moreOptions')}</summary>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-3)',
                    paddingTop: 'var(--space-3)',
                  }}
                >
                  <AuthField
                    label={t('companyNameRu')}
                    hint={t('optional')}
                    value={companyRuName}
                    onChange={(e) => setCompanyRuName(e.target.value)}
                    placeholder="ООО Навруз Трейд"
                  />
                  <AuthField
                    label={t('companySlug')}
                    hint={t('companySlugHint')}
                    required
                    autoCapitalize="none"
                    spellCheck={false}
                    pattern="[a-z0-9-]+"
                    onInvalid={(e) => {
                      // Inside "More options": open it so the browser can show the message.
                      const details = e.currentTarget.closest('details');
                      if (details) details.open = true;
                    }}
                    value={companySlug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setCompanySlug(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]/g, '-')
                          .replace(/-+/g, '-'),
                      );
                    }}
                    placeholder="navroz-trade"
                  />
                </div>
              </details>
            </fieldset>

            <fieldset
              style={{
                border: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-3)',
              }}
            >
              <legend style={sectionTitle}>{t('adminSection')}</legend>
              <div className="auth-grid-2">
                <AuthField
                  label={t('firstName')}
                  icon={User}
                  required
                  autoComplete="given-name"
                  value={adminFirstName}
                  onChange={(e) => setAdminFirstName(e.target.value)}
                  placeholder="Ali"
                />
                <AuthField
                  label={t('lastName')}
                  required
                  autoComplete="family-name"
                  value={adminLastName}
                  onChange={(e) => setAdminLastName(e.target.value)}
                  placeholder="Valiyev"
                />
              </div>
              <AuthField
                label={t('email')}
                icon={Mail}
                type="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                autoComplete="email"
                hint={t('emailConfirmHint')}
                required
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="ali@navroztrade.uz"
              />
              <AuthField
                label={t('password')}
                icon={Lock}
                password
                required
                minLength={6}
                autoComplete="new-password"
                hint={t('passwordHint')}
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="••••••••"
              />
            </fieldset>

            <Button type="submit" variant="primary" size="lg" loading={loading} loadingText={t('registering')} style={{ width: '100%' }}>
              {t('startTrial')}
            </Button>
          </form>
        </>
      )}
    </AuthCard>
  );
}
