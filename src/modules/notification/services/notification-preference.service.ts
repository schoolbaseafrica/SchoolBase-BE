import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import * as sysMsg from '../../../constants/system.messages';
import {
  CreateNotificationPreferenceDto,
  UpdateNotificationPreferenceDto,
} from '../dto';
import { NotificationPreference } from '../entities/notification-preference.entity';

@Injectable()
export class NotificationPreferenceService {
  constructor(
    @InjectRepository(NotificationPreference)
    private readonly notificationPreferenceRepository: Repository<NotificationPreference>,
  ) {}

  async findOneByUserId(
    userId: string,
  ): Promise<NotificationPreference | null> {
    const preference = await this.notificationPreferenceRepository.findOne({
      where: { user_id: userId },
    });
    return preference;
  }

  async create(
    userId: string,
    createDto: CreateNotificationPreferenceDto,
  ): Promise<{ message: string; data: NotificationPreference }> {
    const newPreference = this.notificationPreferenceRepository.create({
      ...createDto,
      user_id: userId,
    });
    const createdPreference =
      await this.notificationPreferenceRepository.save(newPreference);
    return {
      message: sysMsg.NOTIFICATION_PREFERENCE_CREATED,
      data: createdPreference,
    };
  }

  async update(
    userId: string,
    updateDto: UpdateNotificationPreferenceDto,
  ): Promise<{ message: string; data: NotificationPreference }> {
    const preference = await this.notificationPreferenceRepository.findOne({
      where: { user_id: userId },
    });
    if (!preference) {
      throw new NotFoundException(sysMsg.NOTIFICATION_PREFERENCE_NOT_FOUND);
    }

    Object.assign(preference, updateDto);
    const updatedPreference =
      await this.notificationPreferenceRepository.save(preference);
    return {
      message: sysMsg.NOTIFICATION_PREFERENCE_UPDATED,
      data: updatedPreference,
    };
  }
}
