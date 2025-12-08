import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

import { INotificationPreferenceSettings } from '../types/notification.types';

export class CreateNotificationPreferenceDto {
  @ApiPropertyOptional({
    type: 'object',
    properties: {
      email: { type: 'boolean', example: true },
      push: { type: 'boolean', example: false },
    },
    additionalProperties: false,
  })
  @IsOptional()
  preferences?: INotificationPreferenceSettings;
}
