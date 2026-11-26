'use client';

import type { ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CheckCircle2, PieChart, XCircle } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { usePersistentState } from '@/lib/usePersistentState';
import { formatDate } from '@/lib/utils';
import { formatRange } from '@/lib/date-range';
import type { ReportDoc, ReportRow } from '@/lib/accounting-export';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadError } from '@/components/ui/LoadError';
import { Skeleton } from '@/components/ui/Skeleton';
import { AccountingShell, useAccountingView } from '@/components/accounting/AccountingShell';
import { ExportButtons, useLedgerMoney } from '@/components/accounting/AccountingParts';
import type { AccountingReport, AccountingReportType, BalanceReport, CashFlowReport, ProfitLossReport, ReportLine } from '@shared/types';

const REPORTS: AccountingReportType[] = ['profit-loss', 'balance', 'cash-flow'];

export default function ReportsPage() {
  return (
    <AccountingShell>
      <Reports />
    </AccountingShell>
  );
}

function Reports() {
  const t = useTranslations('acct');
  const { mode, periodQuery } = useAccountingView();
  const [stored, setType] = usePersistentState<AccountingReportType>('accounting.report', 'profit-loss');
  const type = REPORTS.includes(stored) ? stored : 'profit-loss';
  const q = useApiQuery<AccountingReport>(`/accounting/reports/${type}?${periodQuery}`, { keepPrevious: true });

  return (
    <>
      <div className="acct-report-picks" role="group" aria-label={t('reports.aria')}>
        {REPORTS.map((r) => (
          <button key={r} type="button" className="acct-report-pick" aria-pressed={type === r} onClick={() => setType(r)}>
            <span className="acct-report-pick-name">{mode === 'accountant' ? t(`reports.${r}_official`) : t(`reports.${r}`)}</span>
            <span className="acct-report-pick-sub">{mode === 'accountant' ? t(`reports.${r}`) : t(`reports.${r}_official`)}</span>
          </button>
        ))}
      </div>

      <Card>
        {q.isError ? (
          <LoadError error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
        ) : q.isPending || !q.data ? (
          <div role="status" aria-busy="true">
            <Skeleton height={24} width="70%" />
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} height={16} style={{ marginTop: 'var(--space-4)' }} />
            ))}
          </div>
        ) : q.data.type === 'profit-loss' ? (
          <ProfitLoss report={q.data} />
        ) : q.data.type === 'balance' ? (
          <Balance report={q.data} />
        ) : (
          <CashFlow report={q.data} />
        )}
      </Card>

      {mode === 'accountant' && (
        <Card style={{ marginTop: 'var(--space-4)' }}>
          <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-2)' }}>{t('reports.extraTitle')}</h2>
          <ul style={{ margin: 0, paddingLeft: 'var(--space-5)', display: 'grid', gap: 'var(--space-2)' }}>
            <li><Link href="/accounting" style={{ color: 'var(--color-primary-700)' }}>{t('reports.extraTb')}</Link></li>
            <li><Link href="/accounting/accounts" style={{ color: 'var(--color-primary-700)' }}>{t('reports.extraCard')}</Link></li>
            <li><Link href="/accounting/journal" style={{ color: 'var(--color-primary-700)' }}>{t('reports.extraLedger')}</Link></li>
          </ul>
        </Card>
      )}
    </>
  );
}

function useLineName() {
  const locale = useLocale() as 'uz' | 'ru';
  const { mode } = useAccountingView();
  return (line: ReportLine) => (mode === 'accountant' && line.code ? `${line.code} · ${line.name[locale]}` : line.name[locale]);
}

function Rows({ title, lines, total, totalLabel }: { title: string; lines: ReportLine[]; total?: number; totalLabel?: string }) {
  const t = useTranslations('acct');
  const money = useLedgerMoney();
  const name = useLineName();
  return (
    <div className="acct-rows">
      <h3>{title}</h3>
      {lines.length === 0 ? (
        <p className="rd-sub">{t('reports.nothing')}</p>
      ) : (
        lines.map((line, i) => (
          <div key={line.code ?? i} className="acct-rows-row">
            <span>{name(line)}</span>
            <span className="num" data-negative={line.amount < 0 || undefined}>{money.full(line.amount)}</span>
          </div>
        ))
      )}
      {total !== undefined && (
        <div className="acct-rows-row" data-strong>
          <span>{totalLabel ?? t('reports.total')}</span>
          <span className="num" data-negative={total < 0 || undefined}>{money.full(total)}</span>
        </div>
      )}
    </div>
  );
}

function Header({ summary, exportName, build }: { summary: ReactNode; exportName: string; build: () => Omit<ReportDoc, 'company' | 'footer'> }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
      <p className="acct-summary" role="status">{summary}</p>
      <ExportButtons filename={exportName} build={build} />
    </div>
  );
}

/** A titled block of a report export: the section line, its lines and its total. */
const block = (title: string, lines: ReportLine[], name: (l: ReportLine) => string, total: number, totalLabel: string): ReportRow[] => [
  { kind: 'section', cells: [title] },
  ...lines.map((l) => ({ cells: [name(l), l.amount] })),
  { kind: 'total', cells: [totalLabel, total] },
];

function useReportDoc() {
  const t = useTranslations('acct');
  return (title: string, meta: string[], rows: ReportRow[]): Omit<ReportDoc, 'company' | 'footer'> => ({
    title,
    meta: [...meta, t('export.currency')],
    columns: [
      { label: t('reports.name'), width: 55 },
      { label: t('reports.amount'), numeric: true, width: 20 },
    ],
    rows,
  });
}

