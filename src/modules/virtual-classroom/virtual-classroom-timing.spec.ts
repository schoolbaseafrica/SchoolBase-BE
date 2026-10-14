import { BadRequestException } from '@nestjs/common';

import { VirtualClassroomSession } from './entities/virtual-classroom.entity';
import { VirtualClassroomService } from './virtual-classroom.service';

describe('virtual classroom timetable timing', () => {
  const room = {
    id: 'room-1',
    scheduleId: 'schedule-1',
    status: 'scheduled',
    startsAt: new Date('2026-10-12T07:00:00Z'),
    endsAt: new Date('2026-10-15T10:00:00Z'),
  } as VirtualClassroomSession;

  afterEach(() => jest.useRealTimers());

  it('rejects starting a room outside its scheduled lesson', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-13T08:30:00Z'));
    const service = Object.create(
      VirtualClassroomService.prototype,
    ) as VirtualClassroomService;
    Reflect.set(service, 'authorize', jest.fn().mockResolvedValue({ ...room }));
    Reflect.set(service, 'dataSource', {
      query: jest
        .fn()
        .mockResolvedValue([
          { day: 'MONDAY', startTime: '09:00:00', endTime: '10:00:00' },
        ]),
    });
    Reflect.set(service, 'sessions', { save: jest.fn() });

    await expect(
      service.updateStatus(room.id, 'live', 'teacher-1', ['teacher']),
    ).rejects.toThrow(BadRequestException);
  });

  it('does not expose a stored live status outside the lesson slot', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-13T08:30:00Z'));
    const service = Object.create(
      VirtualClassroomService.prototype,
    ) as VirtualClassroomService;
    Reflect.set(service, 'sessions', {
      createQueryBuilder: () => ({
        orderBy: () => ({ getMany: async () => [{ ...room, status: 'live' }] }),
      }),
    });
    Reflect.set(service, 'dataSource', {
      query: jest.fn().mockResolvedValue([
        {
          id: room.scheduleId,
          day: 'MONDAY',
          startTime: '09:00:00',
          endTime: '10:00:00',
        },
      ]),
    });

    const listed = await service.list('student-1', [], undefined, undefined);
    expect(listed[0].status).toBe('scheduled');
  });

  it('rejects a student joining an out-of-slot room by direct link', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-13T08:30:00Z'));
    const service = Object.create(
      VirtualClassroomService.prototype,
    ) as VirtualClassroomService;
    Reflect.set(
      service,
      'authorize',
      jest.fn().mockResolvedValue({ ...room, status: 'live' }),
    );
    Reflect.set(service, 'dataSource', {
      query: jest
        .fn()
        .mockResolvedValue([
          { day: 'MONDAY', startTime: '09:00:00', endTime: '10:00:00' },
        ]),
    });
    await expect(
      service.join(room.id, 'student-1', ['student']),
    ).rejects.toThrow(BadRequestException);
  });
});
