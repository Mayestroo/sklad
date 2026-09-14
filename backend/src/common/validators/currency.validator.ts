import { IsIn, IsNotEmpty } from 'class-validator';
import { applyDecorators } from '@nestjs/common';

/**
 * Supported transaction currencies in the system.
 * Changing this list requires a coordinated DTO + service update.
 */
export const SUPPORTED_CURRENCIES = ['USD', 'UZS'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/**
 * Validates that a currency field is present and belongs to the
 * set of supported currencies.  Apply this to any DTO field that
 * carries a transaction currency (purchase receipts, sales invoices,
 * sales orders, service acts, returns, additional expenses, payments).
 *
 * @example
 *   @IsValidCurrency()
 *   currency: string;
 */
export function IsValidCurrency() {
  return applyDecorators(
    IsNotEmpty({ message: 'currency is required' }),
    IsIn(SUPPORTED_CURRENCIES, {
      message: `currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`,
    }),
  );
}
