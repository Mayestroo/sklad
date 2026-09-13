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

  @IsNumber()
  @Min(0)
  @IsOptional()
  salePrice?: number;

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
