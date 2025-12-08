import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

import {
  AttendanceType,
  EditRequestStatus,
} from '../enums/attendance-status.enum';

/**
 * DTO for creating an edit request
 */
export class CreateEditRequestDto {
  @ApiProperty({
    description: 'ID of the attendance record to edit',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  attendance_id: string;

  @ApiProperty({
    description: 'Type of attendance record',
    enum: AttendanceType,
    example: AttendanceType.DAILY,
  })
  @IsEnum(AttendanceType)
  @IsNotEmpty()
  attendance_type: AttendanceType;

  @ApiProperty({
    description: 'Proposed changes as key-value pairs',
    example: {
      status: 'present',
      notes: 'Student arrived late with valid excuse',
    },
  })
  @IsObject()
  @IsNotEmpty()
  proposed_changes: Record<string, unknown>;

  @ApiProperty({
    description: 'Reason for requesting the edit',
    example: 'Student was marked absent but arrived late with valid excuse',
  })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

/**
 * DTO for reviewing an edit request (approve/reject)
 */
export class ReviewEditRequestDto {
  @ApiProperty({
    description: 'Decision on the edit request',
    enum: [EditRequestStatus.APPROVED, EditRequestStatus.REJECTED],
    example: EditRequestStatus.APPROVED,
  })
  @IsEnum([EditRequestStatus.APPROVED, EditRequestStatus.REJECTED])
  @IsNotEmpty()
  status: EditRequestStatus.APPROVED | EditRequestStatus.REJECTED;

  @ApiPropertyOptional({
    description: 'Admin comment on the decision (required for rejection)',
    example: 'Approved - valid reason provided',
  })
  @IsOptional()
  @IsString()
  admin_comment?: string;
}
