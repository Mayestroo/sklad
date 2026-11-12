import { SalesOrderStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class FilterSalesOrdersDto {
  @IsOptional()
  @IsString()
  search?: string; // order number search

  @IsOptional()
  @IsString()
  counterpartyId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  // Validated against the Prisma enum so the API accepts every status the UI offers.
  @IsOptional()
  @IsEnum(SalesOrderStatus)
  status?: SalesOrderStatus;

  @IsOptional()
  @IsString()
  assignedSellerId?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsEnum(['PAID', 'PARTIALLY_PAID', 'UNPAID'])
  paymentStatus?: 'PAID' | 'PARTIALLY_PAID' | 'UNPAID';

  @IsOptional()
  @IsDateString()
  deliveryDateFrom?: string;

  @IsOptional()
  @IsDateString()
  deliveryDateTo?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  skip?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  take?: number;
}
