'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
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
  FileText,
  Truck,
  Building2,
  ExternalLink,
  Layers,
  AlertTriangle,
  History,
  TrendingDown,
  BookOpen,
} from 'lucide-react';
import { AdditionalExpense, PurchaseDocStatus, ExpenseType } from '@shared/types';

export default function ExpenseDetailPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const { token, company, user } = useAuth();

  const [expense, setExpense] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchExpense = () => {
    if (!token || !company || !id) return;
    setLoading(true);
    apiFetch<any>(`/purchases/additional-expenses/${id}`, {
      token: token || undefined,
      tenantId: company?.id || undefined,
      locale,
    })
      .then((res) => setExpense(res))
      .catch((err) => {
        console.error(err);
        setErrorMsg(err.message || (isRu ? 'Ошибка загрузки' : 'Yuklashda xatolik'));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchExpense();
  }, [token, company, id, locale]);

  const handlePost = async () => {
    if (!confirm(isRu ? 'Провести этот расход и обновить себестоимость товаров?' : 'Ushbu xarajatni tasdiqlash va tovarlar tannarxini yangilashni xohlaysizmi?')) {
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
      fetchExpense();
    } catch (err: any) {
      alert(err.message || (isRu ? 'Ошибка при проведении' : 'Tasdiqlashda xatolik'));
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
      fetchExpense();
    } catch (err: any) {
      alert(err.message || (isRu ? 'Ошибка при отмене' : 'Bekor qilishda xatolik'));
    } finally {
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      {/* Header & Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/purchases/expenses`)}>
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
            <Button disabled={actionLoading} onClick={handlePost}>
              <CheckCircle2 size={16} style={{ marginRight: '6px' }} />
              {isRu ? 'Провести' : 'Tasdiqlash'}
            </Button>
          )}

          {expense.status === 'POSTED' && (
            <Button variant="outline" disabled={actionLoading} onClick={() => setCancelModalOpen(true)} style={{ color: 'var(--color-danger-600)', borderColor: 'var(--color-danger-200)' }}>
              <XCircle size={16} style={{ marginRight: '6px' }} />
              {isRu ? 'Отменить проведение' : 'Bekor qilish'}
            </Button>
          )}
        </div>
      </div>

      {/* Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
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
              <strong>{isRu ? 'Склад назначения:' : 'Qabul ombori:'}</strong> {(expense.receipt?.warehouse?.name as any)?.uz || expense.receipt?.warehouse?.name}
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
                {formatCurrency(expense.amount, locale, expense.currency)}
              </span>
            </div>
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
                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'var(--font-semibold)', color: 'var(--color-warning-600)' }}>
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
              {expense.items?.map((item: any) => {
                const totalQty = Number(item.soldQuantity) + Number(item.remainingQuantity) || 1;
                const perUnit = Number(item.allocatedAmount) / totalQty;
                const oldCost = Number(item.initialLandedCost);
                const newCost = Number(item.newLandedCost) || (oldCost + perUnit);
                const percent = oldCost > 0 ? (perUnit / oldCost) * 100 : 0;

                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 'var(--font-medium)' }}>
                      {(item.product?.name as any)?.uz || item.product?.name}
                      <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>{item.product?.sku}</div>
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }} className="tabular-nums">
                      {formatCurrency(oldCost, locale)}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'var(--font-semibold)', color: 'var(--color-warning-700)' }} className="tabular-nums">
                      {formatCurrency(item.allocatedAmount, locale)} (+{formatCurrency(perUnit, locale)}/dona)
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'var(--font-bold)', color: 'var(--color-primary-600)' }} className="tabular-nums">
                      {formatCurrency(newCost, locale)}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 'var(--font-semibold)', color: 'var(--color-warning-600)' }} className="tabular-nums">
                      +{percent.toFixed(1)}%
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <span style={{ color: 'var(--color-success-600)', fontWeight: 'var(--font-medium)' }}>
                        {item.remainingQuantity} omborda
                      </span>
                      {Number(item.soldQuantity) > 0 && (
                        <span style={{ color: 'var(--color-warning-600)', marginLeft: '4px' }}>
                          / {item.soldQuantity} sotilgan
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
                {expense.retroactiveSalesImpact.map((impact: any) => (
                  <tr key={impact.invoiceId} style={{ borderBottom: '1px solid var(--color-warning-200)' }}>
                    <td style={{ padding: '6px 10px', fontWeight: 'var(--font-medium)' }}>
                      <a href={`/${locale}/sales/invoices/${impact.invoiceId}`} style={{ color: 'var(--color-primary-700)', textDecoration: 'none' }}>
                        {impact.invoiceNumber}
                      </a>
                    </td>
                    <td style={{ padding: '6px 10px' }}>{impact.customerName || '—'}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 'var(--font-bold)', color: 'var(--color-danger-700)' }} className="tabular-nums">
                      +{formatCurrency(impact.totalDeltaCogs, locale, expense.currency)}
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
            <AlertTriangle size={24} color="var(--color-danger-600)" style={{ flexShrink: 0, marginTop: '2px' }} />
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
