import { IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

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
  inventory?: Record<string, any>;

  @IsOptional()
  accounting?: Record<string, any>;
}
