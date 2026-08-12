import { IsString, IsNumber, IsOptional, IsDateString, IsPositive, IsNotEmpty } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class CreateTransferDto {
  @IsString()
  @IsNotEmpty()
  fromAccountId: string;

  @IsString()
  @IsNotEmpty()
  toAccountId: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null || value === undefined ? undefined : Number(value)))
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  targetAmount?: number;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null || value === undefined ? undefined : Number(value)))
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  exchangeRate?: number;

  @IsString()
  @IsNotEmpty()
  currency: string;

  @IsDateString()
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  transactionDate?: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => (value === '' || value === null ? undefined : value))
  comment?: string;
}
