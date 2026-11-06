import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateMeetingDto {
  @IsString() @MinLength(3) @MaxLength(160) title: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsDateString() startsAt: string;
  @IsDateString() endsAt: string;
  @IsArray()
  @ArrayMaxSize(4)
  @IsIn(['ADMIN', 'TEACHER', 'PARENT', 'STUDENT'], { each: true })
  audienceRoles: string[];
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  audienceUserIds: string[];
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  audienceClassIds: string[];
}

export class MeetingStatusDto {
  @IsIn(['live', 'ended', 'cancelled']) status: 'live' | 'ended' | 'cancelled';
}

export class MeetingAdmissionDto {
  @IsIn(['admitted', 'denied']) status: 'admitted' | 'denied';
}
