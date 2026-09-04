'use client';

import React, { useState, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select, SelectOption } from '@/components/ui/Select';
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

/** Format a number as 1,234,567.000 */
function formatNum(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(value || 0);
}

const numInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--color-bg-input)',
  color: 'var(--color-text-primary)',
  fontSize: 'var(--text-sm)',
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
  boxSizing: 'border-box' as const,
  outline: 'none',
};

interface FormattedNumInputProps {
  value: number;
  onChange: (val: number) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
  extraStyle?: React.CSSProperties;
  ariaLabel?: string;
  title?: string;
}

/**
 * Shows formatted number (e.g. 12,000.000) when blurred.
 * Shows raw editable value when focused.
 */
function FormattedNumInput({
  value,
  onChange,
  disabled,
  min,
  max,
  extraStyle,
  ariaLabel,
  title,
}: FormattedNumInputProps) {
  const [focused, setFocused] = useState(false);
  const [rawStr, setRawStr] = useState('');

  const handleFocus = useCallback(() => {
    setFocused(true);
    setRawStr(value === 0 ? '' : String(value));
  }, [value]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    const parsed = parseFloat(rawStr.replace(/,/g, ''));
    const next = isNaN(parsed) ? 0 : parsed;
    if (max !== undefined && next > max) {
      onChange(max);
    } else if (min !== undefined && next < min) {
      onChange(min);
    } else {
      onChange(next);
    }
  }, [rawStr, onChange, min, max]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setRawStr(e.target.value);
  }, []);

  const computedStyle: React.CSSProperties = {
    ...numInputStyle,
    ...(disabled ? { backgroundColor: 'var(--color-bg-secondary)', cursor: 'not-allowed', opacity: 0.7 } : {}),
    ...extraStyle,
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={focused ? rawStr : formatNum(value)}
      onFocus={disabled ? undefined : handleFocus}
      onBlur={disabled ? undefined : handleBlur}
      onChange={focused && !disabled ? handleChange : undefined}
      readOnly={!focused || disabled}
      disabled={disabled}
      style={computedStyle}
      aria-label={ariaLabel}
      title={title}
    />
  );
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
              <th scope="col" style={{ padding: '10px 12px', textAlign: 'right', width: '160px' }}>
                {isRu ? 'Цена за ед.' : 'Birlik narxi'}
              </th>
              <th scope="col" style={{ padding: '10px 12px', textAlign: 'right', width: '110px' }}>
                {isRu ? 'Скидка %' : 'Skidka %'}
              </th>
              <th scope="col" style={{ padding: '10px 12px', textAlign: 'right', width: '160px' }}>
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

                  {/* Product */}
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
                    <FormattedNumInput
                      value={item.quantity}
                      onChange={(val) => onItemChange(idx, 'quantity', val)}
                      disabled={isLocked}
                      min={0}
                      ariaLabel={`${isRu ? 'Количество для строки' : 'Miqdor'} ${idx + 1}`}
                    />
                  </td>

                  {/* Ready Qty (read-only display) */}
                  {orderStatus !== 'NEW' && (
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <span style={{ fontWeight: 600, color: (item.readyQty || 0) >= item.quantity ? '#10b981' : '#f59e0b' }}>
                        {item.readyQty || 0} / {item.quantity}
                      </span>
                    </td>
                  )}

                  {/* Unit Price */}
                  <td style={{ padding: '10px 12px' }}>
                    <FormattedNumInput
                      value={item.unitPrice}
                      onChange={(val) => onItemChange(idx, 'unitPrice', val)}
                      disabled={isLocked || !isPriceOverrideAllowed}
                      min={0}
                      extraStyle={!isPriceOverrideAllowed ? { backgroundColor: 'var(--color-bg-secondary)', cursor: 'not-allowed' } : undefined}
                      ariaLabel={`${isRu ? 'Цена за единицу для строки' : 'Birlik narxi'} ${idx + 1}`}
                      title={
                        !isPriceOverrideAllowed
                          ? (isRu ? 'Ручное изменение цены запрещено настройками' : "Narxni qo'lda o'zgartirish taqiqlangan")
                          : undefined
                      }
                    />
                  </td>

                  {/* Discount % */}
                  <td style={{ padding: '10px 12px' }}>
                    <FormattedNumInput
                      value={item.discount}
                      onChange={(val) => onItemChange(idx, 'discount', val)}
                      disabled={isLocked}
                      min={0}
                      max={100}
                      ariaLabel={`${isRu ? 'Скидка для строки' : 'Chegirma %'} ${idx + 1}`}
                    />
                  </td>

                  {/* Line Total */}
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                    {formatNum(lineTotal)} {(currency || 'UZS').toUpperCase()}
                  </td>

                  {/* Delete */}
                  {!isLocked && (
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onRemoveItem(idx)}
                        style={{ color: 'var(--color-text-tertiary)', padding: '4px' }}
                        title={isRu ? 'Удалить строку' : "Qatorni o'chirish"}
                        aria-label={`${isRu ? 'Удалить строку' : "Qatorni o'chirish"} ${idx + 1}`}
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
            aria-label={isRu ? 'Добавить новую позицию' : "Yangi qator qo'shish"}
          >
            <Plus size={16} /> {isRu ? 'Добавить позицию' : "Qator qo'shish"}
          </Button>
        </div>
      )}
    </Card>
  );
}
