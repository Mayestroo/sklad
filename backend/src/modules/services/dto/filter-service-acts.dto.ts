import { IsOptional, IsString, IsEnum, IsUUID, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ServiceActType, ServiceActStatus, ServicePaymentStatus } from '@prisma/client';

export class FilterServiceActsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(ServiceActType)
  type?: ServiceActType;

  @IsOptional()
  @IsEnum(ServiceActStatus)
  status?: ServiceActStatus;

  @IsOptional()
  @IsEnum(ServicePaymentStatus)
  paymentStatus?: ServicePaymentStatus;

  @IsOptional()
  @IsUUID()
  counterpartyId?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  limit?: number = 20;
}
