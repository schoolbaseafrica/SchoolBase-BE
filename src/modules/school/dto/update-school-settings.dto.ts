import {
  IsBooleanString,
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class UpdateSchoolSettingsDto {
  @IsOptional() @IsString() @MaxLength(150) name?: string;
  @IsOptional() @IsString() @MaxLength(255) address?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @Matches(/^#[0-9A-Fa-f]{6}$/) primary_color?: string;
  @IsOptional() @Matches(/^#[0-9A-Fa-f]{6}$/) secondary_color?: string;
  @IsOptional() @Matches(/^#[0-9A-Fa-f]{6}$/) accent_color?: string;
  @IsOptional() @Matches(/^(|[1-9]\d*)$/) activity_log_retention_days?: string;
  @IsOptional() @IsString() @MaxLength(20) school_code?: string;

  @IsOptional() @IsString() @MaxLength(100) student_id_format?: string;
  @IsOptional() @IsString() @MaxLength(20) student_id_prefix?: string;
  @IsOptional() @IsBooleanString() allow_manual_student_ids?: string;
  @IsOptional() @IsString() @MaxLength(100) teacher_id_format?: string;
  @IsOptional() @IsString() @MaxLength(20) teacher_id_prefix?: string;
  @IsOptional() @IsBooleanString() allow_manual_teacher_ids?: string;
  @IsOptional() @IsBooleanString() email_alert_results?: string;
  @IsOptional() @IsBooleanString() email_alert_fees?: string;
  @IsOptional() @IsBooleanString() email_alert_attendance?: string;
  @IsOptional() @IsString() @MaxLength(100) parent_id_format?: string;
  @IsOptional() @IsString() @MaxLength(20) parent_id_prefix?: string;
  @IsOptional() @IsBooleanString() allow_manual_parent_ids?: string;
  @IsOptional() @IsString() @MaxLength(100) staff_id_format?: string;
  @IsOptional() @IsString() @MaxLength(20) staff_id_prefix?: string;
  @IsOptional() @IsBooleanString() allow_manual_staff_ids?: string;
}

export class UpdateLandingPageConfigDto {
  @IsObject()
  landing_page_config: Record<string, unknown>;
}
