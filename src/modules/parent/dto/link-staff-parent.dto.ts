import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class LinkStaffParentDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Existing admin or teacher user ID',
  })
  @IsUUID()
  user_id: string;
}
