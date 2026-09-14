export type OpeningBalanceStatus = 'DRAFT' | 'PENDING_REVIEW' | 'POSTED' | 'CANCELLED';

export type OpeningBalanceCategory =
  | 'CASH'
  | 'BANK'
  | 'INVENTORY'
  | 'CUSTOMER_DEBT'
  | 'SUPPLIER_DEBT'
  | 'CUSTOMER_ADVANCE'
  | 'SUPPLIER_ADVANCE'
  | 'FIXED_ASSET'
  | 'OTHER_ASSET'
  | 'OTHER_LIABILITY'
  | 'EQUITY';

export interface OpeningBalanceLine {
  id: string;
  documentId: string;
  tenantId: string;
  category: OpeningBalanceCategory;
  accountId?: string | null;
  productId?: string | null;
  warehouseId?: string | null;
  counterpartyId?: string | null;
  fixedAssetId?: string | null;
  quantity?: number | null;
  unitCost?: number | null;
  amount: number;
  accumulatedDepreciation?: number | null;
  netAmount: number;
  currency: string;
  exchangeRate: number;
  batchNumber?: string | null;
  contractNumber?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;

  // Joined entity objects for UI
  account?: {
    id: string;
    accountType: string;
    name: any;
    currency: string;
    balance: number;
  } | null;
  product?: {
    id: string;
    sku: string;
    name: any;
    unit: string;
  } | null;
  warehouse?: {
    id: string;
    name: any;
  } | null;
  counterparty?: {
    id: string;
    name: string;
    type: string;
    inn?: string | null;
    phone?: string | null;
  } | null;
  fixedAsset?: {
    id: string;
    name: string;
    inventoryNumber: string;
    assetType: string;
    netBookValue: number;
  } | null;
}

export interface OpeningBalanceDocument {
  id: string;
  tenantId: string;
  docNumber: string;
  openingDate: string;
  status: OpeningBalanceStatus;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  balanceDifference: number;
  notes?: string | null;
  createdById?: string | null;
  approvedById?: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string | null;
  lines?: OpeningBalanceLine[];
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  approvedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

export interface OpeningBalanceMetrics {
  totalAssets: number;
  totalLiabilities: number;
  suggestedEquity: number;
  enteredEquity: number;
  balanceDifference: number;
  isBalanced: boolean;
  categoryBreakdown: Record<OpeningBalanceCategory, number>;
}

export interface ImportErrorItem {
  sheetName: string;
  rowNumber: number;
  fieldName?: string;
  invalidValue?: string;
  errorMessage: string;
}

export interface ImportValidationResult {
  fileName: string;
  totalRows: number;
  validRows: number;
  errorCount: number;
  errors: ImportErrorItem[];
  previewLines?: Array<Partial<OpeningBalanceLine>>;
}
