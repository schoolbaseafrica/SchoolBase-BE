import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { IRequestWithUser } from '../../../common/types/request-with-user.interface'; // Correct import path
import { UserRole } from '../../user/entities/user.entity'; // Correct import path
import { NotificationController } from '../controller/notification.controller';
import {
  NotificationResponseDto,
  PaginatedNotificationsResponseDto,
} from '../dto/user-notification-response.dto';
import { Notification } from '../entities/notification.entity';
import { NotificationService } from '../services/notification.service';
import { NotificationType } from '../types/notification.types';

describe('NotificationController', () => {
  let controller: NotificationController;
  let notificationService: jest.Mocked<NotificationService>;

  const mockNotificationService = {
    getUserNotifications: jest.fn(),
    markNotificationAsReadUnread: jest.fn(),
  };

  const mockNotification: Notification = {
    id: 'notification-1',
    recipient_id: 'user-123',
    type: NotificationType.SYSTEM_ALERT,
    title: 'Test Notification',
    message: 'This is a test notification',
    is_read: false,
    metadata: {},
    createdAt: new Date('2025-12-04T00:00:00.000Z'),
    updatedAt: new Date('2025-12-04T00:00:00.000Z'),
  };

  const mockNotificationResponseDto: NotificationResponseDto = {
    id: 'notification-1',
    recipient_id: 'user-123',
    type: NotificationType.SYSTEM_ALERT,
    title: 'Test Notification',
    message: 'This is a test notification',
    is_read: false,
    metadata: {},
    created_at: new Date('2025-12-04T00:00:00.000Z'),
    updated_at: new Date('2025-12-04T00:00:00.000Z'),
  };

  const mockReq: IRequestWithUser = {
    user: { id: 'user-123', userId: 'user-123', roles: [UserRole.STUDENT] }, // Provide roles here
  } as IRequestWithUser;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationController],
      providers: [
        {
          provide: NotificationService,
          useValue: mockNotificationService,
        },
      ],
    }).compile();

    controller = module.get<NotificationController>(NotificationController);
    notificationService = module.get(NotificationService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getUserNotifications', () => {
    it('should return user notifications', async () => {
      const query = { page: 1, limit: 10 };
      const paginatedResponse: PaginatedNotificationsResponseDto = {
        message: 'Notifications retrieved successfully',
        data: { notifications: [mockNotificationResponseDto] },
        pagination: {
          total: 1,
          page: 1,
          limit: 10,
          total_pages: 1,
          has_next: false,
          has_previous: false,
        },
      };
      notificationService.getUserNotifications.mockResolvedValue(
        paginatedResponse,
      );

      const result = await controller.getUserNotifications(query, mockReq);
      expect(notificationService.getUserNotifications).toHaveBeenCalledWith(
        mockReq.user.userId,
        query,
      );
      expect(result).toEqual(paginatedResponse);
    });
  });

  describe('updateNotificationReadStatus', () => {
    const notificationId = 'notification-1';

    it('should mark notification as read', async () => {
      const updatedNotification = {
        ...mockNotification,
        is_read: true,
      } as Notification;
      notificationService.markNotificationAsReadUnread.mockResolvedValue(
        updatedNotification,
      );

      const result = await controller.updateNotificationReadStatus(
        notificationId,
        true,
        mockReq,
      );
      expect(
        notificationService.markNotificationAsReadUnread,
      ).toHaveBeenCalledWith(notificationId, mockReq.user.userId, true);
      expect(result).toEqual({
        message: 'Notification status updated successfully',
        data: updatedNotification,
      });
    });

    it('should mark notification as unread', async () => {
      const updatedNotification = {
        ...mockNotification,
        is_read: false,
      } as Notification;
      notificationService.markNotificationAsReadUnread.mockResolvedValue(
        updatedNotification,
      );

      const result = await controller.updateNotificationReadStatus(
        notificationId,
        false,
        mockReq,
      );
      expect(
        notificationService.markNotificationAsReadUnread,
      ).toHaveBeenCalledWith(notificationId, mockReq.user.userId, false);
      expect(result).toEqual({
        message: 'Notification status updated successfully',
        data: updatedNotification,
      });
    });

    it('should throw NotFoundException if notification not found or not owned by user', async () => {
      notificationService.markNotificationAsReadUnread.mockResolvedValue(
        undefined,
      );

      await expect(
        controller.updateNotificationReadStatus(notificationId, true, mockReq),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
