import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

import {
  AssignmentStatus,
  AssignmentSubmissionStatus,
} from './entities/assignment.entity';

export class CreateAssignmentDto {
  @IsString() @Length(3, 180) title: string;
  @IsString() @Length(1, 20000) instructions: string;
  @IsUUID() classId: string;
  @IsUUID() subjectId: string;
  @IsUUID() academicSessionId: string;
  @IsOptional() @IsUUID() academicTermId?: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(10000)
  totalMarks?: number;
  @IsOptional() @IsUrl({ require_tld: false }) attachmentUrl?: string;
}

export class UpdateAssignmentDto {
  @IsOptional() @IsString() @Length(3, 180) title?: string;
  @IsOptional() @IsString() @Length(1, 20000) instructions?: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(10000)
  totalMarks?: number;
  @IsOptional() @IsUrl({ require_tld: false }) attachmentUrl?: string;
}

export class TransitionAssignmentDto {
  @IsEnum(AssignmentStatus) status: AssignmentStatus;
}

export class SaveSubmissionDto {
  @IsOptional() @IsString() @Length(0, 50000) responseText?: string;
  @IsOptional() @IsUrl({ require_tld: false }) attachmentUrl?: string;
  @IsOptional()
  @IsEnum(AssignmentSubmissionStatus)
  status?: AssignmentSubmissionStatus;
}

export class GradeSubmissionDto {
  @Type(() => Number) @IsNumber() @Min(0) marksAwarded: number;
  @IsOptional() @IsString() @Length(0, 10000) feedback?: string;
  @IsOptional()
  @IsEnum(AssignmentSubmissionStatus)
  status?: AssignmentSubmissionStatus;
}
