import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TranslatableTextDto {
  @IsString()
  @IsNotEmpty()
  uz: string;

  @IsString()
  @IsNotEmpty()
  ru: string;
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

  @IsEnum(['PRODUCT', 'SERVICE', 'BUNDLE'])
  @IsOptional()
  type?: 'PRODUCT' | 'SERVICE' | 'BUNDLE';

  @IsString()
  @IsNotEmpty()
  sku: string;

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
}
