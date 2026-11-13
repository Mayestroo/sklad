'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { LoadError } from '@/components/ui/LoadError';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useDefaultCurrency } from '@/hooks/useDefaultCurrency';
import { Card } from '@/components/ui/Card';
import { FileText } from 'lucide-react';
import { JournalEntry } from '@shared/types';

export default function JournalPage() {
  const tCommon = useTranslations('common');
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const defaultCurrency = useDefaultCurrency();

  const journalQuery = useApiQuery<JournalEntry[]>('/accounting/journal');
  const entries = journalQuery.data ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', margin: 0 }}>
            {isRu ? 'Журнал проводок' : 'Provodkalar jurnali'}
          </h1>
        </div>
      </div>

      <Card>
        {journalQuery.isError ? (
          <LoadError
            error={journalQuery.error}
            onRetry={() => void journalQuery.refetch()}
            retrying={journalQuery.isFetching}
          />
        ) : journalQuery.isPending ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            {tCommon('loading')}
          </div>
        ) : entries.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            <FileText size={40} style={{ margin: '0 auto var(--space-2)', opacity: 0.4 }} />
            <div>Buxgalteriya provodkalari mavjud emas</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>
                  <th style={{ padding: '12px' }}>PROVODKA №</th>
                  <th style={{ padding: '12px' }}>SANA</th>
                  <th style={{ padding: '12px' }}>IZOH / MANBA HUJJAT</th>
                  <th style={{ padding: '12px' }}>DEBET SCHYOT (Dt)</th>
                  <th style={{ padding: '12px' }}>KREDIT SCHYOT (Kt)</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>SUMMA (SO&apos;M)</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                    <td style={{ padding: '12px', fontWeight: 'var(--font-bold)', fontFamily: 'var(--font-mono)' }}>
                      {entry.entryNumber}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>
                      {formatDate(entry.createdAt, locale)}
                    </td>
                    <td style={{ padding: '12px', fontWeight: 'var(--font-medium)' }}>
                      {entry.description}
                    </td>
                    <td style={{ padding: '12px' }}>
                      {(entry.lines || []).map((line, idx) => (
                        <div key={idx} style={{ fontWeight: 'var(--font-bold)', color: 'var(--color-primary-600)', fontFamily: 'var(--font-mono)' }}>
                          Dt {line.debitAccount?.code} — {line.debitAccount?.name?.[locale] || line.debitAccount?.name?.uz}
                        </div>
                      ))}
                    </td>
                    <td style={{ padding: '12px' }}>
                      {(entry.lines || []).map((line, idx) => (
                        <div key={idx} style={{ fontWeight: 'var(--font-bold)', color: 'var(--color-warning-600)', fontFamily: 'var(--font-mono)' }}>
                          Kt {line.creditAccount?.code} — {line.creditAccount?.name?.[locale] || line.creditAccount?.name?.uz}
                        </div>
                      ))}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'var(--font-bold)' }} className="tabular-nums">
                      {(entry.lines || []).map((line, idx) => (
                        <div key={idx}>{formatCurrency(Number(line.amount), locale, (line as { currency?: string } | null | undefined)?.currency || (entry as { currency?: string } | null | undefined)?.currency || defaultCurrency)}</div>
                      ))}
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
