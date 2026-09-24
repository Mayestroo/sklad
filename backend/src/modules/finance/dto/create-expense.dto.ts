import {
  IsString,
  IsNumber,
  IsOptional,
  IsDateString,
  IsPositive,
  IsNotEmpty,
  IsEnum,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { CounterpartySettlementSide } from '@prisma/client';
import { IsValidCurrency } from '../../../common/validators/currency.validator';

export class CreateExpenseDto {
  @IsString()
  @IsNotEmpty()
  accountId: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsValidCurrency()
  currency: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === null ? undefined : value,
  )
  @IsDateString()
  transactionDate?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === null ? undefined : value,
  )
  @IsString()
  counterpartyId?: string;

  @IsOptional()
  @IsEnum(CounterpartySettlementSide)
  settlementSide?: CounterpartySettlementSide;

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === null ? undefined : value,
  )
  @IsString()
  transactionTypeId?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === null ? undefined : value,
  )
  @IsString()
  comment?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === null ? undefined : value,
  )
  @IsString()
  sourceDocType?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === null ? undefined : value,
  )
  @IsString()
  sourceDocId?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === null ? undefined : value,
  )
  @IsString()
  responsibleUserId?: string;
}
