import { Type } from 'class-transformer';
import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class UploadCbtScreenClipDto {
  @IsUUID()
  recordingId: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  partNumber: number;

  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(60_000)
  durationMs: number;
}
