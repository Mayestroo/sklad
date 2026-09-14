import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { IsValidCurrency } from '../../../common/validators/currency.validator';

export class CreatePaymentDto {
  @IsString()
  @IsNotEmpty()
  counterpartyId: string;

  @IsString()
  @IsOptional()
  invoiceId?: string;

  @IsString()
  @IsOptional()
  orderId?: string;

  @IsEnum(['CASH', 'BANK_TRANSFER', 'CARD', 'CLICK', 'PAYME'])
  method: 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'CLICK' | 'PAYME';

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsValidCurrency()
  currency: string;

  @IsString()
  @IsOptional()
  cashAccountId?: string;

  @IsString()
  @IsOptional()
  comment?: string;
}
