'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { BookOpen, FileText, HelpCircle, PieChart, Scale } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';
import { usePersistentState } from '@/lib/usePersistentState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { SegmentedFilter, DateRangePicker } from '@/components/ui/filters';
import { periodRange } from '@/lib/list-filters';
import { formatRange } from '@/lib/date-range';
import { ACCOUNTING_PERIODS, accountingPeriodRange, isAccountingPeriod } from '@/lib/accounting-plain';

export type AccountingMode = 'simple' | 'accountant';

interface AccountingView {
  mode: AccountingMode;
  setMode: (mode: AccountingMode) => void;
  /** Preset ('this_month', ...) or custom "from_to". */
  period: string;
  setPeriod: (period: string) => void;
  from: string;
  to: string;
  /** The period as a query string: "from=...&to=...". */
  periodQuery: string;
  openHelp: () => void;
}

const AccountingViewContext = createContext<AccountingView | null>(null);

export function useAccountingView(): AccountingView {
  const view = useContext(AccountingViewContext);
  if (!view) throw new Error('useAccountingView must be used inside AccountingShell');
  return view;
}

const TABS = [
  { key: 'overview', href: '/accounting', Icon: Scale },
  { key: 'movements', href: '/accounting/journal', Icon: FileText },
  { key: 'reports', href: '/accounting/reports', Icon: PieChart },
  { key: 'accounts', href: '/accounting/accounts', Icon: BookOpen },
] as const;

/**
 * The accounting section frame (Buxgalteriya TZ 2, 4, 12, 13.4): title, the
 * "Oddiy | Buxgalter" switch (remembered per user; accountants start in their
 * mode), the period picker shared by every tab, the four tabs whose names
 * follow the mode, the "Bu nima?" glossary and the first-visit intro.
 * Switching the mode keeps the tab, the period and the filters.
 */
export function AccountingShell({ actions, children }: { actions?: ReactNode; children: ReactNode }) {
  const t = useTranslations('acct');
  const { user, hasRole } = useAuth();
  const pathname = usePathname();
  const defaultMode: AccountingMode = hasRole('accountant') ? 'accountant' : 'simple';
  const [mode, setMode] = usePersistentState<AccountingMode>(`accounting.mode.${user?.id ?? 'anon'}`, defaultMode);
  const [storedPeriod, setPeriod] = usePersistentState<string>('accounting.period', 'this_month');
  const period = isAccountingPeriod(storedPeriod) ? storedPeriod : 'this_month';
  const [introSeen, setIntroSeen] = usePersistentState<boolean>(`accounting.intro.${user?.id ?? 'anon'}`, false);
  const [introStep, setIntroStep] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const { from, to } = accountingPeriodRange(period);

  const view = useMemo<AccountingView>(
    () => ({ mode, setMode, period, setPeriod, from, to, periodQuery: `from=${from}&to=${to}`, openHelp: () => setHelpOpen(true) }),
    [mode, setMode, period, setPeriod, from, to],
  );

  const isCustom = !(ACCOUNTING_PERIODS as readonly string[]).includes(period);
  const steps = [t('help.step1'), t('help.step2'), t('help.step3')];
  const terms = ['asset', 'liability', 'equity', 'entry', 'turnover', 'saldo', 'retained', 'storno'] as const;

  return (
    <AccountingViewContext.Provider value={view}>
      <div className="rd-page">
        <PageHeader
          title={t('title')}
          subtitle={t('subtitle')}
          actions={
            <div className="acct-head-tools">
              <SegmentedFilter
                label={t('mode.label')}
                name="accounting-mode"
                value={mode}
                onChange={(v) => setMode(v as AccountingMode)}
                options={[
                  { value: 'simple', label: t('mode.simple') },
                  { value: 'accountant', label: t('mode.accountant') },
                ]}
              />
              <Button variant="ghost" onClick={() => setHelpOpen(true)}>
                <HelpCircle size={16} aria-hidden /> {t('help.button')}
              </Button>
              {actions}
            </div>
          }
        />

        <nav className="sec-tabs no-print" aria-label={t('tabs.aria')}>
          {TABS.map(({ key, href, Icon }) => {
            const current = href === '/accounting' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link key={href} href={href} className="sec-tab" aria-current={current ? 'page' : undefined}>
                <Icon size={16} aria-hidden />
                <span>{t(`tabs.${mode}_${key}`)}</span>
              </Link>
            );
          })}
        </nav>

        <div className="acct-period" role="group" aria-label={t('period.label')}>
          <SegmentedFilter
            label={t('period.label')}
            name="accounting-period"
            value={period}
            onChange={setPeriod}
            options={[
              ...ACCOUNTING_PERIODS.map((p) => ({ value: p, label: t(`period.${p}`) })),
              // A custom range shows as its own chosen segment (picked in the calendar next to it).
              ...(isCustom ? [{ value: period, label: t('period.custom') }] : []),
            ]}
          />
          <DateRangePicker
            label={t('period.custom')}
            value={isCustom ? period : ''}
            onChange={(v) => {
              const r = periodRange(v);
              if (r.from && r.to) setPeriod(`${r.from}_${r.to}`);
              else if (!v) setPeriod('this_month');
            }}
          />
          <span className="acct-period-label tabular-nums" aria-live="polite">
            {formatRange(from, to)}
          </span>
        </div>

        {!introSeen && (
          <section className="acct-tour no-print" aria-label={t('help.title')}>
            <strong>{t('help.title')}</strong>
            <p style={{ margin: 0 }}>{steps[introStep]}</p>
            <div className="acct-tour-actions">
              <span className="rd-sub" style={{ marginTop: 0 }}>{t('help.stepOf', { step: introStep + 1, total: steps.length })}</span>
              {introStep < steps.length - 1 ? (
                <Button size="sm" onClick={() => setIntroStep(introStep + 1)}>{t('help.next')}</Button>
              ) : (
                <Button size="sm" onClick={() => setIntroSeen(true)}>{t('help.done')}</Button>
              )}
              {introStep < steps.length - 1 && (
                <Button size="sm" variant="ghost" onClick={() => setIntroSeen(true)}>{t('help.skip')}</Button>
              )}
            </div>
          </section>
        )}

        {children}

        <Drawer isOpen={helpOpen} onClose={() => setHelpOpen(false)} title={t('help.title')} confirmDiscard={false} size="sm">
          <ol style={{ margin: '0 0 var(--space-4)', paddingLeft: 'var(--space-5)', display: 'grid', gap: 'var(--space-2)' }}>
            {steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <p className="doc-banner is-info" style={{ marginBottom: 'var(--space-4)' }}>{t('help.example')}</p>
          <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-2)' }}>{t('help.glossary')}</h3>
          <dl className="acct-glossary">
            {terms.map((term) => (
              <div key={term}>
                <dt>{t(`help.terms.${term}`)}</dt>
                <dd>{t(`help.terms.${term}Text`)}</dd>
              </div>
            ))}
          </dl>
          {introSeen && (
            <Button
              variant="ghost"
              style={{ marginTop: 'var(--space-4)' }}
              onClick={() => {
                setIntroStep(0);
                setIntroSeen(false);
                setHelpOpen(false);
              }}
            >
              {t('help.title')}
            </Button>
          )}
        </Drawer>
      </div>
    </AccountingViewContext.Provider>
  );
}
