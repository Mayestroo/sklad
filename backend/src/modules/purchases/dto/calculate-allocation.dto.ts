import {
  IsNotEmpty,
  IsUUID,
  IsNumber,
  IsPositive,
  IsEnum,
  IsOptional,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ExpenseAllocationMethod } from '@prisma/client';

export class CalculateAllocationDto {
  @IsNotEmpty()
  @IsUUID()
  receiptId: string;

  @IsNotEmpty()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  amount: number;

  @IsOptional()
  @IsEnum(ExpenseAllocationMethod)
  allocationMethod?: ExpenseAllocationMethod = ExpenseAllocationMethod.BY_AMOUNT;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  selectedItemIds?: string[];
}
