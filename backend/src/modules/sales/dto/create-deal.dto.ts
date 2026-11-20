import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import {
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from '../../../common/validators/currency.validator';

export class CreateDealDto {
  @IsString()
  @IsNotEmpty()
  counterpartyId: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsEnum(['LEAD', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'])
  @IsOptional()
  stage?:
    'LEAD' | 'QUALIFICATION' | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST';

  @IsNumber()
  @Min(0)
  @IsOptional()
  amount?: number;

  /** Required with a nonzero amount (ADR 0022). */
  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES, {
    message: `currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`,
  })
  currency?: SupportedCurrency;

  @IsString()
  @IsOptional()
  assignedUserId?: string;
}
