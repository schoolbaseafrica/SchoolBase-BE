import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

import { INotificationPreferenceSettings } from '../types/notification.types';

export class UpdateNotificationPreferenceDto {
  @ApiPropertyOptional({
    type: 'object',
    properties: {
      email: { type: 'boolean', example: false },
      push: { type: 'boolean', example: true },
    },
    additionalProperties: false,
  })
  @IsOptional()
  preferences?: INotificationPreferenceSettings;
}
