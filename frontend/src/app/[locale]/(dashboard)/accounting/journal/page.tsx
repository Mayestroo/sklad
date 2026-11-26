'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';
import { useToast } from '@/context/ToastContext';
import { apiFetch } from '@/lib/api';
import { useApiQuery, useInvalidateApi } from '@/lib/query/useApiQuery';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadError } from '@/components/ui/LoadError';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { FilterBar, useFilterState, type FilterDef } from '@/components/ui/filters';
import { AccountingShell, useAccountingView } from '@/components/accounting/AccountingShell';
import { ExportButtons, MovementList, describeForExport, officialLabel, useLedgerMoney } from '@/components/accounting/AccountingParts';
import { localIsoDate } from '@/lib/date-range';
import { JOURNAL_SOURCE_GROUP_KEYS, DEFAULT_CARD_ACCOUNTS, type Account, type AccountingSummary, type JournalEntryPage } from '@shared/types';

const PAGE_SIZE = 50;
const FILTER_DEFAULTS = { source: '', account: '' };

export default function JournalPage() {
  const { hasPermission } = useAuth();
  return (
    <AccountingShell>
      <Movements canCreate={hasPermission('accounting:create')} />
    </AccountingShell>
  );
}

function Movements({ canCreate }: { canCreate: boolean }) {
  const t = useTranslations('acct');
  const locale = useLocale();
  const { mode, periodQuery, from, to } = useAccountingView();
  // Filters live in the URL and are remembered; ?account=5010 opens one account (trial balance, health issues).
  const lf = useFilterState('accounting.journal', FILTER_DEFAULTS);
  const search = useDebouncedValue(lf.search, 300);
  const [pages, setPages] = useState(1);
  const [manualOpen, setManualOpen] = useState(false);

  const params = new URLSearchParams(periodQuery);
  if (lf.values.source) params.set('source', lf.values.source);
  if (lf.values.account) params.set('accountCode', lf.values.account);
  if (search.trim()) params.set('q', search.trim());
  params.set('pageSize', String(PAGE_SIZE * pages));
  const q = useApiQuery<JournalEntryPage>(`/accounting/journal?${params.toString()}`, { keepPrevious: true });
  const summary = useApiQuery<AccountingSummary>(`/accounting/summary?${periodQuery}`);
  const cards = summary.data?.cardAccounts ?? DEFAULT_CARD_ACCOUNTS;
  const items = q.data?.items ?? [];
  const total = q.data?.total ?? 0;

  const filterDefs: FilterDef[] = [
    {
      key: 'source',
      kind: 'segmented',
      label: t('movements.type'),
      options: [{ value: '', label: t('movements.all') }, ...JOURNAL_SOURCE_GROUP_KEYS.map((g) => ({ value: g, label: t(`movements.group_${g}`) }))],
    },
  ];
  const filtered = Boolean(lf.values.source || lf.values.account || lf.search);

  const exportRows = () =>
    mode === 'accountant'
      ? [
          [t('journal.lines'), `${from} – ${to}`],
          [t('movements.number'), t('movements.when'), t('manual.comment'), t('journal.debit'), t('journal.credit'), t('journal.amount'), t('journal.original')],
          ...items.flatMap((e) =>
            (e.lines ?? []).map((l) => [e.entryNumber, e.entryDate.slice(0, 10), e.description, officialLabel(l.debitAccount, locale), officialLabel(l.creditAccount, locale), Number(l.amount), l.currency !== 'UZS' ? `${l.amountOrig} ${l.currency}` : '']),
          ),
        ]
      : [[t('tabs.simple_movements'), `${from} – ${to}`], [t('movements.when'), t('movements.whatChanged'), t('reports.amount')], ...items.map((e) => describeForExport(e, cards, t, locale))];

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
        <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)' }}>{t(`tabs.${mode}_movements`)}</h2>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
          {items.length > 0 && <ExportButtons filename={`harakatlar_${from}_${to}`} rows={exportRows} />}
          {mode === 'accountant' && canCreate && (
            <Button size="sm" onClick={() => setManualOpen(true)}>
              <Plus size={14} aria-hidden /> {t('journal.newEntry')}
            </Button>
          )}
        </div>
      </div>

      <div style={{ marginBottom: 'var(--space-3)' }}>
        <FilterBar state={lf} defs={filterDefs} searchPlaceholder={t('movements.search')} resultCount={total} />
        {lf.values.account && (
          <p style={{ marginTop: 'var(--space-2)' }}>
            <Badge variant="info">{t('movements.accountFilter', { code: lf.values.account })}</Badge>{' '}
            <Button variant="ghost" size="sm" onClick={() => lf.set({ account: '' })}>
              {t('movements.clear')}
            </Button>
          </p>
        )}
      </div>

      {q.isError ? (
        <LoadError error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : q.isPending ? (
        <SkeletonRows rows={8} columns={3} />
      ) : items.length === 0 ? (
        filtered ? (
          <EmptyState compact title={t('movements.notFound')} action={<Button variant="secondary" onClick={lf.reset}>{t('movements.clear')}</Button>} />
        ) : (
          <EmptyState compact icon={FileText} title={t('movements.empty')} description={t('movements.emptyHint')} />
        )
      ) : (
        <>
          <MovementList entries={items} cardAccounts={cards} mode={mode} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-4)', flexWrap: 'wrap' }}>
            <span className="rd-sub" style={{ marginTop: 0 }}>{t('movements.count', { shown: items.length, total })}</span>
            {items.length < total && (
              <Button variant="secondary" loading={q.isFetching} onClick={() => setPages((p) => p + 1)}>
                {t('movements.more')}
              </Button>
            )}
          </div>
        </>
      )}
      {manualOpen && <ManualEntryDrawer onClose={() => setManualOpen(false)} />}
    </Card>
  );
}

