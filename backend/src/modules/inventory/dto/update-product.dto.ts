import {
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TranslatableTextDto } from './create-product.dto';
import { IsValidCurrency } from '../../../common/validators/currency.validator';

export class UpdateProductDto {
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => TranslatableTextDto)
  name?: TranslatableTextDto;

  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => TranslatableTextDto)
  description?: TranslatableTextDto;

  @IsString()
  @IsOptional()
  categoryId?: string | null;

  @IsEnum(['PRODUCT', 'RAW_MATERIAL', 'SERVICE', 'BUNDLE'])
  @IsOptional()
  type?: 'PRODUCT' | 'RAW_MATERIAL' | 'SERVICE' | 'BUNDLE';

  @IsString()
  @IsOptional()
  sku?: string;

  @IsString()
  @IsOptional()
  barcode?: string | null;

  @IsEnum(['piece', 'kg', 'liter', 'meter', 'box', 'pack'])
  @IsOptional()
  unitOfMeasure?: 'piece' | 'kg' | 'liter' | 'meter' | 'box' | 'pack';

  @IsNumber()
  @Min(0)
  @IsOptional()
  costPrice?: number;

  @IsValidCurrency()
  @IsOptional()
  costPriceCurrency?: string;

  @IsNumber()
  @Min(0.0001)
  @IsOptional()
  costPriceExchangeRate?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  salePrice?: number;

  @IsValidCurrency()
  @IsOptional()
  salePriceCurrency?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  vatRate?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  minStockAlert?: number;

  @IsOptional()
  isActive?: boolean;
}
