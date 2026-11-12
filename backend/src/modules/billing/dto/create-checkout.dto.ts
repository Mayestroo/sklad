import { IsIn } from 'class-validator';

export class CreateCheckoutDto {
  @IsIn(['STARTER', 'PROFESSIONAL', 'ENTERPRISE'])
  planId: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';

  @IsIn(['CLICK', 'PAYME', 'BANK_TRANSFER'])
  method: 'CLICK' | 'PAYME' | 'BANK_TRANSFER';
}
