import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import * as sysMsg from '../../../constants/system.messages'; // Import system messages
import { User, UserRole } from '../../user/entities/user.entity';
import {
  CreateNotificationPreferenceDto,
  UpdateNotificationPreferenceDto,
} from '../dto';
import { NotificationPreference } from '../entities/notification-preference.entity';
import { NotificationPreferenceService } from '../services/notification-preference.service';

describe('NotificationPreferenceService', () => {
  let service: NotificationPreferenceService;
  let repository: Repository<NotificationPreference>;

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
    user: mockUser, // Add the user property
  } as NotificationPreference;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationPreferenceService,
        {
          provide: getRepositoryToken(NotificationPreference),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<NotificationPreferenceService>(
      NotificationPreferenceService,
    );
    repository = module.get<Repository<NotificationPreference>>(
      getRepositoryToken(NotificationPreference),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOneByUserId', () => {
    it('should return notification preference if found', async () => {
      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValue(mockNotificationPreference);
      const result = await service.findOneByUserId(MOCK_USER_ID);
      expect(result).toEqual(mockNotificationPreference);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { user_id: MOCK_USER_ID },
      });
    });

    it('should return null if notification preference not found', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValue(null);
      const result = await service.findOneByUserId(MOCK_USER_ID);
      expect(result).toBeNull();
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { user_id: MOCK_USER_ID },
      });
    });
  });

  describe('create', () => {
    it('should create and return a new notification preference', async () => {
      const createDto: CreateNotificationPreferenceDto = {
        preferences: MOCK_PREFERENCES,
      };
      jest
        .spyOn(repository, 'create')
        .mockReturnValue(mockNotificationPreference);
      jest
        .spyOn(repository, 'save')
        .mockResolvedValue(mockNotificationPreference);

      const result = await service.create(MOCK_USER_ID, createDto);
      expect(repository.create).toHaveBeenCalledWith({
        ...createDto,
        user_id: MOCK_USER_ID,
      });
      expect(repository.save).toHaveBeenCalledWith(mockNotificationPreference);
      expect(result).toEqual({
        message: sysMsg.NOTIFICATION_PREFERENCE_CREATED,
        data: mockNotificationPreference,
      });
    });
  });

  describe('update', () => {
    const updateDto: UpdateNotificationPreferenceDto = {
      preferences: { email: false },
    };
    const updatedPreference = {
      ...mockNotificationPreference,
      preferences: { email: false },
    };

    it('should update and return the notification preference if found', async () => {
      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValue(mockNotificationPreference);
      jest.spyOn(repository, 'save').mockResolvedValue(updatedPreference);

      const result = await service.update(MOCK_USER_ID, updateDto);

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { user_id: MOCK_USER_ID },
      });
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          ...mockNotificationPreference,
          preferences: updateDto.preferences,
        }),
      );
      expect(result).toEqual({
        message: sysMsg.NOTIFICATION_PREFERENCE_UPDATED,
        data: updatedPreference,
      });
    });

    it('should throw NotFoundException if notification preference not found for update', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValue(undefined);

      await expect(service.update(MOCK_USER_ID, updateDto)).rejects.toThrow(
        new NotFoundException(sysMsg.NOTIFICATION_PREFERENCE_NOT_FOUND),
      );
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { user_id: MOCK_USER_ID },
      });
      expect(repository.save).not.toHaveBeenCalled();
    });
  });
});
