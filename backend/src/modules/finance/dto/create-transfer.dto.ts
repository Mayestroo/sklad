import { IsString, IsNumber, IsOptional, IsDateString, IsPositive } from 'class-validator';

export class CreateTransferDto {
  @IsString()
  fromAccountId: string;

  @IsString()
  toAccountId: string;

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
  comment?: string;
}
