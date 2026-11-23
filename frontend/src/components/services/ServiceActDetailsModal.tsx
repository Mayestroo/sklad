'use client';

import { MoneyInput } from '@/components/ui/MoneyInput';
import React, { useState } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatDate, errorMessage } from '@/lib/utils';
import { CASH_ACCOUNT_TYPE_LABELS } from '@/lib/constants/statuses';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useConfirm } from '@/context/ConfirmContext';
import { toast } from '@/context/ToastContext';
import { isCashAccountCurrencyValid } from '@shared/types/cash-account-policy';
import {
  Printer,
  CheckCircle2,
  XCircle,
  Edit,
  Trash2,
  ArrowLeft,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Wallet,
} from 'lucide-react';
import type { ServiceActDetail } from '@/lib/service-act';
import type { CashAccount } from '@shared/types';
import { unitLabel } from '@/lib/units';

interface ServiceActDetailsModalProps {
  act: ServiceActDetail;
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onEdit: (act: ServiceActDetail) => void;
  onPrint: (act: ServiceActDetail) => void;
}

export function ServiceActDetailsModal({
  act,
  isOpen,
  onClose,
  onRefresh,
  onEdit,
  onPrint,
}: ServiceActDetailsModalProps) {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const confirm = useConfirm();
  const { token, company } = useAuth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quick Finance Payment Modal state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentComment, setPaymentComment] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const matchingPaymentAccounts = accounts.filter(
    (account) => account.currency === act?.currency && isCashAccountCurrencyValid(account),
  );

  if (!act) return null;

  const total = Number(act.totalAmount) || 0;
  const paid = Number(act.paidAmount) || 0;
  const remaining = Math.max(0, total - paid);
  const progressPercent = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;

  const isDraft = act.status === 'DRAFT';
  const isPosted = act.status === 'POSTED';
  const isProvided = act.type === 'PROVIDED';

  // Handle Post
  const handlePost = async () => {
    const confirmed = await confirm({
      title: isRu ? 'Проведение акта' : 'Aktni tasdiqlash',
      description: isRu ? `Акт ${act.actNumber} будет проведён: появятся долг контрагента и проводки.` : `${act.actNumber} akt tasdiqlanadi: kontragent qarzi va provodkalar paydo bo‘ladi.`,
      variant: 'info',
      confirmText: isRu ? 'Провести' : 'Tasdiqlash',
      cancelText: isRu ? 'Отмена' : 'Bekor qilish',
    });
    if (!confirmed) return;

    setLoading(true);
    setError(null);
    try {
      await apiFetch(`/services/${act.id}/post`, {
        method: 'POST',
        token: token || undefined,
        tenantId: company?.id,
        locale,
      });
      toast.success(isRu ? `Акт ${act.actNumber} проведён` : `${act.actNumber} akt tasdiqlandi`);
      onRefresh();
      onClose();
    } catch (err) {
      const msg = errorMessage(err) || (isRu ? 'Ошибка при проведении' : 'Tasdiqlashda xatolik yuz berdi');
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Handle Cancel
  const handleCancel = async () => {
    const confirmed = await confirm({
      title: isRu ? 'Отмена акта' : 'Aktni bekor qilish',
      description: isRu
        ? 'Вы уверены, что хотите отменить этот акт? Контрагентский долг и проводки будут отменены.'
        : 'Ushbu aktni bekor qilmoqchimisiz? Kontragent qarzi va provodkalar bekor qilinadi.',
      variant: 'warning',
      confirmText: isRu ? 'Отменить акт' : 'Aktni bekor qilish',
      cancelText: isRu ? 'Не отменять' : 'Bekor qilmaslik',
    });
    if (!confirmed) return;

    setLoading(true);
    setError(null);
    try {
      await apiFetch(`/services/${act.id}/cancel`, {
        method: 'POST',
        token: token || undefined,
        tenantId: company?.id,
        locale,
      });
      toast.success(isRu ? `Акт ${act.actNumber} отменён` : `${act.actNumber} akt bekor qilindi`);
      onRefresh();
      onClose();
    } catch (err) {
      const msg = errorMessage(err) || (isRu ? 'Ошибка при отмене' : 'Bekor qilishda xatolik yuz berdi');
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Handle Unpost and Edit
  const handleUnpostAndEdit = async () => {
    const confirmed = await confirm({
      title: isRu ? 'Отмена проведения' : 'O‘tkazmani bekor qilish',
      description: isRu
        ? 'Для редактирования проведение акта будет отменено (с возвратом проводок и задолженности). Продолжить?'
        : 'Tahrirlash uchun akt o‘tkazmasi bekor qilinadi (qarz va provodkalar orqaga qaytariladi). Davom etasizmi?',
      variant: 'warning',
      confirmText: isRu ? 'Продолжить' : 'Davom etish',
      cancelText: isRu ? 'Отмена' : 'Bekor qilish',
    });
    if (!confirmed) return;

    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<ServiceActDetail>(`/services/${act.id}/unpost`, {
        method: 'POST',
        token: token || undefined,
        tenantId: company?.id,
        locale,
      });
      toast.success(isRu ? 'Проведение акта отменено' : 'Akt o‘tkazmasi bekor qilindi');
      onRefresh();
      onClose();
      onEdit(res || { ...act, status: 'DRAFT' });
    } catch (err) {
      const msg = errorMessage(err) || (isRu ? 'Ошибка отмены проведения' : 'O‘tkazmani bekor qilishda xatolik yuz berdi');
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Handle Delete from Modal
  const handleDeleteFromModal = async () => {
    const isPosted = act.status === 'POSTED';
    const confirmed = await confirm({
      title: isRu ? 'Удаление акта' : 'Aktni o‘chirish',
      description: isPosted
        ? (isRu
            ? 'Этот акт проведён. При удалении он будет автоматически отменён (с откатом проводок и задолженности) и удалён из базы. Продолжить?'
            : 'Ushbu akt tasdiqlangan. O‘chirish jarayonida u avtomatik bekor qilinadi (provodkalar va qarz orqaga qaytariladi) hamda bazadan o‘chiriladi. Davom ettirasizmi?')
        : (isRu ? `Черновик акта ${act.actNumber} будет удалён.` : `${act.actNumber} akt qoralamasi o‘chiriladi.`),
      variant: 'danger',
      confirmText: isRu ? 'Удалить' : 'O‘chirish',
      cancelText: isRu ? 'Отмена' : 'Bekor qilish',
    });

    if (!confirmed) return;

    setLoading(true);
    setError(null);
    try {
      if (isPosted) {
        await apiFetch(`/services/${act.id}/cancel`, {
          method: 'POST',
          token: token || undefined,
          tenantId: company?.id,
          locale,
        });
      }
      await apiFetch(`/services/${act.id}`, {
        method: 'DELETE',
        token: token || undefined,
        tenantId: company?.id,
        locale,
      });
      toast.success(isRu ? `Акт ${act.actNumber} удалён` : `${act.actNumber} akt o‘chirildi`);
      onRefresh();
      onClose();
    } catch (err) {
      const msg = errorMessage(err) || (isRu ? 'Ошибка удаления' : 'O‘chirishda xatolik yuz berdi');
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Payment form opens inside the same dialog (no dialog on top of a dialog).
  const handleOpenPayment = async () => {
    setPaymentAmount(remaining);
    setPaymentComment(isRu ? `Оплата по акту № ${act.actNumber}` : `${act.actNumber} akt bo‘yicha to‘lov`);
    setPaymentError(null);
    setIsPaymentModalOpen(true);
    setAccountsError(null);
    try {
      const res = await apiFetch<CashAccount[]>('/finance/accounts', { token: token || undefined, tenantId: company?.id, locale });
      if (res && Array.isArray(res)) {
        setAccounts(res);
        const matchingAccounts = res.filter((account) => account.currency === act.currency && isCashAccountCurrencyValid(account));
        setSelectedAccountId(matchingAccounts[0]?.id || '');
      }
    } catch (err) {
      setAccountsError(errorMessage(err) || (isRu ? 'Не удалось загрузить кассы' : 'Kassalarni yuklab bo‘lmadi'));
    }
  };

  const handleSubmitPayment = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!selectedAccountId) {
      setPaymentError(isRu ? 'Выберите кассу или счёт' : 'Kassa yoki hisobni tanlang');
      return;
    }
    if (!act.currency) {
      setPaymentError(isRu ? 'В документе не указана валюта' : 'Hujjat valyutasi ko‘rsatilmagan');
      return;
    }
    if (act.currency === 'USD' && (!Number.isFinite(Number(act.exchangeRate)) || Number(act.exchangeRate) <= 0)) {
      setPaymentError(isRu ? 'В акте не указан курс 1 USD к UZS' : 'Aktda 1 USD uchun UZS kursi ko‘rsatilmagan');
      return;
    }
    if (paymentAmount <= 0) {
      setPaymentError(isRu ? 'Сумма должна быть больше 0' : 'Summa 0 dan katta bo‘lishi kerak');
      return;
    }

    setPaymentLoading(true);
    setPaymentError(null);
    try {
      const endpoint = isProvided ? '/finance/income' : '/finance/expense';
      await apiFetch(endpoint, {
        method: 'POST',
        token: token || undefined,
        tenantId: company?.id,
        locale,
        body: JSON.stringify({
          accountId: selectedAccountId,
          counterpartyId: act.counterpartyId,
          amount: paymentAmount,
          currency: act.currency,
          ...(act.currency === 'USD' ? { exchangeRate: Number(act.exchangeRate) } : {}),
          sourceDocType: 'ServiceAct',
          sourceDocId: act.id,
          comment: paymentComment,
        }),
      });
      toast.success(
        isProvided
          ? isRu ? `Оплата ${formatCurrency(paymentAmount, locale, act.currency)} принята` : `${formatCurrency(paymentAmount, locale, act.currency)} to‘lov qabul qilindi`
          : isRu ? `Выплата ${formatCurrency(paymentAmount, locale, act.currency)} проведена` : `${formatCurrency(paymentAmount, locale, act.currency)} to‘lov amalga oshirildi`,
      );
      setIsPaymentModalOpen(false);
      onRefresh();
      onClose();
    } catch (err) {
      setPaymentError(errorMessage(err) || (isRu ? 'Не удалось провести оплату' : 'To‘lovni amalga oshirib bo‘lmadi'));
    } finally {
      setPaymentLoading(false);
    }
  };

  const status =
    act.status === 'POSTED'
      ? { variant: 'success' as const, text: isRu ? 'Проведён' : 'Tasdiqlangan' }
      : act.status === 'DRAFT'
        ? { variant: 'warning' as const, text: isRu ? 'Черновик' : 'Qoralama' }
        : { variant: 'error' as const, text: isRu ? 'Отменён' : 'Bekor qilingan' };
  const pay =
    act.paymentStatus === 'PAID'
      ? { variant: 'success' as const, text: isRu ? 'Оплачен' : 'To‘langan' }
      : act.paymentStatus === 'PARTIALLY_PAID'
        ? { variant: 'warning' as const, text: isRu ? 'Оплачен частично' : 'Qisman to‘langan' }
        : { variant: 'neutral' as const, text: isRu ? 'Не оплачен' : 'To‘lanmagan' };
  const cell: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid var(--color-border-light)' };
  const head: React.CSSProperties = { padding: '8px 10px', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)', borderBottom: '1px solid var(--color-border)' };
  const quietDanger: React.CSSProperties = { color: 'var(--color-error-700)', borderColor: 'var(--color-error-200)' };
  const money = (n: number | string | null | undefined) => formatCurrency(Number(n) || 0, locale, act.currency);

  const detailsFooter = (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', width: '100%' }}>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <Button variant="danger-ghost" size="sm" onClick={() => void handleDeleteFromModal()} disabled={loading}>
          <Trash2 size={14} aria-hidden /> {isRu ? 'Удалить' : 'O‘chirish'}
        </Button>
        {isPosted && paid === 0 && (
          <Button variant="outline" size="sm" onClick={() => void handleCancel()} disabled={loading} style={quietDanger}>
            <XCircle size={14} aria-hidden /> {isRu ? 'Отменить акт' : 'Aktni bekor qilish'}
          </Button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <Button variant="outline" size="sm" onClick={() => onPrint(act)}>
          <Printer size={14} aria-hidden /> {isRu ? 'Печать' : 'Chop etish'}
        </Button>
        {isDraft && (
          <Button variant="outline" size="sm" onClick={() => { onClose(); onEdit(act); }}>
            <Edit size={14} aria-hidden /> {isRu ? 'Изменить' : 'Tahrirlash'}
          </Button>
        )}
        {isPosted && paid === 0 && (
          <Button variant="outline" size="sm" onClick={() => void handleUnpostAndEdit()} disabled={loading}>
            <Edit size={14} aria-hidden /> {isRu ? 'Отменить проведение и изменить' : 'Tasdiqni bekor qilib tahrirlash'}
          </Button>
        )}
        {isDraft && (
          <Button variant="primary" size="sm" onClick={() => void handlePost()} loading={loading} loadingText={isRu ? 'Проведение…' : 'Tasdiqlanmoqda…'}>
            <CheckCircle2 size={14} aria-hidden /> {isRu ? 'Провести' : 'Tasdiqlash'}
          </Button>
        )}
        {isPosted && remaining > 0 && (
          <Button variant="primary" size="sm" onClick={() => void handleOpenPayment()}>
            <Wallet size={14} aria-hidden /> {isProvided ? (isRu ? 'Принять оплату' : 'To‘lov qabul qilish') : isRu ? 'Оплатить поставщику' : 'Yetkazib beruvchiga to‘lash'}
          </Button>
        )}
      </div>
    </div>
  );

  const paymentFooter = (
    <>
      <Button type="button" variant="outline" onClick={() => setIsPaymentModalOpen(false)} disabled={paymentLoading}>
        <ArrowLeft size={14} aria-hidden /> {isRu ? 'Назад к акту' : 'Aktga qaytish'}
      </Button>
      <Button type="submit" form="service-act-payment" variant="primary" loading={paymentLoading} loadingText={isRu ? 'Проведение…' : 'Bajarilmoqda…'} disabled={matchingPaymentAccounts.length === 0}>
        {isProvided ? (isRu ? 'Принять оплату' : 'To‘lovni qabul qilish') : isRu ? 'Оплатить' : 'To‘lash'}
      </Button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        isPaymentModalOpen
          ? isProvided ? (isRu ? `Оплата по акту ${act.actNumber}` : `${act.actNumber} akt bo‘yicha to‘lov`) : isRu ? `Выплата по акту ${act.actNumber}` : `${act.actNumber} akt bo‘yicha to‘lov`
          : isRu ? `Акт услуг ${act.actNumber}` : `${act.actNumber} xizmat akti`
      }
      size="lg"
      footer={isPaymentModalOpen ? paymentFooter : detailsFooter}
      onSubmitShortcut={isPaymentModalOpen ? () => void handleSubmitPayment() : undefined}
    >
      {isPaymentModalOpen ? (
        <form id="service-act-payment" onSubmit={handleSubmitPayment} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {(paymentError || accountsError) && (
            <div role="alert" className="doc-banner is-error" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={16} aria-hidden style={{ flexShrink: 0 }} />
              <span>{paymentError || accountsError}</span>
            </div>
          )}
          <dl style={{ padding: 12, borderRadius: 'var(--radius-md)', background: 'var(--color-bg-tertiary)', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 'var(--text-sm)' }}>
            <dt style={{ color: 'var(--color-text-secondary)' }}>{isProvided ? (isRu ? 'Клиент' : 'Mijoz') : isRu ? 'Поставщик' : 'Yetkazib beruvchi'}</dt>
            <dd style={{ fontWeight: 'var(--font-medium)' }}>{act.counterparty?.name || '—'}</dd>
            <dt style={{ color: 'var(--color-text-secondary)' }}>{isRu ? 'Осталось оплатить' : 'To‘lanmagan qoldiq'}</dt>
            <dd style={{ fontWeight: 'var(--font-semibold)' }} className="tabular-nums">{money(remaining)}</dd>
            {act.currency === 'USD' && (
              <>
                <dt style={{ color: 'var(--color-text-secondary)' }}>{isRu ? 'Курс акта' : 'Akt kursi'}</dt>
                <dd className="tabular-nums">1 USD = {Number(act.exchangeRate)} UZS</dd>
              </>
            )}
          </dl>
          {accounts.length > 0 && matchingPaymentAccounts.length === 0 ? (
            <p className="doc-banner is-warning" role="note">
              {isRu
                ? `Нет кассы или счёта в ${act.currency}. Создайте его в разделе «Финансы» — деньги разных валют не смешиваются.`
                : `${act.currency} dagi kassa yoki hisob yo‘q. Uni «Moliya» bo‘limida yarating — turli valyutadagi pullar aralashtirilmaydi.`}
            </p>
          ) : (
            <Select
              label={isRu ? 'Касса или счёт *' : 'Kassa yoki hisob *'}
              options={matchingPaymentAccounts.map((a) => ({
                value: a.id,
                label: `${typeof a.name === 'object' ? a.name[locale] || a.name.uz : a.name} (${CASH_ACCOUNT_TYPE_LABELS[a.accountType]?.[locale] ?? a.accountType}) — ${formatCurrency(Number(a.balance), locale, a.currency)}`,
              }))}
              value={selectedAccountId}
              onChange={(val) => setSelectedAccountId(val)}
              placeholder={isRu ? 'Выберите кассу' : 'Kassani tanlang'}
            />
          )}
          <div>
            <label htmlFor="service-act-pay-amount" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)', marginBottom: 4 }}>
              {isRu ? `Сумма, ${act.currency} *` : `Summa, ${act.currency} *`}
            </label>
            <MoneyInput id="service-act-pay-amount" value={paymentAmount || ''} max={remaining} onValueChange={(value) => setPaymentAmount(Number(value) || 0)} />
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 4 }}>
              {isRu ? 'Можно оплатить частично.' : 'Qisman to‘lash mumkin.'}
            </p>
          </div>
          <Input label={isRu ? 'Комментарий' : 'Izoh'} type="text" value={paymentComment} onChange={(e) => setPaymentComment(e.target.value)} />
        </form>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          {error && (
            <div role="alert" className="doc-banner is-error" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={16} aria-hidden style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 'var(--space-3)' }}>
            {[
              {
                label: isRu ? 'Вид' : 'Turi',
                value: (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {isProvided ? <ArrowUpRight size={14} aria-hidden /> : <ArrowDownRight size={14} aria-hidden />}
                    {isProvided ? (isRu ? 'Оказанная услуга' : 'Ko‘rsatilgan xizmat') : isRu ? 'Полученная услуга' : 'Olingan xizmat'}
                  </span>
                ),
              },
              { label: isProvided ? (isRu ? 'Клиент' : 'Mijoz') : isRu ? 'Поставщик' : 'Yetkazib beruvchi', value: act.counterparty?.name || '—' },
              { label: isRu ? 'Дата' : 'Sana', value: formatDate(act.actDate, locale) },
              { label: isRu ? 'Статус' : 'Holati', value: <Badge variant={status.variant}>{status.text}</Badge> },
            ].map((m) => (
              <div key={m.label} style={{ padding: 12, borderRadius: 'var(--radius-md)', background: 'var(--color-bg-tertiary)' }}>
                <dt style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{m.label}</dt>
                <dd style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-sm)', marginTop: 2, overflowWrap: 'anywhere' }}>{m.value}</dd>
              </div>
            ))}
          </dl>

          {act.status !== 'DRAFT' && (
            <div style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', background: 'var(--color-bg-tertiary)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--text-sm)' }}>
                <span style={{ fontWeight: 'var(--font-medium)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {isRu ? 'Оплата' : 'To‘lov'} <Badge variant={pay.variant}>{pay.text}</Badge>
                </span>
                <span className="tabular-nums" style={{ fontWeight: 'var(--font-semibold)' }}>{progressPercent}%</span>
              </div>
              <div role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100} aria-label={isRu ? 'Оплачено' : 'To‘langan'} style={{ height: 8, borderRadius: 'var(--radius-full)', background: 'var(--color-border)', overflow: 'hidden' }}>
                <div style={{ width: `${progressPercent}%`, height: '100%', borderRadius: 'var(--radius-full)', background: progressPercent >= 100 ? 'var(--color-success-600)' : 'var(--color-warning-500)' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                <span>{isRu ? 'Оплачено: ' : 'To‘langan: '}<strong className="tabular-nums" style={{ color: 'var(--color-text-primary)' }}>{money(paid)}</strong></span>
                <span>{isRu ? 'Осталось: ' : 'Qoldiq: '}<strong className="tabular-nums" style={{ color: remaining > 0 ? 'var(--color-error-700)' : 'var(--color-text-primary)' }}>{money(remaining)}</strong></span>
              </div>
            </div>
          )}

          <section aria-labelledby="service-act-items">
            <h3 id="service-act-items" style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', marginBottom: 8 }}>
              {isRu ? 'Услуги' : 'Xizmatlar'} ({act.items?.length || 0})
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table className="app-table-stack" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)', textAlign: 'left' }}>
                <thead>
                  <tr>
                    <th scope="col" style={head}>{isRu ? 'Услуга' : 'Xizmat'}</th>
                    <th scope="col" style={{ ...head, textAlign: 'right' }}>{isRu ? 'Количество' : 'Miqdor'}</th>
                    <th scope="col" style={{ ...head, textAlign: 'right' }}>{isRu ? 'Цена' : 'Narx'}</th>
                    <th scope="col" style={{ ...head, textAlign: 'right' }}>{isRu ? 'НДС' : 'QQS'}</th>
                    <th scope="col" style={{ ...head, textAlign: 'right' }}>{isRu ? 'Сумма' : 'Summa'}</th>
                  </tr>
                </thead>
                <tbody>
                  {act.items?.map((item, idx: number) => (
                    <tr key={item.id || idx}>
                      <td data-primary style={cell}>
                        <span style={{ fontWeight: 'var(--font-medium)' }}>{idx + 1}. {item.serviceName}</span>
                        {item.description && <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 2, fontWeight: 'var(--font-normal)' }}>{item.description}</span>}
                      </td>
                      <td data-label={isRu ? 'Количество' : 'Miqdor'} style={{ ...cell, textAlign: 'right', whiteSpace: 'nowrap' }} className="tabular-nums">{Number(item.quantity)} {unitLabel(item.unit, locale)}</td>
                      <td data-label={isRu ? 'Цена' : 'Narx'} style={{ ...cell, textAlign: 'right', whiteSpace: 'nowrap' }} className="tabular-nums">{money(item.unitPrice)}</td>
                      <td data-label={isRu ? 'НДС' : 'QQS'} style={{ ...cell, textAlign: 'right' }} className="tabular-nums">{Number(item.vatRate) ? `${Number(item.vatRate)}%` : isRu ? 'без НДС' : 'QQSsiz'}</td>
                      <td data-label={isRu ? 'Сумма' : 'Summa'} style={{ ...cell, textAlign: 'right', fontWeight: 'var(--font-semibold)', whiteSpace: 'nowrap' }} className="tabular-nums">{money(item.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl style={{ marginTop: 'var(--space-3)', marginLeft: 'auto', maxWidth: 320, display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 12px', fontSize: 'var(--text-sm)' }}>
              <dt style={{ color: 'var(--color-text-secondary)' }}>{isRu ? 'Без НДС' : 'QQSsiz'}</dt>
              <dd className="tabular-nums" style={{ textAlign: 'right' }}>{money(act.subtotal)}</dd>
              <dt style={{ color: 'var(--color-text-secondary)' }}>{isRu ? 'НДС' : 'QQS'}</dt>
              <dd className="tabular-nums" style={{ textAlign: 'right' }}>{money(act.vatAmount)}</dd>
              <dt style={{ fontWeight: 'var(--font-semibold)', borderTop: '1px solid var(--color-border)', paddingTop: 4 }}>{isRu ? 'Итого' : 'Jami'}</dt>
              <dd className="tabular-nums" style={{ textAlign: 'right', fontWeight: 'var(--font-bold)', borderTop: '1px solid var(--color-border)', paddingTop: 4 }}>{money(act.totalAmount)}</dd>
            </dl>
          </section>

          {act.payments && act.payments.length > 0 && (
            <section aria-labelledby="service-act-payments">
              <h3 id="service-act-payments" style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Wallet size={14} aria-hidden /> {isRu ? 'Оплаты' : 'To‘lovlar'}
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table className="app-table-stack" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)', textAlign: 'left' }}>
                  <thead>
                    <tr>
                      <th scope="col" style={head}>{isRu ? 'Дата' : 'Sana'}</th>
                      <th scope="col" style={head}>{isRu ? 'Касса' : 'Kassa'}</th>
                      <th scope="col" style={head}>{isRu ? 'Комментарий' : 'Izoh'}</th>
                      <th scope="col" style={{ ...head, textAlign: 'right' }}>{isRu ? 'Сумма' : 'Summa'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {act.payments.map((p) => (
                      <tr key={p.id}>
                        <td data-primary style={cell}>{formatDate(p.transactionDate, locale)}</td>
                        <td data-label={isRu ? 'Касса' : 'Kassa'} style={cell}>{typeof p.account?.name === 'object' ? p.account.name[locale] || p.account.name.uz : p.account?.name || '—'}</td>
                        <td data-label={isRu ? 'Комментарий' : 'Izoh'} style={{ ...cell, color: 'var(--color-text-secondary)' }}>{p.comment || '—'}</td>
                        <td data-label={isRu ? 'Сумма' : 'Summa'} style={{ ...cell, textAlign: 'right', fontWeight: 'var(--font-semibold)' }} className="tabular-nums">{formatCurrency(Number(p.amount), locale, p.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {act.notes && (
            <div style={{ padding: 12, borderRadius: 'var(--radius-md)', background: 'var(--color-bg-tertiary)', fontSize: 'var(--text-sm)' }}>
              <span style={{ fontWeight: 'var(--font-medium)', display: 'block', marginBottom: 2 }}>{isRu ? 'Комментарий' : 'Izoh'}</span>
              <p style={{ color: 'var(--color-text-secondary)' }}>{act.notes}</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
