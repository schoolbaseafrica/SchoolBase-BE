import { BadRequestException } from '@nestjs/common';

import { ClassroomCollaborationService } from './classroom-collaboration.service';
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
    const queryBuilder = {
      orderBy: jest.fn(),
      andWhere: jest.fn(),
      getMany: jest.fn().mockResolvedValue([{ ...room, status: 'live' }]),
    };
    queryBuilder.orderBy.mockReturnValue(queryBuilder);
    queryBuilder.andWhere.mockReturnValue(queryBuilder);
    Reflect.set(service, 'sessions', {
      createQueryBuilder: () => queryBuilder,
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

    const listed = await service.list(
      'student-1',
      ['student'],
      undefined,
      undefined,
    );
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

  it('lets the assigned teacher prepare a scheduled whiteboard but keeps students out', async () => {
    const service = Object.create(
      VirtualClassroomService.prototype,
    ) as VirtualClassroomService;
    Reflect.set(service, 'authorize', jest.fn().mockResolvedValue({ ...room }));
    const update = jest.fn().mockReturnValue({
      set: () => ({
        where: () => ({
          andWhere: () => ({ execute: async () => ({ affected: 1 }) }),
        }),
      }),
    });
    Reflect.set(service, 'sessions', {
      createQueryBuilder: () => ({ update }),
    });

    await expect(
      service.updateWhiteboard(
        room.id,
        { version: 0, snapshot: { title: 'Prepared lesson' } },
        'teacher-1',
        ['teacher'],
      ),
    ).resolves.toEqual({
      version: 1,
      snapshot: { title: 'Prepared lesson' },
    });
    await expect(
      service.get(room.id, 'student-1', ['student']),
    ).rejects.toThrow('This classroom has not opened to students');

    const collaboration = Object.create(
      ClassroomCollaborationService.prototype,
    ) as ClassroomCollaborationService;
    Reflect.set(collaboration, 'classrooms', {
      get: jest.fn().mockResolvedValue({ ...room, allowStudentDraw: false }),
    });
    Reflect.set(collaboration, 'dataSource', {
      query: jest.fn().mockResolvedValue([{ name: 'Teacher' }]),
    });
    Reflect.set(collaboration, 'jwt', {
      signAsync: jest.fn().mockResolvedValue('ticket'),
    });
    await expect(
      collaboration.createTicket(room.id, 'teacher-1', ['teacher']),
    ).resolves.toMatchObject({ ticket: 'ticket', canWrite: true });
    await expect(
      collaboration.createTicket(room.id, 'student-1', ['student']),
    ).rejects.toThrow(BadRequestException);
    await expect(
      collaboration.canWrite(room.id, 'student-1', ['student']),
    ).resolves.toBe(false);

    const liveKitConfig = new Map([
      ['livekit.url', 'wss://classroom.example.test'],
      ['livekit.apiKey', 'test-key'],
      ['livekit.apiSecret', 'test-secret-for-signed-tokens'],
    ]);
    Reflect.set(service, 'config', {
      get: (key: string) => liveKitConfig.get(key),
    });
    Reflect.set(service, 'dataSource', {
      query: jest.fn().mockResolvedValue([{ name: 'Teacher' }]),
    });
    await expect(
      service.createMediaToken(room.id, 'teacher-1', ['teacher']),
    ).resolves.toMatchObject({ canPublish: true });
    await expect(
      service.createMediaToken(room.id, 'student-1', ['student']),
    ).rejects.toThrow(BadRequestException);
  });
});
