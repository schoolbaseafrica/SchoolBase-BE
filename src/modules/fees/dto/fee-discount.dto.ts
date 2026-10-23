import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

export class CreateFeeDiscountCodeDto {
  @IsString()
  @Length(4, 48)
  code: string;

  @IsIn(['PERCENT', 'AMOUNT'])
  kind: 'PERCENT' | 'AMOUNT';

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  value: number;

  @IsUUID()
  session_id: string;

  @IsUUID()
  term_id: string;

  @IsOptional()
  @IsDateString()
  expires_at?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  max_uses?: number;
}

export class ApplyFeeDiscountDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsUUID()
  student_id: string;

  @IsUUID()
  session_id: string;

  @IsUUID()
  term_id: string;
}

export class ReviewFeeDiscountDto {
  @IsBoolean()
  approve: boolean;

  @IsString()
  @Length(3, 500)
  reason: string;
}

export class FeeDiscountReasonDto {
  @IsString()
  @Length(3, 500)
  reason: string;
}
