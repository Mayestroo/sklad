import { TranslatableField } from './i18n';

export type ProductType = 'PRODUCT' | 'SERVICE' | 'BUNDLE';
export type UnitOfMeasure = 'piece' | 'kg' | 'liter' | 'meter' | 'box' | 'pack';
export type InventoryDocType = 'INBOUND' | 'OUTBOUND' | 'STOCKTAKING' | 'TRANSFER';
export type InventoryDocStatus = 'DRAFT' | 'POSTED' | 'CANCELLED' | 'IN_TRANSIT' | 'RECEIVED';

export interface Category {
  id: string;
  tenantId: string;
  parentId: string | null;
  name: TranslatableField;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  tenantId: string;
  categoryId: string | null;
  type: ProductType;
  name: TranslatableField;
  description: TranslatableField | null;
  sku: string;
  barcode: string | null;
  unitOfMeasure: UnitOfMeasure;
  costPrice: number;
  salePrice: number;
  vatRate: number;
  minStockAlert: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  category?: Category;
  totalStock?: number;
}

export interface StockLevel {
  id: string;
  tenantId: string;
  warehouseId: string;
  productId: string;
  quantity: number;
  reservedQuantity: number;
  product?: Product;
}

export interface InventoryDocumentItem {
  id: string;
  documentId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  product?: Product;
}

export interface InventoryDocument {
  id: string;
  tenantId: string;
  warehouseId: string;
  docNumber: string;
  docType: InventoryDocType;
  docStatus: InventoryDocStatus;
  docDate: string;
  comment: string | null;
  totalAmount: number;
  createdById: string | null;
  items?: InventoryDocumentItem[];
}

export interface StockTransferItem {
  id: string;
  transferId: string;
  productId: string;
  quantity: number;
  product?: Product;
}

export interface StockTransfer {
  id: string;
  tenantId: string;
  sourceWarehouseId: string;
  targetWarehouseId: string;
  transferNumber: string;
  status: InventoryDocStatus;
  transferDate: string;
  shippedAt?: string | null;
  receivedAt?: string | null;
  comment: string | null;
  sourceWarehouse?: any;
  targetWarehouse?: any;
  items?: StockTransferItem[];
}
