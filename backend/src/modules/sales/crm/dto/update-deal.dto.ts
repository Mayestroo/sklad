import { DealStageSlug } from '@prisma/client';
import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from '../../../../common/validators/currency.validator';

export class UpdateDealStageDto {
  @IsEnum(DealStageSlug)
  stage: DealStageSlug;
}

export class UpdateDealDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;

  /** Required with a nonzero amount (ADR 0022). */
  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES, {
    message: `currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`,
  })
  currency?: SupportedCurrency;

  @IsOptional()
  @IsString()
  counterpartyId?: string;

  @IsOptional()
  @IsEnum(DealStageSlug)
  stage?: DealStageSlug;

  /** null unassigns the deal. */
  @IsOptional()
  @IsString()
  assignedUserId?: string | null;
}
