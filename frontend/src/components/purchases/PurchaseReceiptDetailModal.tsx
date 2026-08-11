'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { CheckCircle2, XCircle, Truck, FileText, Plus, RotateCcw, Building2, User } from 'lucide-react';
import { PurchaseReceipt } from '@shared/types';

interface PurchaseReceiptDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  receipt: PurchaseReceipt | null;
  onRefresh: () => void;
  onOpenAddExpense: (receipt: PurchaseReceipt) => void;
  onOpenReturn: (receipt: PurchaseReceipt) => void;
}

export function PurchaseReceiptDetailModal({
  isOpen,
  onClose,
  receipt,
  onRefresh,
  onOpenAddExpense,
  onOpenReturn,
}: PurchaseReceiptDetailModalProps) {
  const { token, company } = useAuth();
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
        method: 'POST',
      });
      onRefresh();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Tasdiqlashda xatolik');
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
        method: 'POST',
      });
      onRefresh();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Bekor qilishda xatolik');
    } finally {
      setLoadingAction(false);
    }
  };

  const getDocStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return <Badge variant="neutral">Qoralama</Badge>;
      case 'POSTED':
        return <Badge variant="success">Tasdiqlangan / Omborda</Badge>;
      case 'CANCELLED':
        return <Badge variant="error">Bekor qilingan</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const getPaymentBadge = (pst: string) => {
    switch (pst) {
      case 'UNPAID':
        return <Badge variant="neutral">To&apos;lanmagan</Badge>;
      case 'PARTIALLY_PAID':
        return <Badge variant="warning">Qisman to&apos;langan</Badge>;
      case 'PAID':
        return <Badge variant="success">To&apos;liq to&apos;langan</Badge>;
      default:
        return null;
    }
  };

  const getReturnBadge = (rst: string) => {
    switch (rst) {
      case 'PARTIALLY_RETURNED':
        return <Badge variant="warning">Qisman qaytarilgan</Badge>;
      case 'FULLY_RETURNED':
        return <Badge variant="error">To&apos;liq qaytarilgan</Badge>;
      default:
        return null;
    }
  };

  const getProductName = (name: any) => {
    if (!name) return '—';
    if (typeof name === 'string') return name;
    return name.uz || name.ru || Object.values(name)[0] || '—';
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Xarid Hujjati: ${receipt.docNumber}`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', maxWidth: '900px', width: '100%' }}>
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
            padding: 'var(--space-4)',
            backgroundColor: 'var(--color-bg-secondary)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)' }}>{receipt.docNumber}</h2>
              {getDocStatusBadge(receipt.status)}
              {getPaymentBadge(receipt.paymentStatus)}
              {getReturnBadge(receipt.returnStatus)}
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
              Sana: {formatDate(receipt.docDate, 'uz')} | Valyuta: {receipt.currency} ({receipt.exchangeRate} kurs)
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>Jami Hujjat Summasi</div>
            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-primary-600)' }} className="tabular-nums">
              {formatCurrency(Number(receipt.totalAmount), 'uz')} {receipt.currency}
            </div>
          </div>
        </div>

        {/* Primary Metadata Details */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
          <div style={{ padding: 'var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>
              <Building2 size={14} /> YETKAZIB BERUVCHI
            </div>
            <div style={{ fontWeight: 'var(--font-semibold)', marginTop: '4px' }}>{receipt.counterparty?.name || '—'}</div>
            {receipt.counterparty?.inn && (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>STIR: {receipt.counterparty.inn}</div>
            )}
          </div>

          <div style={{ padding: 'var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>
              <Truck size={14} /> OMBOR
            </div>
            <div style={{ fontWeight: 'var(--font-semibold)', marginTop: '4px' }}>
              {getProductName(receipt.warehouse?.name)}
            </div>
          </div>

          <div style={{ padding: 'var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>
              <FileText size={14} /> SHARTNOMA
            </div>
            <div style={{ fontWeight: 'var(--font-semibold)', marginTop: '4px' }}>
              {receipt.contractNumber ? `№ ${receipt.contractNumber}` : '—'}
            </div>
            {receipt.contractDate && (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                {formatDate(receipt.contractDate, 'uz')}
              </div>
            )}
          </div>

          <div style={{ padding: 'var(--space-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>
              <User size={14} /> YARATGAN
            </div>
            <div style={{ fontWeight: 'var(--font-semibold)', marginTop: '4px' }}>
              {receipt.createdBy ? `${receipt.createdBy.firstName} ${receipt.createdBy.lastName}` : 'Tizim'}
            </div>
          </div>
        </div>

        {/* GTD Info if present */}
        {receipt.gtdNumber && (
          <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-primary-50)', border: '1px solid var(--color-primary-200)', fontSize: 'var(--text-xs)' }}>
            <strong style={{ color: 'var(--color-primary-700)' }}>🛃 Import / GTD Deklaratsiya:</strong> {receipt.gtdNumber}
            {receipt.gtdDate && ` | Sana: ${formatDate(receipt.gtdDate, 'uz')}`}
            {receipt.customsPost && ` | Bojxona posti: ${receipt.customsPost}`}
          </div>
        )}

        {/* Items Table */}
        <div>
          <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-2)' }}>
            Xarid Qilingan Tovarlar va Tannarx (`Landed Cost`) Taqsimoti
          </h4>
          <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '10px', textAlign: 'left' }}>TOVAR / SKU</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>MIQDOR</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>OG&apos;IRLIK (KG)</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>XARID NARXI</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>CHEGIRMA</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>QQS</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>TAQSIMLANGAN XARAJAT</th>
                  <th style={{ padding: '10px', textAlign: 'right', backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary-800)' }}>BIRLIK TANNARXI</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>JAMI SUMMA</th>
                </tr>
              </thead>
              <tbody>
                {(receipt.items || []).map((item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                    <td style={{ padding: '10px', fontWeight: 'var(--font-medium)' }}>
                      {getProductName(item.product?.name)}
                      <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                        {item.product?.sku}
                      </div>
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right' }} className="tabular-nums">
                      {Number(item.quantity)} {item.product?.unitOfMeasure || 'dona'}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right' }} className="tabular-nums">
                      {Number(item.weight) || Number(item.product?.weight) || 0} kg
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right' }} className="tabular-nums">
                      {formatCurrency(Number(item.unitPrice), 'uz')}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right' }} className="tabular-nums">
                      {formatCurrency(Number(item.discount), 'uz')}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right' }} className="tabular-nums">
                      {formatCurrency(Number(item.vatAmount), 'uz')} ({Number(item.vatRate)}%)
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', color: 'var(--color-warning-700)' }} className="tabular-nums">
                      +{formatCurrency(Number(item.allocatedExpenses), 'uz')}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'var(--font-bold)', backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary-700)' }} className="tabular-nums">
                      {formatCurrency(Number(item.landedCost), 'uz')}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'var(--font-bold)' }} className="tabular-nums">
                      {formatCurrency(Number(item.totalPrice), 'uz')}
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
              🚚 Biriktirilgan Qo&apos;shimcha Xarajatlar
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              {receipt.expenses.map((exp) => (
                <div
                  key={exp.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--color-bg-secondary)',
                    fontSize: 'var(--text-xs)',
                  }}
                >
                  <div>
                    <strong style={{ textTransform: 'capitalize' }}>{exp.expenseType}</strong>: {exp.comment || 'Qo\'shimcha xarajat'} (
                    {exp.allocationMethod === 'BY_AMOUNT'
                      ? 'Summa bo\'yicha'
                      : exp.allocationMethod === 'BY_WEIGHT'
                      ? 'Og\'irlik bo\'yicha'
                      : 'Miqdor bo\'yicha'}
                    )
                  </div>
                  <div style={{ fontWeight: 'var(--font-bold)', color: 'var(--color-warning-700)' }}>
                    +{formatCurrency(Number(exp.amount), 'uz')} {exp.currency}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-2)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {receipt.status === 'POSTED' && (
              <>
                <Button size="sm" variant="outline" onClick={() => onOpenAddExpense(receipt)}>
                  <Plus size={14} style={{ marginRight: '4px' }} /> Qo&apos;shimcha Xarajat Qo&apos;shish
                </Button>
                <Button size="sm" variant="outline" onClick={() => onOpenReturn(receipt)}>
                  <RotateCcw size={14} style={{ marginRight: '4px' }} /> Tovarni Qaytarish
                </Button>
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            {receipt.status === 'DRAFT' && (
              <Button onClick={handlePost} disabled={loadingAction}>
                <CheckCircle2 size={16} style={{ marginRight: '6px' }} />
                {loadingAction ? 'Tasdiqlanmoqda...' : 'Tasdiqlab Omborga Kirim Qilish'}
              </Button>
            )}
            {receipt.status === 'POSTED' && Number(receipt.paidAmount) === 0 && (
              <Button variant="danger" onClick={handleUnpost} disabled={loadingAction}>
                <XCircle size={16} style={{ marginRight: '6px' }} />
                {loadingAction ? 'Bekor qilinmoqda...' : 'Kirimni Bekor Qilish (Qoralama)'}
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              Yopish
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
