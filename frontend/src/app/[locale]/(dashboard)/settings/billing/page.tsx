'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { LoadError } from '@/components/ui/LoadError';
import { formatCurrency, formatDate, errorMessage } from '@/lib/utils';
import { BILLING_PAYMENT_STATUS_LABELS, PAYMENT_METHOD_LABELS, statusLabel } from '@/lib/constants/statuses';
import { Card } from '@/components/ui/Card';
import { Button, buttonStyle } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton, SkeletonRows } from '@/components/ui/Skeleton';
import { toast } from '@/context/ToastContext';
import { CheckCircle, ExternalLink, Receipt, Sparkles } from 'lucide-react';
import { PricingPlan, SubscriptionPayment } from '@shared/types';
import { COMPANY_STATUS_LABELS } from '@/lib/platform-labels';

/** GET /billing/status */
interface SubscriptionStatusView {
  plan: string;
  status: string;
  daysRemaining?: number | null;
  nextBillingAt?: string | null;
}

/** POST /billing/checkout */
interface CheckoutResult {
  paymentNumber: string;
  checkoutUrl: string;
}

type PlanId = 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
type CheckoutMethod = 'CLICK' | 'PAYME';

/** Subscription or company status in words (shared list). */
const STATUS = COMPANY_STATUS_LABELS;

