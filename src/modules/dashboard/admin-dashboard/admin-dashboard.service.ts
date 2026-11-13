import { BadRequestException, Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isUUID } from 'class-validator';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { DataSource } from 'typeorm';
import { Logger } from 'winston';

import { AcademicSessionService } from '../../academic-session/academic-session.service';
import { TimetableModelAction } from '../../timetable/model-actions/timetable.model-action';

import {
  AdminDashboardDataDto,
  TodayActivityDto,
} from './dto/admin-dashboard-response.dto';

@Injectable()
export class AdminDashboardService {
  private readonly logger: Logger;

  constructor(
    private readonly timetableModelAction: TimetableModelAction,
    private readonly academicSessionService: AcademicSessionService,
    @Inject(WINSTON_MODULE_PROVIDER) baseLogger: Logger,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {
    this.logger = baseLogger.child({ context: AdminDashboardService.name });
  }

  async loadTodayAttendance(sessionId?: string) {
    const selectedSessionId =
      sessionId || (await this.academicSessionService.activeSessions()).data.id;
    if (!isUUID(selectedSessionId)) {
      throw new BadRequestException('A valid academic session is required');
    }
    const today = new Intl.DateTimeFormat('sv-SE', {
      timeZone: this.config.get<string>('SCHOOL_TIMEZONE') || 'Africa/Lagos',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const [studentRows, teacherRows] = await Promise.all([
      this.dataSource.query(
        `WITH enrolled AS (
           SELECT DISTINCT cs.student_id FROM class_students cs
           JOIN students s ON s.id = cs.student_id AND s.is_deleted IS NOT TRUE
           JOIN users u ON u.id = s.user_id AND u.is_active = true
           WHERE cs.session_id = $1 AND cs.is_active = true
         )
         SELECT (SELECT COUNT(*) FROM enrolled)::text AS eligible,
                (SELECT COUNT(DISTINCT a.student_id) FROM student_daily_attendance a
                 JOIN enrolled e ON e.student_id = a.student_id
                 WHERE a.session_id = $1::uuid AND a.date = $2::date)::text AS marked`,
        [selectedSessionId, today],
      ),
      this.dataSource.query(
        `WITH active_teachers AS (
           SELECT t.id FROM teachers t JOIN users u ON u.id = t.user_id
           WHERE t.is_active = true AND u.is_active = true
         )
         SELECT (SELECT COUNT(*) FROM active_teachers)::text AS eligible,
                (SELECT COUNT(DISTINCT a.teacher_id) FROM teacher_daily_attendance a
                 JOIN active_teachers t ON t.id = a.teacher_id
                 WHERE a.date = $1::date)::text AS marked`,
        [today],
      ),
    ]);
    return {
      date: today,
      students: {
        marked: Number(studentRows[0]?.marked ?? 0),
        eligible: Number(studentRows[0]?.eligible ?? 0),
      },
      teachers: {
        marked: Number(teacherRows[0]?.marked ?? 0),
        eligible: Number(teacherRows[0]?.eligible ?? 0),
      },
    };
  }

  async loadTodayActivities(
    sessionId?: string,
  ): Promise<AdminDashboardDataDto> {
    this.logger.info("Loading today's activities for admin dashboard");

    // Get today's day of week
    const today = new Date()
      .toLocaleDateString('en-US', { weekday: 'long' })
      .toUpperCase();

    this.logger.info(`Fetching activities for ${today}`);

    // Fetch all timetables with schedules for today
    const targetSessionId = sessionId
      ? sessionId
      : (await this.academicSessionService.activeSessions()).data.id;
    const { payload: timetables } = await this.timetableModelAction.list({
      filterRecordOptions: {
        is_active: true,
        class: { academicSession: { id: targetSessionId } },
      },
      relations: {
        schedules: {
          teacher: { user: true },
          subject: true,
          room: true,
        },
        class: true,
      },
    });

    // Extract and filter schedules for today
    const todaysActivities: TodayActivityDto[] = [];

    for (const timetable of timetables) {
      if (!timetable.schedules || timetable.schedules.length === 0) {
        continue;
      }

      const todaysSchedules = timetable.schedules.filter(
        (schedule) => schedule.day === today,
      );

      for (const schedule of todaysSchedules) {
        const activity: TodayActivityDto = {
          schedule_id: schedule.id,
          teacher: schedule.teacher
            ? {
                id: schedule.teacher.id,
                title: schedule.teacher.title || '',
                first_name: schedule.teacher.user?.first_name || '',
                last_name: schedule.teacher.user?.last_name || '',
                full_name:
                  `${schedule.teacher.title || ''} ${schedule.teacher.user?.first_name || ''} ${schedule.teacher.user?.last_name || ''}`.trim(),
              }
            : null,
          subject: schedule.subject
            ? {
                id: schedule.subject.id,
                name: schedule.subject.name,
              }
            : null,
          class: {
            id: timetable.class.id,
            name: timetable.class.name,
          },
          start_time: schedule.start_time,
          end_time: schedule.end_time,
          venue: schedule.room
            ? {
                id: schedule.room.id,
                name: schedule.room.name,
                capacity: schedule.room.capacity,
              }
            : null,
          period_type: schedule.period_type,
          progress_status: this.calculateProgressStatus(
            schedule.start_time,
            schedule.end_time,
          ),
        };

        todaysActivities.push(activity);
      }
    }

    // Sort by start time
    todaysActivities.sort((a, b) => a.start_time.localeCompare(b.start_time));

    // Calculate summary statistics
    const summary = {
      total_activities: todaysActivities.length,
      completed_activities: todaysActivities.filter(
        (a) => a.progress_status === 'COMPLETED',
      ).length,
      in_progress_activities: todaysActivities.filter(
        (a) => a.progress_status === 'IN_PROGRESS',
      ).length,
      upcoming_activities: todaysActivities.filter(
        (a) => a.progress_status === 'NOT_STARTED',
      ).length,
      activities_with_no_teacher: todaysActivities.filter((a) => !a.teacher)
        .length,
    };

    this.logger.info(
      `Loaded ${todaysActivities.length} activities for today with ${summary.activities_with_no_teacher} missing teachers`,
    );

    return {
      todays_activities: todaysActivities,
      summary,
    };
  }

  /**
   * Calculate progress status based on current time
   */
  private calculateProgressStatus(
    startTime: string,
    endTime: string,
  ): 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' {
    const now = new Date();
    const currentTime = now.toTimeString().split(' ')[0]; // HH:MM:SS

    if (currentTime < startTime) {
      return 'NOT_STARTED';
    } else if (currentTime >= startTime && currentTime <= endTime) {
      return 'IN_PROGRESS';
    } else {
      return 'COMPLETED';
    }
  }
}
