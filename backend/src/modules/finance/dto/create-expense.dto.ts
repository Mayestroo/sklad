import { IsString, IsNumber, IsOptional, IsDateString, IsPositive, IsNotEmpty } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class CreateExpenseDto {
  @IsString()
  @IsNotEmpty()
  accountId: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsString()
  @IsNotEmpty()
  currency: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsDateString()
  transactionDate?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsString()
  counterpartyId?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsString()
  transactionTypeId?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsString()
  comment?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsString()
  sourceDocType?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  @IsString()
  sourceDocId?: string;
}
