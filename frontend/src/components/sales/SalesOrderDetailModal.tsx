'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select, SelectOption } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import {
  Clock,
  CheckCircle,
  AlertTriangle,
  Send,
  Check,
  X,
  Factory,
  Truck,
  CreditCard,
  FileText,
  DollarSign,
  Package,
  Calendar,
  User,
  MapPin,
  History,
} from 'lucide-react';

interface WarehouseOption {
  id: string;
  name: any;
}

interface SalesOrderDetailModalProps {
  orderId: string;
  onClose: () => void;
  onUpdated: () => void;
  warehouses: WarehouseOption[];
}

export const ORDER_STATUS_LABELS: Record<string, { uz: string; ru: string; variant: 'neutral' | 'warning' | 'success' | 'error' }> = {
  NEW: { uz: 'Yangi zakaz', ru: 'Новый заказ', variant: 'neutral' },
  PENDING_APPROVAL: { uz: 'Tasdiqlash kutilmoqda', ru: 'Ожидает утверждения', variant: 'warning' },
  APPROVED: { uz: 'Tasdiqlandi', ru: 'Утверждён', variant: 'neutral' },
  SENT_TO_PRODUCTION: { uz: 'Ishlab chiqarishga yuborildi', ru: 'Передан в производство', variant: 'warning' },
  IN_PRODUCTION: { uz: 'Ishlab chiqarilmoqda', ru: 'В производстве', variant: 'warning' },
  PARTIALLY_READY: { uz: 'Qisman tayyor', ru: 'Частично готов', variant: 'warning' },
  READY: { uz: 'Tayyor (To‘liq)', ru: 'Готов (Полностью)', variant: 'success' },
  AWAITING_PAYMENT: { uz: 'To‘lov kutilmoqda', ru: 'Ожидает оплаты', variant: 'warning' },
  PAYMENT_CONFIRMED: { uz: 'To‘lov tasdiqlandi', ru: 'Оплата подтверждена', variant: 'success' },
  READY_TO_SHIP: { uz: 'Jo‘natishga tayyor', ru: 'Готов к отгрузке', variant: 'success' },
  SHIPPED: { uz: 'Jo‘natildi / Chiqim qilindi', ru: 'Отгружен', variant: 'success' },
  COMPLETED: { uz: 'Yetkazildi / Yakunlandi', ru: 'Доставлен / Завершён', variant: 'success' },
  CANCELLED: { uz: 'Bekor qilindi', ru: 'Отменён', variant: 'error' },
};

