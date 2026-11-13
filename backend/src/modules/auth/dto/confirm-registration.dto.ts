import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** POST /auth/register/confirm: the one-time token from the emailed link (D3). */
export class ConfirmRegistrationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  token: string;
}
