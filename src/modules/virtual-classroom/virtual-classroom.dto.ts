import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateVirtualClassroomDto {
  @IsUUID() scheduleId: string;
  @IsUUID() sessionId: string;
  @IsOptional() @IsUUID() termId?: string;
  @IsString() @MaxLength(255) title: string;
  @IsDateString() startsAt: string;
  @IsDateString() endsAt: string;
}

export class SendVirtualClassroomMessageDto {
  @IsString() @MaxLength(4000) body: string;
}

export class UpdateClassroomPermissionsDto {
  @IsOptional() @IsBoolean() allowStudentChat?: boolean;
  @IsOptional() @IsBoolean() allowStudentDraw?: boolean;
}

export class UpdateVirtualClassroomStatusDto {
  @IsIn(['live', 'ended', 'cancelled'])
  status: 'live' | 'ended' | 'cancelled';
}

export class UpdateWhiteboardSnapshotDto {
  @IsInt()
  version: number;

  @IsObject()
  snapshot: Record<string, unknown>;
}
