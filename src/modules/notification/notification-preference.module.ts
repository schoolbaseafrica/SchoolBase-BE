import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { NotificationPreferenceController } from './controller/notification-preference.controller';
import { NotificationPreference } from './entities/notification-preference.entity';
import { NotificationPreferenceService } from './services/notification-preference.service';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationPreference])],
  controllers: [NotificationPreferenceController],
  providers: [NotificationPreferenceService],
  exports: [NotificationPreferenceService],
})
export class NotificationPreferenceModule {}
