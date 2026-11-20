'use client';

import { quantityWithUnit, unitLabel } from '@/lib/units';
import { useState } from 'react';
import { useLocale } from 'next-intl';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { LoadError } from '@/components/ui/LoadError';
import { formatCurrency, formatUnitCost, formatPercent, formatDate, errorMessage, getLocalizedName } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Printer,
  Trash2,
  ExternalLink,
  AlertTriangle,
  TrendingDown,
  RefreshCw,
} from 'lucide-react';
import { AdditionalExpense, PurchaseDocStatus, ExpenseType } from '@shared/types';
import { useConfirm } from '@/context/ConfirmContext';
import { toast } from '@/context/ToastContext';

/** GET /purchases/additional-expenses/:id, with the COGS impact on sales already made. */
type ExpenseDetail = AdditionalExpense & {
  retroactiveSalesImpact?: Array<{ invoiceId: string; invoiceNumber: string; customerName: string; totalDeltaCogs: number }>;
};

export default function ExpenseDetailPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const { token, company } = useAuth();
  const confirm = useConfirm();

  const expenseQuery = useApiQuery<ExpenseDetail>(id ? `/purchases/additional-expenses/${id}` : null);
  const expense = expenseQuery.data ?? null;
  const loading = expenseQuery.isPending;
  const [actionLoading, setActionLoading] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);

  const fetchExpense = () => void expenseQuery.refetch();

  const handlePost = async () => {
    const confirmed = await confirm({
      title: isRu ? 'Проведение расхода' : 'Xarajatni tasdiqlash',
      description: isRu
        ? 'Провести этот расход и обновить себестоимость товаров?'
        : 'Ushbu xarajatni tasdiqlash va tovarlar tannarxini yangilashni xohlaysizmi?',
      variant: 'info',
      confirmText: isRu ? 'Провести' : 'Tasdiqlash',
      cancelText: isRu ? 'Отмена' : 'Bekor qilish',
    });
    if (!confirmed) {
      return;
    }
    setActionLoading(true);
    try {
      await apiFetch(`/purchases/additional-expenses/${id}/post`, {
        token: token || undefined,
        tenantId: company?.id || undefined,
        method: 'POST',
        locale,
      });
      toast.success(isRu ? 'Расход успешно проведен' : 'Xarajat muvaffaqiyatli tasdiqlandi');
      fetchExpense();
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Ошибка при проведении' : 'Tasdiqlashda xatolik'));
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * Saves the draft again unchanged: the server converts it once more at the
   * documents' current rates and keeps its lines. Posting asks for this when
   * the receipt or a rate changed after the draft was saved.
   */
  const handleResave = async () => {
    setActionLoading(true);
    try {
      await apiFetch(`/purchases/additional-expenses/${id}`, {
        token: token || undefined,
        tenantId: company?.id || undefined,
        method: 'PUT',
        body: JSON.stringify({}),
        locale,
      });
      toast.success(
        isRu
          ? 'Распределение пересчитано по текущим курсам — проверьте его перед проведением'
          : 'Taqsimot joriy kurslar bo‘yicha qayta hisoblandi — tasdiqlashdan oldin tekshiring',
      );
      fetchExpense();
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Ошибка при пересчёте' : 'Qayta hisoblashda xatolik'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    setActionLoading(true);
    try {
      await apiFetch(`/purchases/additional-expenses/${id}/cancel`, {
        token: token || undefined,
        tenantId: company?.id || undefined,
        method: 'POST',
        locale,
      });
      setCancelModalOpen(false);
      toast.success(isRu ? 'Расход успешно отменен' : 'Xarajat muvaffaqiyatli bekor qilindi');
      fetchExpense();
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Ошибка при отмене' : 'Bekor qilishda xatolik'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteExpense = async () => {
    const isPosted = expense?.status === 'POSTED';
    const confirmed = await confirm({
      title: isRu ? 'Удаление расхода' : 'Xarajatni o‘chirish',
      description: isPosted
        ? isRu
          ? 'Этот расход уже проведен и распределен на себестоимость товаров. При удалении он будет автоматически отменен, распределение себестоимости и долг будут откачены, после чего документ будет удален. Продолжить?'
          : 'Ushbu xarajat tasdiqlangan va tovarlar tannarxiga taqsimlangan. O‘chirish jarayonida u avtomatik bekor qilinadi, tannarx taqsimoti va qarz orqaga qaytariladi, so‘ngra hujjat butunlay o‘chiriladi. Davom ettirasizmi?'
        : isRu
        ? 'Вы уверены, что хотите удалить этот документ расхода?'
        : 'Ushbu xarajat hujjatini o‘chirishni xohlaysizmi?',
      variant: 'danger',
      confirmText: isRu ? 'Удалить' : 'O‘chirish',
      cancelText: isRu ? 'Отмена' : 'Bekor qilish',
    });

    if (!confirmed) {
      return;
    }
    setActionLoading(true);
    try {
      if (isPosted) {
        await apiFetch(`/purchases/additional-expenses/${id}/cancel`, {
          token: token || undefined,
          tenantId: company?.id || undefined,
          method: 'POST',
          locale,
        });
      }
      await apiFetch(`/purchases/additional-expenses/${id}`, {
        token: token || undefined,
        tenantId: company?.id || undefined,
        method: 'DELETE',
        locale,
      });
      toast.success(isRu ? 'Расход успешно удален' : 'Xarajat muvaffaqiyatli o‘chirildi');
      router.push(`/${locale}/purchases/expenses`);
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Ошибка при удалении' : 'O‘chirishda xatolik'));
      setActionLoading(false);
    }
  };

  const getExpenseTypeBadge = (type: ExpenseType) => {
    switch (type) {
      case 'TRANSPORT':
        return <Badge variant="warning">{isRu ? 'Транспорт' : 'Transport'}</Badge>;
      case 'CUSTOMS':
        return <Badge variant="info">{isRu ? 'Таможня' : 'Bojxona'}</Badge>;
      case 'BROKER':
        return <Badge variant="neutral">{isRu ? 'Брокер' : 'Broker'}</Badge>;
      case 'INSURANCE':
        return <Badge variant="success">{isRu ? 'Страхование' : 'Sug‘urta'}</Badge>;
      default:
        return <Badge variant="neutral">{isRu ? 'Прочее' : 'Boshqa'}</Badge>;
    }
  };

  const getStatusBadge = (status: PurchaseDocStatus) => {
    switch (status) {
      case 'DRAFT':
        return (
          <Badge variant="neutral">
            <Clock size={12} style={{ marginRight: '4px' }} />
            {isRu ? 'Черновик' : 'Qoralama'}
          </Badge>
        );
      case 'POSTED':
        return (
          <Badge variant="success">
            <CheckCircle2 size={12} style={{ marginRight: '4px' }} />
            {isRu ? 'Проведен' : 'Tasdiqlangan'}
          </Badge>
        );
      case 'CANCELLED':
        return (
          <Badge variant="error">
            <XCircle size={12} style={{ marginRight: '4px' }} />
            {isRu ? 'Отменен' : 'Bekor qilingan'}
          </Badge>
        );
      default:
        return null;
    }
  };

  if (expenseQuery.isError) {
    return (
      <Card>
        <LoadError error={expenseQuery.error} onRetry={fetchExpense} retrying={expenseQuery.isFetching} />
      </Card>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
        {isRu ? 'Загрузка расхода...' : 'Xarajat ma’lumotlari yuklanmoqda...'}
      </div>
    );
  }

  if (!expense) {
    return (
      <div style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
        <h2>{isRu ? 'Расход не найден' : 'Xarajat hujjati topilmadi'}</h2>
        <Button onClick={() => router.push(`/${locale}/purchases/expenses`)} style={{ marginTop: '12px' }}>
          {isRu ? 'Назад к списку' : 'Ro‘yxatga qaytish'}
        </Button>
      </div>
    );
  }

  // Landed costs are in the receipt's currency, expense shares in the
  // expense's, sales COGS in UZS: each is labelled with its own (ADR 0010/0023).
  const receiptCurrency = expense.receipt?.currency;
  const items = expense.items ?? [];
  const hasSnapshot = items.length > 0 && items.every((i) => i.originalCurrency != null);
  const receiptTotal = hasSnapshot
    ? Math.round(items.reduce((sum, i) => sum + Number(i.receiptAmount), 0) * 100) / 100
    : null;
  const usdRate = hasSnapshot
    ? expense.currency === 'USD'
      ? Number(items[0].expenseRate)
      : Number(items[0].receiptRate)
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      {/* Header & Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Button aria-label={isRu ? 'Назад' : 'Orqaga'} title={isRu ? 'Назад' : 'Orqaga'} variant="ghost" size="sm" onClick={() => router.push(`/${locale}/purchases/expenses`)}>
            <ArrowLeft size={16} />
          </Button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
                {expense.docNumber}
              </h1>
              {getStatusBadge(expense.status)}
              {getExpenseTypeBadge(expense.expenseType)}
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              {isRu ? 'Дата расхода:' : 'Xarajat sanasi:'} {formatDate(expense.docDate, locale)}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer size={16} style={{ marginRight: '6px' }} />
            {isRu ? 'Печать' : 'Chop etish'}
          </Button>

          {expense.status === 'DRAFT' && (
            <Button variant="outline" disabled={actionLoading} onClick={handleResave}>
              <RefreshCw size={16} style={{ marginRight: '6px' }} />
              {isRu ? 'Пересчитать и сохранить' : 'Qayta hisoblash va saqlash'}
            </Button>
          )}

          {expense.status === 'DRAFT' && (
            <Button disabled={actionLoading} onClick={handlePost}>
              <CheckCircle2 size={16} style={{ marginRight: '6px' }} />
              {isRu ? 'Провести' : 'Tasdiqlash'}
            </Button>
          )}

          {expense.status === 'POSTED' && (
            <Button variant="outline" disabled={actionLoading} onClick={() => setCancelModalOpen(true)} style={{ color: 'var(--color-danger-700)', borderColor: 'var(--color-danger-200)' }}>
              <XCircle size={16} style={{ marginRight: '6px' }} />
              {isRu ? 'Отменить проведение' : 'Bekor qilish'}
            </Button>
          )}

          <Button
            variant="outline"
            disabled={actionLoading}
            onClick={handleDeleteExpense}
            style={{ color: 'var(--color-danger-700)', borderColor: 'var(--color-danger-200)' }}
          >
            <Trash2 size={16} style={{ marginRight: '6px' }} />
            {isRu ? 'Удалить' : 'O‘chirish'}
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 'var(--space-4)' }}>
        {/* Card 1: Supplier & Receipt info */}
        <Card style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
            {isRu ? 'Услугодатель и Закупка' : 'Xizmat ko‘rsatuvchi va Xarid'}
          </div>
          <div style={{ fontSize: 'var(--text-sm)' }}>
            <div><strong>{isRu ? 'Перевозчик / Поставщик:' : 'Kontragent:'}</strong> {expense.counterparty?.name || '—'}</div>
            <div style={{ marginTop: '4px' }}>
              <strong>{isRu ? 'Связанная закупка:' : 'Bog‘langan xarid:'}</strong>{' '}
              <a
                href={`/${locale}/purchases/${expense.receiptId}`}
                style={{ color: 'var(--color-primary-600)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
              >
                {expense.receipt?.docNumber} <ExternalLink size={12} />
              </a>
            </div>
            <div style={{ marginTop: '4px' }}>
              <strong>{isRu ? 'Поставщик товара:' : 'Tovar yetkazib beruvchi:'}</strong> {expense.receipt?.counterparty?.name}
            </div>
            <div style={{ marginTop: '4px' }}>
              <strong>{isRu ? 'Склад назначения:' : 'Qabul ombori:'}</strong> {getLocalizedName(expense.receipt?.warehouse?.name, 'uz')}
            </div>
          </div>
        </Card>

        {/* Card 2: Financial Details */}
        <Card style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
            {isRu ? 'Финансовые расчеты' : 'Moliyaviy hisob-kitob'}
          </div>
          <div style={{ fontSize: 'var(--text-sm)' }}>
            <div>
              <strong>{isRu ? 'Сумма расхода:' : 'Xarajat summasi:'}</strong>{' '}
              <span style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)', color: 'var(--color-primary-600)' }}>
                {formatCurrency(Number(expense.amount) || 0, locale, expense.currency)}
              </span>
            </div>
            {receiptTotal != null && receiptCurrency && receiptCurrency !== expense.currency && (
              <div style={{ marginTop: '4px' }} className="tabular-nums">
                <strong>{isRu ? 'В валюте закупки:' : 'Xarid valyutasida:'}</strong>{' '}
                {formatCurrency(receiptTotal, locale, receiptCurrency)}
                {usdRate != null && (
                  <span style={{ color: 'var(--color-text-secondary)' }}>
                    {' '}(1 USD = {formatCurrency(usdRate, locale, 'UZS')})
                  </span>
                )}
              </div>
            )}
            <div style={{ marginTop: '4px' }}>
              <strong>{isRu ? 'Статус оплаты:' : 'To‘lov holati:'}</strong>{' '}
              {expense.isPaid ? (
                <Badge variant="success">{isRu ? 'Оплачен из кассы' : 'Kassadan to‘langan'}</Badge>
              ) : (
                <Badge variant="warning">{isRu ? 'Задолженность перед поставщиком' : 'Yetkazib beruvchiga qarz'}</Badge>
              )}
            </div>
            <div style={{ marginTop: '4px' }}>
              <strong>{isRu ? 'Метод распределения:' : 'Taqsimot usuli:'}</strong>{' '}
              {expense.allocationMethod === 'BY_AMOUNT'
                ? isRu ? 'По стоимости' : 'Xarid qiymatiga mutanosib'
                : expense.allocationMethod === 'BY_QUANTITY'
                ? isRu ? 'По количеству' : 'Miqdoriga mutanosib'
                : isRu ? 'По весу' : 'Vazniga mutanosib'}
            </div>
            {expense.comment && (
              <div style={{ marginTop: '4px', fontStyle: 'italic', color: 'var(--color-text-secondary)' }}>
                {expense.comment}
              </div>
            )}
          </div>
        </Card>
      </div>

      {expense.status === 'DRAFT' && items.length > 0 && !hasSnapshot && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 'var(--space-3)',
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-warning-200)',
            backgroundColor: 'var(--color-warning-50)',
            color: 'var(--color-warning-700)',
            fontSize: 'var(--text-sm)',
          }}
        >
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>
            {isRu
              ? 'Этот черновик сохранён до хранения курсов: суммы ниже не пересчитаны в валюту закупки. Нажмите «Пересчитать и сохранить» и проверьте распределение перед проведением.'
              : 'Bu qoralama kurslar saqlanishidan oldin yozilgan: quyidagi summalar xarid valyutasiga o‘tkazilmagan. «Qayta hisoblash va saqlash» tugmasini bosing va tasdiqlashdan oldin taqsimotni tekshiring.'}
          </span>
        </div>
      )}

      {/* Card 3: Item Allocation Breakdown */}
      <Card style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
          {isRu ? 'Распределение расхода по товарам' : 'Tovarlar bo‘yicha xarajat taqsimoti'}
        </h2>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border-subtle)', textAlign: 'left', color: 'var(--color-text-secondary)' }}>
                <th style={{ padding: '8px 12px', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'Товар' : 'Tovar'}</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'Старая себестоимость' : 'Eski tannarx'}</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'var(--font-semibold)', color: 'var(--color-warning-700)' }}>
                  {isRu ? 'Доп. расход' : 'Taqsimlangan xarajat'}
                </th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'var(--font-bold)', color: 'var(--color-primary-600)' }}>
                  {isRu ? 'Новая себестоимость' : 'Yangi tannarx'}
                </th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'Прирост' : 'Tannarx o‘sishi'}</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'Склад / Продано' : 'Ombor / Sotilgan'}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const unit = unitLabel(item.product?.unitOfMeasure, locale);
                const snapshot = item.originalCurrency != null;
                const oldCost = Number(item.initialLandedCost);
                const perUnit = snapshot ? Number(item.receiptUnitDelta) : null;
                const percent = perUnit != null && oldCost > 0 ? (perUnit / oldCost) * 100 : null;
                const money = (amount: number | null, currency: string | undefined) =>
                  amount != null && currency ? formatCurrency(amount, locale, currency) : '—';
                // Per-unit costs keep their 3rd/4th decimal (formatUnitCost).
                const unitCost = (amount: number | null, currency: string | undefined) =>
                  amount != null && currency ? formatUnitCost(amount, locale, currency) : '—';

                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 'var(--font-medium)' }}>
                      {(item.product?.name ? getLocalizedName(item.product?.name, locale) : '—')}
                      <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{item.product?.sku}</div>
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }} className="tabular-nums">
                      {unitCost(oldCost, receiptCurrency)}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'var(--font-semibold)', color: 'var(--color-warning-700)' }} className="tabular-nums">
                      {money(Number(item.allocatedAmount), expense.currency)}
                      {snapshot && receiptCurrency !== expense.currency && (
                        <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', fontWeight: 'var(--font-medium)' }}>
                          = {money(Number(item.receiptAmount), receiptCurrency)}
                        </div>
                      )}
                      {perUnit != null && (
                        <div style={{ fontSize: '11px', fontWeight: 'var(--font-medium)' }}>
                          +{unitCost(perUnit, receiptCurrency)} / {unit}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'var(--font-bold)', color: 'var(--color-primary-600)' }} className="tabular-nums">
                      {snapshot ? unitCost(Number(item.newLandedCost), receiptCurrency) : '—'}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'var(--font-semibold)', color: 'var(--color-warning-700)' }} className="tabular-nums">
                      {percent != null ? `+${formatPercent(percent)}` : '—'}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <span style={{ color: 'var(--color-success-700)', fontWeight: 'var(--font-medium)' }}>
                        {quantityWithUnit(item.remainingQuantity, item.product?.unitOfMeasure, locale)} {isRu ? 'на складе' : 'omborda'}
                      </span>
                      {Number(item.soldQuantity) > 0 && (
                        <span style={{ color: 'var(--color-warning-700)', marginLeft: '4px' }}>
                          / {quantityWithUnit(item.soldQuantity, item.product?.unitOfMeasure, locale)} {isRu ? 'продано' : 'sotilgan'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Card 4: Retroactive Sales Recalibration Impact */}
      {expense.retroactiveSalesImpact && expense.retroactiveSalesImpact.length > 0 && (
        <Card style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', borderColor: 'var(--color-warning-200)', backgroundColor: 'var(--color-warning-50)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingDown size={20} color="var(--color-warning-700)" />
            <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)', color: 'var(--color-warning-900)' }}>
              {isRu ? 'Ретроактивное влияние на себестоимость продаж (COGS Recalibration)' : 'O‘tgan sotuvlar tannarxiga (COGS) retroaktiv ta’siri'}
            </h2>
          </div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-warning-800)' }}>
            {isRu
              ? 'Товары из этой закупки были частично проданы до внесения расхода. Себестоимость и валовая прибыль следующих счетов-фактур были автоматически пересчитаны:'
              : 'Ushbu xariddagi tovarlar xarajat kiritilishidan oldin sotilgan. Quyidagi sotuv hisob-fakturalarining tannarxi va yalpi foydasi avtomatik qayta hisoblandi:'}
          </p>

          <div style={{ overflowX: 'auto', marginTop: '4px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-warning-200)', textAlign: 'left', color: 'var(--color-warning-900)' }}>
                  <th style={{ padding: '6px 10px', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'Счет-фактура' : 'Sotuv hujjati'}</th>
                  <th style={{ padding: '6px 10px', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'Клиент' : 'Xaridor'}</th>
                  <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'Корректировка COGS' : 'Tannarx oshishi (COGS Delta)'}</th>
                </tr>
              </thead>
              <tbody>
                {expense.retroactiveSalesImpact.map((impact) => (
                  <tr key={impact.invoiceId} style={{ borderBottom: '1px solid var(--color-warning-200)' }}>
                    <td style={{ padding: '6px 10px', fontWeight: 'var(--font-medium)' }}>
                      <a href={`/${locale}/sales/invoices/${impact.invoiceId}`} style={{ color: 'var(--color-primary-700)', textDecoration: 'none' }}>
                        {impact.invoiceNumber}
                      </a>
                    </td>
                    <td style={{ padding: '6px 10px' }}>{impact.customerName || '—'}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 'var(--font-bold)', color: 'var(--color-danger-700)' }} className="tabular-nums">
                      +{formatCurrency(Number(impact.totalDeltaCogs) || 0, locale, 'UZS')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Safe Cancellation Modal */}
      <Modal
        isOpen={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        title={isRu ? 'Отмена проведения расхода' : 'Xarajatni bekor qilish (Unpost)'}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
            <AlertTriangle size={24} color="var(--color-danger-700)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
              {isRu
                ? 'Вы действительно хотите отменить этот расход? Себестоимость складских остатков и ретроактивные корректировки счетов продаж будут возвращены в исходное состояние.'
                : 'Ushbu xarajatni bekor qilmoqchimisiz? Ombordagi tovarlar tannarxi va o‘tgan sotuvlar bo‘yicha qilingan barcha hisob-kitoblar avvalgi holatiga qaytariladi.'}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
            <Button variant="outline" onClick={() => setCancelModalOpen(false)}>
              {isRu ? 'Закрыть' : 'Bekor qilish'}
            </Button>
            <Button variant="danger" disabled={actionLoading} onClick={handleCancel}>
              {isRu ? 'Подтвердить отмену' : 'Tasdiqlash va Qaytarish'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
