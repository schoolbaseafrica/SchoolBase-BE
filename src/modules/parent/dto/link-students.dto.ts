import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  ArrayNotEmpty,
  IsUUID,
  ArrayMinSize,
  IsBoolean,
  IsOptional,
  IsObject,
} from 'class-validator';

export class LinkStudentsDto {
  @ApiProperty({
    description: 'Array of student IDs (UUIDs) to link to the parent',
    example: [
      '123e4567-e89b-12d3-a456-426614174001',
      '123e4567-e89b-12d3-a456-426614174002',
    ],
    type: [String],
    minItems: 1,
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'At least one student ID must be provided' })
  @ArrayMinSize(1, { message: 'At least one student ID must be provided' })
  @IsUUID('4', { each: true, message: 'Each student ID must be a valid UUID' })
  student_ids: string[];

  @ApiPropertyOptional({
    description: 'Confirm replacing an existing parent link',
  })
  @IsOptional()
  @IsBoolean()
  allow_reassignment?: boolean;

  @ApiPropertyOptional({
    description:
      'Parent IDs shown when the administrator confirmed; null for unlinked students',
  })
  @IsOptional()
  @IsObject()
  expected_parent_ids?: Record<string, string | null>;
}
