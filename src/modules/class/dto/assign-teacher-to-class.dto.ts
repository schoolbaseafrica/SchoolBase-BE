import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class AssignTeacherToClassDto {
  @ApiProperty({ description: 'Class to assign the teacher to' })
  @IsUUID()
  classId: string;

  @ApiPropertyOptional({
    description:
      'Academic session for the assignment. It must match the class session.',
  })
  @IsOptional()
  @IsUUID()
  sessionId?: string;
}
