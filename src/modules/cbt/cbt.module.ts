import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Class } from '../class/entities/class.entity';
import { Student } from '../student/entities/student.entity';

import { CbtController } from './cbt.controller';
import { CbtService } from './cbt.service';
import {
  CbtAnswer,
  CbtAttempt,
  CbtAttemptEvent,
  CbtExam,
  CbtExamSection,
  CbtQuestion,
} from './entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CbtExam,
      CbtExamSection,
      CbtQuestion,
      CbtAttempt,
      CbtAnswer,
      CbtAttemptEvent,
      Class,
      Student,
    ]),
  ],
  controllers: [CbtController],
  providers: [CbtService],
  exports: [CbtService],
})
export class CbtModule {}
