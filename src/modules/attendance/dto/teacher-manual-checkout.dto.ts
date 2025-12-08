import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

// --- REQUEST DTO ---
export class CreateTeacherCheckoutDto {
  @ApiPropertyOptional({
    example: 'Leaving early for appointment',
    description: 'Optional notes for checkout',
    maxLength: 255,
  })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  notes?: string;
}

// --- RESPONSE DTO ---
export class TeacherCheckoutResponseDto {
  @ApiProperty({ example: 'uuid-here' })
  @Expose()
  id: string;

  @ApiProperty({ example: '2025-12-05' })
  @Expose()
  date: Date;

  @ApiProperty({ example: '2025-12-05T08:00:00Z' })
  @Expose()
  check_in_time: Date;

  @ApiProperty({ example: '2025-12-05T17:00:00Z' })
  @Expose()
  check_out_time: Date;

  @ApiProperty({ example: 9.0, description: 'Total hours worked' })
  @Expose()
  total_hours: number;

  @ApiProperty({ example: 'PRESENT' })
  @Expose()
  status: string;
}
