import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SalesReturnDocStatus } from '@prisma/client';
import { IsValidCurrency } from '../../../common/validators/currency.validator';

export class SalesReturnItemDto {
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
  @IsBoolean()
  isDefective?: boolean;
}

export class CreateSalesReturnDto {
  @IsOptional()
  @IsString()
  invoiceId?: string;

  @IsString()
  @IsNotEmpty()
  counterpartyId: string;

  @IsString()
  @IsNotEmpty()
  warehouseId: string;

  @IsOptional()
  @IsString()
  defectWarehouseId?: string;

  @IsOptional()
  @IsString()
  returnDate?: string;

  @IsValidCurrency()
  currency: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsEnum(SalesReturnDocStatus)
  status?: SalesReturnDocStatus;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalesReturnItemDto)
  items: SalesReturnItemDto[];
}

