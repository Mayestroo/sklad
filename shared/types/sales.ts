import { Product } from './inventory';

export type CounterpartyType = 'CUSTOMER' | 'SUPPLIER' | 'BOTH';
export type SalesDocStatus = 'DRAFT' | 'POSTED' | 'CANCELLED';
export type SalesPaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
export type SalesReturnStatus = 'NONE' | 'PARTIALLY_RETURNED' | 'FULLY_RETURNED';
export type SalesReturnDocStatus = 'DRAFT' | 'POSTED' | 'CANCELLED';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'CLICK' | 'PAYME';
export type DealStageSlug = 'LEAD' | 'QUALIFICATION' | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST';

export interface Counterparty {
  id: string;
  tenantId: string;
  type: CounterpartyType;
  name: string;
  inn: string | null;          // STIR (9 digits in UZ)
  mfo: string | null;          // MFO (5 digits)
  bankAccount: string | null;
  bankName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  debtBalance: number;
  createdAt: string;
  updatedAt: string;
}

export interface SalesInvoiceItem {
  id: string;
  invoiceId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  vatRate: number;
  vatAmount: number;
  totalPrice: number;
  unitCogs: number;
  lineCogs: number;
  lineGrossProfit: number;
  isBelowCost: boolean;
  product?: Product;
}

export interface SalesInvoice {
  id: string;
  tenantId: string;
  warehouseId: string;
  counterpartyId: string;
  invoiceNumber: string;
  status: SalesDocStatus;
  paymentStatus: SalesPaymentStatus;
  returnStatus: SalesReturnStatus;
  invoiceDate: string;
  currency: string;
  exchangeRate: number;
  contractNumber?: string;
  contractDate?: string;
  paymentTerms?: string;
  comment?: string;
  subtotalAmount: number;
  discountAmount: number;
  vatAmount: number;
  totalAmount: number;
  paidAmount: number;
  totalCogs: number;
  grossProfit: number;
  createdById?: string;
  postedById?: string;
  postedAt?: string;
  createdAt: string;
  updatedAt: string;
  counterparty?: Counterparty;
  warehouse?: {
    id: string;
    name: any;
  };
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  items?: SalesInvoiceItem[];
  payments?: SalesPayment[];
  returns?: SalesReturn[];
}

export interface SalesReturnItem {
  id: string;
  returnId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  unitCogs: number;
  lineCogs: number;
  product?: Product;
}

export interface SalesReturn {
  id: string;
  tenantId: string;
  returnNumber: string;
  returnDate: string;
  invoiceId?: string;
  counterpartyId: string;
  warehouseId: string;
  currency: string;
  reason?: string;
  status: SalesReturnDocStatus;
  totalAmount: number;
  totalCogs: number;
  createdById?: string;
  createdAt: string;
  updatedAt: string;
  counterparty?: Counterparty;
  warehouse?: {
    id: string;
    name: any;
  };
  invoice?: SalesInvoice;
  items?: SalesReturnItem[];
}

export interface PriceList {
  id: string;
  tenantId: string;
  name: any; // { uz: string, ru: string }
  currency: string;
  isDefault: boolean;
  isActive: boolean;
  prices?: ProductPrice[];
}

export interface ProductPrice {
  id: string;
  priceListId: string;
  productId: string;
  price: number;
  product?: Product;
}

export interface SalesSummaryStats {
  monthlySalesTotal: number;
  monthlySalesCount: number;
  monthlyCogsTotal: number;
  monthlyGrossProfit: number;
  monthlyGrossProfitMargin: number;
  totalCustomerDebt: number;
  customersWithDebtCount: number;
  monthlyReturnsTotal: number;
}

export interface SalesPayment {
  id: string;
  tenantId: string;
  counterpartyId: string;
  invoiceId?: string | null;
  paymentNumber: string;
  method: string;
  amount: number;
  comment?: string | null;
  createdAt: string;
}
