'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BookOpen, Pencil, Plus, Settings2 } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { apiFetch } from '@/lib/api';
import { useApiQuery, useInvalidateApi } from '@/lib/query/useApiQuery';
import { matchesSearch } from '@/components/ui/SearchField';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadError } from '@/components/ui/LoadError';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { FilterBar, useFilterState } from '@/components/ui/filters';
import { AccountingShell, useAccountingView } from '@/components/accounting/AccountingShell';
import { accountLabel, useLedgerMoney } from '@/components/accounting/AccountingParts';
import { ACCOUNTING_CARD_KEYS, type Account, type AccountType, type AccountingCardKey, type AccountingSummary, type TrialBalanceReport } from '@shared/types';

const TYPES: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];
const FILTER_DEFAULTS = { type: '' };

export default function AccountsPage() {
  return (
    <AccountingShell>
      <Accounts />
    </AccountingShell>
  );
}

function useRequest() {
  const { token, company } = useAuth();
  const locale = useLocale();
  return (endpoint: string, method: 'POST' | 'PATCH' | 'PUT', body: unknown) =>
    apiFetch(endpoint, { method, token: token ?? undefined, tenantId: company?.id, locale, body: JSON.stringify(body) });
}

function Accounts() {
  const t = useTranslations('acct');
  const locale = useLocale() as 'uz' | 'ru';
  const money = useLedgerMoney();
  const { hasPermission } = useAuth();
  const { mode, to } = useAccountingView();
  const accountsQuery = useApiQuery<Account[]>('/accounting/accounts');
  const balances = useApiQuery<TrialBalanceReport>(`/accounting/trial-balance?to=${to}`);
  const lf = useFilterState('accounting.accounts', FILTER_DEFAULTS);
  const [editing, setEditing] = useState<Account | null>(null);
  const [creating, setCreating] = useState(false);
  const [cardsOpen, setCardsOpen] = useState(false);
  const isAccountant = mode === 'accountant';

  const balanceOf = useMemo(() => new Map((balances.data?.items ?? []).map((i) => [i.accountId, i.closingBalance])), [balances.data]);
  // Simple mode: only accounts in use, no technical ones (TZ 8).
  const visible = useMemo(() => (accountsQuery.data ?? []).filter((a) => isAccountant || (a.isUsed && !a.isTechnical && a.isActive)), [accountsQuery.data, isAccountant]);
  const rows = visible.filter((a) => (!lf.values.type || a.type === lf.values.type) && matchesSearch(lf.search, a.code, a.name.uz, a.name.ru, a.alias?.uz, a.alias?.ru));
  const typeLabel = (ty: AccountType) => (isAccountant ? t(`types.${ty}_official`) : t(`types.${ty}`));

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-3)' }}>
        <div>
          <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)' }}>{t(`tabs.${mode}_accounts`)}</h2>
          <p className="rd-sub">{isAccountant ? t('accounts.accountantHint') : t('accounts.simpleHint')}</p>
        </div>
        {isAccountant && (
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {hasPermission('settings:edit') && (
              <Button variant="outline" size="sm" onClick={() => setCardsOpen(true)}>
                <Settings2 size={14} aria-hidden /> {t('accounts.cardsButton')}
              </Button>
            )}
            {hasPermission('accounting:create') && (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus size={14} aria-hidden /> {t('accounts.add')}
              </Button>
            )}
          </div>
        )}
      </div>

      {visible.length > 0 && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <FilterBar
            state={lf}
            defs={[{ key: 'type', kind: 'segmented', label: t('accounts.type'), options: [{ value: '', label: t('types.all'), count: visible.length }, ...TYPES.filter((ty) => visible.some((a) => a.type === ty)).map((ty) => ({ value: ty, label: typeLabel(ty), count: visible.filter((a) => a.type === ty).length }))] }]}
            searchPlaceholder={t('tb.search')}
            resultCount={rows.length}
          />
        </div>
      )}

      {accountsQuery.isError ? (
        <LoadError error={accountsQuery.error} onRetry={() => void accountsQuery.refetch()} retrying={accountsQuery.isFetching} />
      ) : accountsQuery.isPending ? (
        <SkeletonRows rows={8} columns={3} />
      ) : rows.length === 0 ? (
        <EmptyState compact icon={BookOpen} title={t('accounts.empty')} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          {TYPES.filter((ty) => rows.some((r) => r.type === ty)).map((ty) => (
            <section key={ty} aria-labelledby={`acc-type-${ty}`}>
              <h3 id={`acc-type-${ty}`} style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-2)' }} title={t(`types.${ty}_help`)}>
                {typeLabel(ty)} <span className="rd-sub" style={{ display: 'inline', marginTop: 0 }}>· {t(`types.${ty}_help`)}</span>
              </h3>
              <ul className="acc-list">
                {rows.filter((r) => r.type === ty).map((acc) => {
                  const balance = balanceOf.get(acc.id) ?? 0;
                  const canEdit = isAccountant && hasPermission('accounting:edit');
                  const body = (
                    <>
                      <span className="acc-code tabular-nums">{acc.code}</span>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: 'block', fontWeight: 'var(--font-medium)', color: 'var(--color-text-primary)' }}>{isAccountant ? acc.name[locale] : accountLabel(acc, locale)}</span>
                        <span className="acct-official">{isAccountant ? acc.alias?.[locale] ?? '' : `${acc.code} · ${acc.name[locale]}`}</span>
                      </span>
                      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <span className="tabular-nums" style={{ fontWeight: 'var(--font-semibold)' }}>{money.cell(balance)}</span>
                        {isAccountant && (
                          <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            {acc.isTechnical && <Badge variant="neutral">{t('accounts.technical')}</Badge>}
                            {!acc.isActive && <Badge variant="warning">{t('accounts.inactive')}</Badge>}
                            {!acc.isSystem && <Badge variant="info">{t('accounts.custom')}</Badge>}
                            {!acc.isUsed && <Badge variant="neutral">{t('accounts.unused')}</Badge>}
                          </span>
                        )}
                      </span>
                    </>
                  );
                  return (
                    <li key={acc.id} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'stretch' }}>
                      <Link href={`/accounting/journal?account=${encodeURIComponent(acc.code)}`} className="acc-item" style={{ flex: 1, minHeight: 52 }}>
                        {body}
                      </Link>
                      {canEdit && (
                        <Button variant="ghost" size="sm" onClick={() => setEditing(acc)} aria-label={`${t('accounts.edit')}: ${acc.code}`} style={{ minWidth: 44 }}>
                          <Pencil size={16} aria-hidden />
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
      {editing && <EditAccountDrawer account={editing} onClose={() => setEditing(null)} />}
      {creating && <CreateAccountDrawer onClose={() => setCreating(false)} />}
      {cardsOpen && <CardsDrawer accounts={accountsQuery.data ?? []} onClose={() => setCardsOpen(false)} />}
    </Card>
  );
}

function EditAccountDrawer({ account, onClose }: { account: Account; onClose: () => void }) {
  const t = useTranslations('acct');
  const locale = useLocale() as 'uz' | 'ru';
  const request = useRequest();
  const toast = useToast();
  const invalidate = useInvalidateApi();
  const [aliasUz, setAliasUz] = useState(account.alias?.uz ?? '');
  const [aliasRu, setAliasRu] = useState(account.alias?.ru ?? '');
  const [active, setActive] = useState(account.isActive);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const send = async (alias: { uz: string; ru: string } | null | undefined) => {
    setSaving(true);
    setError(null);
    try {
      await request(`/accounting/accounts/${account.id}`, 'PATCH', { ...(alias !== undefined ? { alias } : {}), isActive: active });
      toast.success(t('accounts.saved'));
      await invalidate('/accounting');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  const save = () => {
    const uz = aliasUz.trim();
    const ru = aliasRu.trim();
    if (!uz !== !ru) return setError(t('accounts.errAlias'));
    const unchanged = uz === (account.alias?.uz ?? '') && ru === (account.alias?.ru ?? '');
    void send(unchanged ? undefined : uz ? { uz, ru } : null);
  };

  return (
    <Drawer
      isOpen
      onClose={onClose}
      title={t('accounts.editTitle', { code: account.code })}
      description={t('accounts.aliasHint')}
      size="md"
      onSubmitShortcut={save}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={save} loading={saving}>{t('common.save')}</Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        {error && <p role="alert" className="doc-banner is-error">{error}</p>}
        <div>
          <span className="rd-sub" style={{ marginTop: 0 }}>{t('accounts.official')}</span>
          <p style={{ margin: 0, fontWeight: 'var(--font-medium)' }}>{account.code} · {account.name[locale]}</p>
        </div>
        <Input label={t('accounts.aliasUz')} value={aliasUz} onChange={(e) => setAliasUz(e.target.value)} />
        <Input label={t('accounts.aliasRu')} value={aliasRu} onChange={(e) => setAliasRu(e.target.value)} />
        {account.aliasCustom && (
          <Button variant="ghost" size="sm" style={{ justifySelf: 'start' }} onClick={() => void send(null)}>
            {t('accounts.resetAlias')}
          </Button>
        )}
        <Checkbox label={t('accounts.active')} checked={active} onChange={(e) => setActive(e.target.checked)} />
        {account.isUsed && <p className="rd-sub">{t('accounts.deactivateUsed')}</p>}
      </div>
    </Drawer>
  );
}

function CreateAccountDrawer({ onClose }: { onClose: () => void }) {
  const t = useTranslations('acct');
  const request = useRequest();
  const toast = useToast();
  const invalidate = useInvalidateApi();
  const [form, setForm] = useState({ code: '', nameUz: '', nameRu: '', type: '' as AccountType | '', aliasUz: '', aliasRu: '' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    if (!form.code.trim() || !form.nameUz.trim() || !form.nameRu.trim() || !form.type) return setError(t('accounts.errRequired'));
    if (!form.aliasUz.trim() !== !form.aliasRu.trim()) return setError(t('accounts.errAlias'));
    setSaving(true);
    setError(null);
    try {
      await request('/accounting/accounts', 'POST', {
        code: form.code.trim(),
        name: { uz: form.nameUz.trim(), ru: form.nameRu.trim() },
        type: form.type,
        ...(form.aliasUz.trim() ? { alias: { uz: form.aliasUz.trim(), ru: form.aliasRu.trim() } } : {}),
      });
      toast.success(t('accounts.created'));
      await invalidate('/accounting');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      isOpen
      onClose={onClose}
      title={t('accounts.add')}
      size="md"
      onSubmitShortcut={() => void save()}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={() => void save()} loading={saving}>{t('common.save')}</Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        {error && <p role="alert" className="doc-banner is-error">{error}</p>}
        <Input label={t('accounts.code')} value={form.code} onChange={(e) => set({ code: e.target.value })} inputMode="numeric" />
        <Input label={t('accounts.nameUz')} value={form.nameUz} onChange={(e) => set({ nameUz: e.target.value })} />
        <Input label={t('accounts.nameRu')} value={form.nameRu} onChange={(e) => set({ nameRu: e.target.value })} />
        <Select label={t('accounts.type')} value={form.type} onChange={(v) => set({ type: v as AccountType })} options={TYPES.map((ty) => ({ value: ty, label: t(`types.${ty}_official`), description: t(`types.${ty}_help`) }))} />
        <Input label={t('accounts.aliasUz')} value={form.aliasUz} onChange={(e) => set({ aliasUz: e.target.value })} />
        <Input label={t('accounts.aliasRu')} value={form.aliasRu} onChange={(e) => set({ aliasRu: e.target.value })} />
      </div>
    </Drawer>
  );
}

/** Which accounts feed each balance card (TZ 5.2; an administrator's setting). */
function CardsDrawer({ accounts, onClose }: { accounts: Account[]; onClose: () => void }) {
  const t = useTranslations('acct');
  const locale = useLocale();
  const request = useRequest();
  const toast = useToast();
  const invalidate = useInvalidateApi();
  const { periodQuery } = useAccountingView();
  const summary = useApiQuery<AccountingSummary>(`/accounting/summary?${periodQuery}`);
  const [draft, setDraft] = useState<Record<AccountingCardKey, string[]> | null>(null);
  const current = draft ?? summary.data?.cardAccounts ?? null;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const candidates = accounts.filter((a) => a.type === 'ASSET' || a.type === 'LIABILITY').filter((a) => !a.isTechnical);

  const toggle = (card: AccountingCardKey, code: string, on: boolean) => {
    if (!current) return;
    setDraft({ ...current, [card]: on ? [...current[card], code] : current[card].filter((c) => c !== code) });
  };
  const save = async () => {
    if (!current) return;
    setSaving(true);
    setError(null);
    try {
      await request('/accounting/settings/cards', 'PUT', current);
      toast.success(t('accounts.cardsSaved'));
      await invalidate('/accounting');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      isOpen
      onClose={onClose}
      title={t('accounts.cardsTitle')}
      description={t('accounts.cardsHint')}
      size="lg"
      confirmDiscard={draft !== null}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={() => void save()} loading={saving} disabled={!current}>{t('common.save')}</Button>
        </>
      }
    >
      {error && <p role="alert" className="doc-banner is-error">{error}</p>}
      {!current ? (
        <SkeletonRows rows={6} columns={2} />
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-5)' }}>
          {ACCOUNTING_CARD_KEYS.map((card) => (
            <fieldset key={card} style={{ border: 'none', padding: 0, margin: 0 }}>
              <legend style={{ fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-2)' }}>{t(`cards.${card}`)}</legend>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', gap: 'var(--space-2)' }}>
                {candidates.map((a) => (
                  <Checkbox key={a.id} label={`${a.code} · ${accountLabel(a, locale)}`} checked={current[card].includes(a.code)} onChange={(e) => toggle(card, a.code, e.target.checked)} />
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      )}
    </Drawer>
  );
}
