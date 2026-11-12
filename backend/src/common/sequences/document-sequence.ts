import { Prisma } from '@prisma/client';

/**
 * Atomic per-tenant document numbering.
 *
 * Every numbered document series has one row in `document_sequences`
 * (tenant_id, key). `nextDocumentNumber` increments it with a single
 * row-locking statement, so concurrent callers can never receive the same
 * number. When called with a transaction client the increment is part of that
 * transaction: a rollback also rolls the counter back (no gaps, no duplicates).
 *
 * The first time a series is used for a tenant, the counter is seeded from the
 * highest number already stored in the document table, so databases that were
 * numbered with the old `count() + 1` scheme continue without collisions.
 */

interface SeriesSpec {
  /** Text before the number, e.g. "INV". */
  prefix: string;
  /** Yearly series restart at 1 each calendar year: PREFIX-YYYY-NNNN. */
  yearly: boolean;
  pad: number;
  /** Table/column holding the issued numbers (used only for seeding). */
  table: string;
  column: string;
}

const SERIES = {
  PURCHASE_RECEIPT: {
    prefix: 'PUR',
    yearly: true,
    pad: 4,
    table: 'purchase_receipts',
    column: 'doc_number',
  },
  PURCHASE_RETURN: {
    prefix: 'PRET',
    yearly: true,
    pad: 4,
    table: 'purchase_returns',
    column: 'return_number',
  },
  SALES_ORDER: {
    prefix: 'Z',
    yearly: true,
    pad: 4,
    table: 'sales_orders',
    column: 'order_number',
  },
  SALES_INVOICE: {
    prefix: 'INV',
    yearly: true,
    pad: 4,
    table: 'sales_invoices',
    column: 'invoice_number',
  },
  SALES_RETURN: {
    prefix: 'SRET',
    yearly: true,
    pad: 4,
    table: 'sales_returns',
    column: 'return_number',
  },
  PRODUCTION: {
    prefix: 'PRD',
    yearly: true,
    pad: 4,
    table: 'production_documents',
    column: 'doc_number',
  },
  ADDITIONAL_EXPENSE: {
    prefix: 'EXP',
    yearly: true,
    pad: 4,
    table: 'additional_expenses',
    column: 'doc_number',
  },
  SERVICE_ACT: {
    prefix: 'ACT',
    yearly: true,
    pad: 4,
    table: 'service_acts',
    column: 'act_number',
  },
  OPENING_BALANCE: {
    prefix: 'OB',
    yearly: true,
    pad: 4,
    table: 'opening_balance_documents',
    column: 'doc_number',
  },
  FINANCE_TRANSACTION: {
    prefix: 'FT',
    yearly: true,
    pad: 5,
    table: 'finance_transactions',
    column: 'doc_number',
  },
  PAYMENT: {
    prefix: 'PAY',
    yearly: false,
    pad: 6,
    table: 'payments',
    column: 'payment_number',
  },
  STOCK_TRANSFER: {
    prefix: 'TR',
    yearly: false,
    pad: 6,
    table: 'stock_transfers',
    column: 'transfer_number',
  },
  INVENTORY_INBOUND: {
    prefix: 'IN',
    yearly: false,
    pad: 6,
    table: 'inventory_documents',
    column: 'doc_number',
  },
  INVENTORY_OUTBOUND: {
    prefix: 'OUT',
    yearly: false,
    pad: 6,
    table: 'inventory_documents',
    column: 'doc_number',
  },
  INVENTORY_STOCKTAKE: {
    prefix: 'ST',
    yearly: false,
    pad: 6,
    table: 'inventory_documents',
    column: 'doc_number',
  },
  SUBSCRIPTION_PAYMENT: {
    prefix: 'BILL',
    yearly: false,
    pad: 6,
    table: 'subscription_payments',
    column: 'payment_number',
  },
} as const satisfies Record<string, SeriesSpec>;

export type DocumentSeries = keyof typeof SERIES;

/** Any Prisma client that can run raw SQL: the root client or a transaction client. */
type RawClient = Pick<Prisma.TransactionClient, '$queryRaw'>;

export function seriesPrefix(
  series: DocumentSeries,
  date: Date = new Date(),
): string {
  const spec: SeriesSpec = SERIES[series];
  return spec.yearly
    ? `${spec.prefix}-${date.getFullYear()}-`
    : `${spec.prefix}-`;
}

export function formatDocumentNumber(
  series: DocumentSeries,
  value: number,
  date: Date = new Date(),
): string {
  return `${seriesPrefix(series, date)}${value.toString().padStart(SERIES[series].pad, '0')}`;
}

/**
 * Reserves and returns the next document number of `series` for `tenantId`.
 * `date` selects the year for yearly series (defaults to now).
 */
export async function nextDocumentNumber(
  db: RawClient,
  tenantId: string,
  series: DocumentSeries,
  date: Date = new Date(),
): Promise<string> {
  if (!tenantId) {
    throw new Error('nextDocumentNumber requires a tenantId');
  }
  const prefix = seriesPrefix(series, date);
  const key = prefix.slice(0, -1); // "INV-2026-" -> "INV-2026"

  const bumped = await db.$queryRaw<{ last_value: number }[]>`
    UPDATE "document_sequences"
    SET "last_value" = "last_value" + 1, "updated_at" = now()
    WHERE "tenant_id" = ${tenantId} AND "key" = ${key}
    RETURNING "last_value"`;

  let value: number;
  if (bumped.length > 0) {
    value = bumped[0].last_value;
  } else {
    const seed = await highestIssuedNumber(db, tenantId, series, prefix);
    // A concurrent first caller may insert between our UPDATE and INSERT; the
    // conflict branch then simply increments the row it created.
    const inserted = await db.$queryRaw<{ last_value: number }[]>`
      INSERT INTO "document_sequences" ("tenant_id", "key", "last_value", "updated_at")
      VALUES (${tenantId}, ${key}, ${seed + 1}, now())
      ON CONFLICT ("tenant_id", "key")
      DO UPDATE SET "last_value" = "document_sequences"."last_value" + 1, "updated_at" = now()
      RETURNING "last_value"`;
    value = inserted[0].last_value;
  }

  return formatDocumentNumber(series, value, date);
}

async function highestIssuedNumber(
  db: RawClient,
  tenantId: string,
  series: DocumentSeries,
  prefix: string,
): Promise<number> {
  const spec: SeriesSpec = SERIES[series];
  // Identifiers come from the SERIES constant above, never from input.
  const table = Prisma.raw(`"${spec.table}"`);
  const column = Prisma.raw(`"${spec.column}"`);
  // Cast explicitly: an untyped parameter would select SUBSTRING's regex form.
  const start = prefix.length + 1;
  const rows = await db.$queryRaw<{ max: number | null }[]>`
    SELECT MAX(CAST(SUBSTRING(${column} FROM ${start}::int) AS INTEGER)) AS max
    FROM ${table}
    WHERE "tenant_id" = ${tenantId}
      AND ${column} LIKE ${`${prefix}%`}
      AND SUBSTRING(${column} FROM ${start}::int) ~ '^[0-9]{1,9}$'`;
  return Number(rows[0]?.max ?? 0);
}
