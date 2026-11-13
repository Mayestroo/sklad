import type { Prisma } from '@prisma/client';

/** The parts of `Company.settings` (JSON) the backend reads. */
export interface CompanySettings {
  sales?: {
    enableMultiTierPriceLists?: boolean;
    allowSellerPriceOverride?: boolean;
    defaultCurrency?: string;
  };
}

/** Reads `Company.settings`; a missing or null value reads as no settings. */
export function readCompanySettings(
  settings: Prisma.JsonValue | null | undefined,
): CompanySettings {
  return (settings as CompanySettings | null) || {};
}
