import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  IsBoolean,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PurchaseReceiptItemDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  vatRate?: number;
}

export class CreatePurchaseReceiptDto {
  @IsString()
  @IsNotEmpty()
  counterpartyId: string;

  @IsString()
  @IsNotEmpty()
  warehouseId: string;

  @IsOptional()
  @IsString()
  docDate?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  exchangeRate?: number;

  @IsOptional()
  @IsString()
  contractNumber?: string;

  @IsOptional()
  @IsString()
  contractDate?: string;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsString()
  gtdNumber?: string;

  @IsOptional()
  @IsString()
  gtdDate?: string;

  @IsOptional()
  @IsString()
  customsPost?: string;

  @IsOptional()
  @IsBoolean()
  postImmediately?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseReceiptItemDto)
  items: PurchaseReceiptItemDto[];
}
