'use client';

import { quantityWithUnit, unitLabel } from '@/lib/units';
import { useState } from 'react';
import { useLocale } from 'next-intl';
import { useParams } from 'next/navigation';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { formatCurrency, formatUnitCost, formatPercent, formatDate, errorMessage, getLocalizedName } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { DocumentLoadState } from '@/components/ui/DocumentLoadState';
import { ActionsMenu } from '@/components/production/ActionsMenu';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Printer,
  ExternalLink,
  AlertTriangle,
  TrendingDown,
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
  const [actionLoading, setActionLoading] = useState(false);

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
      toast.success(isRu ? 'Расход проведён, себестоимость обновлена' : 'Xarajat tasdiqlandi, tannarx yangilandi');
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
    const ok = await confirm({
      title: isRu ? 'Отменить проведение расхода?' : 'Xarajat tasdig‘i bekor qilinsinmi?',
      description: isRu
        ? 'Себестоимость товаров на складе и пересчитанная себестоимость прошлых продаж вернутся к прежним значениям, долг поставщику будет снят.'
        : 'Ombordagi tovarlar tannarxi va o‘tgan sotuvlar bo‘yicha qayta hisoblangan tannarx avvalgi holatiga qaytadi, yetkazib beruvchiga qarz olib tashlanadi.',
      variant: 'warning',
      confirmText: isRu ? 'Отменить проведение' : 'Tasdiqni bekor qilish',
      cancelText: isRu ? 'Не отменять' : 'Bekor qilmaslik',
    });
    if (!ok) return;
    setActionLoading(true);
    try {
      await apiFetch(`/purchases/additional-expenses/${id}/cancel`, {
        token: token || undefined,
        tenantId: company?.id || undefined,
        method: 'POST',
        locale,
      });
      toast.success(isRu ? 'Проведение расхода отменено' : 'Xarajat tasdig‘i bekor qilindi');
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
      toast.success(isRu ? 'Расход удалён' : 'Xarajat o‘chirildi');
      router.push('/purchases/expenses');
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

  if (!expense) {
    return (
      <DocumentLoadState
        query={expenseQuery}
        missing
        listHref="/purchases/expenses"
        listLabel={{ uz: 'Qo‘shimcha xarajatlar ro‘yxatiga', ru: 'К списку доп. расходов' }}
        notFound={{ uz: 'Xarajat hujjati topilmadi', ru: 'Расход не найден' }}
      />
    );
  }

  const cardTitle: React.CSSProperties = { fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-3)' };
  const dl: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(120px, auto) 1fr', gap: '6px 12px', fontSize: 'var(--text-sm)' };
  const dt: React.CSSProperties = { color: 'var(--color-text-secondary)' };

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', width: '100%' }}>
      <div style={{ marginBottom: 'calc(-1 * var(--space-5))' }}>
        <PageHeader
          title={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <span style={{ whiteSpace: 'nowrap' }}>{expense.docNumber}</span>
              {getStatusBadge(expense.status)}
              {getExpenseTypeBadge(expense.expenseType)}
            </span>
          }
          subtitle={`${isRu ? 'Доп. расход от' : 'Qo‘shimcha xarajat,'} ${formatDate(expense.docDate, locale)} · ${isRu ? 'распределяется на себестоимость прихода' : 'kirim tannarxiga taqsimlanadi'}`}
          actions={
            <>
              <ActionsMenu
                label={isRu ? 'Другие действия' : 'Boshqa amallar'}
                actions={[
                  { label: isRu ? 'Пересчитать и сохранить' : 'Qayta hisoblash va saqlash', onSelect: () => void handleResave(), hidden: expense.status !== 'DRAFT' },
                  { label: isRu ? 'Отменить проведение' : 'Tasdiqni bekor qilish', onSelect: () => void handleCancel(), hidden: expense.status !== 'POSTED', danger: true },
                  { label: isRu ? 'Удалить' : 'O‘chirish', onSelect: () => void handleDeleteExpense(), danger: true },
                ]}
              />
              <Button variant="outline" onClick={() => window.print()} className="no-print">
                <Printer size={16} aria-hidden /> {isRu ? 'Печать' : 'Chop etish'}
              </Button>
              {expense.status === 'DRAFT' && (
                <Button loading={actionLoading} loadingText={isRu ? 'Подождите…' : 'Kuting…'} onClick={() => void handlePost()}>
                  <CheckCircle2 size={16} aria-hidden /> {isRu ? 'Провести' : 'Tasdiqlash'}
                </Button>
              )}
            </>
          }
        />
      </div>

      <div className="doc-layout">
      <div className="doc-main">
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
          <table className="app-table-stack" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left', color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}>
                <th style={{ padding: '8px 12px', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'Товар' : 'Tovar'}</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'Старая себестоимость' : 'Eski tannarx'}</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'var(--font-semibold)' }}>
                  {isRu ? 'Доп. расход' : 'Taqsimlangan xarajat'}
                </th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'var(--font-semibold)' }}>
                  {isRu ? 'Новая себестоимость' : 'Yangi tannarx'}
                </th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'Прирост' : 'Tannarx o‘sishi'}</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'На складе / продано' : 'Omborda / sotilgan'}</th>
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
                    <td data-primary style={{ padding: '8px 12px', fontWeight: 'var(--font-medium)' }}>
                      {(item.product?.name ? getLocalizedName(item.product?.name, locale) : '—')}
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-normal)' }}>{item.product?.sku}</div>
                    </td>
                    <td data-label={isRu ? 'Старая себестоимость' : 'Eski tannarx'} style={{ padding: '8px 12px', textAlign: 'right' }} className="tabular-nums">
                      {unitCost(oldCost, receiptCurrency)}
                    </td>
                    <td data-label={isRu ? 'Доп. расход' : 'Taqsimlangan xarajat'} style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'var(--font-semibold)' }} className="tabular-nums">
                      {money(Number(item.allocatedAmount), expense.currency)}
                      {snapshot && receiptCurrency !== expense.currency && (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-normal)' }}>
                          = {money(Number(item.receiptAmount), receiptCurrency)}
                        </div>
                      )}
                      {perUnit != null && (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-normal)' }}>
                          +{unitCost(perUnit, receiptCurrency)} / {unit}
                        </div>
                      )}
                    </td>
                    <td data-label={isRu ? 'Новая себестоимость' : 'Yangi tannarx'} style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'var(--font-semibold)' }} className="tabular-nums">
                      {snapshot ? unitCost(Number(item.newLandedCost), receiptCurrency) : '—'}
                    </td>
                    <td data-label={isRu ? 'Прирост' : 'Tannarx o‘sishi'} style={{ padding: '8px 12px', textAlign: 'right' }} className="tabular-nums">
                      {percent != null ? `+${formatPercent(percent)}` : '—'}
                    </td>
                    <td data-label={isRu ? 'На складе / продано' : 'Omborda / sotilgan'} style={{ padding: '8px 12px', textAlign: 'right' }}>
                      <span>
                        {quantityWithUnit(item.remainingQuantity, item.product?.unitOfMeasure, locale)} {isRu ? 'на складе' : 'omborda'}
                      </span>
                      {Number(item.soldQuantity) > 0 && (
                        <span style={{ color: 'var(--color-text-secondary)', marginLeft: '4px' }}>
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
            <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)', color: 'var(--color-warning-700)' }}>
              {isRu ? 'Пересчитана себестоимость прошлых продаж' : 'O‘tgan sotuvlar tannarxi qayta hisoblandi'}
            </h2>
          </div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-warning-700)' }}>
            {isRu
              ? 'Товары из этой закупки были частично проданы до внесения расхода. Себестоимость и валовая прибыль следующих счетов-фактур были автоматически пересчитаны:'
              : 'Ushbu xariddagi tovarlar xarajat kiritilishidan oldin sotilgan. Quyidagi sotuv hisob-fakturalarining tannarxi va yalpi foydasi avtomatik qayta hisoblandi:'}
          </p>

          <div style={{ overflowX: 'auto', marginTop: '4px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-warning-200)', textAlign: 'left', color: 'var(--color-warning-700)' }}>
                  <th style={{ padding: '6px 10px', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'Продажа' : 'Sotuv hujjati'}</th>
                  <th style={{ padding: '6px 10px', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'Клиент' : 'Xaridor'}</th>
                  <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'Рост себестоимости' : 'Tannarx oshishi'}</th>
                </tr>
              </thead>
              <tbody>
                {expense.retroactiveSalesImpact.map((impact) => (
                  <tr key={impact.invoiceId} style={{ borderBottom: '1px solid var(--color-warning-200)' }}>
                    <td style={{ padding: '6px 10px', fontWeight: 'var(--font-medium)' }}>
                      <Link href={`/sales/${impact.invoiceId}`} style={{ color: 'var(--color-primary-700)' }}>
                        {impact.invoiceNumber}
                      </Link>
                    </td>
                    <td style={{ padding: '6px 10px' }}>{impact.customerName || '—'}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 'var(--font-bold)', color: 'var(--color-error-700)' }} className="tabular-nums">
                      +{formatCurrency(Number(impact.totalDeltaCogs) || 0, locale, 'UZS')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      </div>

      {/* Side panel: the amount and status first, then facts, related documents and history */}
      <aside className="doc-aside" aria-label={isRu ? 'Сводка документа' : 'Hujjat xulosasi'}>
        <Card style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {getStatusBadge(expense.status)}
            {getExpenseTypeBadge(expense.expenseType)}
          </div>
          <div className="rd-preview-amount">{formatCurrency(Number(expense.amount) || 0, locale, expense.currency)}</div>
          {expense.status === 'DRAFT' && (
            <Button loading={actionLoading} loadingText={isRu ? 'Подождите…' : 'Kuting…'} onClick={() => void handlePost()} style={{ width: '100%' }}>
              <CheckCircle2 size={16} aria-hidden /> {isRu ? 'Провести' : 'Tasdiqlash'}
            </Button>
          )}
        </Card>
        {/* Facts (moved from the overview cards) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <Card style={{ padding: 'var(--space-4)' }}>
          <h2 style={cardTitle}>{isRu ? 'Исполнитель и приход' : 'Xizmat ko‘rsatuvchi va kirim'}</h2>
          <dl style={dl}>
            <dt style={dt}>{isRu ? 'Исполнитель' : 'Xizmat ko‘rsatuvchi'}</dt>
            <dd>{expense.counterparty?.name || '—'}</dd>
            <dt style={dt}>{isRu ? 'Приход' : 'Kirim hujjati'}</dt>
            <dd>
              <Link href={`/purchases/${expense.receiptId}`} style={{ color: 'var(--color-primary-700)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                {expense.receipt?.docNumber} <ExternalLink size={12} aria-hidden />
              </Link>
            </dd>
            {expense.receipt?.counterparty?.name && expense.receipt.counterparty.name !== expense.counterparty?.name && (
              <>
                <dt style={dt}>{isRu ? 'Поставщик товара' : 'Tovar yetkazib beruvchi'}</dt>
                <dd>{expense.receipt.counterparty.name}</dd>
              </>
            )}
            <dt style={dt}>{isRu ? 'Склад' : 'Ombor'}</dt>
            <dd>{getLocalizedName(expense.receipt?.warehouse?.name, locale)}</dd>
          </dl>
        </Card>

        <Card style={{ padding: 'var(--space-4)' }}>
          <h2 style={cardTitle}>{isRu ? 'Сумма и оплата' : 'Summa va to‘lov'}</h2>
          <dl style={dl}>
            <dt style={dt}>{isRu ? 'Сумма расхода' : 'Xarajat summasi'}</dt>
            <dd style={{ fontWeight: 'var(--font-semibold)' }} className="tabular-nums">{formatCurrency(Number(expense.amount) || 0, locale, expense.currency)}</dd>
            {receiptTotal != null && receiptCurrency && receiptCurrency !== expense.currency && (
              <>
                <dt style={dt}>{isRu ? 'В валюте прихода' : 'Kirim valyutasida'}</dt>
                <dd className="tabular-nums">
                  {formatCurrency(receiptTotal, locale, receiptCurrency)}
                  {usdRate != null && <span style={{ color: 'var(--color-text-secondary)' }}> (1 USD = {formatCurrency(usdRate, locale, 'UZS')})</span>}
                </dd>
              </>
            )}
            <dt style={dt}>{isRu ? 'Оплата' : 'To‘lov'}</dt>
            <dd>
              {expense.isPaid ? (
                <Badge variant="success">{isRu ? 'Оплачен из кассы' : 'Kassadan to‘langan'}</Badge>
              ) : (
                <Badge variant="warning">{isRu ? 'Долг поставщику' : 'Yetkazib beruvchiga qarz'}</Badge>
              )}
            </dd>
            <dt style={dt}>{isRu ? 'Распределение' : 'Taqsimot'}</dt>
            <dd>
              {expense.allocationMethod === 'BY_AMOUNT'
                ? isRu ? 'По стоимости товара' : 'Tovar qiymatiga mutanosib'
                : expense.allocationMethod === 'BY_QUANTITY'
                ? isRu ? 'По количеству' : 'Miqdoriga mutanosib'
                : isRu ? 'По весу' : 'Vazniga mutanosib'}
            </dd>
            {expense.comment && (
              <>
                <dt style={dt}>{isRu ? 'Комментарий' : 'Izoh'}</dt>
                <dd style={{ color: 'var(--color-text-secondary)' }}>{expense.comment}</dd>
              </>
            )}
          </dl>
        </Card>
      </div>

        <Card style={{ padding: 'var(--space-4)' }}>
          <h2 style={cardTitle}>{isRu ? 'История' : 'Tarix'}</h2>
          <ol className="rd-timeline" style={{ marginTop: 'var(--space-2)' }}>
            <li>
              <span>{isRu ? 'Создан' : 'Yaratildi'} · {formatDate(expense.createdAt, locale)}</span>
            </li>
            {expense.postedAt && (
              <li style={{ ['--rd-dot' as string]: 'var(--color-success-600)' }}>
                <span>{isRu ? 'Проведён и распределён' : 'Tasdiqlandi va taqsimlandi'} · {formatDate(expense.postedAt, locale)}</span>
              </li>
            )}
            {expense.status === 'CANCELLED' && (
              <li style={{ ['--rd-dot' as string]: 'var(--color-error-600)' }}>
                <span>{isRu ? 'Проведение отменено' : 'Tasdiq bekor qilingan'}</span>
              </li>
            )}
          </ol>
        </Card>
      </aside>
      </div>
    </div>
  );
}
