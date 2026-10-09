import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EmailModule } from '../email/email.module';
import { FeesModule } from '../fees/fees.module';
import { TimetableModule } from '../timetable/timetable.module';

import { NotificationController } from './controller';
import { Notification } from './entities/notification.entity';
import { NotificationModelAction } from './model-actions/notification.model-action';
import { NotificationPreferenceModule } from './notification-preference.module';
import { NotificationService, FeeNotificationService } from './services';
import { SchoolEmailAlertService } from './services/school-email-alert.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification]),
    EmailModule,
    NotificationPreferenceModule,
    forwardRef(() => FeesModule),
    forwardRef(() => TimetableModule),
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationModelAction,
    FeeNotificationService,
    SchoolEmailAlertService,
  ],
  exports: [
    NotificationModelAction,
    NotificationService,
    FeeNotificationService,
    SchoolEmailAlertService,
  ],
})
export class NotificationModule {}
