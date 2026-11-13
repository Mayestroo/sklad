/**
 * A sales order as GET /api/sales/orders/:id returns it, as far as the order
 * form and its modals (payment, dispatch, pick list, delivery note) read it.
 */
export interface SalesOrderItemDetail {
  id: string;
  productId: string;
  quantity: number | string;
  unitPrice: number | string;
  discount?: number | string;
  vatRate?: number | string | null;
  totalPrice?: number | string;
  readyQty?: number | string | null;
  shippedQty?: number | string | null;
  product?: {
    name?: string | Record<string, string>;
    sku?: string;
    barcode?: string;
    unitOfMeasure?: string;
  };
}

export interface SalesOrderInvoiceRef {
  id: string;
  invoiceNumber: string;
  invoiceDate: string | Date;
  status?: string;
  totalAmount: number | string;
  createdAt?: string | Date;
}

export interface SalesOrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  orderDate?: string | Date;
  createdAt: string | Date;
  counterpartyId: string;
  warehouseId?: string | null;
  assignedSellerId?: string | null;
  currency: string;
  exchangeRate?: number | string | null;
  paymentCondition?: 'PREPAID_100' | 'PARTIAL' | 'CREDIT' | null;
  requiredPaymentPercent?: number | string | null;
  deliveryDate?: string | null;
  deliveryAddress?: string | null;
  comment?: string | null;
  subtotalAmount?: number | string;
  discountAmount?: number | string;
  additionalChargeAmount?: number | string | null;
  additionalChargeVatRate?: number | string | null;
  totalAmount: number;
  paidAmount: number;
  counterparty?: { name: string; phone?: string; inn?: string; address?: string } | null;
  warehouse?: { name: string | Record<string, string>; address?: string } | null;
  assignedSeller?: { firstName: string; lastName: string } | null;
  items?: SalesOrderItemDetail[];
  salesInvoices?: SalesOrderInvoiceRef[];
}

/** Per product: physical stock, reserved, and free to sell, in one warehouse. */
export interface StockAvailability {
  physical: number;
  reserved: number;
  free: number;
}
