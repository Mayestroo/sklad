import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsPositive,
  IsArray,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ServiceActType } from '@prisma/client';
import { CreateServiceActItemDto } from './create-service-act.dto';

export class UpdateServiceActDto {
  @IsOptional()
  @IsEnum(ServiceActType)
  type?: ServiceActType;

  @IsOptional()
  @IsUUID()
  counterpartyId?: string;

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateServiceActItemDto)
  items?: CreateServiceActItemDto[];
}
