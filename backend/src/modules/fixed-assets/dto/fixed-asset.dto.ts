import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { FixedAssetStatus } from '@prisma/client';

export class CreateFixedAssetDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  inventoryNumber: string;

  @IsOptional()
  @IsString()
  assetType?: string;

  @IsOptional()
  @IsDateString()
  acquisitionDate?: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  initialCost: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  accumulatedDepreciation?: number;

  @IsOptional()
  @IsNumber()
  usefulLifeMonths?: number;

  @IsOptional()
  @IsString()
  depreciationMethod?: string;

  @IsOptional()
  @IsString()
  custodianUserId?: string;

  @IsOptional()
  @IsEnum(FixedAssetStatus)
  status?: FixedAssetStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateFixedAssetDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  inventoryNumber?: string;

  @IsOptional()
  @IsString()
  assetType?: string;

  @IsOptional()
  @IsDateString()
  acquisitionDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  initialCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  accumulatedDepreciation?: number;

  @IsOptional()
  @IsNumber()
  usefulLifeMonths?: number;

  @IsOptional()
  @IsString()
  depreciationMethod?: string;

  @IsOptional()
  @IsString()
  custodianUserId?: string;

  @IsOptional()
  @IsEnum(FixedAssetStatus)
  status?: FixedAssetStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
