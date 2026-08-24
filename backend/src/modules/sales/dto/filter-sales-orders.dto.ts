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

  @IsOptional()
  @IsEnum([
    'NEW',
    'PENDING_APPROVAL',
    'APPROVED',
    'SENT_TO_PRODUCTION',
    'IN_PRODUCTION',
    'PARTIALLY_READY',
    'READY',
    'AWAITING_PAYMENT',
    'PAYMENT_CONFIRMED',
    'READY_TO_SHIP',
    'SHIPPED',
    'COMPLETED',
    'CANCELLED',
  ])
  status?: string;

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
}
