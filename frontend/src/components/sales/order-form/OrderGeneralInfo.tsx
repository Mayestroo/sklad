'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';
import { Select, SelectOption } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { DatePicker } from '@/components/ui/DatePicker';
import { CURRENCY_OPTIONS } from '@/lib/utils';
import {
  CounterpartyDropdownItem,
  UserDropdownItem,
  PriceListDropdownItem,
} from '@/hooks/useDocumentDropdowns';

export interface OrderGeneralInfoProps {
  locale: 'uz' | 'ru';
  isLocked: boolean;
  counterpartyId: string;
  onCounterpartyChange: (id: string) => void;
  customerOptions: SelectOption[];
  onQuickCustomerOpen?: () => void;
  priceListId: string;
  onPriceListChange: (id: string) => void;
  priceLists: PriceListDropdownItem[];
  paymentCondition: 'PREPAID_100' | 'PARTIAL' | 'CREDIT';
  onPaymentConditionChange: (cond: 'PREPAID_100' | 'PARTIAL' | 'CREDIT') => void;
  requiredPaymentPercent: number;
  onRequiredPaymentPercentChange: (pct: number) => void;
  assignedSellerId: string;
  onAssignedSellerChange: (id: string) => void;
  sellers: UserDropdownItem[];
  deliveryDate: string;
  onDeliveryDateChange: (date: string) => void;
  currency: string;
  onCurrencyChange: (curr: string) => void;
  deliveryAddress: string;
  onDeliveryAddressChange: (addr: string) => void;
  comment: string;
  onCommentChange: (comment: string) => void;
}

export function OrderGeneralInfo({
  locale,
  isLocked,
  counterpartyId,
  onCounterpartyChange,
  customerOptions,
  onQuickCustomerOpen,
  priceListId,
  onPriceListChange,
  priceLists,
  paymentCondition,
  onPaymentConditionChange,
  requiredPaymentPercent,
  onRequiredPaymentPercentChange,
  assignedSellerId,
  onAssignedSellerChange,
  sellers,
  deliveryDate,
  onDeliveryDateChange,
  currency,
  onCurrencyChange,
  deliveryAddress,
  onDeliveryAddressChange,
  comment,
  onCommentChange,
}: OrderGeneralInfoProps) {
  const isRu = locale === 'ru';

  return (
    <Card style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)' }}>
        {isRu ? 'Основная информация' : 'Asosiy Hujjat Ma’lumotlari'}
      </h3>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
        {/* Customer */}
        <div style={{ minWidth: '200px', flex: '2 1 220px' }}>
          <Select
            label={isRu ? 'Клиент (Покупатель) *' : 'Mijoz (Xaridor) *'}
            options={customerOptions}
            value={counterpartyId}
            onChange={onCounterpartyChange}
            placeholder={isRu ? 'Выберите клиента' : 'Mijozni tanlang'}
            disabled={isLocked}
            onCreateNew={!isLocked ? onQuickCustomerOpen : undefined}
            createNewLabel={isRu ? 'Добавить клиента' : 'Yangi mijoz qo‘shish'}
          />
        </div>

        {/* Price List */}
        <div style={{ minWidth: '180px', flex: '1.5 1 200px' }}>
          <Select
            label={isRu ? 'Прайс-лист цен' : 'Narx jadvali'}
            options={[
              { value: '', label: isRu ? '— Базовый (Основной) —' : '— Asosiy (Bazaviy) —' },
              ...priceLists.map((pl) => {
                const plName = typeof pl.name === 'object' ? (pl.name[locale] || pl.name.ru || pl.name.uz) : pl.name;
                return { value: pl.id, label: `${plName} (${pl.currency || 'UZS'})` };
              }),
            ]}
            value={priceListId}
            onChange={onPriceListChange}
            disabled={isLocked}
          />
        </div>

        {/* Payment Condition */}
        <div style={{ minWidth: '160px', flex: '1.5 1 180px' }}>
          <Select
            label={isRu ? 'Условие отгрузки / оплаты' : 'To‘lov / Jo‘natish sharti'}
            options={[
              { value: 'PREPAID_100', label: isRu ? '100% Предоплата' : '100% Oldindan to‘lov' },
              { value: 'PARTIAL', label: isRu ? 'Частичная предоплата (%)' : 'Qisman oldindan to‘lov (%)' },
              { value: 'CREDIT', label: isRu ? 'В кредит (Без предоплаты)' : 'Nasiya / Kreditga' },
            ]}
            value={paymentCondition}
            onChange={(val) => onPaymentConditionChange(val as any)}
            disabled={isLocked}
          />
        </div>

        {/* Required % when partial */}
        {paymentCondition === 'PARTIAL' && (
          <div style={{ minWidth: '120px', flex: '1 1 130px' }}>
            <Input
              label={isRu ? 'Мин. % оплаты' : 'Min. to‘lov %'}
              type="number"
              min={1}
              max={100}
              value={requiredPaymentPercent}
              onChange={(e) => onRequiredPaymentPercentChange(parseFloat(e.target.value) || 50)}
              disabled={isLocked}
            />
          </div>
        )}

        {/* Responsible Seller */}
        <div style={{ minWidth: '160px', flex: '1.5 1 180px' }}>
          <Select
            label={isRu ? 'Ответственный продавец' : 'Mas’ul sotuvchi'}
            options={[
              { value: '', label: isRu ? '— Не назначен —' : '— Biriktirilmagan —' },
              ...sellers.map((s) => ({ value: s.id, label: `${s.firstName} ${s.lastName}` })),
            ]}
            value={assignedSellerId}
            onChange={onAssignedSellerChange}
            disabled={isLocked}
          />
        </div>

        {/* Delivery Date */}
        <div style={{ minWidth: '140px', flex: '1 1 150px' }}>
          <DatePicker
            label={isRu ? 'Требуемая дата доставки' : 'Yetkazish talab sanasi'}
            value={deliveryDate}
            onChange={onDeliveryDateChange}
            disabled={isLocked}
          />
        </div>

        {/* Currency */}
        <div style={{ minWidth: '90px', flex: '0.8 1 100px' }}>
          <Select
            label={isRu ? 'Валюта' : 'Valyuta'}
            options={CURRENCY_OPTIONS}
            value={currency}
            onChange={onCurrencyChange}
            disabled={isLocked}
          />
        </div>

        {/* Delivery Address */}
        <div style={{ minWidth: '220px', flex: '2 1 250px' }}>
          <Input
            label={isRu ? 'Адрес доставки' : 'Yetkazish manzili'}
            value={deliveryAddress}
            onChange={(e) => onDeliveryAddressChange(e.target.value)}
            placeholder={isRu ? 'Город, район, улица...' : 'Shahar, tuman, ko‘cha...'}
            disabled={isLocked}
          />
        </div>

        {/* Comment */}
        <div style={{ minWidth: '220px', flex: '2 1 250px' }}>
          <Input
            label={isRu ? 'Примечание / Комментарий' : 'Izoh / Qayd'}
            value={comment}
            onChange={(e) => onCommentChange(e.target.value)}
            placeholder={isRu ? 'Дополнительные сведения...' : 'Qo‘shimcha ma’lumotlar...'}
            disabled={isLocked}
          />
        </div>
      </div>
    </Card>
  );
}
