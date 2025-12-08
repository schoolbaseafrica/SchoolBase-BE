import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { IRequestWithUser } from '../../../common/types/request-with-user.interface'; // Correct import path
import * as sysMsg from '../../../constants/system.messages'; // Import system messages
import { User, UserRole } from '../../user/entities/user.entity';
import { NotificationPreferenceController } from '../controller/notification-preference.controller';
import { UpdateNotificationPreferenceDto } from '../dto';
import { NotificationPreference } from '../entities/notification-preference.entity';
import { NotificationPreferenceService } from '../services/notification-preference.service';

describe('NotificationPreferenceController', () => {
  let controller: NotificationPreferenceController;
  let service: NotificationPreferenceService;

  const MOCK_USER_ID = 'user-uuid-123';
  const MOCK_PREFERENCE_ID = 'pref-uuid-456';
  const MOCK_PREFERENCES = {
    email: true,
    push: false,
  };

  const mockUser: User = {
    id: MOCK_USER_ID,
    first_name: 'Test',
    last_name: 'User',
    email: 'test@example.com',
    role: [UserRole.STUDENT],
    password: 'hashedpassword',
    is_active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as User;

  const mockNotificationPreference: NotificationPreference = {
    id: MOCK_PREFERENCE_ID,
    user_id: MOCK_USER_ID,
    preferences: MOCK_PREFERENCES,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: mockUser,
  } as NotificationPreference;

  const mockReq: IRequestWithUser = {
    user: { id: MOCK_USER_ID, userId: MOCK_USER_ID, roles: [UserRole.STUDENT] },
  } as IRequestWithUser;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationPreferenceController],
      providers: [
        {
          provide: NotificationPreferenceService,
          useValue: {
            findOneByUserId: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<NotificationPreferenceController>(
      NotificationPreferenceController,
    );
    service = module.get<NotificationPreferenceService>(
      NotificationPreferenceService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getUserNotificationPreferences', () => {
    it('should return user preferences', async () => {
      jest
        .spyOn(service, 'findOneByUserId')
        .mockResolvedValue(mockNotificationPreference);
      const result =
        await controller.getUserNotificationPreferences(MOCK_USER_ID);
      expect(result).toEqual({
        message: sysMsg.NOTIFICATION_PREFERENCE_RETRIEVED,
        data: mockNotificationPreference,
      });
      expect(service.findOneByUserId).toHaveBeenCalledWith(MOCK_USER_ID);
    });

    it('should throw NotFoundException if preferences not found', async () => {
      jest.spyOn(service, 'findOneByUserId').mockResolvedValue(null);
      await expect(
        controller.getUserNotificationPreferences(MOCK_USER_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateUserNotificationPreferences', () => {
    const updateDto: UpdateNotificationPreferenceDto = {
      preferences: { email: false },
    };
    const updatedPreference = {
      ...mockNotificationPreference,
      preferences: { email: false },
    };

    it('should update existing preferences', async () => {
      jest
        .spyOn(service, 'findOneByUserId')
        .mockResolvedValue(mockNotificationPreference);
      jest.spyOn(service, 'update').mockResolvedValue({
        message: sysMsg.NOTIFICATION_PREFERENCE_UPDATED,
        data: updatedPreference as NotificationPreference,
      });

      const result = await controller.updateUserNotificationPreferences(
        MOCK_USER_ID,
        updateDto,
        mockReq,
      );
      expect(service.update).toHaveBeenCalledWith(MOCK_USER_ID, updateDto);
      expect(result).toEqual({
        message: sysMsg.NOTIFICATION_PREFERENCE_UPDATED,
        data: updatedPreference,
      });
    });

    it('should create preferences if none exist', async () => {
      jest.spyOn(service, 'findOneByUserId').mockResolvedValue(undefined);
      jest.spyOn(service, 'create').mockResolvedValue({
        message: sysMsg.NOTIFICATION_PREFERENCE_CREATED,
        data: mockNotificationPreference,
      });

      const result = await controller.updateUserNotificationPreferences(
        MOCK_USER_ID,
        updateDto,
        mockReq,
      );
      expect(service.findOneByUserId).toHaveBeenCalledWith(MOCK_USER_ID);
      expect(service.create).toHaveBeenCalledWith(MOCK_USER_ID, {
        preferences: updateDto.preferences,
      });
      expect(result).toEqual({
        message: sysMsg.NOTIFICATION_PREFERENCE_CREATED,
        data: mockNotificationPreference,
      });
    });

    it('should throw ForbiddenException if user attempts to update preferences they do not own', async () => {
      const anotherUserId = 'another-user-id';
      const unauthorizedReq: IRequestWithUser = {
        user: {
          id: anotherUserId,
          userId: anotherUserId,
          roles: [UserRole.STUDENT],
        },
      } as IRequestWithUser;

      const updateDto: UpdateNotificationPreferenceDto = {
        preferences: { email: false },
      };

      await expect(
        controller.updateUserNotificationPreferences(
          MOCK_USER_ID,
          updateDto,
          unauthorizedReq,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(service.findOneByUserId).not.toHaveBeenCalled();
      expect(service.create).not.toHaveBeenCalled();
      expect(service.update).not.toHaveBeenCalled();
    });
  });
});
