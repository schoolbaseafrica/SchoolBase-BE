import { IsUUID } from 'class-validator';

export class AssignFirstOwnerDto {
  @IsUUID()
  owner_user_id: string;
}
