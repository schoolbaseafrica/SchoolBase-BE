import {
  Controller,
  Get,
  Query,
  UseGuards,
  Req,
  Patch,
  Param,
  Body,
  NotFoundException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { SkipWrap } from '../../../common/decorators/skip-wrap.decorator';
import { IRequestWithUser } from '../../../common/types';
import * as sysMsg from '../../../constants/system.messages';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import {
  ApiGetUserNotifications,
  ApiUpdateNotificationReadStatus,
  ApiGetNotificationById,
} from '../docs/notification.swagger';
import { ListNotificationsQueryDto } from '../dto/user-notification-list-query.dto';
import { NotificationService } from '../services/notification.service';

@Controller('notifications')
@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get('user')
  @SkipWrap()
  @ApiGetUserNotifications()
  async getUserNotifications(
    @Query() query: ListNotificationsQueryDto,
    @Req() req: IRequestWithUser,
  ) {
    const userId = req.user.userId;

    return this.notificationService.getUserNotifications(userId, query);
  }
  @Patch(':notificationId')
  @ApiUpdateNotificationReadStatus()
  async updateNotificationReadStatus(
    @Param('notificationId') notificationId: string,
    @Body('is_read') isRead: boolean,
    @Req() req: IRequestWithUser,
  ) {
    const userId = req.user.userId;
    const updatedNotification =
      await this.notificationService.markNotificationAsReadUnread(
        notificationId,
        userId,
        isRead,
      );

    if (!updatedNotification) {
      throw new NotFoundException(sysMsg.NOTIFICATION_PREFERENCE_NOT_FOUND);
    }

    return {
      message: sysMsg.NOTIFICATION_READ_STATUS_UPDATED,
      data: updatedNotification,
    };
  }

  @Get(':id')
  @SkipWrap()
  @ApiGetNotificationById()
  async getNotificationById(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: IRequestWithUser,
  ) {
    const userId = req.user.userId;

    return this.notificationService.getNotificationById(id, userId);
  }
}
