'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Save } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/context/ToastContext';
import { apiFetch } from '@/lib/api';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { errorMessage } from '@/lib/utils';
import { LoadError } from '@/components/ui/LoadError';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';

type Method = 'LAST' | 'AVERAGE';
interface SettingsResponse {
  production?: { estimatedCostMethod?: Method };
  [key: string]: unknown;
}

/**
 * Company-wide costing setting (TZ "Ishlab chiqarish" 8.3, decision 2):
 * the actual cost is always FIFO; the estimated (card) cost follows the last
 * receipt price by default, or the average. Only an administrator changes it,
 * and the change never touches past documents.
 */
export default function ProductionSettingsPage() {
  const t = useTranslations('production');
  const query = useApiQuery<SettingsResponse>('/tenants/settings');
  if (query.isError) return <LoadError error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  if (query.isPending) {
    return <div role="status" style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>{t('sozlamalarYuklanmoqda')}</div>;
  }
  return <Form initial={query.data?.production?.estimatedCostMethod === 'AVERAGE' ? 'AVERAGE' : 'LAST'} />;
}

function Form({ initial }: { initial: Method }) {
  const locale = useLocale() as 'uz' | 'ru';
  const t = useTranslations('production');
  const { token, company, hasPermission, updateCompanySettings } = useAuth();
  const canEdit = hasPermission('settings:edit');
  const [method, setMethod] = useState<Method>(initial);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!token || !company) return;
    setSaving(true);
    try {
      const updated = await apiFetch<NonNullable<typeof company>['settings']>('/tenants/settings', {
        method: 'PATCH',
        token,
        tenantId: company.id,
        locale,
        body: JSON.stringify({ production: { estimatedCostMethod: method } }),
      });
      if (updated) updateCompanySettings(updated);
      toast.success(t('sozlamaSaqlandi'));
    } catch (error) {
      toast.error(errorMessage(error) || t('saqlabBolmadi'));
    } finally {
      setSaving(false);
    }
  };

  const options: Array<{ value: Method; title: string; text: string }> = [
    {
      value: 'LAST',
      title: t('oxirgiKirimNarxiStandart'),
      text: t('tovarKartasidagiTannarxHarBir'),
    },
    {
      value: 'AVERAGE',
      title: t('ortachaNarx'),
      text: t('kartaTannarxiOmbordagiQolganPartiyalarning'),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', maxWidth: 900 }}>
      <div style={{ marginBottom: 'calc(-1 * var(--space-5))' }}>
        <PageHeader
          title={t('tannarxSozlamasi')}
          subtitle={t('haqiqiyTannarxIshlabChiqarishVa')}
          actions={
            canEdit ? (
              <Button onClick={() => void save()} disabled={method === initial} loading={saving} loadingText={t('saqlanmoqda')}>
                <Save size={16} aria-hidden /> {t('saqlash')}
              </Button>
            ) : undefined
          }
        />
      </div>
      <Card style={{ padding: 'var(--space-6)' }}>
        <fieldset disabled={!canEdit} style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <legend style={{ fontWeight: 600, marginBottom: 12, color: 'var(--color-text-primary)' }}>{t('taxminiyTannarxTovarKartasi')}</legend>
          {options.map((option) => (
            <label
              key={option.value}
              style={{ display: 'flex', gap: 12, padding: 16, minHeight: 44, borderRadius: 'var(--radius-md)', border: `1px solid ${method === option.value ? 'var(--color-primary-500)' : 'var(--color-border-light)'}`, cursor: canEdit ? 'pointer' : 'default' }}
            >
              <input type="radio" name="estimated-cost-method" value={option.value} checked={method === option.value} onChange={() => setMethod(option.value)} style={{ width: 18, height: 18, marginTop: 2 }} />
              <span>
                <span style={{ display: 'block', fontWeight: 600, color: 'var(--color-text-primary)' }}>{option.title}</span>
                <span style={{ display: 'block', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{option.text}</span>
              </span>
            </label>
          ))}
          <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
            {canEdit
              ? t('ozgarishKeyingiKirimlardanTasirQiladi')
              : t('sozlamaniFaqatAdministratorOzgartiradi')}
          </p>
        </fieldset>
      </Card>
    </div>
  );
}
