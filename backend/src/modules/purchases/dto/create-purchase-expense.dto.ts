import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsEnum,
  Min,
} from 'class-validator';

import { ExpenseAllocationMethod, ExpenseType } from '@prisma/client';

/** The DTO accepts exactly the database enums. */
export const ExpenseTypeDto = ExpenseType;
export type ExpenseTypeDto = ExpenseType;
export const ExpenseAllocationMethodDto = ExpenseAllocationMethod;
export type ExpenseAllocationMethodDto = ExpenseAllocationMethod;

export class CreatePurchaseExpenseDto {
  @IsString()
  @IsNotEmpty()
  receiptId: string;

  @IsEnum(ExpenseTypeDto)
  expenseType: ExpenseTypeDto;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsEnum(ExpenseAllocationMethodDto)
  allocationMethod?: ExpenseAllocationMethodDto;

  @IsOptional()
  @IsString()
  comment?: string;
}
