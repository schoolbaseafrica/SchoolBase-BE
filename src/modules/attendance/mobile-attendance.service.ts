import { randomUUID } from 'crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as qrCode from 'qrcode';
import { DataSource, QueryFailedError } from 'typeorm';

import { AcademicSessionService } from '../academic-session/academic-session.service';
import { ClassStudent } from '../class/entities/class-student.entity';
import { ClassTeacher } from '../class/entities/class-teacher.entity';
import { Class } from '../class/entities/class.entity';
import { Student } from '../student/entities/student.entity';
import { Teacher } from '../teacher/entities/teacher.entity';

import { AttendanceMethodPolicyService } from './attendance-method-policy.service';
import { StudentDailyAttendance } from './entities/student-daily-attendance.entity';
import { DailyAttendanceStatus } from './enums/attendance-status.enum';

@Injectable()
export class MobileAttendanceService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly sessions: AcademicSessionService,
    private readonly policy: AttendanceMethodPolicyService,
  ) {}

  async assignStudentCard(studentId: string, rawCardId: string) {
    const cardId = rawCardId.trim();
    if (!cardId || cardId.length > 128 || /[\x00-\x1f\x7f]/.test(cardId)) {
      throw new BadRequestException('Invalid card ID');
    }
    try {
      return await this.dataSource.transaction(async (manager) => {
        const student = await manager.findOne(Student, {
          where: { id: studentId, is_deleted: false },
        });
        if (!student) throw new NotFoundException('Student not found');
        const owner = await manager.findOne(Student, {
          where: { nfc_card_id: cardId },
        });
        if (owner && owner.id !== studentId) {
          throw new ConflictException('Card is already assigned');
        }
        student.nfc_card_id = cardId;
        await manager.save(student);
        return { studentId, cardId };
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string })?.code === '23505'
      ) {
        throw new ConflictException('Card is already assigned');
      }
      throw error;
    }
  }

  async removeStudentCard(studentId: string) {
    const student = await this.dataSource.manager.findOne(Student, {
      where: { id: studentId, is_deleted: false },
    });
    if (!student) throw new NotFoundException('Student not found');
    student.nfc_card_id = null;
    await this.dataSource.manager.save(student);
    return { studentId, cardId: null };
  }

  async getStudentCard(studentId: string) {
    const student = await this.dataSource.manager.findOne(Student, {
      where: { id: studentId, is_deleted: false },
      select: ['id', 'nfc_card_id'],
    });
    if (!student) throw new NotFoundException('Student not found');
    return { studentId, cardId: student.nfc_card_id ?? null };
  }

  async getStudentCardQr(studentId: string) {
    const card = await this.getStudentCard(studentId);
    if (!card.cardId)
      throw new NotFoundException('Student has no assigned card');
    return {
      card_id: card.cardId,
      qr_code_data_url: await qrCode.toDataURL(card.cardId),
    };
  }

  async bulkAssignStudentCards(
    assignments: Array<{ student_identifier: string; nfc_card_id?: string }>,
  ) {
    const results: Array<{
      student_identifier: string;
      success: boolean;
      nfc_card_id?: string;
      error?: string;
    }> = [];
    for (const assignment of assignments) {
      const identifier = assignment.student_identifier.trim();
      const student = await this.dataSource.manager.findOne(Student, {
        where: identifier.match(/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i)
          ? { id: identifier, is_deleted: false }
          : { registration_number: identifier, is_deleted: false },
      });
      if (!student) {
        results.push({
          student_identifier: identifier,
          success: false,
          error: 'Student not found',
        });
        continue;
      }
      const suppliedCardId = assignment.nfc_card_id?.trim();
      const cardId =
        suppliedCardId && suppliedCardId.toUpperCase() !== 'GENERATE'
          ? suppliedCardId
          : `NFC-${randomUUID()}`;
      try {
        await this.assignStudentCard(student.id, cardId);
        results.push({
          student_identifier: identifier,
          success: true,
          nfc_card_id: cardId,
        });
      } catch (error) {
        results.push({
          student_identifier: identifier,
          success: false,
          error:
            error instanceof Error ? error.message : 'Card assignment failed',
        });
      }
    }
    const successful = results.filter((item) => item.success).length;
    return {
      total: results.length,
      successful,
      failed: results.length - successful,
      results,
    };
  }

  async exportStudentCardsCsv() {
    const students = await this.dataSource.manager.find(Student, {
      where: { is_deleted: false },
      relations: ['user'],
      order: { registration_number: 'ASC' },
    });
    const escape = (value: string | null | undefined) => {
      const safe = /^[=+@-]/.test(value ?? '') ? `'${value}` : (value ?? '');
      return `"${safe.replace(/"/g, '""')}"`;
    };
    return [
      'Registration Number,Student Name,NFC Card ID',
      ...students.map((student) =>
        [
          student.registration_number,
          `${student.user?.first_name ?? ''} ${student.user?.last_name ?? ''}`.trim(),
          student.nfc_card_id,
        ]
          .map(escape)
          .join(','),
      ),
    ].join('\r\n');
  }

  async teacherClasses(userId: string) {
    const session = (await this.sessions.activeSessions()).data;
    const teacher = await this.dataSource.manager.findOne(Teacher, {
      where: { user_id: userId, is_active: true },
    });
    if (!teacher) throw new ForbiddenException('Active teacher required');
    const assignments = await this.dataSource.manager.find(ClassTeacher, {
      where: {
        teacher: { id: teacher.id },
        session_id: session.id,
        is_active: true,
      },
      relations: ['class'],
    });
    return assignments
      .filter((assignment) => assignment.class && !assignment.class.is_deleted)
      .map((assignment) => ({
        id: assignment.class.id,
        name: assignment.class.name,
        arm: assignment.class.arm,
      }));
  }

  async recordNfcTap(
    userId: string,
    classId: string,
    rawCardId: string,
    clientEventId: string,
  ) {
    await this.policy.require('NFC');
    const cardId = rawCardId.trim();
    if (!cardId || cardId.length > 128 || /[\x00-\x1f\x7f]/.test(cardId)) {
      throw new BadRequestException('Invalid card ID');
    }
    const session = (await this.sessions.activeSessions()).data;
    const now = new Date();
    const dayParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Lagos',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const part = (type: string) =>
      dayParts.find((item) => item.type === type)?.value;
    const dateText = `${part('year')}-${part('month')}-${part('day')}`;
    const attendanceDate = new Date(`${dateText}T00:00:00.000Z`);

    return this.dataSource.transaction(async (manager) => {
      const teacher = await manager.findOne(Teacher, {
        where: { user_id: userId, is_active: true },
      });
      if (!teacher) throw new ForbiddenException('Active teacher required');
      const selectedClass = await manager.findOne(Class, {
        where: {
          id: classId,
          academicSession: { id: session.id },
          is_deleted: false,
        },
      });
      if (!selectedClass)
        throw new NotFoundException('Class not in active session');
      const assignment = await manager.findOne(ClassTeacher, {
        where: {
          teacher: { id: teacher.id },
          class: { id: classId },
          session_id: session.id,
          is_active: true,
        },
      });
      if (!assignment)
        throw new ForbiddenException('Teacher is not assigned to this class');

      // Serialise retries and competing taps before reading the attendance row.
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `mobile-tap:${clientEventId}`,
      ]);
      const previous = await manager.query(
        'SELECT teacher_user_id, student_id, class_id, attendance_date, result FROM attendance_mobile_taps WHERE client_event_id = $1',
        [clientEventId],
      );
      if (previous.length) {
        if (
          previous[0].teacher_user_id !== userId ||
          previous[0].class_id !== classId
        ) {
          throw new ConflictException('Event ID was already used');
        }
        const sameStudent = await manager.findOne(Student, {
          where: { id: previous[0].student_id, nfc_card_id: cardId },
          relations: ['user'],
        });
        if (!sameStudent)
          throw new ConflictException('Event ID was already used');
        return this.tapResult(
          sameStudent,
          previous[0].result,
          String(previous[0].attendance_date),
        );
      }
      const student = await manager.findOne(Student, {
        where: { nfc_card_id: cardId, is_deleted: false },
        relations: ['user'],
      });
      if (!student)
        throw new NotFoundException('Card not assigned to a student');
      const enrollment = await manager.findOne(ClassStudent, {
        where: {
          student: { id: student.id },
          class: { id: classId },
          session_id: session.id,
          is_active: true,
        },
      });
      if (!enrollment)
        throw new ForbiddenException('Student is not enrolled in this class');

      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `attendance:${student.id}:${classId}:${dateText}`,
      ]);
      const existing = await manager.findOne(StudentDailyAttendance, {
        where: {
          student_id: student.id,
          class_id: classId,
          date: attendanceDate,
        },
      });
      let result = 'recorded';
      if (existing) {
        if (
          existing.status === DailyAttendanceStatus.PRESENT ||
          existing.status === DailyAttendanceStatus.LATE
        ) {
          result = 'already_recorded';
        } else if (existing.is_locked) {
          throw new ConflictException(
            'Attendance is locked; request a correction',
          );
        } else {
          existing.status = DailyAttendanceStatus.PRESENT;
          existing.check_in_time = now;
          existing.marked_at = now;
          existing.marked_by = userId;
          existing.is_locked = true;
          await manager.save(existing);
        }
      } else {
        await manager.save(
          manager.create(StudentDailyAttendance, {
            student_id: student.id,
            class_id: classId,
            session_id: session.id,
            date: attendanceDate,
            status: DailyAttendanceStatus.PRESENT,
            check_in_time: now,
            marked_by: userId,
            marked_at: now,
            is_locked: true,
          }),
        );
      }
      await manager.query(
        `INSERT INTO attendance_mobile_taps
          (client_event_id, teacher_user_id, student_id, class_id, session_id,
           attendance_date, captured_at, result)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          clientEventId,
          userId,
          student.id,
          classId,
          session.id,
          dateText,
          now,
          result,
        ],
      );
      return this.tapResult(student, result, dateText);
    });
  }

  private tapResult(student: Student, result: string, date: string) {
    return {
      result,
      date,
      student: {
        id: student.id,
        name: `${student.user?.first_name ?? ''} ${student.user?.last_name ?? ''}`.trim(),
        photoUrl: student.photo_url,
      },
    };
  }
}
