import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export enum StudentGrowthInterval {
  MONTH = 'month',
  TERM = 'term',
}

export class StudentGrowthQueryDto {
  @ApiPropertyOptional({ description: 'Academic session ID' })
  @IsOptional()
  @IsUUID()
  session_id?: string;

  @ApiPropertyOptional({ description: 'Academic term ID' })
  @IsOptional()
  @IsUUID()
  term_id?: string;

  @ApiPropertyOptional({
    enum: StudentGrowthInterval,
    default: StudentGrowthInterval.MONTH,
  })
  @IsOptional()
  @IsEnum(StudentGrowthInterval)
  interval: StudentGrowthInterval = StudentGrowthInterval.MONTH;
}

export class StudentGrowthReportItemDto {
  @ApiProperty({ example: 'Sep 2026' })
  label: string;

  @ApiProperty({ example: '2026-09-01' })
  start_date: string;

  @ApiProperty({ example: '2026-09-30' })
  end_date: string;

  @ApiProperty({ example: 18 })
  new_students: number;

  @ApiProperty({ example: 214 })
  cumulative_students: number;
}

export class StudentGrowthReportDataDto {
  @ApiProperty()
  session_id: string;

  @ApiProperty({ example: '2026/2027' })
  academic_year: string;

  @ApiPropertyOptional()
  term_id?: string;

  @ApiProperty({ enum: StudentGrowthInterval })
  interval: StudentGrowthInterval;

  @ApiProperty({ type: [StudentGrowthReportItemDto] })
  report: StudentGrowthReportItemDto[];
}

export class StudentGrowthReportResponseDto {
  @ApiProperty()
  message: string;

  @ApiProperty({ example: 200 })
  status_code: number;

  @ApiProperty({ type: StudentGrowthReportDataDto })
  data: StudentGrowthReportDataDto;
}
