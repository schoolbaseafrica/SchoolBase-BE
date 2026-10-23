import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';

import { StudentGradeDto } from './create-grade-submission.dto';

export class UpdateGradeSubmissionDto {
  @ApiProperty({ type: [StudentGradeDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StudentGradeDto)
  grades: StudentGradeDto[];
}
