'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  BookOpen,
  ListFilter,
  FileText,
  PieChart,
  ShieldCheck,
  TrendingUp,
  Building2,
} from 'lucide-react';
import { TrialBalanceReport } from '@shared/types';

export default function AccountingPage() {
  const tCommon = useTranslations('common');
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token, company } = useAuth();

  const [osv, setOsv] = useState<TrialBalanceReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !company) return;
    setLoading(true);
    apiFetch<TrialBalanceReport>('/accounting/reports/osv', { token, tenantId: company.id, locale })
      .then(setOsv)
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [token, company, locale]);

  const getAccountTypeBadge = (type: string) => {
    switch (type) {
      case 'ASSET':
        return <Badge variant="info">{isRu ? 'Актив (ASSET)' : 'Aktiv (ASSET)'}</Badge>;
      case 'LIABILITY':
        return <Badge variant="warning">{isRu ? 'Обязательство (LIABILITY)' : 'Majburiyat (LIABILITY)'}</Badge>;
      case 'REVENUE':
        return <Badge variant="success">{isRu ? 'Доход (REVENUE)' : 'Daromad (REVENUE)'}</Badge>;
      case 'EXPENSE':
        return <Badge variant="error">{isRu ? 'Расход (EXPENSE)' : 'Xarajat (EXPENSE)'}</Badge>;
      default:
        return <Badge variant="neutral">{type}</Badge>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            {isRu ? 'Двойная Бухгалтерия и Отчёт ОСВ (НСБУ / НСФО)' : 'Ikki Yo‘lama Buxgalteriya va OSV Hisoboti (BHMS / NAS)'}
          </h1>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <Link href="/accounting/accounts" style={{ textDecoration: 'none' }}>
            <Button variant="outline">
              <BookOpen size={16} /> {isRu ? 'План счетов' : 'Hisoblar Rejasi'}
            </Button>
          </Link>
          <Link href="/accounting/journal" style={{ textDecoration: 'none' }}>
            <Button variant="outline">
              <FileText size={16} /> {isRu ? 'Журнал проводок' : 'Provodkalar Jurnali'}
            </Button>
          </Link>
          <Link href="/accounting/reports" style={{ textDecoration: 'none' }}>
            <Button variant="primary">
              <PieChart size={16} /> {isRu ? 'Форма 1 и Форма 2' : 'Shakl 1 & Shakl 2 Hisobotlar'}
            </Button>
          </Link>
        </div>
      </div>

      {/* Trial Balance OSV Table */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', borderBottom: '1px solid var(--color-border-light)', paddingBottom: 'var(--space-3)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)' }}>
            {isRu ? `Оборотно-сальдовая ведомость (ОСВ) — ${new Date().getFullYear()} г.` : `Oborotno-Saldovaya Vedomost (OSV) — ${new Date().getFullYear()} y.`}
          </h3>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <ShieldCheck size={16} style={{ color: 'var(--color-success-600)' }} />
            <span>{isRu ? 'Автоматический сбалансированный баланс по стандартам РУз' : 'O‘zbekiston Standartlari bo‘yicha Avtomatik Balanslangan'}</span>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            {tCommon('loading')}
          </div>
        ) : !osv || osv.items.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            <div>{isRu ? 'Обороты по счетам не найдены' : 'Hisoblar bo‘yicha oborotlar topilmadi'}</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>
                  <th style={{ padding: '12px' }}>{isRu ? 'КОД СЧЁТА' : 'SCHYOT KODI'}</th>
                  <th style={{ padding: '12px' }}>{isRu ? 'НАИМЕНОВАНИЕ СЧЁТА' : 'HISOB NOMI (SCHYOT)'}</th>
                  <th style={{ padding: '12px' }}>{isRu ? 'ТИП' : 'TURI'}</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>{isRu ? 'ДЕБЕТ ОБОРОТ' : 'DEBET OBOROT'}</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>{isRu ? 'КРЕДИТ ОБОРОТ' : 'KREDIT OBOROT'}</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>{isRu ? 'КОНЕЧНОЕ САЛЬДО' : 'OXIRGI SALDO'}</th>
                </tr>
              </thead>
              <tbody>
                {osv.items.map((item) => (
                  <tr key={item.accountCode} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                    <td style={{ padding: '12px', fontWeight: 'var(--font-bold)', fontFamily: 'var(--font-mono)' }}>
                      {item.accountCode}
                    </td>
                    <td style={{ padding: '12px', fontWeight: 'var(--font-medium)' }}>
                      {item.accountName[locale] || item.accountName.ru || item.accountName.uz}
                    </td>
                    <td style={{ padding: '12px' }}>{getAccountTypeBadge(item.accountType)}</td>
                    <td style={{ padding: '12px', textAlign: 'right' }} className="tabular-nums">
                      {formatCurrency(item.debitTurnover, locale)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }} className="tabular-nums">
                      {formatCurrency(item.creditTurnover, locale)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'var(--font-bold)', color: item.closingBalance >= 0 ? 'var(--color-text-primary)' : 'var(--color-error-600)' }} className="tabular-nums">
                      {formatCurrency(item.closingBalance, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: 'var(--color-bg-tertiary)', fontWeight: 'var(--font-bold)', fontSize: 'var(--text-sm)' }}>
                  <td colSpan={3} style={{ padding: '12px' }}>{isRu ? 'ИТОГО БАЛАНС ОБОРОТОВ:' : 'JAMI OBOROTLAR BALANSI:'}</td>
                  <td style={{ padding: '12px', textAlign: 'right', color: 'var(--color-primary-600)' }} className="tabular-nums">
                    {formatCurrency(osv.totalDebitTurnover, locale)}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right', color: 'var(--color-primary-600)' }} className="tabular-nums">
                    {formatCurrency(osv.totalCreditTurnover, locale)}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>
                    {osv.totalDebitTurnover === osv.totalCreditTurnover ? (
                      <Badge variant="success">{isRu ? 'Сбалансировано' : 'Teng (Balanced)'}</Badge>
                    ) : (
                      <Badge variant="error">{isRu ? 'Не сбалансировано' : 'Teng emas'}</Badge>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
