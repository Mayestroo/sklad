'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { PieChart, ShieldCheck, Printer, FileText } from 'lucide-react';

export default function FinancialReportsPage() {
  const tCommon = useTranslations('common');
  const locale = useLocale() as 'uz' | 'ru';
  const { token, company } = useAuth();

  const [statements, setStatements] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !company) return;
    setLoading(true);
    apiFetch<any>('/accounting/reports/statements', { token, tenantId: company.id, locale })
      .then(setStatements)
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [token, company]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            Moliyaviy Hisobotlar (Shakl 1 va Shakl 2)
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
            O&apos;zbekiston NAS / BHMS standartlariga mos Balans (Forma 1) va Moliyaviy Natijalar (Forma 2)
          </p>
        </div>

        <Button variant="primary" onClick={() => window.print()}>
          <Printer size={16} /> Chop etish (Print Report)
        </Button>
      </div>

      {loading ? (
        <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
          {tCommon('loading')}
        </div>
      ) : !statements ? (
        <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
          Hisobotlar topilmadi
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
          {/* Form 1: Balance Sheet */}
          <Card>
            <div style={{ borderBottom: '2px solid var(--color-primary-600)', paddingBottom: 'var(--space-3)', marginBottom: 'var(--space-4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)' }}>
                {locale === 'uz' ? 'SHAKL 1: BALANS HISOBOTI' : 'ФОРМА 1: БАЛАНСОВЫЙ ОТЧЁТ'}
              </h3>
              {statements.balanceSheet.isBalanced ? (
                <Badge variant="success">Aktiv = Passiv (Teng)</Badge>
              ) : (
                <Badge variant="error">Muvozanatda emas</Badge>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
              <div style={{ padding: '12px', backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>I. JAMI AKTIVLAR (ASSETS)</div>
                <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-primary-600)', marginTop: '4px' }} className="tabular-nums">
                  {formatCurrency(Number(statements.balanceSheet.totalAssets), locale)}
                </div>
              </div>

              <div style={{ padding: '12px', backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>II. MAJBURIYATLAR (LIABILITIES)</div>
                <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-semibold)', color: 'var(--color-warning-600)', marginTop: '4px' }} className="tabular-nums">
                  {formatCurrency(Number(statements.balanceSheet.totalLiabilities), locale)}
                </div>
              </div>

              <div style={{ padding: '12px', backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>III. XUSUSIY KAPITAL / SOF FOYDA (EQUITY)</div>
                <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-semibold)', color: 'var(--color-success-600)', marginTop: '4px' }} className="tabular-nums">
                  {formatCurrency(Number(statements.balanceSheet.totalEquity), locale)}
                </div>
              </div>

              <div style={{ borderTop: '2px solid var(--color-border)', paddingTop: 'var(--space-3)', display: 'flex', justifyContent: 'space-between', fontWeight: 'var(--font-bold)' }}>
                <span>JAMI PASSIVLAR:</span>
                <span className="tabular-nums">{formatCurrency(Number(statements.balanceSheet.totalLiabilities) + Number(statements.balanceSheet.totalEquity), locale)}</span>
              </div>
            </div>
          </Card>

          {/* Form 2: Profit & Loss Statement */}
          <Card>
            <div style={{ borderBottom: '2px solid var(--color-success-600)', paddingBottom: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
              <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)' }}>
                {locale === 'uz' ? 'SHAKL 2: MOLIYAVIY NATIJALAR (P&L)' : 'ФОРМА 2: ОТЧЁТ О ФИНАНСОВЫХ РЕЗУЛЬТАТАХ'}
              </h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--color-border-light)' }}>
                <span>1. Sotuvdan daromad (Net Revenue - Schyot 9010):</span>
                <strong className="tabular-nums" style={{ color: 'var(--color-success-600)' }}>
                  {formatCurrency(Number(statements.profitLoss.totalRevenue), locale)}
                </strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--color-border-light)' }}>
                <span>2. Sotilgan tovarlar tannarxi (COGS - Schyot 9110):</span>
                <strong className="tabular-nums" style={{ color: 'var(--color-error-600)' }}>
                  - {formatCurrency(Number(statements.profitLoss.totalCogs), locale)}
                </strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', backgroundColor: 'var(--color-primary-50)', borderRadius: 'var(--radius-md)', fontWeight: 'var(--font-bold)', color: 'var(--color-primary-600)' }}>
                <span>YALPI FOYDA (GROSS PROFIT):</span>
                <span className="tabular-nums">{formatCurrency(Number(statements.profitLoss.grossProfit), locale)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', backgroundColor: 'var(--color-success-50)', borderRadius: 'var(--radius-md)', fontWeight: 'var(--font-bold)', fontSize: 'var(--text-base)', color: 'var(--color-success-600)', marginTop: 'var(--space-4)' }}>
                <span>SOF FOYDA (NET PROFIT):</span>
                <span className="tabular-nums">{formatCurrency(Number(statements.profitLoss.netProfit), locale)}</span>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
