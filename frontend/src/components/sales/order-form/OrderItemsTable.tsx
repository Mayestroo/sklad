'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select, SelectOption } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/utils';
import { Plus, Trash2 } from 'lucide-react';
import { ProductDropdownItem } from '@/hooks/useDocumentDropdowns';

export interface OrderItemRow {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  readyQty?: number;
}

export interface OrderItemsTableProps {
  locale: 'uz' | 'ru';
  currency: string;
  isLocked: boolean;
  orderStatus: string;
  isPriceOverrideAllowed: boolean;
  items: OrderItemRow[];
  products: ProductDropdownItem[];
  productOptions: SelectOption[];
  onItemChange: (index: number, field: keyof OrderItemRow, value: any) => void;
  onAddItem: () => void;
  onRemoveItem: (index: number) => void;
}

export function OrderItemsTable({
  locale,
  currency,
  isLocked,
  orderStatus,
  isPriceOverrideAllowed,
  items,
  products,
  productOptions,
  onItemChange,
  onAddItem,
  onRemoveItem,
}: OrderItemsTableProps) {
  const isRu = locale === 'ru';

  return (
    <Card style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)' }}>
          {isRu ? 'Товары в заказе' : 'Buyurtmadagi Tovarlar'} ({items.length})
        </h3>
      </div>

      <div style={{ overflowX: 'auto', minHeight: '280px', paddingBottom: '40px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border-light)', backgroundColor: 'var(--color-bg-subtle)' }}>
              <th scope="col" style={{ padding: '10px 12px', textAlign: 'left', width: '40px' }}>#</th>
              <th scope="col" style={{ padding: '10px 12px', textAlign: 'left', minWidth: '240px' }}>
                {isRu ? 'Товар / Номенклатура' : 'Tovar / Mahsulot'}
              </th>
              <th scope="col" style={{ padding: '10px 12px', textAlign: 'right', width: '120px' }}>
                {isRu ? 'Заказано' : 'Buyurtma miqdori'}
              </th>
              {orderStatus !== 'NEW' && (
                <th scope="col" style={{ padding: '10px 12px', textAlign: 'right', width: '120px' }}>
                  {isRu ? 'Готово (Пр-во)' : 'Tayyorlandi'}
                </th>
              )}
              <th scope="col" style={{ padding: '10px 12px', textAlign: 'right', width: '140px' }}>
                {isRu ? 'Цена за ед.' : 'Birlik narxi'}
              </th>
              <th scope="col" style={{ padding: '10px 12px', textAlign: 'right', width: '110px' }}>
                {isRu ? 'Скидка %' : 'Skidka %'}
              </th>
              <th scope="col" style={{ padding: '10px 12px', textAlign: 'right', width: '150px' }}>
                {isRu ? 'Итого' : 'Jami Summa'}
              </th>
              {!isLocked && (
                <th scope="col" style={{ padding: '10px 12px', textAlign: 'center', width: '50px' }}>
                  <span className="sr-only">{isRu ? 'Действия' : 'Amallar'}</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const lineRaw = item.quantity * item.unitPrice;
              const discountVal = (lineRaw * item.discount) / 100;
              const lineTotal = lineRaw - discountVal;

              return (
                <tr key={idx} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                  <td style={{ padding: '10px 12px', color: 'var(--color-text-tertiary)' }}>{idx + 1}</td>

                  {/* Product select */}
                  <td style={{ padding: '10px 12px' }}>
                    <Select
                      options={productOptions}
                      value={item.productId}
                      onChange={(val) => onItemChange(idx, 'productId', val)}
                      placeholder={isRu ? 'Выберите товар...' : 'Tovarni tanlang...'}
                      disabled={isLocked}
                    />
                  </td>

                  {/* Quantity */}
                  <td style={{ padding: '10px 12px' }}>
                    <Input
                      type="number"
                      min="0.001"
                      step="any"
                      value={item.quantity}
                      onChange={(e) => onItemChange(idx, 'quantity', parseFloat(e.target.value) || 0)}
                      disabled={isLocked}
                      style={{ textAlign: 'right' }}
                      aria-label={`${isRu ? 'Количество для строки' : 'Miqdor'} ${idx + 1}`}
                    />
                  </td>

                  {/* Ready Qty */}
                  {orderStatus !== 'NEW' && (
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <span style={{ fontWeight: 600, color: (item.readyQty || 0) >= item.quantity ? '#10b981' : '#f59e0b' }}>
                        {item.readyQty || 0} / {item.quantity}
                      </span>
                    </td>
                  )}

                  {/* Unit Price */}
                  <td style={{ padding: '10px 12px' }}>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={item.unitPrice}
                      onChange={(e) => onItemChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                      disabled={isLocked || !isPriceOverrideAllowed}
                      title={!isPriceOverrideAllowed ? (isRu ? 'Ручное изменение цены запрещено настройками' : 'Narxni qo‘lda o‘zgartirish taqiqlangan') : undefined}
                      style={{ textAlign: 'right', ...(!isPriceOverrideAllowed ? { backgroundColor: 'var(--color-bg-secondary)', cursor: 'not-allowed' } : {}) }}
                      aria-label={`${isRu ? 'Цена за единицу для строки' : 'Birlik narxi'} ${idx + 1}`}
                    />
                  </td>

                  {/* Discount */}
                  <td style={{ padding: '10px 12px' }}>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      value={item.discount}
                      onChange={(e) => onItemChange(idx, 'discount', parseFloat(e.target.value) || 0)}
                      disabled={isLocked}
                      style={{ textAlign: 'right' }}
                      aria-label={`${isRu ? 'Скидка для строки' : 'Chegirma %'} ${idx + 1}`}
                    />
                  </td>

                  {/* Line Total */}
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }} className="tabular-nums">
                    {formatCurrency(lineTotal, locale, currency)}
                  </td>

                  {/* Actions */}
                  {!isLocked && (
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onRemoveItem(idx)}
                        style={{ color: 'var(--color-text-tertiary)', padding: '4px' }}
                        title={isRu ? 'Удалить строку' : 'Qatorni o‘chirish'}
                        aria-label={`${isRu ? 'Удалить строку' : 'Qatorni o‘chirish'} ${idx + 1}`}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!isLocked && (
        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onAddItem}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            aria-label={isRu ? 'Добавить новую позицию' : 'Yangi qator qo‘shish'}
          >
            <Plus size={16} /> {isRu ? 'Добавить позицию' : 'Qator qo‘shish'}
          </Button>
        </div>
      )}
    </Card>
  );
}