export default function BillingSettingsPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token, company } = useAuth();

  const plansQuery = useApiQuery<PricingPlan[]>('/billing/plans');
  const statusQuery = useApiQuery<SubscriptionStatusView>('/billing/status');
  const historyQuery = useApiQuery<SubscriptionPayment[]>('/billing/history');
  const billingQueries = [plansQuery, statusQuery, historyQuery];
  const plans = plansQuery.data ?? [];
  const subStatus = statusQuery.data ?? null;
  const payments = historyQuery.data ?? [];
  const loading = billingQueries.some((q) => q.isPending);
  const failedQuery = billingQueries.find((q) => q.isError);

  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<PlanId>('PROFESSIONAL');
  const [paymentMethod, setPaymentMethod] = useState<CheckoutMethod>('CLICK');
  const [checkoutResult, setCheckoutResult] = useState<CheckoutResult | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const planName = (id: string | undefined) => {
    const p = plans.find((x) => x.id === id);
    return p ? p.name[locale] || p.name.uz : id ?? '—';
  };
  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const status = subStatus ? STATUS[subStatus.status] : undefined;

  const handleStartCheckout = (planId: PlanId) => {
    setSelectedPlanId(planId);
    setCheckoutResult(null);
    setCheckoutModalOpen(true);
  };

  const handleExecuteCheckout = async () => {
    if (!token || !company) return;
    setCheckoutLoading(true);
    try {
      const res = await apiFetch<CheckoutResult>('/billing/checkout', {
        token,
        tenantId: company.id,
        locale,
        method: 'POST',
        body: JSON.stringify({ planId: selectedPlanId, method: paymentMethod }),
      });
      setCheckoutResult(res);
      toast.success(isRu ? `Счёт ${res.paymentNumber} сформирован` : `${res.paymentNumber} to‘lov hisobi tayyor`);
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Не удалось сформировать счёт' : 'To‘lov hisobini tayyorlab bo‘lmadi'));
    } finally {
      setCheckoutLoading(false);
    }
  };

  const th = { padding: '12px', fontWeight: 'var(--font-medium)' } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ marginBottom: 'calc(-1 * var(--space-5))' }}>
        <PageHeader
          title={isRu ? 'Тариф и оплата' : 'Tarif va to‘lov'}
          subtitle={isRu ? 'Текущий тариф, сколько дней осталось, продление и история оплат.' : 'Joriy tarif, qancha kun qolgani, uzaytirish va to‘lovlar tarixi.'}
        />
      </div>

      {failedQuery ? (
        <LoadError
          error={failedQuery.error}
          onRetry={() => billingQueries.filter((q) => q.isError).forEach((q) => void q.refetch())}
          retrying={billingQueries.some((q) => q.isFetching)}
        />
      ) : loading ? (
        <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <Card><Skeleton height={20} width="40%" /><Skeleton height={12} width="60%" style={{ marginTop: 12 }} /></Card>
          <Card><SkeletonRows rows={3} columns={3} /></Card>
        </div>
      ) : (
        <>
          <Card style={{ border: '1px solid var(--color-primary-200)', background: 'var(--color-primary-50)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', minWidth: 0 }}>
                <div aria-hidden style={{ width: 48, height: 48, flexShrink: 0, borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--color-primary-100)', color: 'var(--color-primary-700)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Sparkles size={24} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-semibold)' }}>{planName(subStatus?.plan)}</h2>
                    {subStatus && (
                      <Badge variant={status?.variant ?? 'neutral'}>{status ? (isRu ? status.ru : status.uz) : subStatus.status}</Badge>
                    )}
                  </div>
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: 4 }}>
                    {isRu ? 'Осталось дней: ' : 'Qolgan kunlar: '}
                    <strong className="tabular-nums" style={{ color: (subStatus?.daysRemaining ?? 0) <= 3 ? 'var(--color-error-700)' : 'var(--color-text-primary)' }}>
                      {subStatus?.daysRemaining ?? 0}
                    </strong>
                    {' · '}
                    {isRu ? 'Следующая оплата: ' : 'Keyingi to‘lov: '}
                    {subStatus?.nextBillingAt ? formatDate(subStatus.nextBillingAt, locale) : '—'}
                  </p>
                </div>
              </div>
              <Button variant="primary" onClick={() => handleStartCheckout(((subStatus?.plan as PlanId) || 'PROFESSIONAL'))}>
                {isRu ? 'Продлить подписку' : 'Obunani uzaytirish'}
              </Button>
            </div>
          </Card>

          <section aria-labelledby="plans-heading">
            <h2 id="plans-heading" style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-4)' }}>
              {isRu ? 'Тарифы' : 'Tariflar'}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 'var(--space-6)' }}>
              {plans.map((plan) => {
                const current = plan.id === subStatus?.plan;
                return (
                  <Card
                    key={plan.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 'var(--space-4)',
                      border: current || plan.isPopular ? '2px solid var(--color-primary-600)' : '1px solid var(--color-border)',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                        <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)' }}>{plan.name[locale] || plan.name.uz}</h3>
                        {current ? (
                          <Badge variant="info">{isRu ? 'Ваш тариф' : 'Joriy tarif'}</Badge>
                        ) : plan.isPopular ? (
                          <Badge variant="neutral">{isRu ? 'Чаще выбирают' : 'Ko‘p tanlanadi'}</Badge>
                        ) : null}
                      </div>
                      <div style={{ margin: 'var(--space-3) 0' }}>
                        <span style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)' }} className="tabular-nums">
                          {formatCurrency(plan.priceMonthly, locale, 'UZS')}
                        </span>
                        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{isRu ? ' / месяц' : ' / oyiga'}</span>
                      </div>
                      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
                        {plan.features.map((feat, idx) => (
                          <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                            <CheckCircle size={14} aria-hidden style={{ color: 'var(--color-success-700)', flexShrink: 0, marginTop: 3 }} />
                            <span>{feat[locale] || feat.uz}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <Button variant={current || plan.isPopular ? 'primary' : 'outline'} style={{ width: '100%' }} onClick={() => handleStartCheckout(plan.id)}>
                      {current ? (isRu ? 'Продлить' : 'Uzaytirish') : isRu ? 'Перейти на этот тариф' : 'Shu tarifga o‘tish'}
                    </Button>
                  </Card>
                );
              })}
            </div>
          </section>

          <Card>
            <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-4)' }}>{isRu ? 'История оплат' : 'To‘lovlar tarixi'}</h2>
            {payments.length === 0 ? (
              <EmptyState compact icon={Receipt} title={isRu ? 'Оплат пока не было' : 'Hozircha to‘lovlar yo‘q'} description={isRu ? 'Оплаченные счета за подписку появятся здесь.' : 'Obuna uchun to‘langan hisoblar shu yerda paydo bo‘ladi.'} />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="app-table-stack" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}>
                      <th scope="col" style={th}>{isRu ? '№ счёта' : 'Hisob №'}</th>
                      <th scope="col" style={th}>{isRu ? 'Дата' : 'Sana'}</th>
                      <th scope="col" style={th}>{isRu ? 'Способ' : 'Usul'}</th>
                      <th scope="col" style={{ ...th, textAlign: 'right' }}>{isRu ? 'Сумма' : 'Summa'}</th>
                      <th scope="col" style={th}>{isRu ? 'Статус' : 'Holati'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => {
                      const st = statusLabel(BILLING_PAYMENT_STATUS_LABELS, p.status, locale);
                      return (
                        <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                          <td data-primary style={{ padding: '12px', fontWeight: 'var(--font-semibold)', fontFamily: 'var(--font-mono)' }}>{p.paymentNumber}</td>
                          <td data-label={isRu ? 'Дата' : 'Sana'} style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>{formatDate(p.paidAt, locale)}</td>
                          <td data-label={isRu ? 'Способ' : 'Usul'} style={{ padding: '12px' }}>{PAYMENT_METHOD_LABELS[p.method]?.[locale] ?? p.method}</td>
                          <td data-label={isRu ? 'Сумма' : 'Summa'} style={{ padding: '12px', textAlign: 'right', fontWeight: 'var(--font-semibold)' }} className="tabular-nums">{formatCurrency(Number(p.amount), locale, 'UZS')}</td>
                          <td data-label={isRu ? 'Статус' : 'Holati'} style={{ padding: '12px' }}><Badge variant={st.variant}>{st.text}</Badge></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      <Modal
        isOpen={checkoutModalOpen}
        onClose={() => setCheckoutModalOpen(false)}
        title={isRu ? 'Оплата подписки' : 'Obuna uchun to‘lov'}
        size="sm"
        onSubmitShortcut={checkoutResult ? undefined : () => void handleExecuteCheckout()}
        footer={
          checkoutResult ? (
            <Button variant="outline" onClick={() => setCheckoutModalOpen(false)}>{isRu ? 'Закрыть' : 'Yopish'}</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setCheckoutModalOpen(false)}>{isRu ? 'Отмена' : 'Bekor qilish'}</Button>
              <Button variant="primary" onClick={() => void handleExecuteCheckout()} loading={checkoutLoading} loadingText={isRu ? 'Формируется…' : 'Tayyorlanmoqda…'}>
                {isRu ? 'Сформировать счёт' : 'To‘lov hisobini tayyorlash'}
              </Button>
            </>
          )
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <dl style={{ padding: 12, backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }}>
            <dt style={{ color: 'var(--color-text-secondary)' }}>{isRu ? 'Тариф' : 'Tarif'}</dt>
            <dd style={{ fontWeight: 'var(--font-semibold)' }}>{planName(selectedPlanId)}</dd>
            <dt style={{ color: 'var(--color-text-secondary)' }}>{isRu ? 'Сумма за месяц' : 'Oylik summa'}</dt>
            <dd style={{ fontWeight: 'var(--font-semibold)' }} className="tabular-nums">{selectedPlan ? formatCurrency(selectedPlan.priceMonthly, locale, 'UZS') : '—'}</dd>
          </dl>

          <fieldset disabled={!!checkoutResult} style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)', marginBottom: 8 }}>
              {isRu ? 'Способ оплаты' : 'To‘lov usuli'}
            </legend>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              {(['CLICK', 'PAYME'] as const).map((m) => {
                const active = paymentMethod === m;
                return (
                  <label
                    key={m}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      minHeight: 44,
                      padding: '0 12px',
                      borderRadius: 'var(--radius-md)',
                      border: active ? '2px solid var(--color-primary-600)' : '1px solid var(--color-border)',
                      backgroundColor: active ? 'var(--color-primary-50)' : 'var(--color-bg-secondary)',
                      fontWeight: 'var(--font-semibold)',
                      cursor: 'pointer',
                    }}
                  >
                    <input type="radio" name="billing-method" value={m} checked={active} onChange={() => setPaymentMethod(m)} />
                    {PAYMENT_METHOD_LABELS[m][locale]}
                  </label>
                );
              })}
            </div>
          </fieldset>

          {checkoutResult && (
            <div role="status" className="doc-banner is-info" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <span>
                {isRu
                  ? `Счёт ${checkoutResult.paymentNumber} готов. Оплатите его на странице ${PAYMENT_METHOD_LABELS[paymentMethod].ru} — подписка продлится после оплаты.`
                  : `${checkoutResult.paymentNumber} hisob tayyor. Uni ${PAYMENT_METHOD_LABELS[paymentMethod].uz} sahifasida to‘lang — obuna to‘lovdan keyin uzayadi.`}
              </span>
              <a href={checkoutResult.checkoutUrl} target="_blank" rel="noreferrer" style={{ ...buttonStyle('primary'), width: '100%' }}>
                <ExternalLink size={16} aria-hidden /> {isRu ? `Оплатить через ${PAYMENT_METHOD_LABELS[paymentMethod].ru}` : `${PAYMENT_METHOD_LABELS[paymentMethod].uz} orqali to‘lash`}
              </a>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