export function SalesOrderDetailModal({
  orderId,
  onClose,
  onUpdated,
  warehouses,
}: SalesOrderDetailModalProps) {
  const { token, company, user } = useAuth();
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dispatch modal / form
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(warehouses[0]?.id || '');

  // Payment modal / form
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'BANK_TRANSFER' | 'CARD'>('CASH');

  const fetchOrderDetail = () => {
    if (!token || !company || !orderId) return;
    setLoading(true);
    apiFetch<any>(`/api/sales/orders/${orderId}`, {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then((res) => {
        setOrder(res);
        if (res?.remainingAmount > 0) {
          setPaymentAmount(res.remainingAmount);
        }
      })
      .catch((err) => setError(err?.message || 'Error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchOrderDetail();
  }, [token, company, orderId, locale]);

  const handleTransition = async (action: string, comment?: string) => {
    if (!token || !company) return;
    setActionLoading(true);
    setError(null);
    try {
      await apiFetch(`/api/sales/orders/${orderId}/transition`, {
        method: 'POST',
        token: token || undefined,
        tenantId: company.id,
        locale,
        body: JSON.stringify({ action, comment }),
      });
      fetchOrderDetail();
      onUpdated();
    } catch (err: any) {
      setError(err?.message || 'Xatolik yuz berdi');
    } finally {
      setActionLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!token || !company) return;
    setActionLoading(true);
    setError(null);
    try {
      await apiFetch(`/api/sales/orders/${orderId}/complete`, {
        method: 'POST',
        token: token || undefined,
        tenantId: company.id,
        locale,
      });
      fetchOrderDetail();
      onUpdated();
    } catch (err: any) {
      setError(err?.message || 'Xatolik yuz berdi');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDispatch = async () => {
    if (!selectedWarehouseId) {
      setError(isRu ? 'Выберите склад' : 'Omborni tanlang');
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      await apiFetch(`/api/sales/orders/${orderId}/dispatch`, {
        method: 'POST',
        token: token || undefined,
        tenantId: company?.id,
        locale,
        body: JSON.stringify({ warehouseId: selectedWarehouseId }),
      });
      setShowDispatchModal(false);
      fetchOrderDetail();
      onUpdated();
    } catch (err: any) {
      setError(err?.message || 'Xatolik yuz berdi');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRegisterPayment = async () => {
    if (paymentAmount <= 0) return;
    setActionLoading(true);
    setError(null);
    try {
      await apiFetch('/api/sales/payments', {
        method: 'POST',
        token: token || undefined,
        tenantId: company?.id,
        locale,
        body: JSON.stringify({
          counterpartyId: order.counterpartyId,
          orderId: order.id,
          method: paymentMethod,
          amount: Number(paymentAmount),
          comment: `Zakaz ${order.orderNumber} to‘lovi`,
        }),
      });
      setShowPaymentModal(false);
      fetchOrderDetail();
      onUpdated();
    } catch (err: any) {
      setError(err?.message || 'To‘lov saqlashda xatolik');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateReadyQty = async (productionOrderId: string, currentQty: number, maxQty: number) => {
    const promptVal = window.prompt(
      isRu
        ? `Введите готовое количество (макс ${maxQty}):`
        : `Tayyor miqdorni kiriting (maksimal ${maxQty}):`,
      currentQty.toString(),
    );
    if (promptVal === null) return;
    const newQty = Number(promptVal);
    if (isNaN(newQty) || newQty < 0 || newQty > maxQty) {
      alert(isRu ? 'Некорректное количество' : 'Noto‘g‘ri miqdor');
      return;
    }

    setActionLoading(true);
    try {
      await apiFetch(`/api/sales/orders/production/${productionOrderId}/ready-qty`, {
        method: 'PATCH',
        token: token || undefined,
        tenantId: company?.id,
        locale,
        body: JSON.stringify({ readyQty: newQty }),
      });
      fetchOrderDetail();
      onUpdated();
    } catch (err: any) {
      setError(err?.message || 'Xatolik');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <Modal isOpen={true} onClose={onClose} title="Yuklanmoqda..." size="lg">
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          {isRu ? 'Загрузка данных заказа...' : 'Zakaz ma‘lumotlari yuklanmoqda...'}
        </div>
      </Modal>
    );
  }

  if (!order) return null;

  const statusConfig = ORDER_STATUS_LABELS[order.status] || {
    uz: order.status,
    ru: order.status,
    variant: 'neutral' as const,
  };

  const gateVariant =
    order.gateStatus === 'SATISFIED' || order.gateStatus === 'BYPASSED'
      ? 'success'
      : 'warning';

  const gateLabel =
    order.gateStatus === 'SATISFIED'
      ? isRu ? 'Оплата закрыта (Допуск есть)' : 'To‘lov to‘langan (Ruxsat bor)'
      : order.gateStatus === 'BYPASSED'
      ? isRu ? 'Постоплата / Без барьера' : 'Nasiya (To‘lov sharti yo‘q)'
      : isRu ? 'Требуется оплата' : 'Oldindan to‘lov talab qilinadi';

  const warehouseOptions: SelectOption[] = warehouses.map((w) => {
    const name = typeof w.name === 'object' ? (w.name[locale] || w.name.uz || '') : w.name;
    return { value: w.id, label: name };
  });

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={`${isRu ? 'Заказ' : 'Zakaz'} ${order.orderNumber}`}
      size="xl"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacing-sm)',
              padding: 'var(--spacing-sm) var(--spacing-md)',
              backgroundColor: 'var(--color-error-light)',
              color: 'var(--color-error)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-sm)',
            }}
          >
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        {/* Top Summary Header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 'var(--spacing-sm)',
            padding: 'var(--spacing-md)',
            backgroundColor: 'var(--color-bg-secondary)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
              {isRu ? 'Статус заказа' : 'Zakaz holati'}
            </div>
            <div style={{ marginTop: '4px' }}>
              <Badge variant={statusConfig.variant}>
                {isRu ? statusConfig.ru : statusConfig.uz}
              </Badge>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
              {isRu ? 'Барьер отгрузки (Gate)' : 'Ombordan chiqim ruxsati'}
            </div>
            <div style={{ marginTop: '4px' }}>
              <Badge variant={gateVariant}>
                {gateLabel}
              </Badge>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
              {isRu ? 'Клиент' : 'Mijoz'}
            </div>
            <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', marginTop: '4px' }}>
              {order.counterparty?.name || '—'}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
              {isRu ? 'Срок доставки' : 'Yetkazish sanasi'}
            </div>
            <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', marginTop: '4px' }}>
              {order.deliveryDate ? formatDate(order.deliveryDate) : '—'}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
              {isRu ? 'Сумма заказа' : 'Buyurtma summasi'}
            </div>
            <div style={{ fontWeight: 700, fontSize: 'var(--text-base)', color: 'var(--color-primary)', marginTop: '2px' }}>
              {formatCurrency(Number(order.totalAmount), order.currency)}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
              {isRu ? 'Оплачено' : 'To‘langan summa'} ({order.paymentPercent}%)
            </div>
            <div style={{ fontWeight: 700, fontSize: 'var(--text-base)', color: 'var(--color-success)', marginTop: '2px' }}>
              {formatCurrency(Number(order.paidAmount), order.currency)}
            </div>
          </div>
        </div>

        {/* Action Toolbar */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--spacing-sm)',
            padding: 'var(--spacing-sm) 0',
            borderBottom: '1px solid var(--color-border-light)',
          }}
        >
          {order.status === 'NEW' && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleTransition('SUBMIT')}
              disabled={actionLoading}
            >
              <Send size={14} style={{ marginRight: '6px' }} />
              {isRu ? 'Отправить на согласование' : 'Tasdiqlashga yuborish'}
            </Button>
          )}

          {order.status === 'PENDING_APPROVAL' && (
            <>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleTransition('APPROVE')}
                disabled={actionLoading}
              >
                <Check size={14} style={{ marginRight: '6px' }} />
                {isRu ? 'Утвердить' : 'Tasdiqlash'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleTransition('REJECT')}
                disabled={actionLoading}
              >
                <X size={14} style={{ marginRight: '6px' }} />
                {isRu ? 'Отклонить' : 'Rad etish'}
              </Button>
            </>
          )}

          {order.status === 'APPROVED' && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleTransition('SEND_TO_PRODUCTION')}
              disabled={actionLoading}
            >
              <Factory size={14} style={{ marginRight: '6px' }} />
              {isRu ? 'Передать в производство' : 'Ishlab chiqarishga yuborish'}
            </Button>
          )}

          {order.status === 'READY_TO_SHIP' && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowDispatchModal(true)}
              disabled={actionLoading}
            >
              <Truck size={14} style={{ marginRight: '6px' }} />
              {isRu ? 'Отгрузить (Создать реализацию)' : 'Ombordan chiqarish / Jo‘natish'}
            </Button>
          )}

          {order.status === 'SHIPPED' && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleComplete}
              disabled={actionLoading}
            >
              <CheckCircle size={14} style={{ marginRight: '6px' }} />
              {isRu ? 'Подтвердить доставку (Завершить)' : 'Yetkazildi (Yakunlash)'}
            </Button>
          )}

          {/* Payment Button if not 100% paid */}
          {order.paymentPercent < 100 && order.status !== 'CANCELLED' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowPaymentModal(true)}
              disabled={actionLoading}
            >
              <CreditCard size={14} style={{ marginRight: '6px' }} />
              {isRu ? 'Принять оплату' : 'To‘lov kiritish'}
            </Button>
          )}

          {/* Cancel button if applicable */}
          {!['SHIPPED', 'COMPLETED', 'CANCELLED'].includes(order.status) && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (window.confirm(isRu ? 'Вы уверены, что хотите отменить этот заказ?' : 'Zakazni bekor qilishga ishonchingiz komilmi?')) {
                  handleTransition('CANCEL');
                }
              }}
              disabled={actionLoading}
            >
              {isRu ? 'Отменить заказ' : 'Zakazni bekor qilish'}
            </Button>
          )}
        </div>

        {/* Items & Production Progress Table */}
        <div>
          <h4 style={{ margin: '0 0 var(--spacing-xs) 0', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
            {isRu ? 'Товары и прогресс производства' : 'Mahsulotlar va ishlab chiqarish jarayoni'}
          </h4>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border-light)', color: 'var(--color-text-secondary)', textAlign: 'left' }}>
                  <th style={{ padding: '8px' }}>{isRu ? 'Товар' : 'Mahsulot'}</th>
                  <th style={{ padding: '8px' }}>{isRu ? 'Заказано' : 'Buyurtma qilingan'}</th>
                  <th style={{ padding: '8px' }}>{isRu ? 'Готово' : 'Tayyor bo‘ldi'}</th>
                  <th style={{ padding: '8px' }}>{isRu ? 'Осталось' : 'Qolgan'}</th>
                  <th style={{ padding: '8px' }}>{isRu ? 'Цена' : 'Narx'}</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>{isRu ? 'Сумма' : 'Jami'}</th>
                </tr>
              </thead>
              <tbody>
                {order.items?.map((it: any) => {
                  const pName = typeof it.product?.name === 'object'
                    ? (it.product?.name[locale] || it.product?.name?.uz || '')
                    : it.product?.name;
                  const po = order.productionOrders?.find((p: any) => p.salesOrderItemId === it.id);

                  return (
                    <tr key={it.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                      <td style={{ padding: '8px', fontWeight: 500 }}>
                        {pName} ({it.product?.sku})
                      </td>
                      <td style={{ padding: '8px' }}>{Number(it.quantity)}</td>
                      <td style={{ padding: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 600, color: Number(it.readyQty) >= Number(it.quantity) ? 'var(--color-success)' : 'inherit' }}>
                            {Number(it.readyQty)}
                          </span>
                          {po && ['SENT_TO_PRODUCTION', 'IN_PRODUCTION', 'PARTIALLY_READY'].includes(order.status) && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleUpdateReadyQty(po.id, Number(it.readyQty), Number(it.quantity))}
                            >
                              {isRu ? 'Изменить' : 'Kiritish'}
                            </Button>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '8px', color: it.remainingQty > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}>
                        {it.remainingQty}
                      </td>
                      <td style={{ padding: '8px' }}>{formatCurrency(Number(it.unitPrice), order.currency)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>
                        {formatCurrency(Number(it.totalPrice), order.currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Linked Sales Invoices Section */}
        {order.salesInvoices?.length > 0 && (
          <div style={{ backgroundColor: 'var(--color-success-light)', padding: 'var(--spacing-md)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-success)' }}>
              <FileText size={16} />
              {isRu ? 'Связанная накладная реализации:' : 'Chiqim qilingan sotuv fakturasi:'}
            </div>
            <div style={{ marginTop: '8px', fontSize: 'var(--text-sm)' }}>
              {order.salesInvoices.map((inv: any) => (
                <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span>
                    <strong>{inv.invoiceNumber}</strong> ({formatDate(inv.createdAt)})
                  </span>
                  <span>{formatCurrency(Number(inv.totalAmount), order.currency)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Audit Log / History */}
        {order.auditHistory?.length > 0 && (
          <div>
            <h4 style={{ margin: '0 0 var(--spacing-xs) 0', fontSize: 'var(--text-sm)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <History size={14} />
              {isRu ? 'История статусов' : 'Statuslar tarixi'}
            </h4>
            <div style={{ maxHeight: '140px', overflowY: 'auto', fontSize: 'var(--text-xs)', border: '1px solid var(--color-border-light)', borderRadius: 'var(--radius-md)', padding: '8px' }}>
              {order.auditHistory.map((log: any) => (
                <div key={log.id} style={{ padding: '4px 0', borderBottom: '1px dashed var(--color-border-light)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>
                    <strong>{log.user ? `${log.user.firstName} ${log.user.lastName}` : 'Tizim'}:</strong>{' '}
                    {log.oldValue?.status ? `${log.oldValue.status} → ` : ''}
                    {log.newValue?.status || log.action}
                  </span>
                  <span style={{ color: 'var(--color-text-secondary)' }}>{formatDate(log.createdAt)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal: Dispatch / Ombor Chiqim */}
      {showDispatchModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowDispatchModal(false)}
          title={isRu ? 'Отгрузка со склада' : 'Ombordan tovarlarni chiqarish'}
          size="md"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
            <p style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
              {isRu
                ? 'Выберите склад для списания остатков и формирования накладной реализации (FIFO).'
                : 'Qoldiqlar hisobdan chiqariladigan va sotuv fakturasi shakllantiriladigan omborni tanlang (FIFO).'}
            </p>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
                {isRu ? 'Склад отгрузки *' : 'Chiqim ombori *'}
              </label>
              <Select
                options={warehouseOptions}
                value={selectedWarehouseId}
                onChange={(val) => setSelectedWarehouseId(val)}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-sm)', marginTop: 'var(--spacing-md)' }}>
              <Button variant="secondary" onClick={() => setShowDispatchModal(false)}>
                {isRu ? 'Отмена' : 'Bekor qilish'}
              </Button>
              <Button variant="primary" onClick={handleDispatch} disabled={actionLoading}>
                {actionLoading ? '...' : isRu ? 'Подтвердить отгрузку' : 'Chiqimni tasdiqlash'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Register Payment */}
      {showPaymentModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowPaymentModal(false)}
          title={isRu ? 'Приём оплаты по заказу' : 'Zakaz bo‘yicha to‘lov qabul qilish'}
          size="md"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
                {isRu ? 'Сумма оплаты' : 'To‘lov summasi'} ({order.currency})
              </label>
              <Input
                type="number"
                min="1"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(Number(e.target.value))}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginBottom: '4px' }}>
                {isRu ? 'Способ оплаты' : 'To‘lov turi'}
              </label>
              <Select
                options={[
                  { value: 'CASH', label: isRu ? 'Наличные' : 'Naqd' },
                  { value: 'BANK_TRANSFER', label: isRu ? 'Перечисление (Расчетный счет)' : 'Bank o‘tkazmasi' },
                  { value: 'CARD', label: isRu ? 'Банковская карта' : 'Plastik karta' },
                ]}
                value={paymentMethod}
                onChange={(val) => setPaymentMethod(val as any)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-sm)', marginTop: 'var(--spacing-md)' }}>
              <Button variant="secondary" onClick={() => setShowPaymentModal(false)}>
                {isRu ? 'Отмена' : 'Bekor qilish'}
              </Button>
              <Button variant="primary" onClick={handleRegisterPayment} disabled={actionLoading || paymentAmount <= 0}>
                {actionLoading ? '...' : isRu ? 'Зафиксировать оплату' : 'To‘lovni qabul qilish'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
