import { Module } from '@nestjs/common';

import { AcademicSessionModule } from '../../academic-session/academic-session.module';
import { ClassModule } from '../../class/class.module';
import { StudentModule } from '../../student/student.module';
import { TimetableModule } from '../../timetable/timetable.module';
import { UserModule } from '../../user/user.module';

import { StudentDashboardController } from './student-dashboard.controller';
import { StudentDashboardService } from './student-dashboard.service';

@Module({
  imports: [
    UserModule,
    StudentModule,
    TimetableModule,
    AcademicSessionModule,
    ClassModule,
  ],
  controllers: [StudentDashboardController],
  providers: [StudentDashboardService],
  exports: [StudentDashboardService],
})
export class StudentDashboardModule {}
