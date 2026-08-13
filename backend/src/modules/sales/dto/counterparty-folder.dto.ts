import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCounterpartyFolderDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  color?: string;
}

export class UpdateCounterpartyFolderDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  color?: string;
}
