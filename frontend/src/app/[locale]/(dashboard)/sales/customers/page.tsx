'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import {
  Users,
  Plus,
  Building2,
  Phone,
  Mail,
  FileText,
  CreditCard,
  X,
  AlertCircle,
} from 'lucide-react';
import { Counterparty } from '@shared/types';

export default function CustomersPage() {
  const t = useTranslations('sales');
  const tCommon = useTranslations('common');
  const locale = useLocale() as 'uz' | 'ru';
  const { token, company } = useAuth();

  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [type, setType] = useState<'CUSTOMER' | 'SUPPLIER' | 'BOTH'>('CUSTOMER');
  const [name, setName] = useState('');
  const [inn, setInn] = useState('');
  const [mfo, setMfo] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankName, setBankName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');

  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Payment Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedCounterparty, setSelectedCounterparty] = useState<Counterparty | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK_TRANSFER' | 'CARD' | 'CLICK' | 'PAYME'>('BANK_TRANSFER');
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentComment, setPaymentComment] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);

  const fetchData = async () => {
    if (!token || !company) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch<Counterparty[]>('/sales/counterparties', {
        token,
        tenantId: company.id,
        locale,
      });
      setCounterparties(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token, company]);

  const handleCreateCounterparty = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !company) return;
    setCreateError(null);
    setCreateLoading(true);

    try {
      await apiFetch<any>('/sales/counterparties', {
        method: 'POST',
        token,
        tenantId: company.id,
        locale,
        body: JSON.stringify({
          type,
          name,
          inn: inn || undefined,
          mfo: mfo || undefined,
          bankAccount: bankAccount || undefined,
          bankName: bankName || undefined,
          phone: phone || undefined,
          email: email || undefined,
          address: address || undefined,
        }),
      });

      setShowModal(false);
      setName('');
      setInn('');
      setMfo('');
      setBankAccount('');
      fetchData();
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create counterparty');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleRegisterPayment = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !company || !selectedCounterparty || paymentAmount <= 0) return;
    setPaymentLoading(true);

    try {
      await apiFetch<any>('/sales/payments', {
        method: 'POST',
        token,
        tenantId: company.id,
        locale,
        body: JSON.stringify({
          counterpartyId: selectedCounterparty.id,
          method: paymentMethod,
          amount: paymentAmount,
          comment: paymentComment || undefined,
        }),
      });

      setShowPaymentModal(false);
      setSelectedCounterparty(null);
      setPaymentAmount(0);
      fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setPaymentLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            Kontragentlar Ma&apos;lumotnomasi
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
            Mijozlar, Yetkazib beruvchilar, STIR/INN (9 xonali) va MFO bank rekvizitlari
          </p>
        </div>

        <Button variant="primary" onClick={() => setShowModal(true)}>
          <Plus size={16} />
          Yangi Kontragent
        </Button>
      </div>

      {/* Directory Table */}
      <Card>
        {loading ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            {tCommon('loading')}
          </div>
        ) : counterparties.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            <Users size={40} style={{ margin: '0 auto var(--space-2)', opacity: 0.4 }} />
            <div>Kontragentlar mavjud emas</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>
                  <th style={{ padding: '12px' }}>NOMI</th>
                  <th style={{ padding: '12px' }}>TURI</th>
                  <th style={{ padding: '12px' }}>STIR (INN)</th>
                  <th style={{ padding: '12px' }}>MFO / BANK</th>
                  <th style={{ padding: '12px' }}>TELEFON / E-MAIL</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>DEBITORLIK QARZI</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>AMALLAR</th>
                </tr>
              </thead>
              <tbody>
                {counterparties.map((c) => {
                  const debt = Number(c.debtBalance);
                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                      <td style={{ padding: '12px', fontWeight: 'var(--font-semibold)' }}>{c.name}</td>
                      <td style={{ padding: '12px' }}>
                        {c.type === 'CUSTOMER' ? <Badge variant="info">Mijoz</Badge> : c.type === 'SUPPLIER' ? <Badge variant="warning">Yetkazib beruvchi</Badge> : <Badge variant="neutral">Ikkalasi</Badge>}
                      </td>
                      <td style={{ padding: '12px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{c.inn || '—'}</td>
                      <td style={{ padding: '12px', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                        {c.mfo ? `MFO: ${c.mfo}` : ''} {c.bankName ? `(${c.bankName})` : ''}
                      </td>
                      <td style={{ padding: '12px', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                        {c.phone || c.email || '—'}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'var(--font-bold)', color: debt > 0 ? 'var(--color-error-600)' : 'var(--color-success-600)' }} className="tabular-nums">
                        {formatCurrency(debt, locale)}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <Button variant="outline" size="sm" onClick={() => { setSelectedCounterparty(c); setPaymentAmount(debt > 0 ? debt : 0); setShowPaymentModal(true); }}>
                          <CreditCard size={14} /> To&apos;lov Qabul Qilish
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* New Counterparty Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 'var(--space-4)' }}>
          <div style={{ width: '100%', maxWidth: '580px', backgroundColor: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)', boxShadow: 'var(--shadow-xl)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-semibold)' }}>Yangi Kontragent (Mijoz / Yetkazib beruvchi)</h3>
              <button type="button" onClick={() => setShowModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            {createError && (
              <div style={{ padding: '10px', backgroundColor: 'var(--color-error-50)', color: 'var(--color-error-600)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-3)' }}>
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateCounterparty} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <Select
                label="Turi *"
                options={[
                  { value: 'CUSTOMER', label: 'Mijoz (Customer)' },
                  { value: 'SUPPLIER', label: 'Yetkazib beruvchi (Supplier)' },
                  { value: 'BOTH', label: 'Ikkalasi (Both)' },
                ]}
                value={type}
                onChange={(val) => setType(val as any)}
              />

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>Tashkilot / Shaxs Nomi *</label>
                <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="OOO 'Universal Trade'" style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', outline: 'none' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>STIR / INN (9 xonali)</label>
                  <input type="text" maxLength={9} value={inn} onChange={(e) => setInn(e.target.value)} placeholder="309876543" style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>Bank MFO (5 xonali)</label>
                  <input type="text" maxLength={5} value={mfo} onChange={(e) => setMfo(e.target.value)} placeholder="00440" style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', outline: 'none' }} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>Hisob Raqam (20 xonali)</label>
                <input type="text" maxLength={20} value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} placeholder="20208000900123456001" style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', outline: 'none' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>Telefon</label>
                  <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998 90 123 45 67" style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="info@company.uz" style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', outline: 'none' }} />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
                <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>{tCommon('cancel')}</Button>
                <Button type="submit" variant="primary" disabled={createLoading}>{createLoading ? tCommon('loading') : tCommon('save')}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Registration Modal */}
      {showPaymentModal && selectedCounterparty && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 'var(--space-4)' }}>
          <div style={{ width: '100%', maxWidth: '460px', backgroundColor: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)', boxShadow: 'var(--shadow-xl)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-semibold)' }}>To&apos;lovni Ro&apos;yxatga Olish</h3>
              <button type="button" onClick={() => setShowPaymentModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)' }}>
              Kontragent: <strong>{selectedCounterparty.name}</strong><br />
              Joriy Qarzdorlik: <strong style={{ color: 'var(--color-error-600)' }}>{formatCurrency(Number(selectedCounterparty.debtBalance), locale)}</strong>
            </div>

            <form onSubmit={handleRegisterPayment} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <Select
                label="To'lov Usuli"
                options={[
                  { value: 'BANK_TRANSFER', label: 'Bank O\'tkazmasi (Расчётный счёт)' },
                  { value: 'CASH', label: 'Naqd Pul (Касса)' },
                  { value: 'CARD', label: 'Plastik Karta (Uzcard / Humo)' },
                  { value: 'CLICK', label: 'Click' },
                  { value: 'PAYME', label: 'Payme' },
                ]}
                value={paymentMethod}
                onChange={(val) => setPaymentMethod(val as any)}
              />

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>To&apos;lov Summasi (So&apos;m) *</label>
                <input type="number" min={1} required value={paymentAmount} onChange={(e) => setPaymentAmount(Number(e.target.value))} style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', outline: 'none' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>Izoh</label>
                <input type="text" value={paymentComment} onChange={(e) => setPaymentComment(e.target.value)} placeholder="To'lov topshiriqnomasi №..." style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', outline: 'none' }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
                <Button type="button" variant="secondary" onClick={() => setShowPaymentModal(false)}>{tCommon('cancel')}</Button>
                <Button type="submit" variant="primary" disabled={paymentLoading}>{paymentLoading ? tCommon('loading') : 'To\'lovni Tasdiqlash'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
