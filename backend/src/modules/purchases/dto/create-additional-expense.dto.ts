import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  IsPositive,
  IsBoolean,
  IsArray,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ExpenseType, ExpenseAllocationMethod } from '@prisma/client';

export class CreateAdditionalExpenseDto {
  @IsOptional()
  @IsString()
  docDate?: string;

  @IsNotEmpty()
  @IsEnum(ExpenseType)
  expenseType: ExpenseType;

  @IsNotEmpty()
  @IsUUID()
  counterpartyId: string;

  @IsNotEmpty()
  @IsUUID()
  receiptId: string;

  @IsNotEmpty()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  amount: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  exchangeRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  vatRate?: number;

  @IsOptional()
  @IsEnum(ExpenseAllocationMethod)
  allocationMethod?: ExpenseAllocationMethod;

  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;

  @IsOptional()
  @IsUUID()
  cashAccountId?: string;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  selectedItemIds?: string[];
}

export class UpdateAdditionalExpenseDto {
  @IsOptional()
  @IsString()
  docDate?: string;

  @IsOptional()
  @IsEnum(ExpenseType)
  expenseType?: ExpenseType;

  @IsOptional()
  @IsUUID()
  counterpartyId?: string;

  @IsOptional()
  @IsUUID()
  receiptId?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  amount?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  exchangeRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  vatRate?: number;

  @IsOptional()
  @IsEnum(ExpenseAllocationMethod)
  allocationMethod?: ExpenseAllocationMethod;

  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;

  @IsOptional()
  @IsUUID()
  cashAccountId?: string;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  selectedItemIds?: string[];
}
