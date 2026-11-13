'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { Card } from '@/components/ui/Card';
import { LoadError } from '@/components/ui/LoadError';
import { Badge } from '@/components/ui/Badge';
import { Account } from '@shared/types';

export default function ChartOfAccountsPage() {
  const tCommon = useTranslations('common');
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const accountsQuery = useApiQuery<Account[]>('/accounting/accounts');
  const accounts = accountsQuery.data ?? [];

  const getAccountTypeBadge = (type: string) => {
    switch (type) {
      case 'ASSET':
        return <Badge variant="info">Aktiv (ASSET)</Badge>;
      case 'LIABILITY':
        return <Badge variant="warning">Majburiyat (LIABILITY)</Badge>;
      case 'REVENUE':
        return <Badge variant="success">Daromad (REVENUE)</Badge>;
      case 'EXPENSE':
        return <Badge variant="error">Xarajat (EXPENSE)</Badge>;
      default:
        return <Badge variant="neutral">{type}</Badge>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', margin: 0 }}>
            {isRu ? 'План счетов (НСБУ)' : 'Hisoblar rejasi (BHMS)'}
          </h1>
        </div>
      </div>

      <Card>
        {accountsQuery.isError ? (
          <LoadError
            error={accountsQuery.error}
            onRetry={() => void accountsQuery.refetch()}
            retrying={accountsQuery.isFetching}
          />
        ) : accountsQuery.isPending ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            {tCommon('loading')}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>
                  <th style={{ padding: '12px' }}>SCHYOT KODI</th>
                  <th style={{ padding: '12px' }}>O&apos;ZBEKCHA NOMI (UZ)</th>
                  <th style={{ padding: '12px' }}>РУССКОЕ НАЗВАНИЕ (RU)</th>
                  <th style={{ padding: '12px' }}>HISOB TURI</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>HOLATI</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((acc) => (
                  <tr key={acc.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                    <td style={{ padding: '12px', fontWeight: 'var(--font-bold)', fontFamily: 'var(--font-mono)' }}>
                      {acc.code}
                    </td>
                    <td style={{ padding: '12px', fontWeight: 'var(--font-medium)' }}>
                      {acc.name.uz}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>
                      {acc.name.ru}
                    </td>
                    <td style={{ padding: '12px' }}>{getAccountTypeBadge(acc.type)}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <Badge variant="success">Tizimiy (Standard NAS)</Badge>
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
