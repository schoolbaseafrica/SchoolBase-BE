import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { TeacherTitle } from '../enums/teacher.enum';

export class LinkAdminTeacherDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  admin_user_id: string;

  @ApiProperty({ enum: TeacherTitle })
  @IsEnum(TeacherTitle)
  title: TeacherTitle;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  employment_id?: string;
}
