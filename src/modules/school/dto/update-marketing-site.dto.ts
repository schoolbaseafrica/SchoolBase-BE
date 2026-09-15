import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class UpdateMarketingSiteDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Complete multi-page public website configuration. Existing one-page content is unaffected.',
  })
  @IsObject()
  marketing_site_config: Record<string, unknown>;
}
