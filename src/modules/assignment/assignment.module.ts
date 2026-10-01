import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AcademicSession } from '../academic-session/entities/academic-session.entity';
import { Term } from '../academic-term/entities/term.entity';
import { ClassStudent } from '../class/entities/class-student.entity';
import { ClassSubject } from '../class/entities/class-subject.entity';
import { Class } from '../class/entities/class.entity';
import { Notification } from '../notification/entities/notification.entity';
import { Student } from '../student/entities/student.entity';
import { Subject } from '../subject/entities/subject.entity';
import { Teacher } from '../teacher/entities/teacher.entity';
import { Schedule } from '../timetable/entities/schedule.entity';
import { UploadModule } from '../upload/upload.module';

import { AssignmentController } from './assignment.controller';
import { AssignmentService } from './assignment.service';
import { AssignmentAttachment } from './entities/assignment-attachment.entity';
import { Assignment, AssignmentSubmission } from './entities/assignment.entity';

@Module({
  imports: [
    UploadModule,
    TypeOrmModule.forFeature([
      Assignment,
      AssignmentSubmission,
      AcademicSession,
      Term,
      Class,
      ClassStudent,
      ClassSubject,
      Student,
      Subject,
      Teacher,
      Schedule,
      AssignmentAttachment,
      Notification,
    ]),
  ],
  controllers: [AssignmentController],
  providers: [AssignmentService],
})
export class AssignmentModule {}
