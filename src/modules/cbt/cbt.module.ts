import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Class } from '../class/entities/class.entity';
import { InviteModule } from '../invites/invites.module';
import { Student } from '../student/entities/student.entity';
import { UploadModule } from '../upload/upload.module';

import { CbtPublicController } from './cbt-public.controller';
import { CbtScreenRecordingService } from './cbt-screen-recording.service';
import { CbtController } from './cbt.controller';
import { CbtService } from './cbt.service';
import {
  CbtAnswer,
  CbtApplicant,
  CbtAttempt,
  CbtAttemptEvent,
  CbtEntranceInvite,
  CbtExam,
  CbtExamSection,
  CbtIntake,
  CbtQuestion,
  CbtScreenRecording,
} from './entities';

@Module({
  imports: [
    InviteModule,
    UploadModule,
    TypeOrmModule.forFeature([
      CbtExam,
      CbtExamSection,
      CbtQuestion,
      CbtScreenRecording,
      CbtAttempt,
      CbtAnswer,
      CbtAttemptEvent,
      CbtApplicant,
      CbtEntranceInvite,
      CbtIntake,
      Class,
      Student,
    ]),
  ],
  controllers: [CbtController, CbtPublicController],
  providers: [CbtService, CbtScreenRecordingService],
  exports: [CbtService],
})
export class CbtModule {}
