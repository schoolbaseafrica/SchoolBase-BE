import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Class } from '../class/entities/class.entity';
import { InviteModule } from '../invites/invites.module';
import { Student } from '../student/entities/student.entity';

import { CbtPublicController } from './cbt-public.controller';
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
} from './entities';

@Module({
  imports: [
    InviteModule,
    TypeOrmModule.forFeature([
      CbtExam,
      CbtExamSection,
      CbtQuestion,
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
  providers: [CbtService],
  exports: [CbtService],
})
export class CbtModule {}
