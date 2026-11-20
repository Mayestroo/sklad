'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { LoadError } from '@/components/ui/LoadError';
import { formatCurrency } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Printer } from 'lucide-react';
import type { FinancialStatements } from '@shared/types';

export default function FinancialReportsPage() {
  const tCommon = useTranslations('common');
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const statementsQuery = useApiQuery<FinancialStatements>('/accounting/reports/statements');
  const statements = statementsQuery.data ?? null;


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', margin: 0 }}>
            {isRu ? 'Финансовые отчеты' : 'Moliyaviy hisobotlar'}
          </h1>
        </div>

        <Button variant="primary" onClick={() => window.print()}>
          <Printer size={16} /> {isRu ? 'Печать' : 'Chop etish'}
        </Button>
      </div>

      {statementsQuery.isError ? (
        <LoadError
          error={statementsQuery.error}
          onRetry={() => void statementsQuery.refetch()}
          retrying={statementsQuery.isFetching}
        />
      ) : statementsQuery.isPending ? (
        <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
          {tCommon('loading')}
        </div>
      ) : !statements ? (
        <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
          {isRu ? 'Отчётов пока нет: они появятся после первых проведённых документов.' : 'Hozircha hisobot yo‘q: birinchi o‘tkazilgan hujjatlardan keyin paydo bo‘ladi.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 'var(--space-6)' }}>
          {/* Form 1: Balance Sheet */}
          <Card>
            <div style={{ borderBottom: '2px solid var(--color-primary-600)', paddingBottom: 'var(--space-3)', marginBottom: 'var(--space-4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)' }}>
                {isRu ? 'Форма 1: Бухгалтерский баланс' : '1-shakl: Buxgalteriya balansi'}
              </h3>
              {statements.balanceSheet.isBalanced ? (
                <Badge variant="success">{isRu ? 'Актив = Пассив' : 'Aktiv = Passiv'}</Badge>
              ) : (
                <Badge variant="error">{isRu ? 'Баланс не сходится' : 'Balans teng emas'}</Badge>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
              <div style={{ padding: '12px', backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'I. Итого активы' : 'I. Jami aktivlar'}</div>
                <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-primary-600)', marginTop: '4px' }} className="tabular-nums">
                  {formatCurrency(Number(statements.balanceSheet.totalAssets), locale, statements.currency)}
                </div>
              </div>

              <div style={{ padding: '12px', backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'II. Обязательства' : 'II. Majburiyatlar'}</div>
                <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-semibold)', color: 'var(--color-warning-700)', marginTop: '4px' }} className="tabular-nums">
                  {formatCurrency(Number(statements.balanceSheet.totalLiabilities), locale, statements.currency)}
                </div>
              </div>

              <div style={{ padding: '12px', backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'III. Собственный капитал / чистая прибыль' : 'III. Xususiy kapital / sof foyda'}</div>
                <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-semibold)', color: 'var(--color-success-700)', marginTop: '4px' }} className="tabular-nums">
                  {formatCurrency(Number(statements.balanceSheet.totalEquity), locale, statements.currency)}
                </div>
              </div>

              <div style={{ borderTop: '2px solid var(--color-border)', paddingTop: 'var(--space-3)', display: 'flex', justifyContent: 'space-between', fontWeight: 'var(--font-bold)' }}>
                <span>{isRu ? 'Итого пассивы:' : 'Jami passivlar:'}</span>
                <span className="tabular-nums">{formatCurrency(Number(statements.balanceSheet.totalLiabilities) + Number(statements.balanceSheet.totalEquity), locale, statements.currency)}</span>
              </div>
            </div>
          </Card>

          {/* Form 2: Profit & Loss Statement */}
          <Card>
            <div style={{ borderBottom: '2px solid var(--color-success-600)', paddingBottom: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
              <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)' }}>
                {isRu ? 'Форма 2: Отчёт о финансовых результатах' : '2-shakl: Moliyaviy natijalar'}
              </h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--color-border-light)' }}>
                <span>{isRu ? '1. Выручка от реализации (счёт 9010):' : '1. Sotuvdan tushum (9010-schyot):'}</span>
                <strong className="tabular-nums" style={{ color: 'var(--color-success-700)' }}>
                  {formatCurrency(Number(statements.profitLoss.totalRevenue), locale, statements.currency)}
                </strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--color-border-light)' }}>
                <span>{isRu ? '2. Себестоимость реализованных товаров (счёт 9110):' : '2. Sotilgan tovarlar tannarxi (9110-schyot):'}</span>
                <strong className="tabular-nums" style={{ color: 'var(--color-error-700)' }}>
                  - {formatCurrency(Number(statements.profitLoss.totalCogs), locale, statements.currency)}
                </strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', backgroundColor: 'var(--color-primary-50)', borderRadius: 'var(--radius-md)', fontWeight: 'var(--font-bold)', color: 'var(--color-primary-600)' }}>
                <span>{isRu ? 'Валовая прибыль:' : 'Yalpi foyda:'}</span>
                <span className="tabular-nums">{formatCurrency(Number(statements.profitLoss.grossProfit), locale, statements.currency)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', backgroundColor: 'var(--color-success-50)', borderRadius: 'var(--radius-md)', fontWeight: 'var(--font-bold)', fontSize: 'var(--text-base)', color: 'var(--color-success-700)', marginTop: 'var(--space-4)' }}>
                <span>{isRu ? 'Чистая прибыль:' : 'Sof foyda:'}</span>
                <span className="tabular-nums">{formatCurrency(Number(statements.profitLoss.netProfit), locale, statements.currency)}</span>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
