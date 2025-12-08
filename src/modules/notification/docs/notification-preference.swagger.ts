import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';

import * as sysMsg from '../../../constants/system.messages';
import { UpdateNotificationPreferenceDto } from '../dto';
import { NotificationPreference } from '../entities/notification-preference.entity';

export const ApiNotificationPreferenceTags = () =>
  applyDecorators(ApiTags('Notification Preferences'));
export const ApiNotificationPreferenceBearerAuth = () =>
  applyDecorators(ApiBearerAuth());

export const ApiGetUserNotificationPreferences = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Get user notification preferences',
      description:
        'Retrieves notification preference settings for a specific user.',
    }),
    ApiParam({
      name: 'userId',
      description: 'ID of the user',
      type: String,
      format: 'uuid',
    }),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'User notification preferences retrieved successfully',
      type: NotificationPreference,
    }),
    ApiResponse({
      status: HttpStatus.UNAUTHORIZED,
      description: 'Unauthorized - Invalid or missing JWT token',
    }),
    ApiResponse({
      status: HttpStatus.FORBIDDEN,
      description: 'Forbidden - User does not have permission',
    }),
    ApiResponse({
      status: HttpStatus.NOT_FOUND,
      description: 'Notification preferences not found for user',
    }),
  );

export const ApiUpdateUserNotificationPreferences = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Update user notification preferences',
      description:
        'Updates notification preference settings for a specific user. ' +
        'If preferences do not exist, they will be created.',
    }),
    ApiParam({
      name: 'userId',
      description: 'ID of the user',
      type: String,
      format: 'uuid',
    }),
    ApiBody({
      type: UpdateNotificationPreferenceDto,
      description: 'Notification preference settings to update',
    }),
    ApiResponse({
      status: HttpStatus.OK,
      description: sysMsg.NOTIFICATION_PREFERENCE_UPDATED,
      type: NotificationPreference,
    }),
    ApiResponse({
      status: HttpStatus.CREATED,
      description: sysMsg.NOTIFICATION_PREFERENCE_CREATED,
      type: NotificationPreference,
    }),
    ApiResponse({
      status: HttpStatus.UNAUTHORIZED,
      description: sysMsg.UNAUTHORIZED,
    }),
    ApiResponse({
      status: HttpStatus.FORBIDDEN,
      description: sysMsg.FORBIDDEN,
    }),
    ApiResponse({
      status: HttpStatus.BAD_REQUEST,
      description: 'Bad Request - Invalid preference values submitted',
    }),
  );
