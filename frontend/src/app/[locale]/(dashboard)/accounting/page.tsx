'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { usePersistentState } from '@/lib/usePersistentState';
import { LoadError } from '@/components/ui/LoadError';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { buttonStyle } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { matchesSearch } from '@/components/ui/SearchField';
import { AccountTypeBadge } from '@/components/accounting/AccountTypeBadge';
import { BookOpen, FileText, PieChart, Scale } from 'lucide-react';
import { TrialBalanceReport, type TrialBalanceItem, type AccountType } from '@shared/types';
import { Button } from '@/components/ui/Button';
import { FilterBar, useFilterState, type FilterDef } from '@/components/ui/filters';
import { StatCard, StatCardGrid } from '@/components/ui/stats/StatCard';
import { DataTable, type Column, type SortState } from '@/components/ui/list/DataTable';

/** Debit and credit turnovers agree to the tiyin (floating sums can differ in the last digits). */
function isBalanced(debit: number, credit: number): boolean {
  return Math.abs(debit - credit) < 0.005;
}

const FILTER_DEFAULTS = { type: '', allAccounts: '' };
const ACCOUNT_TYPES_SHOWN: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

export default function AccountingPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const tIn = useTranslations('rd.inline');

  const osvQuery = useApiQuery<TrialBalanceReport>('/accounting/reports/osv');
  const osv = osvQuery.data ?? null;
  // Filters live in the URL and are remembered per user. By default only accounts with movement are shown.
  const lf = useFilterState('accounting.osv', FILTER_DEFAULTS);
  const search = lf.search;
  const activeOnly = lf.values.allAccounts !== '1';
  const typeFilter = lf.values.type;
  const [sort, setSort] = usePersistentState<SortState | null>('accounting.osv.sort', null);
  const router = useRouter();
  const tl = useTranslations('rd.list');
  const ta = useTranslations('rd.acc');

  const rows = useMemo(() => {
    if (!osv) return [];
    return osv.items.filter((item) => {
      if (activeOnly && !item.debitTurnover && !item.creditTurnover && !item.closingBalance) return false;
      if (typeFilter && item.accountType !== typeFilter) return false;
      return matchesSearch(search, item.accountCode, item.accountName.uz, item.accountName.ru);
    });
  }, [osv, search, activeOnly, typeFilter]);

  const balanced = osv ? isBalanced(osv.totalDebitTurnover, osv.totalCreditTurnover) : true;

  const movementCount = (type: AccountType) => (osv?.items ?? []).filter((i) => i.accountType === type && (i.debitTurnover || i.creditTurnover || i.closingBalance)).length;
  const filterDefs: FilterDef[] = [
    { key: 'type', kind: 'segmented', label: isRu ? 'Тип счёта' : 'Hisob turi', options: ACCOUNT_TYPES_SHOWN.map((type) => ({ value: type, label: ta(`type_${type}`) })) },
    { key: 'allAccounts', kind: 'toggle', label: isRu ? 'Все счета' : 'Barcha hisoblar' },
  ];

  return (
    <div>
      <PageHeader
        title={isRu ? 'Бухгалтерия' : 'Buxgalteriya'}
        subtitle={
          isRu
            ? 'Оборотно-сальдовая ведомость: обороты и остатки по каждому счёту. Проводки создаются документами автоматически.'
            : 'Aylanma-saldo qaydnomasi: har bir hisob bo‘yicha aylanma va qoldiq. Provodkalarni hujjatlar avtomatik yaratadi.'
        }
        actions={
          <>
            <Link href="/accounting/accounts" style={buttonStyle('outline')}>
              <BookOpen size={16} aria-hidden /> {isRu ? 'План счетов' : 'Hisoblar rejasi'}
            </Link>
            <Link href="/accounting/journal" style={buttonStyle('outline')}>
              <FileText size={16} aria-hidden /> {isRu ? 'Журнал проводок' : 'Provodkalar jurnali'}
            </Link>
            <Link href="/accounting/reports" style={buttonStyle('primary')}>
              <PieChart size={16} aria-hidden /> {isRu ? 'Финансовая отчётность' : 'Moliyaviy hisobotlar'}
            </Link>
          </>
        }
      />

      {osv && osv.items.length > 0 && (
        <StatCardGrid label={tl('summary')} count={3}>
          <StatCard label={ta('check')} value={balanced ? (isRu ? 'Дебет = Кредит' : 'Debet = Kredit') : tIn('teng_emas')} negative={!balanced} secondary={balanced ? ta('checkOk') : ta('checkBad')} />
          {ACCOUNT_TYPES_SHOWN.map((type) => (
            <StatCard key={type} label={ta(`type_${type}`)} value={movementCount(type)} secondary={ta('accountsWithMovement')} />
          ))}
        </StatCardGrid>
      )}

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)' }}>
              {isRu ? 'Оборотно-сальдовая ведомость' : 'Aylanma-saldo qaydnomasi'}
            </h2>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 2 }}>
              {osv
                ? isRu
                  ? `За всё время, по ${formatDate(osv.periodEnd, locale)} · суммы в UZS`
                  : `Barcha davr uchun, ${formatDate(osv.periodEnd, locale)} gacha · summalar UZS da`
                : isRu
                  ? 'За всё время · суммы в UZS'
                  : 'Barcha davr uchun · summalar UZS da'}
            </p>
          </div>
          {osv && osv.items.length > 0 && (
            <Badge variant={balanced ? 'success' : 'error'}>
              <Scale size={12} aria-hidden style={{ marginRight: 4 }} />
              {balanced
                ? isRu ? 'Дебет = Кредит' : 'Debet = Kredit'
                : isRu ? 'Дебет и кредит не сходятся' : 'Debet va kredit teng emas'}
            </Badge>
          )}
        </div>

        {osv && osv.items.length > 0 && (
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <FilterBar state={lf} defs={filterDefs} searchPlaceholder={isRu ? 'Код или название счёта' : 'Hisob kodi yoki nomi'} resultCount={rows.length} />
          </div>
        )}

        {osvQuery.isError ? (
          <LoadError error={osvQuery.error} onRetry={() => void osvQuery.refetch()} retrying={osvQuery.isFetching} />
        ) : osvQuery.isPending ? (
          <SkeletonRows rows={8} columns={6} />
        ) : !osv || osv.items.length === 0 ? (
          <EmptyState
            compact
            icon={Scale}
            title={isRu ? 'Оборотов по счетам пока нет' : 'Hisoblar bo‘yicha hozircha aylanma yo‘q'}
            description={
              isRu
                ? 'Проведите приход, продажу или оплату — проводки и обороты появятся здесь автоматически.'
                : 'Kirim, sotuv yoki to‘lovni tasdiqlang — provodkalar va aylanmalar shu yerda avtomatik paydo bo‘ladi.'
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            compact
            title={isRu ? 'Ничего не найдено' : 'Hech narsa topilmadi'}
            description={
              activeOnly
                ? isRu ? 'Измените поиск или включите «Все счета».' : 'Qidiruvni o‘zgartiring yoki «Barcha hisoblar»ni yoqing.'
                : isRu ? 'Измените поиск.' : 'Qidiruvni o‘zgartiring.'
            }
            action={<Button variant="secondary" onClick={lf.reset}>{tl('clearFilters')}</Button>}
          />
        ) : (
          <div className="rd-table-card" style={{ border: 'none' }}>
            <DataTable
              rows={rows}
              columns={[
                { key: 'code', label: isRu ? 'Счёт' : 'Hisob', primary: true, locked: true, sortValue: (i) => i.accountCode, render: (i) => <span className="rd-doc-no tabular-nums">{i.accountCode}</span>, footer: <span>{isRu ? 'Итого обороты' : 'Jami aylanma'}</span> },
                { key: 'name', label: isRu ? 'Название' : 'Nomi', sortValue: (i) => i.accountName[locale] || '', render: (i) => <span style={{ fontWeight: 'var(--font-medium)' }}>{i.accountName[locale] || i.accountName.ru || i.accountName.uz}</span> },
                { key: 'type', label: isRu ? 'Тип' : 'Turi', sortValue: (i) => i.accountType, render: (i) => <AccountTypeBadge type={i.accountType} /> },
                { key: 'debit', label: isRu ? 'Оборот по дебету' : 'Debet aylanmasi', numeric: true, sortValue: (i) => i.debitTurnover, render: (i) => formatCurrency(i.debitTurnover, locale, osv.currency), footer: formatCurrency(osv.totalDebitTurnover, locale, osv.currency) },
                { key: 'credit', label: isRu ? 'Оборот по кредиту' : 'Kredit aylanmasi', numeric: true, sortValue: (i) => i.creditTurnover, render: (i) => formatCurrency(i.creditTurnover, locale, osv.currency), footer: formatCurrency(osv.totalCreditTurnover, locale, osv.currency) },
                { key: 'saldo', label: isRu ? 'Сальдо' : 'Saldo', numeric: true, sortValue: (i) => i.closingBalance, render: (i) => <strong style={{ color: i.closingBalance >= 0 ? undefined : 'var(--color-error-700)' }}>{formatCurrency(i.closingBalance, locale, osv.currency)}</strong> },
              ] as Column<TrialBalanceItem>[]}
              rowKey={(i) => i.accountCode}
              sort={sort}
              onSortChange={setSort}
              onRowClick={(i) => router.push(`/accounting/journal?q=${encodeURIComponent(i.accountCode)}`)}
              caption={ta('rowHint')}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
