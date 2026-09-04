'use client';

import React, { useState } from 'react';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  Printer,
  CheckCircle2,
  XCircle,
  Edit,
  DollarSign,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Wallet,
} from 'lucide-react';

interface ServiceActDetailsModalProps {
  act: any;
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onEdit: (act: any) => void;
  onPrint: (act: any) => void;
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

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quick Finance Payment Modal state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentComment, setPaymentComment] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  if (!act) return null;

  const total = Number(act.totalAmount) || 0;
  const paid = Number(act.paidAmount) || 0;
  const remaining = Math.max(0, total - paid);
  const progressPercent = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;

  const isDraft = act.status === 'DRAFT';
  const isPosted = act.status === 'POSTED';
  const isCancelled = act.status === 'CANCELLED';
  const isProvided = act.type === 'PROVIDED';

  // Handle Post
  const handlePost = async () => {
    if (!window.confirm(isRu ? 'Вы уверены, что хотите провести данный акт?' : 'Ushbu aktni tasdiqlamoqchimisiz? Kontragent balansi va provodkalar shakllanadi.')) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await apiFetch(`/services/${act.id}/post`, { method: 'POST' });
      onRefresh();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Tasdiqlashda xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  // Handle Cancel
  const handleCancel = async () => {
    if (!window.confirm(isRu ? 'Вы уверены, что хотите отменить этот акт?' : 'Ushbu aktni bekor qilmoqchimisiz? Kontragent qarzi va provodkalar bekor qilinadi.')) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await apiFetch(`/services/${act.id}/cancel`, { method: 'POST' });
      onRefresh();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Bekor qilishda xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  // Open Finance Payment Dialog
  const handleOpenPayment = async () => {
    setPaymentAmount(remaining);
    setPaymentComment(
      isProvided
        ? `Xizmat to'lovi: Akt № ${act.actNumber}`
        : `Xizmat uchun to'lov: Akt № ${act.actNumber}`,
    );
    setPaymentError(null);
    setIsPaymentModalOpen(true);

    try {
      const res = await apiFetch<any[]>('/finance/accounts');
      if (res && Array.isArray(res)) {
        setAccounts(res);
        if (res.length > 0) {
          setSelectedAccountId(res[0].id);
        }
      }
    } catch {
      // ignore
    }
  };

  // Submit payment to Finance module API
  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccountId) {
      setPaymentError(isRu ? 'Выберите кассу/счет' : 'Iltimos, kassani tanlang');
      return;
    }
    if (paymentAmount <= 0) {
      setPaymentError(isRu ? 'Сумма должна быть больше 0' : 'Summa 0 dan katta bo\'lishi kerak');
      return;
    }

    setPaymentLoading(true);
    setPaymentError(null);

    try {
      const endpoint = isProvided ? '/finance/income' : '/finance/expense';
      await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          accountId: selectedAccountId,
          counterpartyId: act.counterpartyId,
          amount: paymentAmount,
          currency: act.currency || 'UZS',
          sourceDocType: 'ServiceAct',
          sourceDocId: act.id,
          comment: paymentComment,
        }),
      });

      setIsPaymentModalOpen(false);
      onRefresh();
      onClose();
    } catch (err: any) {
      setPaymentError(err.message || 'To\'lovni kiritishda xatolik');
    } finally {
      setPaymentLoading(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`${isRu ? 'Акт услуг' : 'Xizmatlar dalolatnomasi'} № ${act.actNumber}`}
        size="lg"
      >
        <div className="space-y-6">
          {/* Top Status Banner */}
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <span className="text-xs text-gray-500 font-medium uppercase">
              {isRu ? 'Операционный статус документа' : 'Hujjatning operatsion holati'}
            </span>
            <Badge
              variant={
                act.status === 'POSTED'
                  ? 'success'
                  : act.status === 'DRAFT'
                  ? 'warning'
                  : 'error'
              }
            >
              {act.status === 'POSTED'
                ? isRu ? 'Проведён' : 'Tasdiqlangan'
                : act.status === 'DRAFT'
                ? isRu ? 'Черновик' : 'Qoralama'
                : isRu ? 'Отменён' : 'Bekor qilingan'}
            </Badge>
          </div>
          {error && (
            <div className="flex items-center gap-2 p-3 text-sm text-red-700 bg-red-50 rounded-md border border-red-200">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Top Info Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 bg-gray-50 rounded border border-gray-200">
              <span className="text-[11px] text-gray-500 block uppercase">
                {isRu ? 'Тип' : 'Xizmat turi'}
              </span>
              <span className="font-semibold text-sm flex items-center gap-1.5 mt-0.5">
                {isProvided ? (
                  <>
                    <ArrowUpRight className="w-4 h-4 text-green-600" />
                    <span>{isRu ? 'Оказанная' : 'Ko\'rsatilgan'}</span>
                  </>
                ) : (
                  <>
                    <ArrowDownRight className="w-4 h-4 text-blue-600" />
                    <span>{isRu ? 'Полученная' : 'Olingan'}</span>
                  </>
                )}
              </span>
            </div>

            <div className="p-3 bg-gray-50 rounded border border-gray-200">
              <span className="text-[11px] text-gray-500 block uppercase">
                {isProvided ? (isRu ? 'Клиент' : 'Mijoz') : (isRu ? 'Поставщик' : 'Yetkazib beruvchi')}
              </span>
              <span className="font-semibold text-sm mt-0.5 truncate block" title={act.counterparty?.name}>
                {act.counterparty?.name || '—'}
              </span>
            </div>

            <div className="p-3 bg-gray-50 rounded border border-gray-200">
              <span className="text-[11px] text-gray-500 block uppercase">
                {isRu ? 'Дата акта' : 'Sana'}
              </span>
              <span className="font-semibold text-sm mt-0.5 block">
                {formatDate(act.actDate, locale)}
              </span>
            </div>

            <div className="p-3 bg-gray-50 rounded border border-gray-200">
              <span className="text-[11px] text-gray-500 block uppercase">
                {isRu ? 'Статус оплаты' : 'To\'lov holati'}
              </span>
              <div className="mt-1">
                <Badge
                  variant={
                    act.paymentStatus === 'PAID'
                      ? 'success'
                      : act.paymentStatus === 'PARTIALLY_PAID'
                      ? 'warning'
                      : 'neutral'
                  }
                >
                  {act.paymentStatus === 'PAID'
                    ? isRu ? 'Оплачен' : 'To\'langan'
                    : act.paymentStatus === 'PARTIALLY_PAID'
                    ? isRu ? 'Частично' : 'Qisman to\'langan'
                    : isRu ? 'Не оплачен' : 'To\'lanmagan'}
                </Badge>
              </div>
            </div>
          </div>

          {/* Payment Progress Bar */}
          <div className="p-4 rounded-lg bg-gray-50 border border-gray-200 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-medium text-gray-700">
                {isRu ? 'Ход оплаты (Moliya so\'ndiruvi):' : 'To\'lov holati (Moliya so\'ndiruvi):'}
              </span>
              <span className="font-bold text-gray-900">{progressPercent}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-2.5 rounded-full transition-all duration-300 ${
                  progressPercent >= 100
                    ? 'bg-green-600'
                    : progressPercent > 0
                    ? 'bg-amber-500'
                    : 'bg-gray-300'
                }`}
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
            <div className="flex justify-between items-center text-xs text-gray-600 pt-1">
              <span>
                {isRu ? 'Оплачено: ' : 'To\'langan: '}
                <strong className="text-green-700">
                  {formatCurrency(paid, locale, act.currency)}
                </strong>
              </span>
              <span>
                {isRu ? 'Остаток долга: ' : 'Qarz qoldig\'i: '}
                <strong className={remaining > 0 ? 'text-red-700' : 'text-gray-700'}>
                  {formatCurrency(remaining, locale, act.currency)}
                </strong>
              </span>
            </div>
          </div>

          {/* Items Table */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-gray-700 uppercase">
              {isRu ? 'Позиции акта' : 'Xizmat qatorlari'} ({act.items?.length || 0})
            </h4>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-100 text-gray-700">
                  <tr>
                    <th className="p-2.5 w-8 text-center">№</th>
                    <th className="p-2.5">{isRu ? 'Услуга' : 'Xizmat nomi'}</th>
                    <th className="p-2.5 w-20 text-center">{isRu ? 'Ед. изм.' : 'Birlik'}</th>
                    <th className="p-2.5 w-16 text-right">{isRu ? 'Кол-во' : 'Miqdor'}</th>
                    <th className="p-2.5 w-24 text-right">{isRu ? 'Цена' : 'Narx'}</th>
                    <th className="p-2.5 w-20 text-right">{isRu ? 'НДС' : 'QQS'}</th>
                    <th className="p-2.5 w-28 text-right">{isRu ? 'Итого' : 'Jami'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {act.items?.map((item: any, idx: number) => (
                    <tr key={item.id || idx} className="hover:bg-gray-50/50">
                      <td className="p-2.5 text-center text-gray-500">{idx + 1}</td>
                      <td className="p-2.5">
                        <span className="font-medium text-gray-900">{item.serviceName}</span>
                        {item.description && (
                          <p className="text-gray-500 text-[11px] mt-0.5">{item.description}</p>
                        )}
                      </td>
                      <td className="p-2.5 text-center text-gray-600">{item.unit || 'dona'}</td>
                      <td className="p-2.5 text-right font-medium">{Number(item.quantity)}</td>
                      <td className="p-2.5 text-right">
                        {formatCurrency(Number(item.unitPrice), locale, act.currency)}
                      </td>
                      <td className="p-2.5 text-right text-gray-600">
                        {Number(item.vatRate)}%
                      </td>
                      <td className="p-2.5 text-right font-semibold text-gray-900">
                        {formatCurrency(Number(item.lineTotal), locale, act.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 font-medium">
                  <tr>
                    <td colSpan={5} className="p-2.5 text-right text-gray-600">
                      {isRu ? 'Сумма без НДС:' : 'QQSsiz summa:'}
                    </td>
                    <td colSpan={2} className="p-2.5 text-right">
                      {formatCurrency(Number(act.subtotal), locale, act.currency)}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={5} className="p-2.5 text-right text-gray-600">
                      {isRu ? 'Сумма НДС:' : 'QQS summasi:'}
                    </td>
                    <td colSpan={2} className="p-2.5 text-right">
                      {formatCurrency(Number(act.vatAmount), locale, act.currency)}
                    </td>
                  </tr>
                  <tr className="border-t border-gray-300 font-bold text-sm">
                    <td colSpan={5} className="p-2.5 text-right text-gray-900">
                      {isRu ? 'ИТОГО К НАЧИСЛЕНИЮ:' : 'JAMI HISOB-KITOB SUMMASI:'}
                    </td>
                    <td colSpan={2} className="p-2.5 text-right text-blue-700">
                      {formatCurrency(Number(act.totalAmount), locale, act.currency)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Linked Finance Transactions History */}
          {act.payments && act.payments.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-gray-700 uppercase flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-blue-600" />
                <span>{isRu ? 'Связанные платежи (Модуль Финансы)' : 'Bog\'langan moliya to\'lovlari'}</span>
              </h4>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-100 text-gray-700">
                    <tr>
                      <th className="p-2">{isRu ? 'Дата' : 'Sana'}</th>
                      <th className="p-2">{isRu ? 'Касса / Счет' : 'Kassa / Hisob'}</th>
                      <th className="p-2">{isRu ? 'Примечание' : 'Izoh'}</th>
                      <th className="p-2 text-right">{isRu ? 'Сумма' : 'Summa'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {act.payments.map((p: any) => (
                      <tr key={p.id}>
                        <td className="p-2">{formatDate(p.transactionDate, locale)}</td>
                        <td className="p-2 font-medium">
                          {typeof p.account?.name === 'object'
                            ? p.account.name[locale] || p.account.name.uz
                            : p.account?.name || 'Kassa'}
                        </td>
                        <td className="p-2 text-gray-500">{p.comment || '—'}</td>
                        <td className="p-2 text-right font-bold text-green-700">
                          {formatCurrency(Number(p.amount), locale, p.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {act.notes && (
            <div className="p-3 bg-gray-50 rounded border border-gray-200 text-xs">
              <span className="font-semibold text-gray-700 block mb-0.5">
                {isRu ? 'Примечание:' : 'Izoh:'}
              </span>
              <p className="text-gray-600">{act.notes}</p>
            </div>
          )}

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-gray-200">
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onPrint(act)}
                className="flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                {isRu ? 'Печать' : 'Chop etish'}
              </Button>

              {isDraft && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    onClose();
                    onEdit(act);
                  }}
                  className="flex items-center gap-1.5"
                >
                  <Edit className="w-4 h-4" />
                  {isRu ? 'Редактировать' : 'Tahrirlash'}
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isDraft && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handlePost}
                  disabled={loading}
                  className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {loading
                    ? isRu ? 'Проведение...' : 'Tasdiqlanmoqda...'
                    : isRu ? 'Провести акт' : 'Aktni tasdiqlash'}
                </Button>
              )}

              {isPosted && remaining > 0 && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleOpenPayment}
                  className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700"
                >
                  <DollarSign className="w-4 h-4" />
                  {isRu ? 'Внести платеж в Финансы' : 'Moliya to\'lovi kiritish'}
                </Button>
              )}

              {isPosted && paid === 0 && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleCancel}
                  disabled={loading}
                  className="flex items-center gap-1.5"
                >
                  <XCircle className="w-4 h-4" />
                  {isRu ? 'Отменить акт' : 'Aktni bekor qilish'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* Quick Finance Payment Sub-modal */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title={
          isProvided
            ? isRu ? 'Принять оплату от клиента (Финансы)' : 'Mijozdan to\'lov qabul qilish (Moliya)'
            : isRu ? 'Выплатить поставщику (Финансы)' : 'Yetkazib beruvchiga to\'lov qilish (Moliya)'
        }
        size="md"
      >
        <form onSubmit={handleSubmitPayment} className="space-y-4">
          {paymentError && (
            <div className="flex items-center gap-2 p-3 text-sm text-red-700 bg-red-50 rounded-md border border-red-200">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{paymentError}</span>
            </div>
          )}

          <div className="p-3 bg-blue-50 rounded border border-blue-100 text-xs text-blue-900 space-y-1">
            <p className="font-semibold">
              {isRu ? 'Акт №' : 'Dalolatnoma №'} {act.actNumber} ({act.counterparty?.name})
            </p>
            <p>
              {isRu ? 'Неоплаченный остаток: ' : 'To\'lanmagan qoldiq: '}
              <strong>{formatCurrency(remaining, locale, act.currency)}</strong>
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {isRu ? 'Касса / Банковский счет *' : 'Kassa / Bank hisobi *'}
            </label>
            <Select
              options={accounts.map((a) => ({
                value: a.id,
                label: `${typeof a.name === 'object' ? a.name[locale] || a.name.uz : a.name} (${formatCurrency(Number(a.balance), locale, a.currency)})`,
              }))}
              value={selectedAccountId}
              onChange={(val) => setSelectedAccountId(val)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {isRu ? 'Сумма платежа *' : 'To\'lov summasi *'}
            </label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              max={remaining}
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {isRu ? 'Комментарий к платежу' : 'To\'lov izohi'}
            </label>
            <Input
              type="text"
              value={paymentComment}
              onChange={(e) => setPaymentComment(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsPaymentModalOpen(false)}
              disabled={paymentLoading}
            >
              {isRu ? 'Отмена' : 'Bekor qilish'}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={paymentLoading}
              className="bg-green-600 hover:bg-green-700"
            >
              {paymentLoading
                ? isRu ? 'Проведение...' : 'Bajarilmoqda...'
                : isRu ? 'Зафиксировать в Финансах' : 'Moliyaga kirim/chiqim qilish'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
