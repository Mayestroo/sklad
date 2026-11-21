'use client';

import { useMemo, useState } from 'react';
import { useLocale } from 'next-intl';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { Card } from '@/components/ui/Card';
import { LoadError } from '@/components/ui/LoadError';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { SearchField, matchesSearch } from '@/components/ui/SearchField';
import { AccountTypeBadge, ACCOUNT_TYPES, accountTypeLabel } from '@/components/accounting/AccountTypeBadge';
import { BookOpen } from 'lucide-react';
import { Account } from '@shared/types';

export default function ChartOfAccountsPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const accountsQuery = useApiQuery<Account[]>('/accounting/accounts');
  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<string>('');

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of accounts) c[a.type] = (c[a.type] ?? 0) + 1;
    return c;
  }, [accounts]);

  const rows = useMemo(
    () => accounts.filter((a) => (!type || a.type === type) && matchesSearch(search, a.code, a.name.uz, a.name.ru)),
    [accounts, search, type],
  );

  const chip = (value: string, label: string, count: number) => {
    const active = type === value;
    return (
      <button
        key={value || 'all'}
        type="button"
        aria-pressed={active}
        onClick={() => setType(value)}
        style={{
          minHeight: 32,
          padding: '4px 12px',
          borderRadius: 'var(--radius-full)',
          border: `1px solid ${active ? 'var(--color-primary-600)' : 'var(--color-border)'}`,
          background: active ? 'var(--color-primary-50)' : 'var(--color-bg-secondary)',
          color: active ? 'var(--color-primary-700)' : 'var(--color-text-secondary)',
          fontSize: 'var(--text-xs)',
          fontWeight: 'var(--font-medium)',
          cursor: 'pointer',
        }}
      >
        {label} <span className="tabular-nums" style={{ opacity: 0.8 }}>{count}</span>
      </button>
    );
  };

  const th = { padding: '12px', fontWeight: 'var(--font-medium)' } as const;
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            <SearchField value={search} onChange={setSearch} placeholder={isRu ? 'Код или название счёта' : 'Hisob kodi yoki nomi'} style={{ maxWidth: 360 }} />
            <div role="group" aria-label={isRu ? 'Тип счёта' : 'Hisob turi'} style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              {chip('', isRu ? 'Все' : 'Hammasi', accounts.length)}
              {ACCOUNT_TYPES.filter((t) => counts[t]).map((t) => chip(t, accountTypeLabel(t, locale), counts[t]))}
            </div>
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
          <div style={{ overflowX: 'auto' }}>
            <table className="app-table-stack" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}>
                  <th scope="col" style={th}>{isRu ? 'Счёт' : 'Hisob'}</th>
                  <th scope="col" style={th}>{isRu ? 'Название' : 'Nomi'}</th>
                  <th scope="col" style={th}>{isRu ? 'Тип' : 'Turi'}</th>
                  <th scope="col" style={th}>{isRu ? 'Статус' : 'Holati'}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((acc) => (
                  <tr key={acc.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                    <td data-primary style={{ padding: '12px', fontWeight: 'var(--font-semibold)', fontFamily: 'var(--font-mono)' }}>{acc.code}</td>
                    <td data-label={isRu ? 'Название' : 'Nomi'} style={{ padding: '12px' }}>
                      <div style={{ fontWeight: 'var(--font-medium)' }}>{acc.name[locale] || acc.name[other]}</div>
                      {acc.name[other] && acc.name[other] !== acc.name[locale] && (
                        <div lang={other} style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 2 }}>{acc.name[other]}</div>
                      )}
                    </td>
                    <td data-label={isRu ? 'Тип' : 'Turi'} style={{ padding: '12px' }}><AccountTypeBadge type={acc.type} /></td>
                    <td data-label={isRu ? 'Статус' : 'Holati'} style={{ padding: '12px' }}>
                      {acc.isActive === false ? (
                        <Badge variant="neutral">{isRu ? 'Не используется' : 'Ishlatilmaydi'}</Badge>
                      ) : acc.isSystem ? (
                        <Badge variant="success">{isRu ? 'Системный' : 'Tizimiy'}</Badge>
                      ) : (
                        <Badge variant="info">{isRu ? 'Добавлен вручную' : 'Qo‘lda qo‘shilgan'}</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
