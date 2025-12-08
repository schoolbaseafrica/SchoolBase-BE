import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { DataSource } from 'typeorm';
import { Logger } from 'winston';

import { Student } from 'src/modules/student/entities';

import { IPaginationMeta } from '../../../common/types/base-response.interface';
import * as sysMsg from '../../../constants/system.messages';
import { AcademicSessionService } from '../../academic-session/academic-session.service';
import { TermName } from '../../academic-term/entities/term.entity';
import { TermModelAction } from '../../academic-term/model-actions';
import { ClassStudent } from '../../class/entities/class-student.entity';
import { ClassTeacher } from '../../class/entities/class-teacher.entity';
import { Teacher } from '../../teacher/entities/teacher.entity';
import { Schedule } from '../../timetable/entities/schedule.entity';
import { DayOfWeek } from '../../timetable/enums/timetable.enums';
import {
  AttendanceRecordDto,
  AttendanceResponseDto,
  CreateEditRequestDto,
  GetScheduleAttendanceQueryDto,
  MarkAttendanceDto,
  ReviewEditRequestDto,
  UpdateAttendanceDto,
} from '../dto';
import { ScheduleBasedAttendance } from '../entities';
import { StudentDailyAttendance } from '../entities/student-daily-attendance.entity';
import {
  AttendanceStatus,
  DailyAttendanceStatus,
  AttendanceType,
  EditRequestStatus,
} from '../enums/attendance-status.enum';
import {
  AttendanceModelAction,
  StudentDailyAttendanceModelAction,
  AttendanceEditRequestModelAction,
} from '../model-actions';

