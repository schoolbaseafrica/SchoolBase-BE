import { IsBoolean } from 'class-validator';

export class SetAdminActiveDto {
  @IsBoolean()
  is_active: boolean;
}
