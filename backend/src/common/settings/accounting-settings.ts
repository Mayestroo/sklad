import type { Prisma } from '@prisma/client';

/**
 * Keys of `Company.settings.accounting` that drive automatic postings.
 *
 * purchaseReturnGainAccountCode (D2): the ledger account that takes the gap
 * when goods go back to a supplier at a landed cost below their base price
 * (e.g. a USD receipt whose batches were costed at a lower rate). The
 * accountant chooses it; there is deliberately no default.
 */
export interface AccountingSettings {
  purchaseReturnGainAccountCode?: string | null;
}

export const PURCHASE_RETURN_GAIN_ACCOUNT_SETTING =
  'purchaseReturnGainAccountCode' as const;

/** Reads the accounting section of `Company.settings` (JSON). */
export function accountingSettings(
  settings: Prisma.JsonValue | null | undefined,
): AccountingSettings {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return {};
  }
  const accounting = settings.accounting;
  if (
    !accounting ||
    typeof accounting !== 'object' ||
    Array.isArray(accounting)
  ) {
    return {};
  }
  const code = accounting[PURCHASE_RETURN_GAIN_ACCOUNT_SETTING];
  return {
    purchaseReturnGainAccountCode:
      typeof code === 'string' && code.trim() !== '' ? code.trim() : null,
  };
}