@Injectable()
export class AttendanceService {
  private readonly logger: Logger;
  protected monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) baseLogger: Logger,
    private readonly attendanceModelAction: AttendanceModelAction,
    private readonly studentDailyAttendanceModelAction: StudentDailyAttendanceModelAction,
    private readonly academicSessionService: AcademicSessionService,
    private readonly termModelAction: TermModelAction,
    private readonly dataSource: DataSource,
    private readonly editRequestModelAction: AttendanceEditRequestModelAction,
  ) {
    this.logger = baseLogger.child({ context: AttendanceService.name });
  }

  /**
   * Convert JavaScript day number (0-6) to DayOfWeek enum
   * JavaScript: 0 = Sunday, 1 = Monday, ..., 6 = Saturday
   */
  private getDayOfWeekEnum(dayNumber: number): DayOfWeek {
    const dayMap = [
      DayOfWeek.SUNDAY,
      DayOfWeek.MONDAY,
      DayOfWeek.TUESDAY,
      DayOfWeek.WEDNESDAY,
      DayOfWeek.THURSDAY,
      DayOfWeek.FRIDAY,
      DayOfWeek.SATURDAY,
    ];
    return dayMap[dayNumber];
  }

  /**
   * Unified method to mark attendance (both schedule-based and daily)
   * Handles both types based on schedule_id or class_id in the DTO
   */
  async markAttendance(
    userId: string,
    dto: MarkAttendanceDto,
  ): Promise<{
    message: string;
    marked: number;
    updated: number;
    total: number;
  }> {
    const { schedule_id, class_id, date, attendance_records } = dto;

    // Validate that either schedule_id or class_id is provided
    if (!schedule_id && !class_id) {
      throw new BadRequestException(
        'Either schedule_id or class_id must be provided',
      );
    }

    if (schedule_id && class_id) {
      throw new BadRequestException(
        'Cannot provide both schedule_id and class_id',
      );
    }

    // Validate date is not in the future
    const attendanceDate = new Date(date);
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    if (attendanceDate > today) {
      throw new BadRequestException(sysMsg.ATTENDANCE_FUTURE_DATE_NOT_ALLOWED);
    }

    // Get active session
    const activeSession = await this.academicSessionService
      .activeSessions()
      .then((s) => s.data);

    let markedCount = 0;
    let updatedCount = 0;

    // Route to appropriate marking logic
    if (schedule_id) {
      // Schedule-based attendance
      const result = await this.markScheduleBasedAttendance(
        userId,
        schedule_id,
        attendanceDate,
        activeSession.id,
        attendance_records,
      );
      markedCount = result.marked;
      updatedCount = result.updated;
    } else {
      // Daily attendance
      if (!class_id) {
        throw new BadRequestException(
          'class_id is required for daily attendance',
        );
      }
      const result = await this.markDailyAttendance(
        userId,
        class_id,
        attendanceDate,
        activeSession.id,
        attendance_records,
      );
      markedCount = result.marked;
      updatedCount = result.updated;
    }

    return {
      message: schedule_id
        ? sysMsg.ATTENDANCE_MARKED_SUCCESSFULLY
        : 'Student daily attendance marked successfully',
      marked: markedCount,
      updated: updatedCount,
      total: attendance_records.length,
    };
  }

  /**
   * Internal method for schedule-based attendance marking
   */
  private async markScheduleBasedAttendance(
    userId: string,
    scheduleId: string,
    attendanceDate: Date,
    sessionId: string,
    attendanceRecords: AttendanceRecordDto[],
  ): Promise<{ marked: number; updated: number }> {
    // Get teacher ID from user ID
    const teacher = await this.dataSource.manager.findOne(Teacher, {
      where: { user: { id: userId } },
    });

    if (!teacher) {
      throw new NotFoundException(sysMsg.TEACHER_NOT_FOUND);
    }

    const teacherId = teacher.id;
    let markedCount = 0;
    let updatedCount = 0;

    await this.dataSource.transaction(async (manager) => {
      // Verify schedule exists and teacher is assigned to it
      const schedule = await manager.findOne(Schedule, {
        where: { id: scheduleId },
        relations: ['timetable', 'timetable.class'],
      });

      if (!schedule) {
        throw new NotFoundException(sysMsg.SCHEDULE_NOT_FOUND);
      }

      if (schedule.teacher_id !== teacherId) {
        throw new ForbiddenException(sysMsg.TEACHER_NOT_ASSIGNED_TO_SCHEDULE);
      }

      const classId = schedule.timetable?.class?.id;
      if (!classId) {
        throw new NotFoundException(sysMsg.CLASS_NOT_FOUND);
      }

      for (const record of attendanceRecords) {
        const { student_id, status, notes } = record;

        // Verify student is enrolled in this class
        const enrollment = await manager.findOne(ClassStudent, {
          where: {
            student: { id: student_id },
            class: { id: classId },
            is_active: true,
          },
          relations: ['student', 'class'],
        });

        if (!enrollment) {
          this.logger.warn(
            `Student ${student_id} is not enrolled in class ${classId}, skipping`,
          );
          continue;
        }

        // Check if attendance already exists
        const existingAttendance = await manager.findOne(
          ScheduleBasedAttendance,
          {
            where: {
              student_id,
              schedule_id: scheduleId,
              date: attendanceDate,
            },
          },
        );

        if (existingAttendance) {
          // Check if attendance is locked - cannot update via marking
          if (existingAttendance.is_locked) {
            throw new ForbiddenException(sysMsg.ATTENDANCE_LOCKED);
          }

          // Update existing attendance using model action
          await this.attendanceModelAction.update({
            identifierOptions: { id: existingAttendance.id },
            updatePayload: {
              status: status as AttendanceStatus,
              notes: notes || existingAttendance.notes,
              marked_by: userId,
              marked_at: new Date(),
              is_locked: true, // Auto-lock on marking
            },
            transactionOptions: {
              useTransaction: true,
              transaction: manager,
            },
          });
          updatedCount++;
        } else {
          // Create new attendance record
          await this.attendanceModelAction.create({
            createPayload: {
              schedule_id: scheduleId,
              student_id,
              session_id: sessionId,
              date: attendanceDate,
              status: status as AttendanceStatus,
              marked_by: userId,
              marked_at: new Date(),
              notes,
              is_locked: true, // Auto-lock on creation
            },
            transactionOptions: {
              useTransaction: true,
              transaction: manager,
            },
          });
          markedCount++;
        }
      }
    });

    this.logger.info(
      `Teacher ${teacherId} marked attendance for schedule ${scheduleId} on ${attendanceDate.toISOString().split('T')[0]}. Marked: ${markedCount}, Updated: ${updatedCount}`,
    );

    return { marked: markedCount, updated: updatedCount };
  }

  /**
   * Internal method for daily attendance marking
   */
  private async markDailyAttendance(
    userId: string,
    classId: string,
    attendanceDate: Date,
    sessionId: string,
    attendanceRecords: AttendanceRecordDto[],
  ): Promise<{ marked: number; updated: number }> {
    // Get teacher ID from user ID and validate
    const teacher = await this.dataSource.manager.findOne(Teacher, {
      where: { user: { id: userId } },
    });

    if (!teacher) {
      throw new NotFoundException(sysMsg.TEACHER_NOT_FOUND);
    }

    const teacherId = teacher.id;

    // Validate that this teacher is the class teacher for this class
    const classTeacherAssignment = await this.dataSource.manager.findOne(
      ClassTeacher,
      {
        where: {
          teacher: { id: teacherId },
          class: { id: classId },
          is_active: true,
        },
      },
    );

    if (!classTeacherAssignment) {
      throw new ForbiddenException(
        'Only the class teacher can mark daily attendance for this class',
      );
    }

    let markedCount = 0;
    let updatedCount = 0;

    await this.dataSource.transaction(async (manager) => {
      const markTime = new Date();

      for (const record of attendanceRecords) {
        const { student_id, status, notes } = record;

        // Check if student is enrolled in class
        const enrollment = await manager.findOne(ClassStudent, {
          where: {
            student: { id: student_id },
            class: { id: classId },
            is_active: true,
          },
        });

        if (!enrollment) {
          throw new NotFoundException(
            `Student ${student_id} not enrolled in class ${classId}`,
          );
        }

        // Check for existing record
        const existingRecord = await manager.findOne(StudentDailyAttendance, {
          where: {
            student_id,
            class_id: classId,
            date: attendanceDate,
          },
        });

        if (existingRecord) {
          // Check if attendance is locked - cannot update via marking
          if (existingRecord.is_locked) {
            throw new ForbiddenException(sysMsg.ATTENDANCE_LOCKED);
          }

          // Update existing record using model action
          await this.studentDailyAttendanceModelAction.update({
            identifierOptions: { id: existingRecord.id },
            updatePayload: {
              status: status as DailyAttendanceStatus,
              check_in_time: existingRecord.check_in_time || markTime,
              notes: notes || existingRecord.notes,
              marked_by: userId,
              marked_at: new Date(),
              is_locked: true, // Auto-lock on marking
            },
            transactionOptions: {
              useTransaction: true,
              transaction: manager,
            },
          });
          updatedCount++;
        } else {
          // Create new record using model action - auto-set check_in_time
          await this.studentDailyAttendanceModelAction.create({
            createPayload: {
              student_id,
              class_id: classId,
              session_id: sessionId,
              date: attendanceDate,
              status: status as DailyAttendanceStatus,
              check_in_time: markTime,
              notes,
              marked_by: userId,
              marked_at: new Date(),
              is_locked: true, // Auto-lock on creation
            },
            transactionOptions: {
              useTransaction: true,
              transaction: manager,
            },
          });
          markedCount++;
        }
      }
    });

    this.logger.info(
      `Teacher ${teacherId} marked daily attendance for class ${classId} on ${attendanceDate.toISOString().split('T')[0]}. Marked: ${markedCount}, Updated: ${updatedCount}`,
    );

    return { marked: markedCount, updated: updatedCount };
  }

  /**
   * Get attendance records for a specific schedule and date
   */
  async getScheduleAttendance(
    scheduleId: string,
    date: string,
  ): Promise<{
    message: string;
    data: AttendanceResponseDto[];
  }> {
    const attendanceDate = new Date(date);

    const { payload: records } = await this.attendanceModelAction.list({
      filterRecordOptions: {
        schedule_id: scheduleId,
        date: attendanceDate,
      },
      order: { createdAt: 'DESC' },
    });

    return {
      message: sysMsg.ATTENDANCE_RECORDS_RETRIEVED,
      data: records.map((record) => this.mapToResponseDto(record)),
    };
  }

  /**
   * Update a single attendance record
   */
  async updateAttendance(
    attendanceId: string,
    dto: UpdateAttendanceDto,
  ): Promise<{
    message: string;
    data: AttendanceResponseDto;
  }> {
    const attendance = await this.attendanceModelAction.get({
      identifierOptions: { id: attendanceId },
    });

    if (!attendance) {
      throw new NotFoundException(sysMsg.ATTENDANCE_NOT_FOUND);
    }

    // Check if attendance is locked - admin approval required
    if (attendance.is_locked) {
      throw new ForbiddenException(sysMsg.ATTENDANCE_LOCKED);
    }

    // Build update payload with proper type handling
    const updatePayload: Partial<ScheduleBasedAttendance> = {
      marked_at: new Date(),
      is_locked: true, // Auto-lock after update
    };

    if (dto.status !== undefined) {
      updatePayload.status = dto.status as AttendanceStatus;
    }
    if (dto.notes !== undefined) {
      updatePayload.notes = dto.notes;
    }

    const updated = await this.attendanceModelAction.update({
      identifierOptions: { id: attendanceId },
      updatePayload,
      transactionOptions: {
        useTransaction: false,
      },
    });

    this.logger.info(`Attendance record ${attendanceId} updated`);

    return {
      message: sysMsg.ATTENDANCE_UPDATED_SUCCESSFULLY,
      data: this.mapToResponseDto(updated),
    };
  }

  /**
   * Update a single student daily attendance record
   */
  async updateStudentDailyAttendance(
    attendanceId: string,
    dto: UpdateAttendanceDto,
  ): Promise<{
    message: string;
  }> {
    const attendance = await this.studentDailyAttendanceModelAction.get({
      identifierOptions: { id: attendanceId },
    });

    if (!attendance) {
      throw new NotFoundException(sysMsg.ATTENDANCE_NOT_FOUND);
    }

    // Check if attendance is locked - admin approval required
    if (attendance.is_locked) {
      throw new ForbiddenException(sysMsg.ATTENDANCE_LOCKED);
    }

    // Build update payload
    const updateData: Partial<StudentDailyAttendance> = {
      marked_at: new Date(),
      is_locked: true, // Auto-lock after update
    };

    if (dto.status !== undefined) {
      updateData.status = dto.status as DailyAttendanceStatus;
    }
    if (dto.notes !== undefined) {
      updateData.notes = dto.notes;
    }
    if (dto.check_in_time !== undefined) {
      updateData.check_in_time = new Date(`1970-01-01T${dto.check_in_time}`);
    }
    if (dto.check_out_time !== undefined) {
      updateData.check_out_time = new Date(`1970-01-01T${dto.check_out_time}`);
    }

    await this.studentDailyAttendanceModelAction.update({
      identifierOptions: { id: attendanceId },
      updatePayload: updateData,
      transactionOptions: { useTransaction: false },
    });

    this.logger.info(`Student daily attendance record ${attendanceId} updated`);

    return {
      message: sysMsg.ATTENDANCE_UPDATED_SUCCESSFULLY,
    };
  }

  /**
   * Get student's own attendance history
   */
  async getStudentAttendance(
    studentId: string,
    query: GetScheduleAttendanceQueryDto,
  ): Promise<{
    message: string;
    data: AttendanceResponseDto[];
    meta: Partial<IPaginationMeta>;
  }> {
    const { start_date, end_date, status, page = 1, limit = 20 } = query;

    const filterOptions: Record<string, unknown> = { student_id: studentId };

    if (status) {
      filterOptions.status = status;
    }

    // For date ranges, we need to use raw query or simpler approach
    const { payload: records, paginationMeta } =
      await this.attendanceModelAction.list({
        filterRecordOptions: filterOptions,
        order: { date: 'DESC' },
        paginationPayload: { page, limit },
      });

    // Filter by date range in memory if needed (or use repository for complex queries)
    let filteredRecords = records;
    if (start_date || end_date) {
      const startDate = start_date ? new Date(start_date) : null;
      const endDate = end_date ? new Date(end_date) : null;

      filteredRecords = records.filter((record) => {
        const recordDate = new Date(record.date);
        if (startDate && recordDate < startDate) return false;
        if (endDate && recordDate > endDate) return false;
        return true;
      });
    }

    return {
      message: sysMsg.ATTENDANCE_RECORDS_RETRIEVED,
      data: filteredRecords.map((record) => this.mapToResponseDto(record)),
      meta: paginationMeta,
    };
  }

  /**
   * Get attendance records with filters (Admin/Teacher)
   */
  async getAttendanceRecords(query: GetScheduleAttendanceQueryDto): Promise<{
    message: string;
    data: AttendanceResponseDto[];
    meta: Partial<IPaginationMeta>;
  }> {
    const {
      schedule_id,
      student_id,
      start_date,
      end_date,
      status,
      page = 1,
      limit = 20,
    } = query;

    const filterOptions: Record<string, unknown> = {};

    if (schedule_id) filterOptions.schedule_id = schedule_id;
    if (student_id) filterOptions.student_id = student_id;
    if (status) filterOptions.status = status;

    const { payload: records, paginationMeta } =
      await this.attendanceModelAction.list({
        filterRecordOptions: filterOptions,
        order: { date: 'DESC', createdAt: 'DESC' },
        paginationPayload: { page, limit },
      });

    // Filter by date range in memory if needed
    let filteredRecords = records;
    if (start_date || end_date) {
      const startDate = start_date ? new Date(start_date) : null;
      const endDate = end_date ? new Date(end_date) : null;

      filteredRecords = records.filter((record) => {
        const recordDate = new Date(record.date);
        if (startDate && recordDate < startDate) return false;
        if (endDate && recordDate > endDate) return false;
        return true;
      });
    }

    return {
      message: sysMsg.ATTENDANCE_RECORDS_RETRIEVED,
      data: filteredRecords.map((record) => this.mapToResponseDto(record)),
      meta: paginationMeta,
    };
  }

  /**
   * Check if attendance is already marked for a schedule on a specific date
   */
  async isAttendanceMarked(
    scheduleId: string,
    date: string,
  ): Promise<{ is_marked: boolean; count: number }> {
    const attendanceDate = new Date(date);

    const { payload: records } = await this.attendanceModelAction.list({
      filterRecordOptions: {
        schedule_id: scheduleId,
        date: attendanceDate,
      },
    });

    return {
      is_marked: records.length > 0,
      count: records.length,
    };
  }

  // Get a single student's monthly attendance for current month

  async getStudentMonthlyAttendance(studentId: string): Promise<{
    message: string;
    month: string;
    year: number;
    student_id: string;
    total_days_in_month: number;
    days_present: number;
    days_absent: number;
    days_late: number;
    days_excused: number;
    days_half_day: number;
    attendance_details: Array<{
      date: string;
      status: string;
      check_in_time?: string;
      check_out_time?: string;
      notes?: string;
    }>;
  }> {
    // Get current month start and end dates
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    // First day of current month
    const startDate = new Date(year, month, 1);
    const startDateStr = startDate.toISOString().split('T')[0];

    // Last day of current month
    const endDate = new Date(year, month + 1, 0);
    const endDateStr = endDate.toISOString().split('T')[0];

    // Get all daily attendance records for this student in the current month
    const { payload: attendanceRecords } =
      await this.studentDailyAttendanceModelAction.list({
        filterRecordOptions: {
          session_id: await this.academicSessionService
            .activeSessions()
            .then((s) => s.data.id),
          student_id: studentId,
        },
      });

    // Filter by current month date range
    const filteredRecords = attendanceRecords.filter((record) => {
      const recordDateStr =
        typeof record.date === 'string'
          ? record.date
          : record.date.toISOString().split('T')[0];
      return recordDateStr >= startDateStr && recordDateStr <= endDateStr;
    });

    // Calculate total days in current month
    const totalDaysInMonth = endDate.getDate();

    // Calculate attendance statistics
    let daysPresent = 0;
    let daysAbsent = 0;
    let daysLate = 0;
    let daysExcused = 0;
    let daysHalfDay = 0;

    const attendanceDetails = filteredRecords.map((record) => {
      // Count by status
      switch (record.status) {
        case DailyAttendanceStatus.PRESENT:
          daysPresent++;
          break;
        case DailyAttendanceStatus.ABSENT:
          daysAbsent++;
          break;
        case DailyAttendanceStatus.LATE:
          daysLate++;
          daysPresent++; // Late still counts as present
          break;
        case DailyAttendanceStatus.EXCUSED:
          daysExcused++;
          break;
        case DailyAttendanceStatus.HALF_DAY:
          daysHalfDay++;
          break;
      }

      return {
        date:
          typeof record.date === 'string'
            ? record.date
            : record.date.toISOString().split('T')[0],
        status: record.status,
        check_in_time: record.check_in_time
          ? record.check_in_time.toISOString()
          : undefined,
        check_out_time: record.check_out_time
          ? record.check_out_time.toISOString()
          : undefined,
        notes: record.notes,
      };
    });

    return {
      message: sysMsg.STUDENT_MONTHLY_ATTENDANCE_RETRIEVED,
      month: this.monthNames[month],
      year,
      student_id: studentId,
      total_days_in_month: totalDaysInMonth,
      days_present: daysPresent,
      days_absent: daysAbsent,
      days_late: daysLate,
      days_excused: daysExcused,
      days_half_day: daysHalfDay,
      attendance_details: attendanceDetails,
    };
  }

  /**
   * Get a single student's term attendance summary
   * Shows aggregate attendance data for the entire term/date range
   */
  async getStudentTermAttendanceSummary(
    studentId: string,
    sessionId: string,
    termName: TermName,
  ): Promise<{
    message: string;
    total_school_days: number;
    days_present: number;
    days_absent: number;
  }> {
    // Get the term to find start and end dates
    const term = await this.termModelAction.get({
      identifierOptions: {
        sessionId: sessionId,
        name: termName,
      },
    });

    if (!term) {
      throw new NotFoundException(
        `Term ${termName} not found for session ${sessionId}`,
      );
    }

    const startDate = new Date(term.startDate);
    const endDate = new Date(term.endDate);

    // Get all daily attendance records for this student in the term
    const { payload: attendanceRecords } =
      await this.studentDailyAttendanceModelAction.list({
        filterRecordOptions: {
          student_id: studentId,
          session_id: sessionId,
        },
      });

    // Filter by term date range
    const filteredRecords = attendanceRecords.filter((record) => {
      const recordDate = new Date(record.date);
      return recordDate >= startDate && recordDate <= endDate;
    });

    // Calculate total school days by counting weekdays between term dates
    let totalSchoolDays = 0;
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay();
      // Count only weekdays (Monday=1 to Friday=5)
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        totalSchoolDays++;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Calculate days present and absent
    let daysPresent = 0;
    let daysAbsent = 0;

    filteredRecords.forEach((record) => {
      switch (record.status) {
        case DailyAttendanceStatus.PRESENT:
        case DailyAttendanceStatus.LATE: // Count late as present
          daysPresent++;
          break;
        case DailyAttendanceStatus.ABSENT:
          daysAbsent++;
          break;
        case DailyAttendanceStatus.EXCUSED:
        case DailyAttendanceStatus.HALF_DAY:
          // Don't count excused or half day in either category
          break;
      }
    });

    return {
      message: sysMsg.ATTENDANCE_RECORDS_RETRIEVED,
      total_school_days: totalSchoolDays,
      days_present: daysPresent,
      days_absent: daysAbsent,
    };
  }

  /**
   * Get daily attendance summary for an entire class
   * Shows each student's attendance across all periods for a specific date
   */
  /**
   * Get total daily attendance for a class on a specific date
   * Returns student daily attendance records (check-in/check-out based)
   */
  async getClassDailyAttendance(
    classId: string,
    date: string,
  ): Promise<{
    message: string;
    class_id: string;
    date: string;
    students: Array<{
      student_id: string;
      first_name: string;
      middle_name?: string;
      last_name: string;
      attendance_id?: string;
      status?: string;
      check_in_time?: string;
      check_out_time?: string;
      notes?: string;
    }>;
    summary: {
      total_students: number;
      present_count: number;
      absent_count: number;
      late_count: number;
      excused_count: number;
      half_day_count: number;
      not_marked_count: number;
    };
  }> {
    // Get all students enrolled in the class
    const enrolledStudents = await this.dataSource.manager.find(ClassStudent, {
      where: {
        class: { id: classId },
        is_active: true,
      },
      relations: ['student', 'student.user'],
    });

    if (enrolledStudents.length === 0) {
      throw new NotFoundException('No students enrolled in this class');
    }

    // Get all daily attendance records for this class on this date
    // Use date string directly for date-only comparison
    const attendanceRecords = await this.dataSource.manager
      .createQueryBuilder(StudentDailyAttendance, 'attendance')
      .where('attendance.class_id = :classId', { classId })
      .andWhere('attendance.date = :date', { date })
      .getMany();

    // Create a map of student attendance for quick lookup
    const attendanceMap = new Map(
      attendanceRecords.map((record) => [record.student_id, record]),
    );

    // Build student data with attendance information
    const students = enrolledStudents.map((enrollment) => {
      const attendance = attendanceMap.get(enrollment.student.id);

      return {
        student_id: enrollment.student.id,
        first_name: enrollment.student.user.first_name,
        middle_name: enrollment.student.user.middle_name,
        last_name: enrollment.student.user.last_name,
        attendance_id: attendance?.id,
        status: attendance?.status,
        check_in_time: attendance?.check_in_time
          ? attendance.check_in_time.toString()
          : undefined,
        check_out_time: attendance?.check_out_time
          ? attendance.check_out_time.toString()
          : undefined,
        notes: attendance?.notes,
      };
    });

    // Calculate summary statistics
    const presentCount = attendanceRecords.filter(
      (r) => r.status === DailyAttendanceStatus.PRESENT,
    ).length;
    const absentCount = attendanceRecords.filter(
      (r) => r.status === DailyAttendanceStatus.ABSENT,
    ).length;
    const lateCount = attendanceRecords.filter(
      (r) => r.status === DailyAttendanceStatus.LATE,
    ).length;
    const excusedCount = attendanceRecords.filter(
      (r) => r.status === DailyAttendanceStatus.EXCUSED,
    ).length;
    const halfDayCount = attendanceRecords.filter(
      (r) => r.status === DailyAttendanceStatus.HALF_DAY,
    ).length;
    const notMarkedCount = enrolledStudents.length - attendanceRecords.length;

    return {
      message: 'Class daily attendance retrieved successfully',
      class_id: classId,
      date,
      students,
      summary: {
        total_students: enrolledStudents.length,
        present_count: presentCount,
        absent_count: absentCount,
        late_count: lateCount,
        excused_count: excusedCount,
        half_day_count: halfDayCount,
        not_marked_count: notMarkedCount,
      },
    };
  }

  /**
   * Get term attendance summary for an entire class
   * Shows each student's total daily attendance across the term
   */
  async getClassTermAttendance(
    classId: string,
    sessionId: string,
    term: TermName,
  ): Promise<{
    message: string;
    class_id: string;
    session_id: string;
    term: string;
    start_date: string;
    end_date: string;
    students: Array<{
      student_id: string;
      first_name: string;
      middle_name?: string;
      last_name: string;
      total_school_days: number;
      days_present: number;
      days_absent: number;
      days_excused: number;
      attendance_details: Array<{
        date: string;
        status: string;
        was_late: boolean;
      }>;
    }>;
    summary: {
      total_students: number;
      total_school_days: number;
    };
  }> {
    // Get the term by session_id and term name
    const { payload: terms } = await this.termModelAction.list({
      filterRecordOptions: {
        sessionId: sessionId,
        name: term,
      },
    });

    if (!terms || terms.length === 0) {
      throw new NotFoundException(
        `Term '${term}' not found for the specified session`,
      );
    }

    const termData = terms[0];
    // startDate and endDate are already strings from the database
    const startDate =
      typeof termData.startDate === 'string'
        ? termData.startDate
        : termData.startDate.toISOString().split('T')[0];
    const endDate =
      typeof termData.endDate === 'string'
        ? termData.endDate
        : termData.endDate.toISOString().split('T')[0];

    // Get all students enrolled in the class
    const enrolledStudents = await this.dataSource.manager.find(ClassStudent, {
      where: {
        class: { id: classId },
        is_active: true,
      },
      relations: ['student', 'student.user'],
    });

    if (enrolledStudents.length === 0) {
      throw new NotFoundException('No students enrolled in this class');
    }

    // Get all daily attendance records for this class in the term
    const attendanceRecords = await this.dataSource.manager
      .createQueryBuilder(StudentDailyAttendance, 'attendance')
      .where('attendance.class_id = :classId', { classId })
      .andWhere('attendance.date >= :startDate', { startDate })
      .andWhere('attendance.date <= :endDate', { endDate })
      .getMany();

    // Get unique dates to calculate total school days
    // Handle both string and Date types for the date field
    const uniqueDates = [
      ...new Set(
        attendanceRecords.map((r) =>
          typeof r.date === 'string'
            ? r.date
            : r.date.toISOString().split('T')[0],
        ),
      ),
    ];
    const totalSchoolDays = uniqueDates.length;

    // Build student summaries
    const studentSummaries = enrolledStudents.map((enrollment) => {
      const studentRecords = attendanceRecords.filter(
        (r) => r.student_id === enrollment.student.id,
      );

      // PRESENT = student was on time
      const daysOnTime = studentRecords.filter(
        (r) => r.status === DailyAttendanceStatus.PRESENT,
      ).length;

      // LATE = student was present but came late (NOT absent)
      const daysPresentButLate = studentRecords.filter(
        (r) => r.status === DailyAttendanceStatus.LATE,
      ).length;

      // Total days present = on time + late (both mean student attended)
      const daysPresent = daysOnTime + daysPresentButLate;

      // ABSENT = student did not attend
      const daysAbsent = studentRecords.filter(
        (r) => r.status === DailyAttendanceStatus.ABSENT,
      ).length;

      // EXCUSED = student was absent but excused
      const daysExcused = studentRecords.filter(
        (r) => r.status === DailyAttendanceStatus.EXCUSED,
      ).length;

      // Build detailed attendance records array
      const attendanceDetails = studentRecords.map((record) => ({
        date:
          typeof record.date === 'string'
            ? record.date
            : record.date.toISOString().split('T')[0],
        status: record.status,
        was_late: record.status === DailyAttendanceStatus.LATE,
      }));

      return {
        student_id: enrollment.student.id,
        first_name: enrollment.student.user.first_name,
        middle_name: enrollment.student.user.middle_name,
        last_name: enrollment.student.user.last_name,
        total_school_days: totalSchoolDays,
        days_present: daysPresent,
        days_absent: daysAbsent,
        days_excused: daysExcused,
        attendance_details: attendanceDetails,
      };
    });

    return {
      message: 'Class term attendance retrieved successfully',
      class_id: classId,
      session_id: sessionId,
      term: term,
      start_date: startDate,
      end_date: endDate,
      students: studentSummaries,
      summary: {
        total_students: enrolledStudents.length,
        total_school_days: totalSchoolDays,
      },
    };
  }

  /**
   * Map Attendance entity to response DTO
   */
  private mapToResponseDto(
    attendance: ScheduleBasedAttendance,
  ): AttendanceResponseDto {
    return {
      id: attendance.id,
      schedule_id: attendance.schedule_id,
      student_id: attendance.student_id,
      session_id: attendance.session_id,
      date: attendance.date,
      status: attendance.status,
      marked_by: attendance.marked_by,
      marked_at: attendance.marked_at,
      notes: attendance.notes,
      created_at: attendance.createdAt,
      updated_at: attendance.updatedAt,
    };
  }

  //parents endpoints to view child attendance

  async getParentChildMonthlyAttendance(registrationNumber: string): Promise<{
    message: string;
    month: string;
    year: number;
    registration_number: string;
    student_id: string;
    total_days_in_month: number;
    days_present: number;
    days_absent: number;
    days_late: number;
    days_excused: number;
    days_half_day: number;
    attendance_details: Array<{
      date: string;
      status: string;
      check_in_time?: string;
      check_out_time?: string;
      notes?: string;
    }>;
  }> {
    if (!registrationNumber) {
      throw new BadRequestException(sysMsg.REGISTRATION_NUMBER_REQUIRED);
    }

    // 🔎 Find student by registration_number
    const student = await this.dataSource.manager.findOne(Student, {
      where: { registration_number: registrationNumber },
      relations: ['user', 'parent'],
    });

    if (!student) {
      throw new NotFoundException(sysMsg.CHILD_REGISTRATION_NUMBER_NOT_FOUNS);
    }

    // Get current month start and end dates
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    const startDate = new Date(year, month, 1);
    const startDateStr = startDate.toISOString().split('T')[0];

    const endDate = new Date(year, month + 1, 0);
    const endDateStr = endDate.toISOString().split('T')[0];

    // Get all daily attendance records for this student in the current month
    const { payload: attendanceRecords } =
      await this.studentDailyAttendanceModelAction.list({
        filterRecordOptions: {
          session_id: await this.academicSessionService
            .activeSessions()
            .then((s) => s.data.id),
          student_id: student.id, // 👈 use student.id after lookup
        },
      });

    // Filter by current month date range
    const filteredRecords = attendanceRecords.filter((record) => {
      const recordDateStr =
        typeof record.date === 'string'
          ? record.date
          : record.date.toISOString().split('T')[0];
      return recordDateStr >= startDateStr && recordDateStr <= endDateStr;
    });

    // Calculate total days in current month
    const totalDaysInMonth = endDate.getDate();

    // Calculate attendance statistics
    let daysPresent = 0;
    let daysAbsent = 0;
    let daysLate = 0;
    let daysExcused = 0;
    let daysHalfDay = 0;

    const attendanceDetails = filteredRecords.map((record) => {
      switch (record.status) {
        case DailyAttendanceStatus.PRESENT:
          daysPresent++;
          break;
        case DailyAttendanceStatus.ABSENT:
          daysAbsent++;
          break;
        case DailyAttendanceStatus.LATE:
          daysLate++;
          daysPresent++; // Late still counts as present
          break;
        case DailyAttendanceStatus.EXCUSED:
          daysExcused++;
          break;
        case DailyAttendanceStatus.HALF_DAY:
          daysHalfDay++;
          break;
      }

      return {
        date:
          typeof record.date === 'string'
            ? record.date
            : record.date.toISOString().split('T')[0],
        status: record.status,
        check_in_time: record.check_in_time
          ? record.check_in_time.toISOString()
          : undefined,
        check_out_time: record.check_out_time
          ? record.check_out_time.toISOString()
          : undefined,
        notes: record.notes,
      };
    });

    return {
      message: sysMsg.STUDENT_MONTHLY_ATTENDANCE_RETRIEVED,
      month: this.monthNames[month],
      year,
      registration_number: student.registration_number,
      student_id: student.id,
      total_days_in_month: totalDaysInMonth,
      days_present: daysPresent,
      days_absent: daysAbsent,
      days_late: daysLate,
      days_excused: daysExcused,
      days_half_day: daysHalfDay,
      attendance_details: attendanceDetails,
    };
  }

  /**
   * Create a new edit request for a locked attendance record
   */
  async createEditRequest(userId: string, dto: CreateEditRequestDto) {
    // Verify attendance record exists and is locked
    const modelAction =
      dto.attendance_type === AttendanceType.DAILY
        ? this.studentDailyAttendanceModelAction
        : this.attendanceModelAction;

    const attendance = await modelAction.get({
      identifierOptions: { id: dto.attendance_id },
    });

    if (!attendance) {
      throw new NotFoundException(
        `${sysMsg.ATTENDANCE_NOT_FOUND}. The record may have been deleted or does not exist.`,
      );
    }

    if (!attendance.is_locked) {
      throw new BadRequestException(
        'Attendance record is not locked. You can edit it directly.',
      );
    }

    // Verify teacher owns this attendance record
    if (attendance.marked_by !== userId) {
      throw new ForbiddenException(
        'You can only request edits for attendance records you created',
      );
    }

    // Check for existing pending request
    const { payload: existingRequests } =
      await this.editRequestModelAction.list({
        filterRecordOptions: {
          attendance_id: dto.attendance_id,
          attendance_type: dto.attendance_type,
          status: EditRequestStatus.PENDING,
        },
      });

    if (existingRequests.length > 0) {
      throw new BadRequestException(
        'A pending edit request already exists for this attendance record',
      );
    }

    const editRequest = await this.editRequestModelAction.create({
      createPayload: {
        ...dto,
        requested_by: userId,
        status: EditRequestStatus.PENDING,
      },
      transactionOptions: {
        useTransaction: false,
      },
    });

    this.logger.info(
      `Edit request created: request_id=${editRequest.id}, attendance_id=${dto.attendance_id}, type=${dto.attendance_type}, requested_by=${userId}`,
    );

    return {
      message: sysMsg.EDIT_REQUEST_CREATED_SUCCESSFULLY,
      data: {
        request_id: editRequest.id,
      },
    };
  }

  /**
   * Get all edit requests submitted by current user
   */
  async getMyEditRequests(userId: string) {
    const { payload: requests } = await this.editRequestModelAction.list({
      filterRecordOptions: { requested_by: userId },
      relations: { reviewedBy: true },
      order: { createdAt: 'DESC' },
    });

    return {
      message: sysMsg.EDIT_REQUESTS_RETRIEVED_SUCCESSFULLY,
      data: requests,
    };
  }

  /**
   * Review (approve/reject) an edit request
   * Admin only - automatically applies changes if approved
   */
  async reviewEditRequest(
    requestId: string,
    adminId: string,
    dto: ReviewEditRequestDto,
  ) {
    const request = await this.editRequestModelAction.get({
      identifierOptions: { id: requestId },
    });

    if (!request) {
      throw new NotFoundException('Edit request not found');
    }

    if (request.status !== EditRequestStatus.PENDING) {
      throw new BadRequestException(
        `Cannot review request with status: ${request.status}`,
      );
    }

    // Validate rejection requires comment
    if (dto.status === EditRequestStatus.REJECTED && !dto.admin_comment) {
      throw new BadRequestException(
        'Admin comment is required when rejecting a request',
      );
    }

    // If approved, apply changes to attendance
    if (dto.status === EditRequestStatus.APPROVED) {
      const modelAction =
        request.attendance_type === AttendanceType.DAILY
          ? this.studentDailyAttendanceModelAction
          : this.attendanceModelAction;

      const attendance = await modelAction.get({
        identifierOptions: { id: request.attendance_id },
      });

      if (!attendance) {
        throw new NotFoundException(sysMsg.ATTENDANCE_NOT_FOUND);
      }

      // Validate attendance hasn't been modified since request was created
      // This prevents applying stale changes if admin manually edited the record
      if (
        attendance.updatedAt &&
        request.createdAt &&
        new Date(attendance.updatedAt) > new Date(request.createdAt)
      ) {
        this.logger.warn(
          `Edit request ${requestId} is stale: attendance ${request.attendance_id} was modified after request creation`,
        );
        throw new BadRequestException(sysMsg.EDIT_REQUEST_STALE);
      }

      // Apply proposed changes with proper enum conversion
      const proposedChanges = { ...request.proposed_changes };

      // Convert status to uppercase if present
      if (
        proposedChanges.status &&
        typeof proposedChanges.status === 'string'
      ) {
        proposedChanges.status = proposedChanges.status.toUpperCase();
      }

      // Apply proposed changes using model action update
      await modelAction.update({
        identifierOptions: { id: request.attendance_id },
        updatePayload: proposedChanges,
        transactionOptions: {
          useTransaction: false,
        },
      });

      this.logger.info(
        `Attendance updated via approved edit request: attendance_id=${request.attendance_id}, type=${request.attendance_type}, changes=${JSON.stringify(proposedChanges)}`,
      );
    }

    // Update request status
    await this.editRequestModelAction.update({
      identifierOptions: { id: requestId },
      updatePayload: {
        status: dto.status,
        reviewed_by: adminId,
        reviewed_at: new Date(),
        admin_comment: dto.admin_comment,
      },
      transactionOptions: {
        useTransaction: false,
      },
    });

    this.logger.info(
      `Edit request ${dto.status.toLowerCase()}: request_id=${requestId}, reviewed_by=${adminId}, attendance_id=${request.attendance_id}, requested_by=${request.requested_by}`,
    );

    const message =
      dto.status === EditRequestStatus.APPROVED
        ? 'Edit request approved and changes applied successfully'
        : 'Edit request rejected successfully';

    return {
      message,
      data: {
        request_id: requestId,
        status: dto.status,
      },
    };
  }
}
