'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, SelectOption } from '@/components/ui/Select';
import { formatCurrency } from '@/lib/utils';
import { Truck, AlertCircle, CheckCircle, Warehouse as WarehouseIcon, Package } from 'lucide-react';

interface PartialDispatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any | null;
  onSuccess: () => void;
}

export function PartialDispatchModal({
  isOpen,
  onClose,
  order,
  onSuccess,
}: PartialDispatchModalProps) {
  const { token, company } = useAuth();
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [dispatchQuantities, setDispatchQuantities] = useState<Record<string, number>>({});
  const [stockMap, setStockMap] = useState<Record<string, any>>({});
  const [loadingStock, setLoadingStock] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // 1. Fetch warehouses
  useEffect(() => {
    if (!isOpen || !token || !company) return;

    apiFetch<any>('/tenants/warehouses', {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then((res) => {
        const list = Array.isArray(res) ? res : res?.data || [];
        setWarehouses(list);
        if (order?.warehouseId) {
          setSelectedWarehouseId(order.warehouseId);
        } else if (list.length > 0) {
          setSelectedWarehouseId(list[0].id);
        }
      })
      .catch((err) => console.error('Failed to load warehouses:', err));
  }, [isOpen, token, company, order, locale]);

  // 2. Initialize default dispatch quantities from remaining un-shipped
  useEffect(() => {
    if (!isOpen || !order) return;

    const initialMap: Record<string, number> = {};
    (order.items || []).forEach((item: any) => {
      const qty = Number(item.quantity);
      const shipped = Number(item.shippedQty || 0);
      const remaining = Math.max(0, qty - shipped);
      initialMap[item.id] = remaining;
    });

    setDispatchQuantities(initialMap);
    setError('');
  }, [isOpen, order]);

  // 3. Fetch live free stock whenever warehouse changes
  useEffect(() => {
    if (!isOpen || !token || !company || !selectedWarehouseId) return;

    setLoadingStock(true);
    apiFetch<any>(`/inventory/stock-levels?warehouseId=${selectedWarehouseId}`, {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then((res) => {
        const list = Array.isArray(res) ? res : res?.data || [];
        const map: Record<string, any> = {};
        list.forEach((sl: any) => {
          const physical = Number(sl.quantity || 0);
          const reserved = Number(sl.reservedQuantity || 0);
          map[sl.productId] = {
            physical,
            reserved,
            free: Math.max(0, physical - reserved),
          };
        });
        setStockMap(map);
      })
      .catch((err) => console.error('Failed to load stock availability:', err))
      .finally(() => setLoadingStock(false));
  }, [isOpen, token, company, selectedWarehouseId, locale]);

  if (!order) return null;

  const warehouseOptions: SelectOption[] = warehouses.map((w) => {
    const name = typeof w.name === 'object' ? w.name[locale] || w.name.uz || w.name.ru : w.name;
    return { value: w.id, label: name };
  });

  const handleQtyChange = (itemId: string, val: number, maxQty: number) => {
    const cleanVal = Math.max(0, Math.min(maxQty, isNaN(val) ? 0 : val));
    setDispatchQuantities((prev) => ({
      ...prev,
      [itemId]: cleanVal,
    }));
  };

  const totalDispatchCount = Object.values(dispatchQuantities).reduce((a, b) => a + b, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWarehouseId) {
      setError(isRu ? 'Выберите склад для списания' : 'Chiqim qilish uchun omborni tanlang');
      return;
    }

    if (totalDispatchCount <= 0) {
      setError(
        isRu
          ? 'Укажите хотя бы один товар для отгрузки'
          : 'Kamida bitta tovar uchun chiqarilayotgan miqdorni kiriting',
      );
      return;
    }

    // Check against live stock
    for (const item of order.items || []) {
      const dispatchQty = dispatchQuantities[item.id] || 0;
      if (dispatchQty > 0) {
        const stock = stockMap[item.productId];
        const physical = Number(stock?.physical || 0);
        if (physical < dispatchQty) {
          const prodName =
            typeof item.product?.name === 'object'
              ? item.product.name[locale] || item.product.name.uz
              : item.product?.name;
          setError(
            isRu
              ? `Недостаточно остатка для "${prodName}". На складе: ${physical}, отгружается: ${dispatchQty}`
              : `"${prodName}" uchun omborda yetarli qoldiq yo'q. Omborda: ${physical}, chiqarilayotgan: ${dispatchQty}`,
          );
          return;
        }
      }
    }

    setSubmitting(true);
    setError('');

    try {
      const itemsPayload = Object.entries(dispatchQuantities)
        .filter(([_, qty]) => qty > 0)
        .map(([orderItemId, quantity]) => ({
          orderItemId,
          quantity,
        }));

      await apiFetch(`/sales/orders/${order.id}/dispatch`, {
        method: 'POST',
        token: token || undefined,
        tenantId: company?.id,
        locale,
        body: JSON.stringify({
          warehouseId: selectedWarehouseId,
          items: itemsPayload,
        }),
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(
        err.message ||
          (isRu ? 'Ошибка при отгрузке со склада' : 'Ombordan chiqim qilishda xatolik yuz berdi'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        isRu
          ? `Отгрузка со склада — Заказ ${order.orderNumber}`
          : `Ombordan chiqim qilish — Zakaz ${order.orderNumber}`
      }
    >
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
      >
        {error && (
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius-md)',
              color: '#ef4444',
              fontSize: 'var(--text-sm)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Warehouse Selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: 'var(--text-sm)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <WarehouseIcon size={16} color="var(--color-primary)" />
            {isRu ? 'Склад списания' : 'Chiqim qilinadigan ombor'}
          </label>
          <Select
            options={warehouseOptions}
            value={selectedWarehouseId}
            onChange={(val) => setSelectedWarehouseId(val)}
            placeholder={isRu ? 'Выберите склад' : 'Omborni tanlang'}
          />
        </div>

        {/* Items Table */}
        <div
          style={{
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 'var(--text-xs)',
            }}
          >
            <thead>
              <tr style={{ backgroundColor: 'var(--color-bg-subtle)', textAlign: 'left' }}>
                <th style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border)' }}>
                  {isRu ? 'Товар' : 'Tovar'}
                </th>
                <th style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border)', textAlign: 'center' }}>
                  {isRu ? 'Заказ' : 'Zakaz'}
                </th>
                <th style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border)', textAlign: 'center' }}>
                  {isRu ? 'Отгружено' : "Jo'natildi"}
                </th>
                <th style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border)', textAlign: 'center' }}>
                  {isRu ? 'Остаток' : 'Qoldiq'}
                </th>
                <th style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border)', textAlign: 'right', width: '130px' }}>
                  {isRu ? 'К отгрузке' : 'Chiqarish miqdori'}
                </th>
              </tr>
            </thead>
            <tbody>
              {(order.items || []).map((item: any) => {
                const prodName =
                  typeof item.product?.name === 'object'
                    ? item.product.name[locale] || item.product.name.uz
                    : item.product?.name || '—';
                const totalQty = Number(item.quantity);
                const shippedQty = Number(item.shippedQty || 0);
                const unShipped = Math.max(0, totalQty - shippedQty);
                const currentDispatch = dispatchQuantities[item.id] || 0;
                const stock = stockMap[item.productId];
                const physicalStock = Number(stock?.physical || 0);
                const isShortage = physicalStock < currentDispatch;

                return (
                  <tr
                    key={item.id}
                    style={{
                      borderBottom: '1px solid var(--color-border)',
                      backgroundColor: isShortage ? 'rgba(239, 68, 68, 0.04)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>
                        {prodName}
                      </div>
                      {item.product?.sku && (
                        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                          SKU: {item.product.sku}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 500 }}>
                      {totalQty}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center', color: '#10b981', fontWeight: 600 }}>
                      {shippedQty}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      {loadingStock ? (
                        <span style={{ color: 'var(--color-text-secondary)' }}>...</span>
                      ) : (
                        <span
                          style={{
                            fontWeight: 600,
                            color: physicalStock >= unShipped ? '#10b981' : '#f59e0b',
                          }}
                        >
                          {physicalStock}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                      <Input
                        type="number"
                        min="0"
                        max={unShipped}
                        step="0.001"
                        value={currentDispatch}
                        onChange={(e) =>
                          handleQtyChange(item.id, parseFloat(e.target.value), unShipped)
                        }
                        disabled={unShipped <= 0}
                        style={{
                          width: '100%',
                          textAlign: 'right',
                          height: '32px',
                          fontSize: 'var(--text-xs)',
                          borderColor: isShortage ? '#ef4444' : undefined,
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {isRu ? 'Отмена' : 'Bekor qilish'}
          </Button>
          <Button variant="primary" type="submit" disabled={submitting || totalDispatchCount <= 0}>
            <Truck size={16} style={{ marginRight: '6px' }} />
            {isRu ? `Отгрузить (${totalDispatchCount} шт)` : `Chiqim qilish (${totalDispatchCount} dona)`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
