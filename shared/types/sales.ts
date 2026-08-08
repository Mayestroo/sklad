import { Product } from './inventory';

export type CounterpartyType = 'CUSTOMER' | 'SUPPLIER' | 'BOTH';
export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';
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
  vatAmount: number;
  totalPrice: number;
  product?: Product;
}

export interface SalesInvoice {
  id: string;
  tenantId: string;
  warehouseId: string;
  counterpartyId: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  invoiceDate: string;
  subtotalAmount: number;
  vatAmount: number;
  totalAmount: number;
  paidAmount: number;
  createdById: string | null;
  counterparty?: Counterparty;
  items?: SalesInvoiceItem[];
}

export interface PurchaseOrder {
  id: string;
  tenantId: string;
  counterpartyId: string;
  orderNumber: string;
  status: string;
  orderDate: string;
  totalAmount: number;
  counterparty?: Counterparty;
}

export interface Deal {
  id: string;
  tenantId: string;
  counterpartyId: string;
  title: string;
  stage: DealStageSlug;
  amount: number;
  assignedUserId: string | null;
  expectedClose: string | null;
  createdAt: string;
  counterparty?: Counterparty;
}

export interface Payment {
  id: string;
  tenantId: string;
  counterpartyId: string;
  invoiceId: string | null;
  paymentNumber: string;
  method: PaymentMethod;
  amount: number;
  paymentDate: string;
  comment: string | null;
  counterparty?: Counterparty;
}
