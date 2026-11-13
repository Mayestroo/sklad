import {
  IsDefined,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { TranslatableTextDto } from '../../inventory/dto/create-product.dto';

const PLANS = ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'] as const;
const STATUSES = ['TRIAL', 'ACTIVE', 'SUSPENDED', 'BLOCKED'] as const;

export class CreateTenantDto {
  /** Bilingual { uz, ru } object, or a single string used for both languages. */
  @IsDefined()
  name: { uz: string; ru: string } | string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug: lowercase letters, digits and dashes only',
  })
  slug: string;

  @IsOptional()
  @IsIn(PLANS)
  plan?: (typeof PLANS)[number];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  trialDays?: number;

  @IsEmail()
  adminEmail: string;

  /** An empty field in the form means "not provided". */
  @Transform(({ value }: { value: unknown }) =>
    value === '' ? undefined : value,
  )
  @IsOptional()
  @IsString()
  @MinLength(8)
  adminPassword?: string;

  @IsString()
  @IsNotEmpty()
  adminFirstName: string;

  @IsString()
  @IsNotEmpty()
  adminLastName: string;
}

export class UpdateTenantDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  @IsOptional()
  @IsIn(PLANS)
  plan?: (typeof PLANS)[number];
}

export class CreateAnnouncementDto {
  @ValidateNested()
  @Type(() => TranslatableTextDto)
  title: TranslatableTextDto;

  @ValidateNested()
  @Type(() => TranslatableTextDto)
  message: TranslatableTextDto;
}

export class ReplyTicketDto {
  @IsString()
  @IsNotEmpty()
  message: string;
}
