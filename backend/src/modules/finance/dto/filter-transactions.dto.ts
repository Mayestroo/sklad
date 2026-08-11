import { IsString, IsNumber, IsOptional, IsDateString, IsPositive, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class FilterTransactionsDto {
  @IsDateString()
  @IsOptional()
  date_from?: string;

  @IsDateString()
  @IsOptional()
  date_to?: string;

  @IsString()
  @IsOptional()
  accountId?: string;

  @IsIn(['INCOME', 'EXPENSE', 'TRANSFER'])
  @IsOptional()
  direction?: 'INCOME' | 'EXPENSE' | 'TRANSFER';

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  counterpartyId?: string;

  @IsString()
  @IsOptional()
  transactionTypeId?: string;

  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  @IsOptional()
  amountMin?: number;

  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  @IsOptional()
  amountMax?: number;

  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  page?: number;

  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  limit?: number;
}