interface DraftLine {
  debitAccountId: string;
  creditAccountId: string;
  amount: string;
}
const emptyLine = (): DraftLine => ({ debitAccountId: '', creditAccountId: '', amount: '' });

/** A manual entry (TZ 10.2): accountant mode and permission only; date, description, balanced lines, a confirmation. */
function ManualEntryDrawer({ onClose }: { onClose: () => void }) {
  const t = useTranslations('acct');
  const locale = useLocale();
  const { token, company } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const invalidate = useInvalidateApi();
  const money = useLedgerMoney();
  const accountsQuery = useApiQuery<Account[]>('/accounting/accounts');
  const [date, setDate] = useState(localIsoDate(new Date()));
  const [comment, setComment] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const options = useMemo(
    () => (accountsQuery.data ?? []).filter((a) => a.isActive).map((a) => ({ value: a.id, label: officialLabel(a, locale) })),
    [accountsQuery.data, locale],
  );
  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);

  const validate = (): string | null => {
    if (!date) return t('manual.errDate');
    if (!comment.trim()) return t('manual.errComment');
    for (const [i, l] of lines.entries()) {
      if (!l.debitAccountId || !l.creditAccountId || !(Number(l.amount) > 0)) return t('manual.errLine', { n: i + 1 });
      if (l.debitAccountId === l.creditAccountId) return t('manual.errSame', { n: i + 1 });
    }
    return null;
  };

  const save = async () => {
    const problem = validate();
    setError(problem);
    if (problem) return;
    const ok = await confirm({ title: t('manual.confirmTitle'), description: t('manual.confirmBody'), confirmText: t('manual.save') });
    if (!ok) return;
    setSaving(true);
    try {
      await apiFetch('/accounting/journal', {
        method: 'POST',
        token: token ?? undefined,
        tenantId: company?.id,
        locale,
        body: JSON.stringify({ date, description: comment.trim(), lines: lines.map((l) => ({ debitAccountId: l.debitAccountId, creditAccountId: l.creditAccountId, amount: Number(l.amount) })) }),
      });
      toast.success(t('manual.saved'));
      await invalidate('/accounting');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const setLine = (i: number, patch: Partial<DraftLine>) => setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <Drawer
      isOpen
      onClose={onClose}
      title={t('manual.title')}
      description={t('manual.description')}
      size="lg"
      onSubmitShortcut={() => void save()}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={() => void save()} loading={saving}>{t('manual.save')}</Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        {error && (
          <p role="alert" className="doc-banner is-error">
            {error}
          </p>
        )}
        <DatePicker label={t('manual.date')} value={date} onChange={setDate} />
        <Input label={t('manual.comment')} value={comment} onChange={(e) => setComment(e.target.value)} required />
        {lines.map((line, i) => (
          <fieldset key={i} style={{ border: '1px solid var(--color-border-light)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', display: 'grid', gap: 'var(--space-3)' }}>
            <legend style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', padding: '0 4px' }}>{t('manual.line', { n: i + 1 })}</legend>
            <Select label={t('manual.debitAccount')} value={line.debitAccountId} onChange={(v) => setLine(i, { debitAccountId: v })} options={options} searchable />
            <Select label={t('manual.creditAccount')} value={line.creditAccountId} onChange={(v) => setLine(i, { creditAccountId: v })} options={options} searchable />
            <MoneyInput label={t('manual.amount')} value={line.amount} onValueChange={(v) => setLine(i, { amount: v })} decimals={2} />
            {lines.length > 1 && (
              <Button variant="danger-ghost" size="sm" onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))} style={{ justifySelf: 'start' }}>
                <Trash2 size={14} aria-hidden /> {t('manual.removeLine')}
              </Button>
            )}
          </fieldset>
        ))}
        <Button variant="outline" size="sm" onClick={() => setLines((prev) => [...prev, emptyLine()])} style={{ justifySelf: 'start' }}>
          <Plus size={14} aria-hidden /> {t('manual.addLine')}
        </Button>
        <p className="rd-sub tabular-nums">{t('manual.total', { amount: money.full(total) })}</p>
      </div>
    </Drawer>
  );
}

