import { Prisma } from '@prisma/client';

/**
 * Document tables whose draft edit locks the row (F9, as the T4 draft-invoice
 * edit). The table name is interpolated as an identifier, so only these
 * fixed names are allowed.
 */
const LOCKABLE_TABLES = {
  purchaseReceipt: 'purchase_receipts',
  additionalExpense: 'additional_expenses',
  serviceAct: 'service_acts',
  openingBalanceDocument: 'opening_balance_documents',
} as const;

export type LockableDocument = keyof typeof LOCKABLE_TABLES;

/**
 * Locks the document row for the rest of the transaction (SELECT ... FOR
 * UPDATE) and returns its current status, or null when the document does not
 * exist in this tenant. A concurrent edit or post of the same document waits
 * until this transaction ends, so the status checked here is the one the
 * write sees.
 */
export async function lockDocumentStatus(
  tx: Prisma.TransactionClient,
  document: LockableDocument,
  id: string,
  tenantId: string,
): Promise<string | null> {
  const table = Prisma.raw(`"${LOCKABLE_TABLES[document]}"`);
  const rows = await tx.$queryRaw<{ status: string }[]>(Prisma.sql`
    SELECT "status" FROM ${table}
    WHERE "id" = ${id} AND "tenant_id" = ${tenantId}
    FOR UPDATE
  `);
  return rows[0]?.status ?? null;
}
