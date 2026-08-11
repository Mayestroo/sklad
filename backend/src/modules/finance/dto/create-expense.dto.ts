import { IsString, IsNumber, IsOptional, IsDateString, IsPositive } from 'class-validator';

export class CreateExpenseDto {
  @IsString()
  accountId: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsString()
  currency: string;

  @IsDateString()
  @IsOptional()
  transactionDate?: string;

  @IsString()
  @IsOptional()
  counterpartyId?: string;

  @IsString()
  @IsOptional()
  transactionTypeId?: string;

  @IsString()
  @IsOptional()
  comment?: string;

  @IsString()
  @IsOptional()
  sourceDocType?: string;

  @IsString()
  @IsOptional()
  sourceDocId?: string;
}
