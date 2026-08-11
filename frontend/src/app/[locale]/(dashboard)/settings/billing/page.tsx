'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import {
  CreditCard,
  CheckCircle,
  ShieldCheck,
  Zap,
  Clock,
  Sparkles,
  ExternalLink,
  ArrowRight,
} from 'lucide-react';
import { PricingPlan, SubscriptionPayment } from '@shared/types';

export default function BillingSettingsPage() {
  const tCommon = useTranslations('common');
  const locale = useLocale() as 'uz' | 'ru';
  const { token, company } = useAuth();

  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [subStatus, setSubStatus] = useState<any | null>(null);
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [loading, setLoading] = useState(true);

  // Checkout modal
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE'>('PROFESSIONAL');
  const [paymentMethod, setPaymentMethod] = useState<'CLICK' | 'PAYME' | 'BANK_TRANSFER'>('CLICK');
  const [checkoutResult, setCheckoutResult] = useState<any | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const fetchBillingData = async () => {
    if (!token || !company) return;
    setLoading(true);
    try {
      const [plansData, statusData, historyData] = await Promise.all([
        apiFetch<PricingPlan[]>('/billing/plans', { token, tenantId: company.id, locale }),
        apiFetch<any>('/billing/status', { token, tenantId: company.id, locale }),
        apiFetch<SubscriptionPayment[]>('/billing/history', { token, tenantId: company.id, locale }),
      ]);

      setPlans(plansData);
      setSubStatus(statusData);
      setPayments(historyData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBillingData();
  }, [token, company]);

  const handleStartCheckout = (planId: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE') => {
    setSelectedPlanId(planId);
    setCheckoutResult(null);
    setCheckoutModalOpen(true);
  };

  const handleExecuteCheckout = async () => {
    if (!token || !company) return;
    setCheckoutLoading(true);
    try {
      const res = await apiFetch<any>('/billing/checkout', {
        token,
        tenantId: company.id,
        locale,
        method: 'POST',
        body: JSON.stringify({
          planId: selectedPlanId,
          method: paymentMethod,
        }),
      });

      setCheckoutResult(res);
    } catch (err: any) {
      alert(err.message || 'Error processing checkout');
    } finally {
      setCheckoutLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div>
        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
          Tariflar va Obuna Sozlamalari (Billing & Subscription)
        </h1>
      </div>

      {loading ? (
        <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
          {tCommon('loading')}
        </div>
      ) : (
        <>
          {/* Current Subscription Status Card */}
          <Card style={{ background: 'linear-gradient(135deg, rgba(79,70,229,0.06) 0%, rgba(79,70,229,0.02) 100%)', border: '1px solid var(--color-primary-100)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-xl)', backgroundColor: 'var(--color-primary-100)', color: 'var(--color-primary-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Sparkles size={24} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)' }}>
                      {subStatus?.plan} Tarif Rejasi
                    </h3>
                    <Badge variant={subStatus?.status === 'ACTIVE' ? 'success' : 'warning'}>
                      {subStatus?.status === 'TRIAL' ? 'Sinov Davri (TRIAL)' : 'Faol (ACTIVE)'}
                    </Badge>
                  </div>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                    Qolgan kunlar: <strong style={{ color: 'var(--color-primary-600)' }}>{subStatus?.daysRemaining} kun</strong> | Keyingi to&apos;lov sanasi: {subStatus?.nextBillingAt ? formatDate(subStatus.nextBillingAt, locale) : '—'}
                  </p>
                </div>
              </div>

              <Button variant="primary" onClick={() => handleStartCheckout('PROFESSIONAL')}>
                <Zap size={16} /> Obunani Uzaytirish / Yangilash
              </Button>
            </div>
          </Card>

          {/* Pricing Plans Grid */}
          <div>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-4)' }}>
              Tarif Paketlari (SaaS Pricing Plans UZS)
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--space-6)' }}>
              {plans.map((plan) => (
                <Card
                  key={plan.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 'var(--space-4)',
                    position: 'relative',
                    border: plan.isPopular ? '2px solid var(--color-primary-600)' : '1px solid var(--color-border)',
                  }}
                >
                  {plan.isPopular && (
                    <div style={{ position: 'absolute', top: '-12px', right: '20px', backgroundColor: 'var(--color-primary-600)', color: '#fff', fontSize: '10px', fontWeight: 'bold', padding: '2px 10px', borderRadius: '12px' }}>
                      ENG MASHHUR (POPULAR)
                    </div>
                  )}

                  <div>
                    <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)' }}>
                      {plan.name[locale] || plan.name.uz}
                    </h3>

                    <div style={{ margin: 'var(--space-3) 0' }}>
                      <span style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-primary-600)' }} className="tabular-nums">
                        {formatCurrency(plan.priceMonthly, locale)}
                      </span>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}> / oyiga</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
                      {plan.features.map((feat, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                          <CheckCircle size={14} style={{ color: 'var(--color-success-600)', flexShrink: 0 }} />
                          <span>{feat[locale] || feat.uz}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button
                    variant={plan.isPopular ? 'primary' : 'outline'}
                    style={{ width: '100%', marginTop: 'var(--space-4)' }}
                    onClick={() => handleStartCheckout(plan.id)}
                  >
                    Ushbu Tarifni Tanlash <ArrowRight size={14} />
                  </Button>
                </Card>
              ))}
            </div>
          </div>

          {/* Payment History Table */}
          <Card style={{ marginTop: 'var(--space-4)' }}>
            <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)', marginBottom: 'var(--space-4)' }}>
              Obona To&apos;lovlari Tarixi (Billing Invoices)
            </h3>

            {payments.length === 0 ? (
              <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
                Hozircha to&apos;lovlar tarixi mavjud emas
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>
                      <th style={{ padding: '12px' }}>TO&apos;LOV №</th>
                      <th style={{ padding: '12px' }}>SANA</th>
                      <th style={{ padding: '12px' }}>TO&apos;LOV TIZIMI</th>
                      <th style={{ padding: '12px', textAlign: 'right' }}>SUMMA</th>
                      <th style={{ padding: '12px', textAlign: 'center' }}>HOLATI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                        <td style={{ padding: '12px', fontWeight: 'bold', fontFamily: 'var(--font-mono)' }}>{p.paymentNumber}</td>
                        <td style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>{formatDate(p.paidAt, locale)}</td>
                        <td style={{ padding: '12px', fontWeight: 'bold' }}>{p.method}</td>
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }} className="tabular-nums">
                          {formatCurrency(Number(p.amount), locale)}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <Badge variant={p.status === 'PAID' ? 'success' : 'neutral'}>{p.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {/* Checkout Modal */}
      <Modal isOpen={checkoutModalOpen} onClose={() => setCheckoutModalOpen(false)} title="Obuna To'lovini Amalga Oshirish">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div style={{ padding: '12px', backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)' }}>
            <div>Tanlangan Tarif: <strong style={{ color: 'var(--color-primary-600)' }}>{selectedPlanId}</strong></div>
            <div style={{ marginTop: '4px' }}>To&apos;lov Summasi: <strong>{formatCurrency(plans.find((p) => p.id === selectedPlanId)?.priceMonthly || 0, locale)}</strong></div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '8px' }}>
              To&apos;lov usulini tanlang:
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <button
                type="button"
                onClick={() => setPaymentMethod('CLICK')}
                style={{
                  padding: '12px',
                  borderRadius: 'var(--radius-md)',
                  border: paymentMethod === 'CLICK' ? '2px solid var(--color-primary-600)' : '1px solid var(--color-border)',
                  backgroundColor: paymentMethod === 'CLICK' ? 'rgba(79,70,229,0.05)' : '#fff',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: 'var(--text-sm)',
                }}
              >
                🔵 CLICK Evolution
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('PAYME')}
                style={{
                  padding: '12px',
                  borderRadius: 'var(--radius-md)',
                  border: paymentMethod === 'PAYME' ? '2px solid var(--color-primary-600)' : '1px solid var(--color-border)',
                  backgroundColor: paymentMethod === 'PAYME' ? 'rgba(79,70,229,0.05)' : '#fff',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  fontSize: 'var(--text-sm)',
                }}
              >
                🟢 PAYME Business
              </button>
            </div>
          </div>

          {checkoutResult ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
              <div style={{ padding: '12px', backgroundColor: 'var(--color-success-50)', color: 'var(--color-success-600)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)', fontWeight: 'bold' }}>
                ✓ To&apos;lov hisobi shakllantirildi (Invoiced № {checkoutResult.paymentNumber})
              </div>
              <a href={checkoutResult.checkoutUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                <Button variant="primary" style={{ width: '100%' }}>
                  <ExternalLink size={16} /> {paymentMethod} Orqali To&apos;lashga O&apos;tish
                </Button>
              </a>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              <Button type="button" variant="outline" onClick={() => setCheckoutModalOpen(false)}>Bekor qilish</Button>
              <Button type="button" variant="primary" onClick={handleExecuteCheckout} disabled={checkoutLoading}>
                {checkoutLoading ? 'Shakllanmoqda...' : 'To\'lov Hujjatini Shakllantirish'}
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
