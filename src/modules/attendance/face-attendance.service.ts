import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as sharp from 'sharp';
import { DataSource, EntityManager } from 'typeorm';

import { IMulterFile } from '../../common/types/multer.types';
import { AcademicSessionService } from '../academic-session/academic-session.service';
import { ClassStudent } from '../class/entities/class-student.entity';
import { ClassTeacher } from '../class/entities/class-teacher.entity';
import { Class } from '../class/entities/class.entity';
import { Student } from '../student/entities/student.entity';
import { Teacher } from '../teacher/entities/teacher.entity';
import { MinioService } from '../upload/services/minio.service';

import { AttendanceMethodPolicyService } from './attendance-method-policy.service';
import { StudentDailyAttendance } from './entities/student-daily-attendance.entity';
import { DailyAttendanceStatus } from './enums/attendance-status.enum';
import { FaceVerificationService } from './face-verification.service';

@Injectable()
export class FaceAttendanceService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly sessions: AcademicSessionService,
    private readonly policy: AttendanceMethodPolicyService,
    private readonly verification: FaceVerificationService,
    private readonly minio: MinioService,
  ) {}

  private async assignedClass(
    manager: EntityManager,
    userId: string,
    classId: string,
    sessionId: string,
  ) {
    const teacher = await manager.findOne(Teacher, {
      where: { user_id: userId, is_active: true },
    });
    if (!teacher) throw new ForbiddenException('Active teacher required');
    const selectedClass = await manager.findOne(Class, {
      where: {
        id: classId,
        academicSession: { id: sessionId },
        is_deleted: false,
      },
    });
    if (!selectedClass)
      throw new NotFoundException('Class not in active session');
    const assignment = await manager.findOne(ClassTeacher, {
      where: {
        teacher: { id: teacher.id },
        class: { id: classId },
        session_id: sessionId,
        is_active: true,
      },
    });
    if (!assignment)
      throw new ForbiddenException('Teacher is not assigned to this class');
  }

  private async enrolledStudent(
    manager: EntityManager,
    studentId: string,
    classId: string,
    sessionId: string,
  ) {
    const student = await manager.findOne(Student, {
      where: { id: studentId, is_deleted: false },
      relations: ['user'],
    });
    if (!student) throw new NotFoundException('Student not found');
    const enrollment = await manager.findOne(ClassStudent, {
      where: {
        student: { id: studentId },
        class: { id: classId },
        session_id: sessionId,
        is_active: true,
      },
    });
    if (!enrollment)
      throw new ForbiddenException('Student is not enrolled in this class');
    return student;
  }

  private approvedPhoto(student: Student): string {
    const key = student.face_photo_object_key;
    if (
      !key ||
      !student.face_photo_approved_at ||
      !key.startsWith(`schoolbase-users/${student.id}/`)
    ) {
      throw new BadRequestException('Student needs an approved face photo');
    }
    return key;
  }

  async classStudents(userId: string, classId: string) {
    const session = (await this.sessions.activeSessions()).data;
    const manager = this.dataSource.manager;
    await this.assignedClass(manager, userId, classId, session.id);
    const enrollments = await manager.find(ClassStudent, {
      where: {
        class: { id: classId },
        session_id: session.id,
        is_active: true,
      },
      relations: ['student', 'student.user'],
    });
    return enrollments
      .filter((row) => row.student && !row.student.is_deleted)
      .map((row) => ({
        id: row.student.id,
        name: `${row.student.user?.first_name ?? ''} ${row.student.user?.last_name ?? ''}`.trim(),
        registrationNumber: row.student.registration_number,
        photoUrl: row.student.photo_url,
        faceReady: Boolean(
          row.student.face_photo_approved_at &&
          row.student.face_photo_object_key,
        ),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async faceReference(studentId: string) {
    const student = await this.dataSource.manager.findOne(Student, {
      where: { id: studentId, is_deleted: false },
    });
    if (!student) throw new NotFoundException('Student not found');
    return {
      studentId,
      photoUrl: student.photo_url ?? null,
      canApprove: Boolean(student.face_photo_object_key),
      approvedAt: student.face_photo_approved_at ?? null,
    };
  }

  async approveFaceReference(studentId: string, adminUserId: string) {
    return this.dataSource.transaction(async (manager) => {
      const student = await manager.findOne(Student, {
        where: { id: studentId, is_deleted: false },
        lock: { mode: 'pessimistic_write' },
      });
      if (!student) throw new NotFoundException('Student not found');
      if (!student.face_photo_object_key)
        throw new BadRequestException('Student must capture a new photo first');
      student.face_photo_approved_at = new Date();
      student.face_photo_approved_by = adminUserId;
      await manager.save(student);
      return { studentId, approvedAt: student.face_photo_approved_at };
    });
  }

  async revokeFaceReference(studentId: string) {
    return this.dataSource.transaction(async (manager) => {
      const student = await manager.findOne(Student, {
        where: { id: studentId, is_deleted: false },
        lock: { mode: 'pessimistic_write' },
      });
      if (!student) throw new NotFoundException('Student not found');
      student.face_photo_approved_at = null;
      student.face_photo_approved_by = null;
      await manager.save(student);
      return { studentId, approvedAt: null };
    });
  }

  async recordFace(
    userId: string,
    classId: string,
    studentId: string,
    clientEventId: string,
    file: IMulterFile,
  ) {
    await this.policy.require('FACE');
    if (!this.verification.available)
      throw new ServiceUnavailableException(
        'Face verification is not configured',
      );
    if (!file?.buffer) throw new BadRequestException('Take a camera photo');
    let captured: Buffer;
    try {
      captured = await sharp(file.buffer, { failOn: 'error' })
        .rotate()
        .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      const metadata = await sharp(captured).metadata();
      if ((metadata.width ?? 0) < 480 || (metadata.height ?? 0) < 480)
        throw new BadRequestException(
          'Camera photo must be at least 480 by 480 pixels',
        );
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Take a clear JPEG, PNG, or WebP photo');
    }

    const session = (await this.sessions.activeSessions()).data;
    await this.assignedClass(
      this.dataSource.manager,
      userId,
      classId,
      session.id,
    );
    const student = await this.enrolledStudent(
      this.dataSource.manager,
      studentId,
      classId,
      session.id,
    );
    const referenceKey = this.approvedPhoto(student);
    let reference: Buffer;
    try {
      reference = await this.minio.downloadFile(referenceKey);
    } catch {
      throw new ServiceUnavailableException(
        'Enrolled student photo is unavailable',
      );
    }
    if (reference.length > 5 * 1024 * 1024)
      throw new BadRequestException('Enrolled photo is too large');
    const similarity = await this.verification.verify(captured, reference);
    if (similarity < this.verification.threshold)
      throw new ForbiddenException(
        'Face did not match the approved student photo',
      );

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
      await this.assignedClass(manager, userId, classId, session.id);
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `mobile-tap:${clientEventId}`,
      ]);
      const previous = await manager.query(
        'SELECT teacher_user_id, student_id, class_id, attendance_date, result, method FROM attendance_mobile_taps WHERE client_event_id = $1',
        [clientEventId],
      );
      if (previous.length) {
        if (
          previous[0].teacher_user_id !== userId ||
          previous[0].class_id !== classId ||
          previous[0].student_id !== studentId ||
          previous[0].method !== 'FACE'
        )
          throw new ConflictException('Event ID was already used');
        return this.result(
          student,
          previous[0].result,
          String(previous[0].attendance_date),
        );
      }
      const current = await this.enrolledStudent(
        manager,
        studentId,
        classId,
        session.id,
      );
      if (this.approvedPhoto(current) !== referenceKey)
        throw new ConflictException('Student face photo changed; scan again');
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `attendance:${studentId}:${classId}:${dateText}`,
      ]);
      const existing = await manager.findOne(StudentDailyAttendance, {
        where: {
          student_id: studentId,
          class_id: classId,
          date: attendanceDate,
        },
      });
      let result = 'recorded';
      if (existing) {
        if (
          existing.status === DailyAttendanceStatus.PRESENT ||
          existing.status === DailyAttendanceStatus.LATE
        )
          result = 'already_recorded';
        else if (existing.is_locked)
          throw new ConflictException(
            'Attendance is locked; request a correction',
          );
        else {
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
            student_id: studentId,
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
           attendance_date, captured_at, result, method, face_similarity)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'FACE', $9)`,
        [
          clientEventId,
          userId,
          studentId,
          classId,
          session.id,
          dateText,
          now,
          result,
          similarity,
        ],
      );
      return this.result(current, result, dateText);
    });
  }

  private result(student: Student, result: string, date: string) {
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
