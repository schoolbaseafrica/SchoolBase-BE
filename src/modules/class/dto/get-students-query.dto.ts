import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class GetStudentsQueryDto {
  @ApiPropertyOptional({
    description:
      'The academic session ID (e.g., "2023-2024"). Defaults to active session if omitted.',
    example: '2023-2024',
  })
  @IsOptional()
  @IsString()
  session_id?: string;

  @ApiPropertyOptional({
    description: 'Subject ID for a term-specific score roster',
  })
  @IsOptional()
  @IsUUID()
  subject_id?: string;

  @ApiPropertyOptional({ description: 'Term ID required with subject_id' })
  @IsOptional()
  @IsUUID()
  term_id?: string;
}
