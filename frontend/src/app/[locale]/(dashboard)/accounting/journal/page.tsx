'use client';

import { useMemo } from 'react';
import { FilterBar, periodRange, useFilterState, type FilterDef } from '@/components/ui/filters';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { LoadError } from '@/components/ui/LoadError';
import { formatCurrency, formatDate, LEDGER_CURRENCY } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { matchesSearch } from '@/components/ui/SearchField';
import { FileText } from 'lucide-react';
import { JournalEntry } from '@shared/types';

/** Words for the document that created an entry (no raw type codes on screen). */
const SOURCE_LABELS: Record<string, { uz: string; ru: string; href?: (id: string) => string }> = {
  SalesInvoice: { uz: 'Sotuv hujjati', ru: 'Продажа', href: (id) => `/sales/${id}` },
  SalesOrder: { uz: 'Buyurtma', ru: 'Заказ', href: (id) => `/sales/orders/${id}` },
  SalesReturn: { uz: 'Mijozdan qaytarish', ru: 'Возврат покупателя' },
  SalesReturnCancel: { uz: 'Qaytarishni bekor qilish', ru: 'Отмена возврата' },
  PurchaseReceipt: { uz: 'Kirim hujjati', ru: 'Приходный документ', href: (id) => `/purchases/${id}` },
  PurchaseReturn: { uz: 'Yetkazib beruvchiga qaytarish', ru: 'Возврат поставщику', href: (id) => `/purchases/returns/${id}` },
  AdditionalExpense: { uz: 'Qo‘shimcha xarajat', ru: 'Доп. расход', href: (id) => `/purchases/expenses/${id}` },
  PurchaseExpense: { uz: 'Xarid xarajati', ru: 'Расход по закупке' },
  PurchasePayment: { uz: 'Yetkazib beruvchiga to‘lov', ru: 'Оплата поставщику' },
  PAYMENT: { uz: 'To‘lov', ru: 'Оплата' },
  Payment: { uz: 'To‘lov', ru: 'Оплата' },
  FinanceTransaction: { uz: 'Kassa operatsiyasi', ru: 'Кассовая операция' },
  InventoryDocument: { uz: 'Ombor hujjati', ru: 'Складской документ' },
  StockTransfer: { uz: 'Omborlararo ko‘chirish', ru: 'Перемещение' },
  ServiceAct: { uz: 'Xizmat dalolatnomasi', ru: 'Акт услуг' },
  ProductionDocument: { uz: 'Ishlab chiqarish', ru: 'Производство' },
  OpeningBalanceDocument: { uz: 'Boshlang‘ich qoldiq', ru: 'Начальный остаток' },
  OpeningBalanceLine: { uz: 'Boshlang‘ich qoldiq', ru: 'Начальный остаток' },
};

const FILTER_DEFAULTS = { source: '', period: '' };

