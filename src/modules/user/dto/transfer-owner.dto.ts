import { IsUUID } from 'class-validator';

export class TransferOwnerDto {
  @IsUUID()
  new_owner_user_id: string;
}
