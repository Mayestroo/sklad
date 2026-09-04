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
  vatRate?: number;
  vatAmount?: number;
  totalPrice: number;
  product?: {
    id: string;
    name: any;
    sku: string;
    type?: string;
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
  actNumber?: string;
  reason?: string;
  comment?: string;
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

export interface AdditionalExpenseItem {
  id: string;
  expenseId: string;
  receiptItemId: string;
  productId: string;
  initialLandedCost: number;
  allocatedAmount: number;
  newLandedCost: number;
  soldQuantity: number;
  remainingQuantity: number;
  cogsAdjustment: number;
  product?: {
    id: string;
    name: any;
    sku: string;
    unitOfMeasure: string;
    weight?: number;
  };
  receiptItem?: PurchaseReceiptItem;
}

export interface AdditionalExpense {
  id: string;
  tenantId: string;
  docNumber: string;
  docDate: string;
  status: PurchaseDocStatus;
  expenseType: ExpenseType;
  counterpartyId: string;
  receiptId: string;
  amount: number;
  currency: string;
  exchangeRate: number;
  vatRate: number;
  vatAmount: number;
  allocationMethod: ExpenseAllocationMethod;
  isPaid: boolean;
  cashAccountId?: string;
  comment?: string;
  createdById?: string;
  postedById?: string;
  postedAt?: string;
  createdAt: string;
  updatedAt: string;
  counterparty?: {
    id: string;
    name: string;
    phone?: string;
    inn?: string;
  };
  receipt?: PurchaseReceipt;
  cashAccount?: {
    id: string;
    name: any;
    currency: string;
  };
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  postedBy?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  items?: AdditionalExpenseItem[];
}

export interface BatchConsumption {
  id: string;
  tenantId: string;
  salesInvoiceItemId: string;
  batchId: string;
  quantity: number;
  unitCost: number;
  createdAt: string;
  salesInvoiceItem?: any;
  batch?: any;
}

export interface AllocationPreviewItem {
  receiptItemId: string;
  productId: string;
  productName: any;
  sku: string;
  unitOfMeasure: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  weight: number;
  initialLandedCost: number;
  allocatedAmount: number;
  allocatedPerUnit: number;
  newLandedCost: number;
  costIncreasePercent: number;
  soldQuantity: number;
  remainingQuantity: number;
  cogsAdjustment: number;
  stockAdjustment: number;
}

export interface AllocationPreviewResult {
  expenseAmount: number;
  allocationMethod: ExpenseAllocationMethod;
  allocatedTotal: number;
  remainder: number;
  items: AllocationPreviewItem[];
}

