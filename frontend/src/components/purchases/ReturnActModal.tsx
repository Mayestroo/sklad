'use client';

import { useRef } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Printer } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { PurchaseReturn } from '@shared/types';

interface ReturnActModalProps {
  isOpen: boolean;
  onClose: () => void;
  purchaseReturn: PurchaseReturn | null;
}

export function ReturnActModal({ isOpen, onClose, purchaseReturn }: ReturnActModalProps) {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { company } = useAuth();
  const printRef = useRef<HTMLDivElement>(null);

  if (!purchaseReturn) return null;

  const handlePrint = () => {
    window.print();
  };

  const getProductName = (name: any) => {
    if (!name) return '—';
    if (typeof name === 'string') return name;
    return name[locale] || name.ru || name.uz || Object.values(name)[0] || '—';
  };

  const items = purchaseReturn.items || [];
  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.quantity) * Number(item.unitPrice),
    0,
  );
  const totalVat = items.reduce(
    (sum, item) => sum + Number(item.vatAmount || 0),
    0,
  );
  const totalAmount = Number(purchaseReturn.totalAmount || subtotal + totalVat);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${isRu ? 'Акт возврата товаров №' : 'Qaytarish Dalolatnomasi №'} ${purchaseReturn.returnNumber}`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: '850px', width: '100%' }}>
        {/* Action Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }} className="no-print">
          <Button variant="secondary" onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Printer size={16} /> {isRu ? 'Печать акта' : 'Aktni chop etish'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {isRu ? 'Закрыть' : 'Yopish'}
          </Button>
        </div>

        {/* Printable Paper Area */}
        <div
          ref={printRef}
          className="printable-act"
          style={{
            backgroundColor: '#ffffff',
            color: '#111827',
            padding: '32px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border-light)',
            boxShadow: 'var(--shadow-sm)',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          {/* Header */}
          <div style={{ borderBottom: '2px solid #111827', paddingBottom: '16px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h1 style={{ fontSize: '18px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                  {company?.name || 'Sklad ERP'}
                </h1>
                <div style={{ fontSize: '12px', color: '#4b5563', marginTop: '4px' }}>
                  {isRu ? 'Официальный акт возврата материальных ценностей' : 'Moddiy boyliklarni yetkazib beruvchiga qaytarish dalolatnomasi'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#111827', fontFamily: 'monospace' }}>
                  № {purchaseReturn.returnNumber}
                </div>
                <div style={{ fontSize: '12px', color: '#4b5563', marginTop: '4px' }}>
                  {isRu ? 'Дата' : 'Sana'}: {formatDate(purchaseReturn.returnDate, locale)}
                </div>
              </div>
            </div>
          </div>

          {/* Parties Meta Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px', backgroundColor: '#f9fafb', padding: '16px', borderRadius: '6px' }}>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: '#6b7280', letterSpacing: '0.05em', marginBottom: '4px' }}>
                {isRu ? 'Отправитель (Покупатель / Склад)' : 'Yuboruvchi (Xaridor / Ombor)'}
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>
                {company?.name || 'Kompaniya'}
              </div>
              <div style={{ fontSize: '12px', color: '#4b5563', marginTop: '2px' }}>
                {isRu ? 'Склад отгрузки' : 'Chiqim ombori'}: <strong>{getProductName(purchaseReturn.warehouse?.name)}</strong>
              </div>
            </div>

            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: '#6b7280', letterSpacing: '0.05em', marginBottom: '4px' }}>
                {isRu ? 'Получатель (Поставщик)' : 'Qabul qiluvchi (Yetkazib beruvchi)'}
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>
                {purchaseReturn.counterparty?.name || 'Yetkazib beruvchi'}
              </div>
              {purchaseReturn.receipt && (
                <div style={{ fontSize: '12px', color: '#4b5563', marginTop: '2px' }}>
                  {isRu ? 'Основание' : 'Asos xarid'}: <strong>№ {purchaseReturn.receipt.docNumber}</strong>
                </div>
              )}
              {purchaseReturn.actNumber && (
                <div style={{ fontSize: '12px', color: '#4b5563', marginTop: '2px' }}>
                  {isRu ? 'Номер внешнего акта' : 'Akt raqami'}: <strong>{purchaseReturn.actNumber}</strong>
                </div>
              )}
            </div>
          </div>

          {/* Reason banner */}
          <div style={{ marginBottom: '20px', padding: '10px 14px', backgroundColor: '#eff6ff', borderLeft: '4px solid #3b82f6', borderRadius: '4px', fontSize: '13px' }}>
            <span style={{ fontWeight: 600, color: '#1e40af' }}>{isRu ? 'Причина возврата: ' : 'Qaytarish sababi: '}</span>
            <span style={{ color: '#1e3a8a' }}>{purchaseReturn.reason || (isRu ? 'Не указана' : 'Ko‘rsatilmadi')}</span>
            {purchaseReturn.comment && (
              <div style={{ marginTop: '4px', fontSize: '12px', color: '#3b82f6' }}>
                {isRu ? 'Примечание: ' : 'Izoh: '}{purchaseReturn.comment}
              </div>
            )}
          </div>

          {/* Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '24px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f3f4f6', borderTop: '1px solid #d1d5db', borderBottom: '2px solid #9ca3af' }}>
                <th style={{ padding: '8px 10px', textAlign: 'center', width: '35px' }}>№</th>
                <th style={{ padding: '8px 10px', textAlign: 'left' }}>{isRu ? 'Наименование ТМЦ' : 'Nomenklatura nomi'}</th>
                <th style={{ padding: '8px 10px', textAlign: 'center', width: '80px' }}>{isRu ? 'Тип' : 'Turi'}</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', width: '70px' }}>{isRu ? 'Кол-во' : 'Miqdor'}</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', width: '95px' }}>{isRu ? 'Цена' : 'Narx'}</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', width: '60px' }}>{isRu ? 'НДС %' : 'QQS %'}</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', width: '80px' }}>{isRu ? 'НДС' : 'QQS'}</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', width: '110px' }}>{isRu ? 'Сумма' : 'Jami'}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const itemType = item.product?.type || 'PRODUCT';
                return (
                  <tr key={item.id || idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '8px 10px', textAlign: 'center', color: '#6b7280' }}>{idx + 1}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                      {getProductName(item.product?.name)}
                      {item.product?.sku && (
                        <span style={{ fontSize: '10px', color: '#9ca3af', marginLeft: '6px', fontFamily: 'monospace' }}>
                          [{item.product.sku}]
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: itemType === 'RAW_MATERIAL' ? '#ecfdf5' : '#eff6ff',
                          color: itemType === 'RAW_MATERIAL' ? '#047857' : '#1d4ed8',
                        }}
                      >
                        {itemType === 'RAW_MATERIAL' ? (isRu ? 'Сырье' : 'Xomashyo') : (isRu ? 'Товар' : 'Tovar')}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>
                      {Number(item.quantity).toLocaleString()}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                      {formatCurrency(Number(item.unitPrice), locale, purchaseReturn.currency)}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#6b7280' }}>
                      {Number(item.vatRate || 0)}%
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: '#6b7280' }}>
                      {formatCurrency(Number(item.vatAmount || 0), locale, purchaseReturn.currency)}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>
                      {formatCurrency(Number(item.totalPrice), locale, purchaseReturn.currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #111827', backgroundColor: '#f9fafb', fontWeight: 700 }}>
                <td colSpan={6} style={{ padding: '10px', textAlign: 'right' }}>
                  {isRu ? 'ИТОГО К ВОЗВРАТУ:' : 'JAMI QAYTARILISHI LOZIM:'}
                </td>
                <td style={{ padding: '10px', textAlign: 'right', color: '#4b5563' }}>
                  {formatCurrency(totalVat, locale, purchaseReturn.currency)}
                </td>
                <td style={{ padding: '10px', textAlign: 'right', fontSize: '14px', color: '#111827' }}>
                  {formatCurrency(totalAmount, locale, purchaseReturn.currency)}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Signatures Block */}
          <div style={{ marginTop: '48px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', pageBreakInside: 'avoid' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '8px' }}>
                {isRu ? 'Отпустил (Сдал со склада):' : 'Topshirdi (Ombor mudiri):'}
              </div>
              <div style={{ borderBottom: '1px solid #9ca3af', height: '32px', marginBottom: '6px' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#6b7280' }}>
                <span>{isRu ? 'Подпись' : 'Imzo'}</span>
                <span>{isRu ? 'Ф.И.О.' : 'F.I.SH.'}</span>
              </div>
              <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '6px' }}>М.П. / Muhr o‘rni</div>
            </div>

            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '8px' }}>
                {isRu ? 'Принял (Представитель поставщика):' : 'Qabul qildi (Yetkazib beruvchi vakili):'}
              </div>
              <div style={{ borderBottom: '1px solid #9ca3af', height: '32px', marginBottom: '6px' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#6b7280' }}>
                <span>{isRu ? 'Подпись' : 'Imzo'}</span>
                <span>{isRu ? 'Ф.I.O.' : 'F.I.SH.'}</span>
              </div>
              <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '6px' }}>М.П. / Muhr o‘rni</div>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .printable-act, .printable-act * {
            visibility: visible;
          }
          .printable-act {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </Modal>
  );
}
