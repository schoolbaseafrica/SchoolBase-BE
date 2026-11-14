import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ArrayMaxSize,
  ArrayMinSize,
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
  @IsOptional() @IsBoolean() allowStudentMicrophone?: boolean;
  @IsOptional() @IsBoolean() allowStudentCamera?: boolean;
}

export class ModerateClassroomParticipantDto {
  @IsUUID() participantIdentity: string;
  @IsIn(['microphone', 'camera']) source: 'microphone' | 'camera';
  @IsBoolean() enabled: boolean;
}

export class CreateClassroomHealthEventDto {
  @IsIn(['media', 'collaboration', 'network', 'device'])
  category: 'media' | 'collaboration' | 'network' | 'device';
  @IsString() @MaxLength(80) eventType: string;
  @IsIn(['info', 'warning', 'error']) severity: 'info' | 'warning' | 'error';
  @IsOptional() @IsObject() details?: Record<
    string,
    string | number | boolean | null
  >;
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

export class CreateWhiteboardPageDto {
  @IsString()
  @MaxLength(120)
  title: string;
}

export class RenameWhiteboardPageDto {
  @IsString()
  @MaxLength(120)
  title: string;
}

export class ReorderWhiteboardPagesDto {
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  pageKeys: string[];
}

export class CorrectClassroomAttendanceDto {
  @IsIn(['present', 'late', 'partial', 'absent'])
  status: 'present' | 'late' | 'partial' | 'absent';

  @IsString()
  @MaxLength(500)
  reason: string;
}
