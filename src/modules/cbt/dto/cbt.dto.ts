import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  CbtExamStatus,
  CbtExamType,
  CbtQuestionDifficulty,
  CbtQuestionType,
} from '../entities';

export class CbtQuestionOptionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  id: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text: string;
}

export class CreateCbtExamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  instructions?: string;

  @IsOptional()
  @IsEnum(CbtExamType)
  examType?: CbtExamType;

  @IsOptional()
  @IsUUID()
  termId?: string;

  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsInt()
  @Min(1)
  @Max(1440)
  timeLimitMinutes: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxAttempts?: number;

  @IsOptional()
  @IsDateString()
  availableFrom?: string;

  @IsOptional()
  @IsDateString()
  availableTo?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  passMarkPercent?: number;

  @IsOptional()
  @IsBoolean()
  shuffleQuestions?: boolean;

  @IsOptional()
  @IsBoolean()
  shuffleOptions?: boolean;

  @IsOptional()
  @IsBoolean()
  showResultImmediately?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  classIds?: string[];
}

export class UpdateCbtExamDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  instructions?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  timeLimitMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxAttempts?: number;

  @IsOptional()
  @IsDateString()
  availableFrom?: string | null;

  @IsOptional()
  @IsDateString()
  availableTo?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  passMarkPercent?: number | null;

  @IsOptional()
  @IsBoolean()
  shuffleQuestions?: boolean;

  @IsOptional()
  @IsBoolean()
  shuffleOptions?: boolean;

  @IsOptional()
  @IsBoolean()
  showResultImmediately?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  classIds?: string[];
}

export class CreateCbtQuestionDto {
  @IsEnum(CbtQuestionType)
  type: CbtQuestionType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50_000)
  body: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => CbtQuestionOptionDto)
  options?: CbtQuestionOptionDto[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  correctAnswer?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  marks: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  topic?: string;

  @IsOptional()
  @IsEnum(CbtQuestionDifficulty)
  difficulty?: CbtQuestionDifficulty;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  explanation?: string;
}

export class UpdateCbtQuestionDto extends PartialType(CreateCbtQuestionDto) {}

export class ListCbtExamsDto {
  @IsOptional()
  @IsEnum(CbtExamStatus)
  status?: CbtExamStatus;
}

export class SaveCbtAnswerDto {
  @IsObject()
  answer: Record<string, unknown>;

  @IsInt()
  @Min(1)
  revision: number;
}

export class RecordCbtConnectionEventDto {
  @IsIn(['connection_lost', 'connection_restored'])
  eventType: 'connection_lost' | 'connection_restored';

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
