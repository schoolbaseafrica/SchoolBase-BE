import { DataSource } from 'typeorm';

import { EmailService } from '../../email/email.service';
import { SchoolEmailAlertService } from '../services/school-email-alert.service';

describe('SchoolEmailAlertService', () => {
  const query = jest.fn();
  const managerQuery = jest.fn();
  const sendMail = jest.fn();
  const dataSource = {
    query,
    transaction: jest.fn((callback) => callback({ query: managerQuery })),
  } as unknown as DataSource;
  const service = new SchoolEmailAlertService(dataSource, {
    sendMail,
  } as unknown as EmailService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not queue an optional email when its school switch is off', async () => {
    query.mockResolvedValueOnce([{ email_alert_results: false }]);
    await service.enqueue('results', [
      { recipient_user_id: 'parent-id', subject: 'Result', message: 'Ready' },
    ]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('queues enabled emails with a deduplication key', async () => {
    query
      .mockResolvedValueOnce([{ email_alert_results: true }])
      .mockResolvedValueOnce([]);
    await service.enqueue('results', [
      {
        recipient_user_id: 'parent-id',
        subject: 'Result',
        message: 'Ready',
        dedupe_key: 'result:1:parent:1',
      },
    ]);
    expect(query.mock.calls[1][0]).toContain(
      'ON CONFLICT ("dedupe_key") DO NOTHING',
    );
    expect(JSON.parse(query.mock.calls[1][1][1])).toEqual([
      expect.objectContaining({ dedupe_key: 'result:1:parent:1' }),
    ]);
  });

  it('discards queued alerts if their school switch was turned off before delivery', async () => {
    managerQuery
      .mockResolvedValueOnce([
        {
          id: 'alert-id',
          alert_type: 'fees',
          recipient_user_id: 'parent-id',
          subject: 'Fee',
          message: 'Changed',
          attempts: 0,
          metadata: null,
        },
      ])
      .mockResolvedValueOnce([{ email_alert_fees: false }])
      .mockResolvedValueOnce([]);
    await service.drain();
    expect(managerQuery.mock.calls[2][0]).toContain('"discarded_at" = now()');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('sends an enabled alert to the current active recipient email', async () => {
    managerQuery
      .mockResolvedValueOnce([
        {
          id: 'alert-id',
          alert_type: 'results',
          recipient_user_id: 'parent-id',
          subject: 'Result',
          message: 'Ready',
          attempts: 0,
          metadata: null,
        },
      ])
      .mockResolvedValueOnce([{ email_alert_results: true }])
      .mockResolvedValueOnce([
        { email: 'parent@example.com', first_name: 'Ada', last_name: 'Okoro' },
      ])
      .mockResolvedValueOnce([]);
    await service.drain();
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: [{ email: 'parent@example.com', name: 'Ada Okoro' }],
        subject: 'Result',
      }),
    );
    expect(managerQuery.mock.calls[3][0]).toContain('"sent_at" = now()');
  });

  it('records an SMTP failure for retry without throwing into school activity', async () => {
    managerQuery
      .mockResolvedValueOnce([
        {
          id: 'alert-id',
          alert_type: 'results',
          recipient_user_id: 'parent-id',
          subject: 'Result',
          message: 'Ready',
          attempts: 0,
          metadata: null,
        },
      ])
      .mockResolvedValueOnce([{ email_alert_results: true }])
      .mockResolvedValueOnce([
        { email: 'parent@example.com', first_name: 'Ada', last_name: 'Okoro' },
      ])
      .mockResolvedValueOnce([]);
    sendMail.mockRejectedValueOnce(new Error('SMTP unavailable'));
    await expect(service.drain()).resolves.toBeUndefined();
    expect(managerQuery.mock.calls[3][0]).toContain(
      '"attempts" = "attempts" + 1',
    );
    expect(managerQuery.mock.calls[3][1]).toEqual([
      'alert-id',
      'SMTP unavailable',
    ]);
  });

  it('queues attendance only for students with a linked parent', async () => {
    query
      .mockResolvedValueOnce([
        {
          student_id: 'student-id',
          parent_user_id: 'parent-id',
          first_name: 'Ada',
          last_name: 'Okoro',
        },
      ])
      .mockResolvedValueOnce([{ email_alert_attendance: true }])
      .mockResolvedValueOnce([]);
    await service.enqueueAttendance([
      {
        student_id: 'student-id',
        class_id: 'class-id',
        date: '2026-10-08',
        status: 'ABSENT',
      },
      {
        student_id: 'unlinked-id',
        class_id: 'class-id',
        date: '2026-10-08',
        status: 'LATE',
      },
    ]);
    const queued = JSON.parse(query.mock.calls[2][1][1]);
    expect(queued).toEqual([
      expect.objectContaining({
        recipient_user_id: 'parent-id',
        metadata: {
          student_id: 'student-id',
          class_id: 'class-id',
          date: '2026-10-08',
          status: 'ABSENT',
        },
      }),
    ]);
  });

  it('discards an attendance alert if the recorded status was corrected', async () => {
    managerQuery
      .mockResolvedValueOnce([
        {
          id: 'alert-id',
          alert_type: 'attendance',
          recipient_user_id: 'parent-id',
          subject: 'Attendance',
          message: 'Absent',
          attempts: 0,
          metadata: {
            student_id: 'student-id',
            class_id: 'class-id',
            date: '2026-10-08',
            status: 'ABSENT',
          },
        },
      ])
      .mockResolvedValueOnce([{ email_alert_attendance: true }])
      .mockResolvedValueOnce([{ status: 'PRESENT' }])
      .mockResolvedValueOnce([]);
    await service.drain();
    expect(managerQuery.mock.calls[3][0]).toContain(
      'Attendance status changed',
    );
    expect(sendMail).not.toHaveBeenCalled();
  });
});