export default function JournalPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  const journalQuery = useApiQuery<JournalEntry[]>('/accounting/journal');
  const entries = useMemo(() => journalQuery.data ?? [], [journalQuery.data]);
  // Filters live in the URL and are remembered per user; a link from the trial balance opens the
  // journal on one account (?q=2910).
  const lf = useFilterState('journal.list', FILTER_DEFAULTS);
  const search = lf.search;
  const sourceFilter = lf.values.source;
  const { from, to } = periodRange(lf.values.period);
  const tj = useTranslations('rd.journal');
  const tl = useTranslations('rd.list');

  const rows = useMemo(
    () =>
      entries.filter((e) => {
        const day = (e.entryDate ?? e.createdAt ?? '').slice(0, 10);
        if (from && day < from) return false;
        if (to && day > to) return false;
        if (sourceFilter && e.sourceDocType !== sourceFilter) return false;
        const accounts = (e.lines ?? []).flatMap((l) => [
          l.debitAccount?.code,
          l.creditAccount?.code,
          l.debitAccount?.name?.[locale],
          l.creditAccount?.name?.[locale],
        ]);
        return matchesSearch(search, e.entryNumber, e.description, ...accounts);
      }),
    [entries, search, from, to, locale, sourceFilter],
  );

  const sourceTypes = [...new Set(entries.map((e) => e.sourceDocType).filter((x): x is NonNullable<typeof x> => Boolean(x)))];
  // Day book: entries grouped by date, each day with its count and turnover.
  const days: Array<{ day: string; items: typeof rows; total: number }> = [];
  for (const e of rows) {
    const day = (e.entryDate ?? e.createdAt ?? '').slice(0, 10);
    let g = days[days.length - 1];
    if (!g || g.day !== day) {
      g = { day, items: [], total: 0 };
      days.push(g);
    }
    g.items.push(e);
    g.total += (e.lines ?? []).reduce((sum, l) => sum + Number(l.amount || 0), 0);
  }
  const th = { padding: '12px', fontWeight: 'var(--font-medium)' } as const;
  const accountName = (a: { code: string; name?: { uz?: string; ru?: string } } | undefined) =>
    a ? `${a.code} · ${a.name?.[locale] || a.name?.uz || ''}` : '—';

  return (
    <div>
      <PageHeader
        title={isRu ? 'Журнал проводок' : 'Provodkalar jurnali'}
        subtitle={
          isRu
            ? 'Каждая проведённая операция: какой счёт дебетуется, какой кредитуется и на какую сумму (в UZS).'
            : 'Har bir tasdiqlangan operatsiya: qaysi hisob debetlanadi, qaysi biri kreditlanadi va qancha (UZS da).'
        }
      />

      <Card>
        {entries.length > 0 && (
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <FilterBar
              state={lf}
              defs={[
                ...(sourceTypes.length > 1
                  ? [
                      {
                        key: 'source',
                        kind: 'select',
                        label: tj('source'),
                        options: sourceTypes.map((st) => ({ value: st, label: SOURCE_LABELS[st] ? (isRu ? SOURCE_LABELS[st].ru : SOURCE_LABELS[st].uz) : st, count: entries.filter((e) => e.sourceDocType === st).length })),
                      } satisfies FilterDef,
                    ]
                  : []),
                { key: 'period', kind: 'period', label: tl('period') },
              ]}
              searchPlaceholder={isRu ? '№ проводки, описание или счёт' : 'Provodka №, izoh yoki hisob'}
              resultCount={rows.length}
            />
          </div>
        )}

        {journalQuery.isError ? (
          <LoadError error={journalQuery.error} onRetry={() => void journalQuery.refetch()} retrying={journalQuery.isFetching} />
        ) : journalQuery.isPending ? (
          <SkeletonRows rows={8} columns={5} />
        ) : entries.length === 0 ? (
          <EmptyState
            compact
            icon={FileText}
            title={isRu ? 'Проводок пока нет' : 'Hozircha provodkalar yo‘q'}
            description={
              isRu
                ? 'Проводки появятся сами, когда вы проведёте приход, продажу, оплату или другой документ.'
                : 'Kirim, sotuv, to‘lov yoki boshqa hujjatni tasdiqlaganingizda provodkalar o‘zi paydo bo‘ladi.'
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState compact title={isRu ? 'Ничего не найдено' : 'Hech narsa topilmadi'} description={isRu ? 'Измените поиск или период.' : 'Qidiruv yoki davrni o‘zgartiring.'} action={<Button variant="secondary" onClick={lf.reset}>{tl('clearFilters')}</Button>} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="app-table-stack" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}>
                  <th scope="col" style={th}>{isRu ? '№ проводки' : 'Provodka №'}</th>
                  <th scope="col" style={th}>{isRu ? 'Дата' : 'Sana'}</th>
                  <th scope="col" style={th}>{isRu ? 'Описание' : 'Izoh'}</th>
                  <th scope="col" style={th}>
                    <div className="ux-journal-line" style={{ fontWeight: 'inherit' }}>
                      <span>{isRu ? 'Дебет (Дт)' : 'Debet (Dt)'}</span>
                      <span>{isRu ? 'Кредит (Кт)' : 'Kredit (Kt)'}</span>
                      <span style={{ textAlign: 'right' }}>{isRu ? 'Сумма' : 'Summa'}</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {days.map((g) => [
                  <tr key={`day-${g.day}`} className="jr-day">
                    <td colSpan={4}>
                      <strong>{formatDate(g.day, locale)}</strong>
                      <span className="rd-sub" style={{ marginLeft: 8, marginTop: 0, display: 'inline' }}>
                        {tj('dayLine', { count: g.items.length, total: formatCurrency(g.total, locale, LEDGER_CURRENCY) })}
                      </span>
                    </td>
                  </tr>,
                  ...g.items.map((entry) => {
                  const source = entry.sourceDocType ? SOURCE_LABELS[entry.sourceDocType] : undefined;
                  const href = source?.href && entry.sourceDocId ? source.href(entry.sourceDocId) : undefined;
                  const lines = entry.lines ?? [];
                  return (
                    <tr key={entry.id} style={{ borderBottom: '1px solid var(--color-border-light)', verticalAlign: 'top' }}>
                      <td data-primary style={{ padding: '12px', fontWeight: 'var(--font-semibold)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{entry.entryNumber}</td>
                      <td data-label={isRu ? 'Дата' : 'Sana'} style={{ padding: '12px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{formatDate(entry.entryDate, locale)}</td>
                      <td data-label={isRu ? 'Описание' : 'Izoh'} style={{ padding: '12px' }}>
                        <div style={{ fontWeight: 'var(--font-medium)' }}>{entry.description}</div>
                        {source && (
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                            {href ? <Link href={href} style={{ color: 'var(--color-primary-700)' }}>{isRu ? source.ru : source.uz}</Link> : isRu ? source.ru : source.uz}
                          </div>
                        )}
                      </td>
                      <td className="ux-cell-block" style={{ padding: '12px' }}>
                        {lines.map((line, idx) => (
                          <div key={idx} className="ux-journal-line" style={{ padding: idx ? '6px 0 0' : 0 }}>
                            <span><abbr title={isRu ? 'Дебет' : 'Debet'} style={{ textDecoration: 'none', color: 'var(--color-text-secondary)' }}>Dt</abbr> {accountName(line.debitAccount)}</span>
                            <span><abbr title={isRu ? 'Кредит' : 'Kredit'} style={{ textDecoration: 'none', color: 'var(--color-text-secondary)' }}>Kt</abbr> {accountName(line.creditAccount)}</span>
                            <span className="tabular-nums" style={{ textAlign: 'right', fontWeight: 'var(--font-semibold)', whiteSpace: 'nowrap' }}>
                              {formatCurrency(Number(line.amount), locale, LEDGER_CURRENCY)}
                            </span>
                          </div>
                        ))}
                      </td>
                    </tr>
                  );
                  }),
                ])}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
