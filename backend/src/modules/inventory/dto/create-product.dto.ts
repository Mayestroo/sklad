import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsValidCurrency } from '../../../common/validators/currency.validator';

export class TranslatableTextDto {
  @IsString()
  @IsNotEmpty()
  uz: string;

  @IsString()
  @IsNotEmpty()
  ru: string;
}

/** An extra unit of a product: 1 `name` = `factor` base units. */
export class ProductUnitDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  name: string;

  @IsNumber()
  @Min(0.000000000001)
  factor: number;
}

export class CreateProductDto {
  @IsObject()
  @ValidateNested()
  @Type(() => TranslatableTextDto)
  name: TranslatableTextDto;

  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => TranslatableTextDto)
  description?: TranslatableTextDto;

  @IsString()
  @IsOptional()
  categoryId?: string;

  @IsEnum(['PRODUCT', 'RAW_MATERIAL', 'FINISHED_PRODUCT', 'SERVICE', 'BUNDLE'])
  @IsOptional()
  type?: 'PRODUCT' | 'RAW_MATERIAL' | 'FINISHED_PRODUCT' | 'SERVICE' | 'BUNDLE';

  /** Only for FINISHED_PRODUCT: other recipes may use it as a material (TZ 3.1). */
  @IsBoolean()
  @IsOptional()
  isSemiFinished?: boolean;

  /** Extra units (1 qop = 50 kg). On update the list replaces the stored one. */
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ProductUnitDto)
  units?: ProductUnitDto[];

  @IsString()
  @IsOptional()
  sku?: string;

  @IsString()
  @IsOptional()
  barcode?: string;

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
}
