import {
  Controller,
  Patch,
  Body,
  Param,
  Get,
  UseGuards,
  Req,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { IRequestWithUser } from '../../../common/types';
import * as sysMsg from '../../../constants/system.messages';
import { Roles } from '../../auth/decorators/roles.decorator'; // Import the Roles decorator
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UserRole } from '../../user/entities/user.entity'; // Import UserRole enum
import {
  ApiGetUserNotificationPreferences,
  ApiUpdateUserNotificationPreferences,
} from '../docs/notification-preference.swagger';
import {
  UpdateNotificationPreferenceDto,
  CreateNotificationPreferenceDto,
} from '../dto';
import { NotificationPreferenceService } from '../services/notification-preference.service';

@Controller('users')
@ApiTags('Notification Preferences')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationPreferenceController {
  constructor(
    private readonly notificationPreferenceService: NotificationPreferenceService,
  ) {}

  @Get(':userId/notification-preferences')
  @ApiGetUserNotificationPreferences()
  async getUserNotificationPreferences(@Param('userId') userId: string) {
    const preference =
      await this.notificationPreferenceService.findOneByUserId(userId);
    if (!preference) {
      throw new NotFoundException(sysMsg.NOTIFICATION_PREFERENCE_NOT_FOUND);
    }
    return {
      message: sysMsg.NOTIFICATION_PREFERENCE_RETRIEVED,
      data: preference,
    };
  }

  @Patch(':userId/notification-preferences')
  @Roles(UserRole.ADMIN, UserRole.STUDENT, UserRole.TEACHER, UserRole.PARENT)
  @ApiUpdateUserNotificationPreferences()
  async updateUserNotificationPreferences(
    @Param('userId') userId: string,
    @Body() updateDto: UpdateNotificationPreferenceDto,
    @Req() req: IRequestWithUser,
  ) {
    // Allow users to update their own preferences, or an admin to update any
    if (
      req.user.userId !== userId &&
      !req.user.roles.includes(UserRole.ADMIN)
    ) {
      throw new ForbiddenException(sysMsg.UNAUTHORIZED_NOTIFICATION_ACCESS);
    }

    // Check if preferences exist
    const existing =
      await this.notificationPreferenceService.findOneByUserId(userId);

    if (existing) {
      return this.notificationPreferenceService.update(userId, updateDto);
    }

    // Create if they don't exist
    const createDto: CreateNotificationPreferenceDto = {
      preferences: updateDto.preferences,
    };
    return this.notificationPreferenceService.create(userId, createDto);
  }
}
