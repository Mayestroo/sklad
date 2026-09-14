import { IsOptional, IsString } from 'class-validator';

export class UnpostOpeningBalanceDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
