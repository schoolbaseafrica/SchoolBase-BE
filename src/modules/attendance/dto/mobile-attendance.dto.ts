import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import {
  attendanceMethods,
  AttendanceMethod,
} from '../attendance-method-policy.service';

export class UpdateAttendanceMethodsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsIn(attendanceMethods, { each: true })
  enabledMethods: AttendanceMethod[];
}

export class AssignStudentCardDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  cardId: string;
}

export class MobileNfcTapDto {
  @IsUUID()
  classId: string;

  @IsUUID()
  clientEventId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  cardId: string;
}

export class MobileFaceCheckInDto {
  @IsUUID()
  classId: string;

  @IsUUID()
  studentId: string;

  @IsUUID()
  clientEventId: string;
}

class BulkCardItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  student_identifier: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  nfc_card_id?: string;
}

export class BulkAssignCardsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => BulkCardItemDto)
  assignments: BulkCardItemDto[];
}
