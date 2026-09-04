import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  IsPositive,
  IsArray,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ServiceActType } from '@prisma/client';

export class CreateServiceActItemDto {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsNotEmpty()
  @IsString()
  serviceName: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsNotEmpty()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  quantity: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  unitPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  vatRate?: number;
}

export class CreateServiceActDto {
  @IsNotEmpty()
  @IsEnum(ServiceActType)
  type: ServiceActType;

  @IsNotEmpty()
  @IsUUID()
  counterpartyId: string;

  @IsOptional()
  @IsString()
  actDate?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  exchangeRate?: number;

  @IsOptional()
  @IsString()
  externalNumber?: string;

  @IsOptional()
  @IsString()
  externalDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateServiceActItemDto)
  items: CreateServiceActItemDto[];
}
