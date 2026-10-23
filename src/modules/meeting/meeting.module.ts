import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { MeetingController } from './meeting.controller';
import { MeetingService } from './meeting.service';

@Module({
  imports: [ConfigModule],
  controllers: [MeetingController],
  providers: [MeetingService],
})
export class MeetingModule {}
