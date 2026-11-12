import { DealStageSlug } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

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
