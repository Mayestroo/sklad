import { TranslatableField } from './i18n';

export type SubscriptionPlan = 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'OVERDUE' | 'CANCELLED';

export interface PricingPlan {
  id: SubscriptionPlan;
  name: TranslatableField;
  priceMonthly: number; // in UZS
  priceYearly: number;  // in UZS
  features: TranslatableField[];
  isPopular?: boolean;
}

export interface Subscription {
  id: string;
  tenantId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  amount: number;
  currency: string;
  startDate: string;
  endDate: string;
  nextBillingAt: string;
  daysRemaining?: number;
}

export interface SubscriptionPayment {
  id: string;
  tenantId: string;
  subscriptionId: string | null;
  paymentNumber: string;
  method: 'CLICK' | 'PAYME' | 'BANK_TRANSFER';
  amount: number;
  status: 'PAID' | 'DRAFT' | 'CANCELLED';
  paidAt: string;
  transactionId: string | null;
  receiptUrl: string | null;
}
