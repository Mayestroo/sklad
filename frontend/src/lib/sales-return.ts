/**
 * A sales return is booked against its original sales invoice: same customer,
 * same warehouse and same currency. The backend rejects any mismatch, so the UI
 * takes these from the invoice instead of letting the user (or a default) pick.
 */
export interface ReturnableInvoice {
  id: string;
  counterpartyId: string;
  warehouseId: string;
  currency: string;
}

export interface SalesReturnHeader {
  invoiceId: string;
  counterpartyId: string;
  warehouseId: string;
  currency: string;
}

export function salesReturnHeaderFromInvoice(invoice: ReturnableInvoice): SalesReturnHeader {
  if (!invoice.currency) {
    throw new Error(`Sales invoice ${invoice.id} has no currency`);
  }
  if (!invoice.warehouseId) {
    throw new Error(`Sales invoice ${invoice.id} has no warehouse`);
  }
  return {
    invoiceId: invoice.id,
    counterpartyId: invoice.counterpartyId,
    warehouseId: invoice.warehouseId,
    currency: invoice.currency,
  };
}
