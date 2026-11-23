'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { Card } from '@/components/ui/Card';
import { LoadError } from '@/components/ui/LoadError';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { matchesSearch } from '@/components/ui/SearchField';
import { AccountTypeBadge, ACCOUNT_TYPES, accountTypeLabel } from '@/components/accounting/AccountTypeBadge';
import { BookOpen } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { FilterBar, useFilterState } from '@/components/ui/filters';
import { Account } from '@shared/types';

const FILTER_DEFAULTS = { type: '' };

export default function ChartOfAccountsPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const ta = useTranslations('rd.acc');
  const accountsQuery = useApiQuery<Account[]>('/accounting/accounts');
  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);
  // Filters live in the URL and are remembered per user.
  const lf = useFilterState('accounts.list', FILTER_DEFAULTS);
  const search = lf.search;
  const type = lf.values.type;

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of accounts) c[a.type] = (c[a.type] ?? 0) + 1;
    return c;
  }, [accounts]);

  const rows = useMemo(
    () => accounts.filter((a) => (!type || a.type === type) && matchesSearch(search, a.code, a.name.uz, a.name.ru)),
    [accounts, search, type],
  );


  const other = locale === 'ru' ? 'uz' : 'ru';

  return (
    <div>
      <PageHeader
        title={isRu ? 'План счетов' : 'Hisoblar rejasi'}
        subtitle={
          isRu
            ? 'Счета НСБУ, на которые документы делают проводки автоматически. Изменять их не нужно.'
            : 'Hujjatlar avtomatik provodka qiladigan BHMS hisoblari. Ularni o‘zgartirish shart emas.'
        }
      />

      <Card>
        {accounts.length > 0 && (
          <div className="rd-toolbar" style={{ marginBottom: 'var(--space-4)' }}>
            <FilterBar
              state={lf}
              defs={[{ key: 'type', kind: 'segmented', label: isRu ? 'Тип счёта' : 'Hisob turi', options: ACCOUNT_TYPES.filter((t) => counts[t]).map((t) => ({ value: t, label: accountTypeLabel(t, locale), count: counts[t] })) }]}
              searchPlaceholder={isRu ? 'Код или название счёта' : 'Hisob kodi yoki nomi'}
              resultCount={rows.length}
            />
            <p className="rd-sub" style={{ marginTop: 0 }}>{ta('listHint')}</p>
          </div>
        )}

        {accountsQuery.isError ? (
          <LoadError error={accountsQuery.error} onRetry={() => void accountsQuery.refetch()} retrying={accountsQuery.isFetching} />
        ) : accountsQuery.isPending ? (
          <SkeletonRows rows={8} columns={4} />
        ) : accounts.length === 0 ? (
          <EmptyState
            compact
            icon={BookOpen}
            title={isRu ? 'План счетов пуст' : 'Hisoblar rejasi bo‘sh'}
            description={
              isRu
                ? 'Счета создаются автоматически при первом отчёте. Откройте «Бухгалтерию» или обратитесь к администратору.'
                : 'Hisoblar birinchi hisobotda avtomatik yaratiladi. «Buxgalteriya»ni oching yoki administratorga murojaat qiling.'
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState compact title={isRu ? 'Ничего не найдено' : 'Hech narsa topilmadi'} description={isRu ? 'Измените поиск или тип счёта.' : 'Qidiruv yoki hisob turini o‘zgartiring.'} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            {ACCOUNT_TYPES.filter((t) => rows.some((r) => r.type === t)).map((t) => (
              <section key={t} aria-labelledby={`acc-type-${t}`}>
                <h2 id={`acc-type-${t}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-2)' }}>
                  <AccountTypeBadge type={t} /> <span className="rd-sub" style={{ marginTop: 0 }}>{rows.filter((r) => r.type === t).length}</span>
                </h2>
                <ul className="acc-list">
                  {rows.filter((r) => r.type === t).map((acc) => (
                    <li key={acc.id}>
                      <Link href={`/accounting/journal?q=${encodeURIComponent(acc.code)}`} className="acc-item">
                        <span className="acc-code tabular-nums">{acc.code}</span>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontWeight: 'var(--font-medium)', color: 'var(--color-text-primary)' }}>{acc.name[locale] || acc.name[other]}</span>
                          {acc.name[other] && acc.name[other] !== acc.name[locale] && (
                            <span lang={other} className="rd-sub" style={{ display: 'block' }}>{acc.name[other]}</span>
                          )}
                        </span>
                        {acc.isActive === false ? (
                          <Badge variant="neutral">{isRu ? 'Не используется' : 'Ishlatilmaydi'}</Badge>
                        ) : !acc.isSystem ? (
                          <Badge variant="info">{isRu ? 'Добавлен вручную' : 'Qo‘lda qo‘shilgan'}</Badge>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
