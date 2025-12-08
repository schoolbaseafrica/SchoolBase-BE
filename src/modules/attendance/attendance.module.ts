import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AcademicSessionModule } from '../academic-session/academic-session.module';
import { TermModule } from '../academic-term/term.module';
import { TeachersModule } from '../teacher/teacher.module';

import {
  ScheduleBasedAttendanceController,
  StudentDailyAttendanceController,
  TeachersAttendanceController,
} from './controllers';
import {
  ScheduleBasedAttendance,
  StudentDailyAttendance,
  TeacherDailyAttendance,
  TeacherManualCheckin,
} from './entities';
import { AttendanceEditRequest } from './entities/student-daily-attendance.entity';
import {
  AttendanceModelAction,
  StudentDailyAttendanceModelAction,
  TeacherManualCheckinModelAction,
  AttendanceEditRequestModelAction,
} from './model-actions';
import { TeacherDailyAttendanceModelAction } from './model-actions/teacher-daily-attendance.action';
import { AttendanceService, TeachersAttendanceService } from './services';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ScheduleBasedAttendance,
      StudentDailyAttendance,
      TeacherManualCheckin,
      TeacherDailyAttendance,
      AttendanceEditRequest,
    ]),
    AcademicSessionModule,
    TermModule,
    TeachersModule,
  ],
  controllers: [
    ScheduleBasedAttendanceController,
    StudentDailyAttendanceController,
    TeachersAttendanceController,
  ],
  providers: [
    AttendanceService,
    TeachersAttendanceService,
    AttendanceModelAction,
    StudentDailyAttendanceModelAction,
    TeacherManualCheckinModelAction,
    TeacherDailyAttendanceModelAction,
    AttendanceEditRequestModelAction,
  ],
  exports: [AttendanceService, TeachersAttendanceService],
})
export class AttendanceModule {}
