import { IsOptional, IsUUID } from 'class-validator';

export class OwnerOverviewQueryDto {
  @IsOptional()
  @IsUUID()
  session_id?: string;

  @IsOptional()
  @IsUUID()
  term_id?: string;
}
