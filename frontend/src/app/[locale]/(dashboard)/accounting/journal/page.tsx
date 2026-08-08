'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { FileText, ArrowRightLeft } from 'lucide-react';
import { JournalEntry } from '@shared/types';

export default function JournalPage() {
  const tCommon = useTranslations('common');
  const locale = useLocale() as 'uz' | 'ru';
  const { token, company } = useAuth();

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !company) return;
    setLoading(true);
    apiFetch<JournalEntry[]>('/accounting/journal', { token, tenantId: company.id, locale })
      .then(setEntries)
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [token, company]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            General Ledger — Buxgalteriya Provodkalari Jurnali
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
            Avtomatik va qo&apos;lda kiritilgan ikki yo&apos;lama debet/kredit provodkalari
          </p>
        </div>
      </div>

      <Card>
        {loading ? (
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
                        <div key={idx}>{formatCurrency(Number(line.amount), locale)}</div>
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
