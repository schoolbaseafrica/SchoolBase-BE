import { Module } from '@nestjs/common';

import { AcademicSessionModule } from '../../academic-session/academic-session.module';
import { TimetableModule } from '../../timetable/timetable.module';

import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardService } from './admin-dashboard.service';

@Module({
  imports: [TimetableModule, AcademicSessionModule],
  controllers: [AdminDashboardController],
  providers: [AdminDashboardService],
  exports: [AdminDashboardService],
})
export class AdminDashboardModule {}
