import {
  IsBoolean,
  IsOptional,
  IsString,
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

export class UpdateCompanySettingsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => SalesSettingsDto)
  sales?: SalesSettingsDto;

  @IsOptional()
  inventory?: Prisma.InputJsonObject;

  @IsOptional()
  accounting?: Prisma.InputJsonObject;
}
