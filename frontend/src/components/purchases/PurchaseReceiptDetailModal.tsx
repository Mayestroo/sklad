'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { CheckCircle2, XCircle, Truck, FileText, Plus, RotateCcw, Building2, User, CreditCard } from 'lucide-react';
import { PurchaseReceipt } from '@shared/types';

interface PurchaseReceiptDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  receipt: PurchaseReceipt | null;
  onRefresh: () => void;
  onOpenAddExpense: (receipt: PurchaseReceipt) => void;
  onOpenReturn: (receipt: PurchaseReceipt) => void;
  onOpenPay: (receipt: PurchaseReceipt) => void;
}

export function PurchaseReceiptDetailModal({
  isOpen,
  onClose,
  receipt,
  onRefresh,
  onOpenAddExpense,
  onOpenReturn,
  onOpenPay,
}: PurchaseReceiptDetailModalProps) {
  const { token, company } = useAuth();
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  const [loadingAction, setLoadingAction] = useState(false);
  const [error, setError] = useState('');

  if (!receipt) return null;

  const handlePost = async () => {
    if (!token || !company) return;
    setLoadingAction(true);
    setError('');
    try {
      await apiFetch(`/purchases/receipts/${receipt.id}/post`, {
        token: token || undefined,
        tenantId: company?.id ? company.id : undefined,
        locale,
        method: 'POST',
      });
      onRefresh();
      onClose();
    } catch (err: any) {
      setError(err?.message || (isRu ? 'Ошибка проведения' : 'Tasdiqlashda xatolik'));
    } finally {
      setLoadingAction(false);
    }
  };

  const handleUnpost = async () => {
    if (!token || !company) return;
    setLoadingAction(true);
    setError('');
    try {
      await apiFetch(`/purchases/receipts/${receipt.id}/unpost`, {
        token: token || undefined,
        tenantId: company?.id ? company.id : undefined,
        locale,
        method: 'POST',
      });
      onRefresh();
      onClose();
    } catch (err: any) {
      setError(err?.message || (isRu ? 'Ошибка отмены' : 'Bekor qilishda xatolik'));
    } finally {
      setLoadingAction(false);
    }
  };

  const getDocStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return <Badge variant="neutral">{isRu ? 'Черновик' : 'Qoralama'}</Badge>;
      case 'POSTED':
        return <Badge variant="success">{isRu ? 'Проведён / На складе' : 'Tasdiqlangan / Omborda'}</Badge>;
      case 'CANCELLED':
        return <Badge variant="error">{isRu ? 'Отменён' : 'Bekor qilingan'}</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const getPaymentBadge = (pst: string) => {
    switch (pst) {
      case 'UNPAID':
        return <Badge variant="neutral">{isRu ? 'Не оплачен' : 'To‘lanmagan'}</Badge>;
      case 'PARTIALLY_PAID':
        return <Badge variant="warning">{isRu ? 'Частично оплачен' : 'Qisman to‘langan'}</Badge>;
      case 'PAID':
        return <Badge variant="success">{isRu ? 'Оплачен' : 'To‘liq to‘langan'}</Badge>;
      default:
        return null;
    }
  };

  const getReturnBadge = (rst: string) => {
    switch (rst) {
      case 'PARTIALLY_RETURNED':
        return <Badge variant="warning">{isRu ? 'Частичный возврат' : 'Qisman qaytarilgan'}</Badge>;
      case 'FULLY_RETURNED':
        return <Badge variant="error">{isRu ? 'Полный возврат' : 'To‘liq qaytarilgan'}</Badge>;
      default:
        return null;
    }
  };

  const getProductName = (name: any) => {
    if (!name) return '—';
    if (typeof name === 'string') return name;
    return name[locale] || name.ru || name.uz || Object.values(name)[0] || '—';
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${isRu ? 'Документ закупки:' : 'Xarid Hujjati:'} ${receipt.docNumber}`}
      size="3xl"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', width: '100%' }}>
        {error && (
          <div
            style={{
              padding: 'var(--space-3)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-danger-50)',
              color: 'var(--color-danger-700)',
              fontSize: 'var(--text-sm)',
            }}
          >
            {error}
          </div>
        )}

        {/* Top Header Card */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 'var(--space-4) var(--space-5)',
            backgroundColor: 'var(--color-bg-tertiary)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>{receipt.docNumber}</h2>
              {getDocStatusBadge(receipt.status)}
              {getPaymentBadge(receipt.paymentStatus)}
              {getReturnBadge(receipt.returnStatus)}
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '6px' }}>
              {isRu ? 'Дата:' : 'Sana:'} <strong>{formatDate(receipt.docDate, locale)}</strong> | {isRu ? 'Валюта:' : 'Valyuta:'} <strong>{receipt.currency}</strong> ({receipt.exchangeRate} {isRu ? 'курс' : 'kurs'})
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', fontWeight: 'var(--font-medium)' }}>{isRu ? 'Общая сумма документа' : 'Jami Hujjat Summasi'}</div>
            <div
              style={{
                fontSize: 'var(--text-2xl)',
                fontWeight: 'var(--font-bold)',
                color: 'var(--color-primary-600)',
                marginTop: '4px',
              }}
              className="tabular-nums"
            >
              {formatCurrency(Number(receipt.totalAmount), locale)} {receipt.currency}
            </div>
          </div>
        </div>

        {/* Primary Metadata Details Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
          <div style={{ padding: 'var(--space-3) var(--space-4)', backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)' }}>
              <Building2 size={15} /> {isRu ? 'ПОСТАВЩИК' : 'YETKAZIB BERUVCHI'}
            </div>
            <div style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-base)', color: 'var(--color-text-primary)', marginTop: '4px' }}>{receipt.counterparty?.name || '—'}</div>
            {receipt.counterparty?.inn && (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{isRu ? 'ИНН:' : 'STIR:'} {receipt.counterparty.inn}</div>
            )}
          </div>

          <div style={{ padding: 'var(--space-3) var(--space-4)', backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)' }}>
              <Truck size={15} /> {isRu ? 'СКЛАД' : 'OMBOR'}
            </div>
            <div style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-base)', color: 'var(--color-text-primary)', marginTop: '4px' }}>
              {getProductName(receipt.warehouse?.name)}
            </div>
          </div>

          <div style={{ padding: 'var(--space-3) var(--space-4)', backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)' }}>
              <FileText size={15} /> {isRu ? 'ДОГОВОР' : 'SHARTNOMA'}
            </div>
            <div style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-base)', color: 'var(--color-text-primary)', marginTop: '4px' }}>
              {receipt.contractNumber ? `№ ${receipt.contractNumber}` : '—'}
            </div>
            {receipt.contractDate && (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                {formatDate(receipt.contractDate, locale)}
              </div>
            )}
          </div>

          <div style={{ padding: 'var(--space-3) var(--space-4)', backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)' }}>
              <User size={15} /> {isRu ? 'СОЗДАТЕЛЬ' : 'YARATGAN'}
            </div>
            <div style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-base)', color: 'var(--color-text-primary)', marginTop: '4px' }}>
              {receipt.createdBy ? `${receipt.createdBy.firstName} ${receipt.createdBy.lastName}` : (isRu ? 'Система' : 'Tizim')}
            </div>
          </div>
        </div>

        {/* GTD Info if present */}
        {receipt.gtdNumber && (
          <div style={{ padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--color-primary-50)', border: '1px solid var(--color-primary-200)', fontSize: 'var(--text-xs)' }}>
            <strong style={{ color: 'var(--color-primary-800)', fontSize: 'var(--text-sm)' }}>{isRu ? 'Импорт / Декларация ГТД:' : 'Import / GTD Deklaratsiya:'}</strong>{' '}
            <span style={{ fontWeight: 'var(--font-bold)', color: 'var(--color-primary-900)' }}>{receipt.gtdNumber}</span>
            {receipt.gtdDate && ` | ${isRu ? 'Дата:' : 'Sana:'} ${formatDate(receipt.gtdDate, locale)}`}
            {receipt.customsPost && ` | ${isRu ? 'Таможенный пост:' : 'Bojxona posti:'} ${receipt.customsPost}`}
          </div>
        )}

        {/* Items Table */}
        <div>
          <h4 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', marginBottom: 'var(--space-2)' }}>
            {isRu ? 'Закупленные товары и распределение себестоимости (Landed Cost)' : 'Xarid Qilingan Tovarlar va Tannarx (`Landed Cost`) Taqsimoti'}
          </h4>
          <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', minWidth: '220px' }}>{isRu ? 'ТОВАР / SKU' : 'TOVAR / SKU'}</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>{isRu ? 'КОЛ-ВО' : 'MIQDOR'}</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>{isRu ? 'ВЕС (КГ)' : 'OG\'IRLIK (KG)'}</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>{isRu ? 'ЦЕНА ЗАКУПКИ' : 'XARID NARXI'}</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>{isRu ? 'СКИДКА' : 'CHEGIRMA'}</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>{isRu ? 'НДС' : 'QQS'}</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>{isRu ? 'РАСПР. РАСХОДЫ' : 'TAQSIMLANGAN XARAJAT'}</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary-900)', fontWeight: 'var(--font-bold)' }}>{isRu ? 'СЕБЕСТОИМОСТЬ ЕД.' : 'BIRLIK TANNARXI'}</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>{isRu ? 'ОБЩАЯ СУММА' : 'JAMI SUMMA'}</th>
                </tr>
              </thead>
              <tbody>
                {(receipt.items || []).map((item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)' }}>
                      {getProductName(item.product?.name)}
                      <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                        {item.product?.sku}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }} className="tabular-nums">
                      {Number(item.quantity)} {item.product?.unitOfMeasure || (isRu ? 'шт' : 'dona')}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }} className="tabular-nums">
                      {Number(item.weight) || Number(item.product?.weight) || 0} kg
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }} className="tabular-nums">
                      {formatCurrency(Number(item.unitPrice), locale)}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }} className="tabular-nums">
                      {formatCurrency(Number(item.discount), locale)}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }} className="tabular-nums">
                      {formatCurrency(Number(item.vatAmount), locale)} ({Number(item.vatRate)}%)
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--color-warning-700)', fontWeight: 'var(--font-medium)' }} className="tabular-nums">
                      +{formatCurrency(Number(item.allocatedExpenses), locale)}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 'var(--font-bold)', backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary-700)' }} className="tabular-nums">
                      {formatCurrency(Number(item.landedCost), locale)}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }} className="tabular-nums">
                      {formatCurrency(Number(item.totalPrice), locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Expenses List */}
        {receipt.expenses && receipt.expenses.length > 0 && (
          <div>
            <h4 style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
              {isRu ? 'Привязанные доп. расходы' : 'Biriktirilgan Qo\'shimcha Xarajatlar'}
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {receipt.expenses.map((exp) => (
                <div
                  key={exp.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-bg-tertiary)',
                    border: '1px solid var(--color-border)',
                    fontSize: 'var(--text-xs)',
                  }}
                >
                  <div>
                    <strong style={{ textTransform: 'capitalize' }}>{exp.expenseType}</strong>: {exp.comment || (isRu ? 'Доп. расход' : 'Qo\'shimcha xarajat')} (
                    {exp.allocationMethod === 'BY_AMOUNT'
                      ? (isRu ? 'По сумме' : 'Summa bo\'yicha')
                      : exp.allocationMethod === 'BY_WEIGHT'
                      ? (isRu ? 'По весу' : 'Og\'irlik bo\'yicha')
                      : (isRu ? 'По количеству' : 'Miqdor bo\'yicha')}
                    )
                  </div>
                  <div style={{ fontWeight: 'var(--font-bold)', color: 'var(--color-warning-700)' }}>
                    +{formatCurrency(Number(exp.amount), locale)} {exp.currency}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-2)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {receipt.status === 'POSTED' && (
              <>
                {receipt.paymentStatus !== 'PAID' && (
                  <Button
                    size="sm"
                    onClick={() => onOpenPay(receipt)}
                    style={{
                      backgroundColor: 'var(--color-success-50)',
                      color: 'var(--color-success-600)',
                      border: '1px solid var(--color-success-100)',
                    }}
                  >
                    <CreditCard size={14} style={{ marginRight: '4px' }} /> {isRu ? 'Оплатить' : 'To‘lash'}
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => onOpenAddExpense(receipt)}>
                  <Plus size={14} style={{ marginRight: '4px' }} /> {isRu ? 'Добавить доп. расход' : 'Qo\'shimcha Xarajat Qo\'shish'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => onOpenReturn(receipt)}>
                  <RotateCcw size={14} style={{ marginRight: '4px' }} /> {isRu ? 'Возврат товара' : 'Tovarni Qaytarish'}
                </Button>
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            {receipt.status === 'DRAFT' && (
              <Button onClick={handlePost} disabled={loadingAction}>
                <CheckCircle2 size={16} style={{ marginRight: '6px' }} />
                {loadingAction ? (isRu ? 'Проведение...' : 'Tasdiqlanmoqda...') : (isRu ? 'Провести и оприходовать' : 'Tasdiqlab Omborga Kirim Qilish')}
              </Button>
            )}
            {receipt.status === 'POSTED' && Number(receipt.paidAmount) === 0 && (
              <Button variant="danger" onClick={handleUnpost} disabled={loadingAction}>
                <XCircle size={16} style={{ marginRight: '6px' }} />
                {loadingAction ? (isRu ? 'Отмена...' : 'Bekor qilinmoqda...') : (isRu ? 'Отменить проведение' : 'Kirimni Bekor Qilish (Qoralama)')}
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              {isRu ? 'Закрыть' : 'Yopish'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
