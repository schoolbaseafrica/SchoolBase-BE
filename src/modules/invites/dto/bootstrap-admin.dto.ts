import { IsEmail, IsOptional, IsString } from 'class-validator';

export class BootstrapAdminDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  full_name?: string;
}
