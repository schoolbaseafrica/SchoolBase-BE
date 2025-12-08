import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InsertResult, Repository } from 'typeorm';

import { CreateManyRecordType } from '../../../common/types/create-many-record.types';
import { Notification } from '../entities/notification.entity';
import {
  NotificationMetadata,
  NotificationType,
} from '../types/notification.types';

@Injectable()
export class NotificationModelAction extends AbstractModelAction<Notification> {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
  ) {
    super(notificationRepository, Notification);
  }
  async findOneById(id: string): Promise<Notification | null> {
    return this.repository.findOne({ where: { id } });
  }

  async createBulk(
    notifications: Array<{
      recipient_id: string;
      title: string;
      message: string;
      type: NotificationType;
      metadata?: NotificationMetadata;
      is_read: boolean;
    }>,
  ): Promise<Notification[]> {
    const entities = notifications.map((data) => this.repository.create(data));
    return this.repository.save(entities);
  }

  /**
   * Bulk insert multiple Notifications records.
   * Uses TypeORM insert for performance.
   * @param data Array of Notification partial objects to insert
   */
  async createMany(
    data: CreateManyRecordType<Partial<Notification>>,
  ): Promise<InsertResult> {
    const { createPayloads, transactionOptions } = data;

    if (!createPayloads?.length) {
      return Promise.resolve({ identifiers: [], generatedMaps: [], raw: [] });
    }

    if (transactionOptions.useTransaction) {
      return transactionOptions.transaction.insert(
        Notification,
        createPayloads,
      );
    } else {
      return this.repository.insert(createPayloads);
    }
  }
}
