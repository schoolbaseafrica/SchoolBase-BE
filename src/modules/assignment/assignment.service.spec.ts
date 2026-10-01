import { AssignmentService } from './assignment.service';
import { AssignmentStatus } from './entities/assignment.entity';

describe('AssignmentService reminder processing', () => {
  it('sends overdue student and parent notifications only once', async () => {
    const assignment = {
      id: 'assignment-1',
      title: 'Fractions',
      status: AssignmentStatus.PUBLISHED,
      dueAt: new Date('2026-09-30T09:00:00Z'),
      classroom: { id: 'class-1' },
      subject: { name: 'Mathematics' },
    };
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([assignment]),
    };
    const assignments = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    const submissions = { find: jest.fn().mockResolvedValue([]) };
    const classStudents = {
      find: jest.fn().mockResolvedValue([
        {
          student: {
            id: 'student-1',
            registration_number: 'REG-1',
            user: { id: 'student-user', first_name: 'Ada' },
            parent: { user: { id: 'parent-user' } },
          },
        },
      ]),
    };
    let savedReminder: Record<string, unknown> | null = null;
    const reminders = {
      findOne: jest.fn().mockImplementation(() => savedReminder),
      create: jest.fn((value) => value),
      save: jest.fn().mockImplementation((value) => {
        savedReminder = value;
        return Promise.resolve(value);
      }),
    };
    const notifications = {
      create: jest.fn((value) => value),
      save: jest.fn((value) => Promise.resolve(value)),
    };
    const runner = {
      connect: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      query: jest
        .fn()
        .mockImplementation((query: string) =>
          Promise.resolve(
            query.includes('try_advisory') ? [{ acquired: true }] : [],
          ),
        ),
    };
    const dataSource = { createQueryRunner: jest.fn(() => runner) };
    const service = new AssignmentService(
      assignments as never,
      submissions as never,
      {} as never,
      {} as never,
      {} as never,
      classStudents as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      notifications as never,
      reminders as never,
      {} as never,
      dataSource as never,
    );

    const now = new Date('2026-09-30T10:00:00Z');
    await expect(service.processReminders(now)).resolves.toEqual({
      processed: 1,
    });
    await expect(service.processReminders(now)).resolves.toEqual({
      processed: 0,
    });

    expect(notifications.save).toHaveBeenCalledTimes(2);
    expect(runner.release).toHaveBeenCalledTimes(2);
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient_id: 'student-user',
        title: 'Assignment overdue',
      }),
    );
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient_id: 'parent-user',
        title: 'Child assignment overdue',
      }),
    );
  });
});
