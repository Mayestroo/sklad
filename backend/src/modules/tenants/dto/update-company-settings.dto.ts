import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { Prisma } from '@prisma/client';

export class SalesSettingsDto {
  @IsOptional()
  @IsBoolean()
  enableMultiTierPriceLists?: boolean;

  @IsOptional()
  @IsBoolean()
  allowSellerPriceOverride?: boolean;

  @IsOptional()
  @IsString()
  defaultCurrency?: string;
}

/** `Company.settings.accounting` (see common/settings/accounting-settings.ts). */
export class AccountingSettingsDto {
  /**
   * D2: account (chart-of-accounts code) for the gap when returned goods
   * leave at a landed cost below their base price. Null clears it.
   */
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{4}$/, {
    message: 'purchaseReturnGainAccountCode must be a 4-digit account code',
  })
  purchaseReturnGainAccountCode?: string | null;
}

export class UpdateCompanySettingsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => SalesSettingsDto)
  sales?: SalesSettingsDto;

  @IsOptional()
  inventory?: Prisma.InputJsonObject;

  @IsOptional()
  @ValidateNested()
  @Type(() => AccountingSettingsDto)
  accounting?: AccountingSettingsDto;
}