function ProfitLoss({ report }: { report: ProfitLossReport }) {
  const t = useTranslations('acct');
  const doc = useReportDoc();
  const money = useLedgerMoney();
  const name = useLineName();
  const { from, to } = useAccountingView();
  if (!report.revenue.length && !report.expenses.length) return <EmptyState compact icon={PieChart} title={t('reports.nothing')} />;
  const params = { profit: money.compact(Math.abs(report.netProfit)), revenue: money.compact(report.totalRevenue), expenses: money.compact(report.totalExpenses) };
  return (
    <>
      <Header
        summary={report.netProfit < 0 ? t('reports.pnlLoss', params) : t('reports.pnlProfit', params)}
        exportName={`foyda-zarar_${from}_${to}`}
        build={() =>
          doc(t('reports.profit-loss_official'), [t('export.period', { range: formatRange(from, to) })], [
            ...block(t('reports.revenue'), report.revenue, name, report.totalRevenue, t('reports.total')),
            ...block(t('reports.expenses'), report.expenses, name, report.totalExpenses, t('reports.total')),
            { kind: 'grand', cells: [t('reports.netProfit'), report.netProfit] },
          ])
        }
      />
      <Rows title={t('reports.revenue')} lines={report.revenue} total={report.totalRevenue} />
      <Rows title={t('reports.expenses')} lines={report.expenses} total={report.totalExpenses} />
      <div className="acct-rows" style={{ marginTop: 'var(--space-3)' }}>
        <div className="acct-rows-row" data-strong>
          <span>{t('reports.netProfit')}</span>
          <span className="num" data-negative={report.netProfit < 0 || undefined}>{money.full(report.netProfit)}</span>
        </div>
      </div>
    </>
  );
}

function Balance({ report }: { report: BalanceReport }) {
  const t = useTranslations('acct');
  const doc = useReportDoc();
  const locale = useLocale();
  const money = useLedgerMoney();
  const name = useLineName();
  if (!report.assets.length && !report.liabilities.length && !report.equity.length) return <EmptyState compact icon={PieChart} title={t('reports.nothing')} />;
  return (
    <>
      <Header
        summary={t('reports.balanceSummary', { assets: money.compact(report.totalAssets), liabilities: money.compact(report.totalLiabilities), equity: money.compact(report.totalEquity) })}
        exportName={`balans_${report.periodEnd}`}
        build={() =>
          doc(t('reports.balance_official'), [t('export.asOf', { date: formatDate(report.periodEnd, locale) })], [
            ...block(t('reports.assets'), report.assets, name, report.totalAssets, t('reports.total')),
            ...block(t('reports.liabilities'), report.liabilities, name, report.totalLiabilities, t('reports.total')),
            ...block(t('reports.equity'), report.equity, name, report.totalEquity, t('reports.total')),
            { kind: 'grand', cells: [t('reports.liabilitiesEquity'), report.totalLiabilities + report.totalEquity] },
          ])
        }
      />
      <p className="rd-sub" style={{ marginTop: 0 }}>{t('reports.asOf', { date: formatDate(report.periodEnd, locale) })}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 'var(--space-6)' }}>
        <Rows title={t('reports.assets')} lines={report.assets} total={report.totalAssets} />
        <div>
          <Rows title={t('reports.liabilities')} lines={report.liabilities} total={report.totalLiabilities} />
          <Rows title={t('reports.equity')} lines={report.equity} total={report.totalEquity} />
          <div className="acct-rows">
            <div className="acct-rows-row" data-strong>
              <span>{t('reports.liabilitiesEquity')}</span>
              <span className="num">{money.full(report.totalLiabilities + report.totalEquity)}</span>
            </div>
          </div>
        </div>
      </div>
      <p className={report.isBalanced ? 'acct-tb-check' : 'doc-banner is-warning'} data-bad={!report.isBalanced || undefined} style={{ marginTop: 'var(--space-4)' }}>
        {report.isBalanced ? <CheckCircle2 size={16} aria-hidden /> : <XCircle size={16} aria-hidden />} {report.isBalanced ? t('reports.balanced') : t('reports.notBalanced')}
      </p>
    </>
  );
}

function CashFlow({ report }: { report: CashFlowReport }) {
  const t = useTranslations('acct');
  const doc = useReportDoc();
  const money = useLedgerMoney();
  const name = useLineName();
  const { from, to } = useAccountingView();
  return (
    <>
      <Header
        summary={t('reports.cashSummary', { inflow: money.compact(report.inflow), outflow: money.compact(report.outflow) })}
        exportName={`pul-harakati_${from}_${to}`}
        build={() =>
          doc(t('reports.cash-flow_official'), [t('export.period', { range: formatRange(from, to) })], [
            { kind: 'total', cells: [t('reports.opening'), report.opening] },
            ...block(t('reports.inflowBy'), report.inflowBy, name, report.inflow, t('reports.inflow')),
            ...block(t('reports.outflowBy'), report.outflowBy, name, report.outflow, t('reports.outflow')),
            { kind: 'grand', cells: [t('reports.closing'), report.closing] },
          ])
        }
      />
      <div className="acct-rows">
        <div className="acct-rows-row"><span>{t('reports.opening')}</span><span className="num">{money.full(report.opening)}</span></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 'var(--space-6)' }}>
        <Rows title={t('reports.inflowBy')} lines={report.inflowBy} total={report.inflow} totalLabel={t('reports.inflow')} />
        <Rows title={t('reports.outflowBy')} lines={report.outflowBy} total={report.outflow} totalLabel={t('reports.outflow')} />
      </div>
      <div className="acct-rows" style={{ marginTop: 'var(--space-3)' }}>
        <div className="acct-rows-row" data-strong><span>{t('reports.closing')}</span><span className="num" data-negative={report.closing < 0 || undefined}>{money.full(report.closing)}</span></div>
      </div>
    </>
  );
}
