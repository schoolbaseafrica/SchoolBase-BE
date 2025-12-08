import { ApiProperty } from '@nestjs/swagger';
import { Entity, Column, Index, JoinColumn, OneToOne } from 'typeorm';

import { BaseEntity } from '../../../entities/base-entity';
import { User } from '../../user/entities/user.entity'; // Assuming a User entity exists
import { INotificationPreferenceSettings } from '../types/notification.types'; // Define this type later

@Entity('notification_preference')
export class NotificationPreference extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  user_id: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ApiProperty({
    type: 'object',
    properties: {
      email: { type: 'boolean', example: true },
      push: { type: 'boolean', example: false },
    },
    additionalProperties: false,
  })
  @Column({ type: 'jsonb', nullable: true })
  preferences: INotificationPreferenceSettings;
}
