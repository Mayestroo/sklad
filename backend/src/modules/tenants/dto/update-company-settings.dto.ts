import {
  IsBoolean,
  IsIn,
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

/** `Company.settings.production` (TZ 8.3: one company-wide costing setting). */
export class ProductionSettingsDto {
  /** Catalog (estimated) cost: last receipt price (default) or the average. */
  @IsOptional()
  @IsIn(['LAST', 'AVERAGE'])
  estimatedCostMethod?: 'LAST' | 'AVERAGE';
}

export class UpdateCompanySettingsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ProductionSettingsDto)
  production?: ProductionSettingsDto;

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
