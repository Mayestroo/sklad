import {
  IsNotEmpty,
  IsUUID,
  IsNumber,
  IsPositive,
  IsEnum,
  IsOptional,
  IsArray,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ExpenseAllocationMethod } from '@prisma/client';
import { IsValidCurrency } from '../../../common/validators/currency.validator';

export class CalculateAllocationDto {
  @IsNotEmpty()
  @IsUUID()
  receiptId: string;

  @IsNotEmpty()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  amount: number;

  /** The expense currency: the preview converts from it (ADR 0022: no default). */
  @IsValidCurrency()
  currency: string;

  /** UZS per 1 unit of `currency`; required when it is not UZS (checked by convertAndAllocate). */
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  exchangeRate?: number;

  /** Expense date, the date the rates belong to. */
  @IsOptional()
  @IsString()
  docDate?: string;

  @IsOptional()
  @IsEnum(ExpenseAllocationMethod)
  allocationMethod?: ExpenseAllocationMethod =
    ExpenseAllocationMethod.BY_AMOUNT;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  selectedItemIds?: string[];
}
