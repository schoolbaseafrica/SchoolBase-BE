import { writeActivityLog } from './write-activity-log';

describe('writeActivityLog', () => {
  it('writes the audit row through the supplied transaction manager', async () => {
    const manager = { query: jest.fn().mockResolvedValue([]) };
    await writeActivityLog(manager, {
      actorUserId: 'actor-id',
      entityType: 'STUDENT',
      entityId: 'student-id',
      action: 'CREATE',
      description: 'Student record created',
      newValues: { registration_number: 'STU-2026-0001' },
    });
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "activity_logs"'),
      [
        'actor-id',
        'STUDENT',
        'student-id',
        'CREATE',
        'Student record created',
        null,
        JSON.stringify({ registration_number: 'STU-2026-0001' }),
        null,
      ],
    );
  });

  it('propagates audit failure so the surrounding transaction can roll back', async () => {
    const manager = {
      query: jest.fn().mockRejectedValue(new Error('database unavailable')),
    };
    await expect(
      writeActivityLog(manager, {
        actorUserId: 'actor-id',
        entityType: 'FEE',
        entityId: 'fee-id',
        action: 'CREATE',
        description: 'Fee created',
      }),
    ).rejects.toThrow('database unavailable');
  });
});
