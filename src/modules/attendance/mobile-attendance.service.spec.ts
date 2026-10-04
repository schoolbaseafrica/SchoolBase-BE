import { ForbiddenException } from '@nestjs/common';

import { ClassStudent } from '../class/entities/class-student.entity';
import { ClassTeacher } from '../class/entities/class-teacher.entity';
import { Class } from '../class/entities/class.entity';
import { Student } from '../student/entities/student.entity';
import { Teacher } from '../teacher/entities/teacher.entity';

import { StudentDailyAttendance } from './entities/student-daily-attendance.entity';
import { DailyAttendanceStatus } from './enums/attendance-status.enum';
import { MobileAttendanceService } from './mobile-attendance.service';

describe('MobileAttendanceService', () => {
  const userId = '109ba35b-efbd-4926-a574-3a4bac4e8486';
  const classId = '0a6044f0-8210-4b62-8f37-835e92780547';
  const eventId = 'a72a005e-48a0-45ac-95dd-bec86759616d';

  function setup(
    enrolled = true,
    existing?: { status: DailyAttendanceStatus },
    previous: Record<string, string>[] = [],
  ) {
    const manager = {
      findOne: jest.fn(async (entity: unknown) => {
        if (entity === Teacher) return { id: 'teacher-1' };
        if (entity === Class) return { id: classId };
        if (entity === ClassTeacher) return { id: 'assignment-1' };
        if (entity === Student)
          return {
            id: 'student-1',
            nfc_card_id: 'AB:CD:EF',
            user: { first_name: 'Ada', last_name: 'Okoro' },
          };
        if (entity === ClassStudent)
          return enrolled ? { id: 'enrollment-1' } : null;
        if (entity === StudentDailyAttendance) return existing ?? null;
        return null;
      }),
      query: jest.fn(async (sql: string) =>
        sql.startsWith('SELECT teacher_user_id') ? previous : [],
      ),
      create: jest.fn((_entity: unknown, value: unknown) => value),
      save: jest.fn(async (value: unknown) => value),
    };
    const source = {
      transaction: jest.fn(
        async (
          callback: (value: Record<string, unknown>) => Promise<unknown>,
        ) => callback(manager),
      ),
    };
    const sessions = {
      activeSessions: jest.fn(async () => ({ data: { id: 'session-1' } })),
    };
    const policy = { require: jest.fn(async () => undefined) };
    const service = new MobileAttendanceService(
      source as never,
      sessions as never,
      policy as never,
    );
    return { service, manager, policy };
  }

  it('rejects a card holder outside the selected active class before writing attendance', async () => {
    const { service, manager } = setup(false);
    await expect(
      service.recordNfcTap(userId, classId, 'AB:CD:EF', eventId),
    ).rejects.toThrow(ForbiddenException);
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO attendance_mobile_taps'),
      expect.anything(),
    );
  });

  it('treats a second tap as already recorded without changing the first mark', async () => {
    const existing = { status: DailyAttendanceStatus.PRESENT };
    const { service, manager } = setup(true, existing);
    const response = await service.recordNfcTap(
      userId,
      classId,
      'AB:CD:EF',
      eventId,
    );
    expect(response.result).toBe('already_recorded');
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO attendance_mobile_taps'),
      expect.arrayContaining([eventId, userId, 'student-1', classId]),
    );
  });

  it('replays the same client event without writing attendance again', async () => {
    const { service, manager } = setup(true, undefined, [
      {
        teacher_user_id: userId,
        student_id: 'student-1',
        class_id: classId,
        attendance_date: '2026-10-04',
        result: 'recorded',
      },
    ]);
    const response = await service.recordNfcTap(
      userId,
      classId,
      'AB:CD:EF',
      eventId,
    );
    expect(response.result).toBe('recorded');
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO attendance_mobile_taps'),
      expect.anything(),
    );
  });

  it('does not record a tap when the school disables NFC', async () => {
    const { service, manager, policy } = setup();
    policy.require.mockRejectedValueOnce(
      new ForbiddenException('NFC disabled'),
    );
    await expect(
      service.recordNfcTap(userId, classId, 'AB:CD:EF', eventId),
    ).rejects.toThrow(ForbiddenException);
    expect(manager.save).not.toHaveBeenCalled();
  });
});
