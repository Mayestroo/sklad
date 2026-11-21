'use client';

import { useMemo, useState } from 'react';
import { useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { usePersistentState } from '@/lib/usePersistentState';
import { LoadError } from '@/components/ui/LoadError';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { buttonStyle } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Checkbox } from '@/components/ui/Checkbox';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { SearchField, matchesSearch } from '@/components/ui/SearchField';
import { AccountTypeBadge } from '@/components/accounting/AccountTypeBadge';
import { BookOpen, FileText, PieChart, Scale } from 'lucide-react';
import { TrialBalanceReport } from '@shared/types';

/** Debit and credit turnovers agree to the tiyin (floating sums can differ in the last digits). */
function isBalanced(debit: number, credit: number): boolean {
  return Math.abs(debit - credit) < 0.005;
}

export default function AccountingPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  const osvQuery = useApiQuery<TrialBalanceReport>('/accounting/reports/osv');
  const osv = osvQuery.data ?? null;
  const [search, setSearch] = useState('');
  const [activeOnly, setActiveOnly] = usePersistentState('accounting.osv.activeOnly', true);

  const rows = useMemo(() => {
    if (!osv) return [];
    return osv.items.filter((item) => {
      if (activeOnly && !item.debitTurnover && !item.creditTurnover && !item.closingBalance) return false;
      return matchesSearch(search, item.accountCode, item.accountName.uz, item.accountName.ru);
    });
  }, [osv, search, activeOnly]);

  const balanced = osv ? isBalanced(osv.totalDebitTurnover, osv.totalCreditTurnover) : true;
  const th = { padding: '12px', fontWeight: 'var(--font-medium)' } as const;

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
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder={isRu ? 'Код или название счёта' : 'Hisob kodi yoki nomi'}
              style={{ maxWidth: 360 }}
            />
            <Checkbox
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
              label={isRu ? 'Только счета с движением' : 'Faqat harakat bo‘lgan hisoblar'}
            />
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
                ? isRu ? 'Измените поиск или снимите флажок «Только счета с движением».' : 'Qidiruvni o‘zgartiring yoki «Faqat harakat bo‘lgan hisoblar» belgisini olib tashlang.'
                : isRu ? 'Измените поиск.' : 'Qidiruvni o‘zgartiring.'
            }
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="app-table-stack" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}>
                  <th scope="col" style={th}>{isRu ? 'Счёт' : 'Hisob'}</th>
                  <th scope="col" style={th}>{isRu ? 'Название' : 'Nomi'}</th>
                  <th scope="col" style={th}>{isRu ? 'Тип' : 'Turi'}</th>
                  <th scope="col" style={{ ...th, textAlign: 'right' }}>{isRu ? 'Оборот по дебету' : 'Debet aylanmasi'}</th>
                  <th scope="col" style={{ ...th, textAlign: 'right' }}>{isRu ? 'Оборот по кредиту' : 'Kredit aylanmasi'}</th>
                  <th scope="col" style={{ ...th, textAlign: 'right' }}>{isRu ? 'Сальдо' : 'Saldo'}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.accountCode} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                    <td data-primary style={{ padding: '12px', fontWeight: 'var(--font-semibold)', fontFamily: 'var(--font-mono)' }}>
                      {item.accountCode}
                    </td>
                    <td data-label={isRu ? 'Название' : 'Nomi'} style={{ padding: '12px', fontWeight: 'var(--font-medium)' }}>
                      {item.accountName[locale] || item.accountName.ru || item.accountName.uz}
                    </td>
                    <td data-label={isRu ? 'Тип' : 'Turi'} style={{ padding: '12px' }}>
                      <AccountTypeBadge type={item.accountType} />
                    </td>
                    <td data-label={isRu ? 'Оборот по дебету' : 'Debet aylanmasi'} style={{ padding: '12px', textAlign: 'right' }} className="tabular-nums">
                      {formatCurrency(item.debitTurnover, locale, osv.currency)}
                    </td>
                    <td data-label={isRu ? 'Оборот по кредиту' : 'Kredit aylanmasi'} style={{ padding: '12px', textAlign: 'right' }} className="tabular-nums">
                      {formatCurrency(item.creditTurnover, locale, osv.currency)}
                    </td>
                    <td
                      data-label={isRu ? 'Сальдо' : 'Saldo'}
                      style={{ padding: '12px', textAlign: 'right', fontWeight: 'var(--font-semibold)', color: item.closingBalance >= 0 ? 'var(--color-text-primary)' : 'var(--color-error-700)' }}
                      className="tabular-nums"
                    >
                      {formatCurrency(item.closingBalance, locale, osv.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: 'var(--color-bg-tertiary)', fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-sm)' }}>
                  <td colSpan={3} style={{ padding: '12px' }}>{isRu ? 'Итого обороты (все счета)' : 'Jami aylanma (barcha hisoblar)'}</td>
                  <td data-label={isRu ? 'Дебет' : 'Debet'} style={{ padding: '12px', textAlign: 'right' }} className="tabular-nums">
                    {formatCurrency(osv.totalDebitTurnover, locale, osv.currency)}
                  </td>
                  <td data-label={isRu ? 'Кредит' : 'Kredit'} style={{ padding: '12px', textAlign: 'right' }} className="tabular-nums">
                    {formatCurrency(osv.totalCreditTurnover, locale, osv.currency)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
