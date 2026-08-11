import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsEnum,
  Min,
} from 'class-validator';

export enum ExpenseTypeDto {
  TRANSPORT = 'TRANSPORT',
  CUSTOMS = 'CUSTOMS',
  BROKER = 'BROKER',
  INSURANCE = 'INSURANCE',
  OTHER = 'OTHER',
}

export enum ExpenseAllocationMethodDto {
  BY_AMOUNT = 'BY_AMOUNT',
  BY_QUANTITY = 'BY_QUANTITY',
  BY_WEIGHT = 'BY_WEIGHT',
}

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
