'use client';

import type { ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { StatCard, StatCardGrid } from '@/components/ui/stats/StatCard';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { LoadError } from '@/components/ui/LoadError';
import { formatCurrency, formatDate, LEDGER_CURRENCY } from '@/lib/utils';
import { localIsoDate } from '@/lib/date-range';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { AccountingNav } from '@/components/accounting/AccountingNav';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { PieChart, Printer } from 'lucide-react';
import type { FinancialStatements } from '@shared/types';

function Row({ label, value, strong, tone }: { label: ReactNode; value: ReactNode; strong?: boolean; tone?: 'positive' | 'negative' }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) 0',
        borderBottom: '1px solid var(--color-border-light)',
        fontWeight: strong ? 'var(--font-semibold)' : undefined,
        fontSize: strong ? 'var(--text-base)' : 'var(--text-sm)',
      }}
    >
      <span>{label}</span>
      <span
        className="tabular-nums"
        style={{
          whiteSpace: 'nowrap',
          color: tone === 'negative' ? 'var(--color-error-700)' : tone === 'positive' ? 'var(--color-success-700)' : 'var(--color-text-primary)',
        }}
      >
        {value}
      </span>
    </div>
  );
}

export default function FinancialReportsPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const tIn = useTranslations('rd.inline');
  const tUx = useTranslations('ux');
  const trp = useTranslations('rd.reports');
  const statementsQuery = useApiQuery<FinancialStatements>('/accounting/reports/statements');
  const statements = statementsQuery.data ?? null;
  // Statements come from journal lines, which are always UZS (ADR 0006).
  const money = (n: number) => formatCurrency(Number(n), locale, LEDGER_CURRENCY);
  const empty =
    statements &&
    !statements.balanceSheet.totalAssets &&
    !statements.balanceSheet.totalLiabilities &&
    !statements.profitLoss.totalRevenue &&
    !statements.profitLoss.totalCogs;

  return (
    <div>
      <PageHeader
        title={isRu ? 'Финансовая отчётность' : 'Moliyaviy hisobotlar'}
        subtitle={
          isRu
            ? `Баланс (форма 1) и финансовые результаты (форма 2) за всё время по ${formatDate(localIsoDate(new Date()), locale)}, по проводкам журнала.`
            : `Buxgalteriya balansi (1-shakl) va moliyaviy natijalar (2-shakl), barcha davr uchun ${formatDate(localIsoDate(new Date()), locale)} gacha, jurnal provodkalari bo‘yicha.`
        }
        actions={
          statements && !empty ? (
            <Button variant="outline" onClick={() => window.print()} className="no-print">
              <Printer size={16} aria-hidden /> {isRu ? 'Печать' : 'Chop etish'}
            </Button>
          ) : undefined
        }
      />

      <AccountingNav />

      {statementsQuery.isError ? (
        <Card>
          <LoadError error={statementsQuery.error} onRetry={() => void statementsQuery.refetch()} retrying={statementsQuery.isFetching} />
        </Card>
      ) : statementsQuery.isPending ? (
        <div role="status" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 'var(--space-6)' }}>
          <span className="sr-only">{tUx('loading')}</span>
          {[0, 1].map((i) => (
            <Card key={i}>
              <Skeleton height={20} width="60%" />
              {[0, 1, 2, 3].map((r) => (
                <Skeleton key={r} height={14} style={{ marginTop: 'var(--space-4)' }} />
              ))}
            </Card>
          ))}
        </div>
      ) : !statements || empty ? (
        <Card>
          <EmptyState
            icon={PieChart}
            title={isRu ? 'Отчётов пока нет' : 'Hozircha hisobot yo‘q'}
            description={
              isRu
                ? 'Баланс и прибыль посчитаются после первых проведённых документов: прихода, продажи или оплаты.'
                : 'Balans va foyda birinchi tasdiqlangan hujjatlardan keyin hisoblanadi: kirim, sotuv yoki to‘lov.'
            }
          />
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        {/* The answer first: profit, the result line, and whether the books balance (with where to look if not) */}
        <StatCardGrid label={trp('summary')} count={3}>
          <StatCard label={statements.profitLoss.netProfit < 0 ? (isRu ? 'Чистый убыток' : 'Sof zarar') : isRu ? 'Чистая прибыль' : 'Sof foyda'} value={money(statements.profitLoss.netProfit)} negative={statements.profitLoss.netProfit < 0} secondary={trp('allTime')} />
          <StatCard label={isRu ? 'Доходы (выручка)' : 'Daromadlar (tushum)'} value={money(statements.profitLoss.totalRevenue)} secondary={trp('costs', { amount: money(statements.profitLoss.totalCogs) })} />
          <StatCard
            label={trp('balanceCheck')}
            value={statements.balanceSheet.isBalanced ? (isRu ? 'Актив = Пассив' : 'Aktiv = Passiv') : isRu ? 'Актив ≠ Пассив' : 'Aktiv ≠ Passiv'}
            negative={!statements.balanceSheet.isBalanced}
            secondary={statements.balanceSheet.isBalanced ? trp('balanced') : undefined}
          />
        </StatCardGrid>
        {!statements.balanceSheet.isBalanced && (
          <p className="rd-sub" style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', margin: 0 }}>
            <Link href="/accounting" style={{ color: 'var(--color-primary-700)', textDecoration: 'underline' }}>{trp('openOsv')}</Link>
            <Link href="/opening-balances" style={{ color: 'var(--color-primary-700)', textDecoration: 'underline' }}>{trp('openOb')}</Link>
          </p>
        )}

        {/* Where the money went: revenue split into costs and profit */}
        {Number(statements.profitLoss.totalRevenue) > 0 && (
          <Card>
            <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-3)' }}>{trp('whereTitle')}</h2>
            <div className="rp-bar" role="img" aria-label={trp('whereAria', { revenue: money(statements.profitLoss.totalRevenue), costs: money(statements.profitLoss.totalCogs), profit: money(statements.profitLoss.grossProfit) })}>
              <span className="rp-bar-costs" style={{ flexBasis: `${Math.min(100, Math.max(0, (Number(statements.profitLoss.totalCogs) / Number(statements.profitLoss.totalRevenue)) * 100))}%` }} />
              <span className="rp-bar-profit" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginTop: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
              <span><span className="rp-dot rp-dot-costs" aria-hidden /> {tIn('tannarx_va_xarajatlar')}: <strong className="tabular-nums">{money(statements.profitLoss.totalCogs)}</strong></span>
              <span><span className="rp-dot rp-dot-profit" aria-hidden /> {isRu ? 'Валовая прибыль' : 'Yalpi foyda'}: <strong className="tabular-nums">{money(statements.profitLoss.grossProfit)}</strong></span>
            </div>
          </Card>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 'var(--space-6)', alignItems: 'start' }}>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-2)' }}>
              <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-semibold)' }}>
                {isRu ? 'Форма 1. Бухгалтерский баланс' : '1-shakl. Buxgalteriya balansi'}
              </h2>
              <Badge variant={statements.balanceSheet.isBalanced ? 'success' : 'error'}>
                {statements.balanceSheet.isBalanced
                  ? isRu ? 'Актив = Пассив' : 'Aktiv = Passiv'
                  : isRu ? 'Актив ≠ Пассив' : 'Aktiv ≠ Passiv'}
              </Badge>
            </div>
            <Row strong label={isRu ? 'Актив (всего)' : 'Aktiv (jami)'} value={money(statements.balanceSheet.totalAssets)} />
            <Row label={isRu ? 'Обязательства' : 'Majburiyatlar'} value={money(statements.balanceSheet.totalLiabilities)} />
            <Row
              label={isRu ? 'Собственный капитал (прибыль)' : 'Xususiy kapital (foyda)'}
              value={money(statements.balanceSheet.totalEquity)}
              tone={statements.balanceSheet.totalEquity < 0 ? 'negative' : undefined}
            />
            <Row
              strong
              label={isRu ? 'Пассив (всего)' : 'Passiv (jami)'}
              value={money(Number(statements.balanceSheet.totalLiabilities) + Number(statements.balanceSheet.totalEquity))}
            />
            {!statements.balanceSheet.isBalanced && (
              <p role="note" className="doc-banner is-warning" style={{ marginTop: 'var(--space-4)' }}>
                {isRu
                  ? 'Актив и пассив различаются. Проверьте оборотно-сальдовую ведомость: обычно причина — начальные остатки без источника.'
                  : 'Aktiv va passiv farq qiladi. Aylanma-saldo qaydnomasini tekshiring: odatda sabab — manbasiz boshlang‘ich qoldiqlar.'}
              </p>
            )}
          </Card>

          <Card>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-2)' }}>
              {isRu ? 'Форма 2. Финансовые результаты' : '2-shakl. Moliyaviy natijalar'}
            </h2>
            <Row label={isRu ? 'Доходы (выручка)' : 'Daromadlar (tushum)'} value={money(statements.profitLoss.totalRevenue)} />
            <Row
              label={isRu ? 'Расходы (себестоимость и прочие)' : 'Xarajatlar (tannarx va boshqalar)'}
              value={`− ${money(statements.profitLoss.totalCogs)}`}
            />
            <Row
              strong
              label={isRu ? 'Валовая прибыль' : 'Yalpi foyda'}
              value={money(statements.profitLoss.grossProfit)}
              tone={statements.profitLoss.grossProfit < 0 ? 'negative' : undefined}
            />
            <Row
              strong
              label={statements.profitLoss.netProfit < 0 ? (isRu ? 'Чистый убыток' : 'Sof zarar') : isRu ? 'Чистая прибыль' : 'Sof foyda'}
              value={money(statements.profitLoss.netProfit)}
              tone={statements.profitLoss.netProfit < 0 ? 'negative' : 'positive'}
            />
          </Card>
        </div>
        </div>
      )}
    </div>
  );
}
