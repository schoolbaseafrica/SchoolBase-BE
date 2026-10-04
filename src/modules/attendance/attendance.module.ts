import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AcademicSessionModule } from '../academic-session/academic-session.module';
import { TermModule } from '../academic-term/term.module';
import { TeachersModule } from '../teacher/teacher.module';

import { AttendanceMethodPolicyService } from './attendance-method-policy.service';
import {
  ScheduleBasedAttendanceController,
  StudentDailyAttendanceController,
  TeachersAttendanceController,
} from './controllers';
import { MobileAttendanceController } from './controllers/mobile-attendance.controller';
import {
  ScheduleBasedAttendance,
  StudentDailyAttendance,
  TeacherDailyAttendance,
  TeacherManualCheckin,
} from './entities';
import { AttendanceEditRequest } from './entities/student-daily-attendance.entity';
import { MobileAttendanceService } from './mobile-attendance.service';
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
    MobileAttendanceController,
  ],
  providers: [
    AttendanceService,
    TeachersAttendanceService,
    AttendanceModelAction,
    StudentDailyAttendanceModelAction,
    TeacherManualCheckinModelAction,
    TeacherDailyAttendanceModelAction,
    AttendanceEditRequestModelAction,
    MobileAttendanceService,
    AttendanceMethodPolicyService,
  ],
  exports: [AttendanceService, TeachersAttendanceService],
})
export class AttendanceModule {}
