import { ResultNotificationService } from '../services/result.notification.service';

describe('ResultNotificationService email alerts', () => {
  it('queues a parent email after publishing the result', async () => {
    const createBulkNotifications = jest.fn();
    const enqueue = jest.fn();
    const get = jest.fn().mockResolvedValue({
      student: {
        user: { id: 'student-user-id', first_name: 'Ada' },
        parent: { user: { id: 'parent-user-id' } },
      },
      class: { name: 'JSS 1' },
      term: { name: 'First term' },
      academicSession: { name: '2026/2027' },
    });
    const service = new ResultNotificationService(
      {
        child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
      } as never,
      { createBulkNotifications } as never,
      { get } as never,
      {} as never,
      {} as never,
      { list: jest.fn().mockResolvedValue({ payload: [] }) } as never,
      {} as never,
      {} as never,
      { enqueue } as never,
    );

    await service.handleResultPublication({
      result_id: 'result-id',
      student_id: 'student-id',
      class_id: 'class-id',
      term_id: 'term-id',
      academic_session_id: 'session-id',
      is_published: true,
    });

    expect(createBulkNotifications).toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledWith('results', [
      expect.objectContaining({
        recipient_user_id: 'parent-user-id',
        dedupe_key: 'result:result-id:parent:parent-user-id',
      }),
    ]);
  });
});
