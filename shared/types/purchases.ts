export type PurchaseDocStatus = 'DRAFT' | 'POSTED' | 'CANCELLED';

export type PurchasePaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';

export type PurchaseReturnStatus = 'NONE' | 'PARTIALLY_RETURNED' | 'FULLY_RETURNED';

export type ExpenseType = 'TRANSPORT' | 'CUSTOMS' | 'BROKER' | 'INSURANCE' | 'OTHER';

export type ExpenseAllocationMethod = 'BY_AMOUNT' | 'BY_QUANTITY' | 'BY_WEIGHT';

export type ReturnDocStatus = 'DRAFT' | 'POSTED' | 'CANCELLED';

export interface PurchaseReceiptItem {
  id: string;
  receiptId: string;
  productId: string;
  quantity: number;
  weight: number;
  unitPrice: number;
  discount: number;
  vatRate: number;
  vatAmount: number;
  totalPrice: number;
  allocatedExpenses: number;
  landedCost: number;
  product?: {
    id: string;
    name: any;
    sku: string;
    unitOfMeasure: string;
    weight?: number;
  };
}

export interface PurchaseExpense {
  id: string;
  tenantId: string;
  receiptId: string;
  expenseType: ExpenseType;
  supplierId?: string;
  amount: number;
  currency: string;
  allocationMethod: ExpenseAllocationMethod;
  comment?: string;
  createdAt: string;
  receipt?: PurchaseReceipt;
  supplier?: {
    id: string;
    name: string;
  };
}

export interface PurchaseReceipt {
  id: string;
  tenantId: string;
  docNumber: string;
  docDate: string;
  counterpartyId: string;
  warehouseId: string;
  currency: string;
  exchangeRate: number;
  contractNumber?: string;
  contractDate?: string;
  comment?: string;
  status: PurchaseDocStatus;
  paymentStatus: PurchasePaymentStatus;
  returnStatus: PurchaseReturnStatus;
  subtotalAmount: number;
  discountAmount: number;
  vatAmount: number;
  additionalExpensesTotal: number;
  totalAmount: number;
  paidAmount: number;
  gtdNumber?: string;
  gtdDate?: string;
  customsPost?: string;
  createdById?: string;
  postedById?: string;
  postedAt?: string;
  createdAt: string;
  updatedAt: string;
  counterparty?: {
    id: string;
    name: string;
    inn?: string;
    phone?: string;
  };
  warehouse?: {
    id: string;
    name: any;
  };
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  items?: PurchaseReceiptItem[];
  expenses?: PurchaseExpense[];
  returns?: PurchaseReturn[];
}

export interface PurchaseReturnItem {
  id: string;
  returnId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  product?: {
    id: string;
    name: any;
    sku: string;
  };
}

export interface PurchaseReturn {
  id: string;
  tenantId: string;
  returnNumber: string;
  returnDate: string;
  receiptId?: string;
  counterpartyId: string;
  warehouseId: string;
  currency: string;
  reason?: string;
  status: ReturnDocStatus;
  totalAmount: number;
  createdAt: string;
  counterparty?: {
    id: string;
    name: string;
  };
  warehouse?: {
    id: string;
    name: any;
  };
  receipt?: PurchaseReceipt;
  items?: PurchaseReturnItem[];
}

export interface PurchaseSummaryStats {
  monthlyPurchasesTotal: number;
  monthlyPurchasesCount: number;
  totalSupplierDebt: number;
  suppliersWithDebtCount: number;
  monthlyReturnsTotal: number;
  monthlyReturnsCount: number;
  activeSuppliersCount: number;
}
