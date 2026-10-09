import { BadRequestException, ForbiddenException } from '@nestjs/common';
import * as sharp from 'sharp';

import { ClassStudent } from '../class/entities/class-student.entity';
import { ClassTeacher } from '../class/entities/class-teacher.entity';
import { Class } from '../class/entities/class.entity';
import { Student } from '../student/entities/student.entity';
import { Teacher } from '../teacher/entities/teacher.entity';

import { StudentDailyAttendance } from './entities/student-daily-attendance.entity';
import { FaceAttendanceService } from './face-attendance.service';

describe('FaceAttendanceService', () => {
  const userId = '109ba35b-efbd-4926-a574-3a4bac4e8486';
  const classId = '0a6044f0-8210-4b62-8f37-835e92780547';
  const studentId = 'bb871b47-bf71-4c5c-9063-68608e0ff4df';
  const eventId = 'a72a005e-48a0-45ac-95dd-bec86759616d';

  function setup(approved = true, score = 0.92, assigned = true) {
    const student = {
      id: studentId,
      photo_url: 'https://images.example/student.jpg',
      face_photo_object_key: `schoolbase-users/${studentId}/photo.jpg`,
      face_photo_approved_at: approved ? new Date() : null,
      face_photo_approved_by: null as string | null,
      user: { first_name: 'Ada', last_name: 'Okoro' },
    };
    const manager = {
      findOne: jest.fn(async (entity: unknown) => {
        if (entity === Teacher) return { id: 'teacher-1' };
        if (entity === Class) return { id: classId };
        if (entity === ClassTeacher)
          return assigned ? { id: 'assignment-1' } : null;
        if (entity === Student) return student;
        if (entity === ClassStudent) return { id: 'enrollment-1' };
        if (entity === StudentDailyAttendance) return null;
        return null;
      }),
      query: jest.fn(async () => []),
      create: jest.fn((_entity: unknown, value: unknown) => value),
      save: jest.fn(async (value: unknown) => value),
    };
    const source = {
      manager,
      transaction: jest.fn(async (work: (value: typeof manager) => unknown) =>
        work(manager),
      ),
    };
    const sessions = {
      activeSessions: jest.fn(async () => ({ data: { id: 'session-1' } })),
    };
    const policy = { require: jest.fn(async () => undefined) };
    const verification = {
      available: true,
      threshold: 0.8,
      verify: jest.fn(async () => score),
    };
    const minio = {
      downloadFile: jest.fn(async () => Buffer.from('reference')),
    };
    const service = new FaceAttendanceService(
      source as never,
      sessions as never,
      policy as never,
      verification as never,
      minio as never,
    );
    return { service, manager, verification, minio, student };
  }

  let photo: Buffer;
  beforeAll(async () => {
    photo = await sharp({
      create: { width: 500, height: 500, channels: 3, background: 'white' },
    })
      .jpeg()
      .toBuffer();
  });

  it('requires an admin-approved student photo', async () => {
    const { service, verification } = setup(false);
    await expect(
      service.recordFace(userId, classId, studentId, eventId, {
        buffer: photo,
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(verification.verify).not.toHaveBeenCalled();
  });

  it('records admin approval for the captured reference photo', async () => {
    const { service, student, manager } = setup(false);
    await expect(
      service.approveFaceReference(studentId, 'admin-1'),
    ).resolves.toMatchObject({ studentId, approvedAt: expect.any(Date) });
    expect(student.face_photo_approved_by).toBe('admin-1');
    expect(manager.save).toHaveBeenCalledWith(student);
  });

  it('rejects a nonmatching face without marking attendance', async () => {
    const { service, manager } = setup(true, 0.3);
    await expect(
      service.recordFace(userId, classId, studentId, eventId, {
        buffer: photo,
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('records a matching face for an assigned teacher and enrolled student', async () => {
    const { service, manager, minio } = setup();
    await expect(
      service.recordFace(userId, classId, studentId, eventId, {
        buffer: photo,
      } as never),
    ).resolves.toMatchObject({
      result: 'recorded',
      student: { id: studentId, name: 'Ada Okoro' },
    });
    expect(minio.downloadFile).toHaveBeenCalledWith(
      `schoolbase-users/${studentId}/photo.jpg`,
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('face_similarity'),
      expect.arrayContaining([eventId, userId, studentId, classId, 0.92]),
    );
  });

  it('rejects a teacher outside the selected class', async () => {
    const { service, minio } = setup(true, 0.92, false);
    await expect(
      service.recordFace(userId, classId, studentId, eventId, {
        buffer: photo,
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(minio.downloadFile).not.toHaveBeenCalled();
  });
});
