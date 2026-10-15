import { OwnerEmailDigestDeliveryService } from './owner-email-digest-delivery.service';

describe('OwnerEmailDigestDeliveryService', () => {
  const manager = { query: jest.fn() };
  const dataSource = {
    transaction: jest.fn(
      async (callback: (tx: typeof manager) => Promise<unknown>) =>
        callback(manager),
    ),
  };
  const email = { sendMail: jest.fn() };
  const config = {
    get: jest.fn((key: string) =>
      key === 'frontend.url' ? 'https://demo.schoolbase.africa' : 'configured',
    ),
  };
  const service = new OwnerEmailDigestDeliveryService(
    dataSource as never,
    email as never,
    config as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('emails selected counts to the current owner and advances only after delivery', async () => {
    manager.query
      .mockResolvedValueOnce([
        {
          school_id: 'school-1',
          school_name: 'School',
          owner_user_id: 'owner-1',
          email: 'owner@example.com',
          first_name: 'Owner',
          last_name: 'One',
          frequency: 'daily',
          categories: ['attendance', 'assessments'],
          period_start_at: new Date('2026-10-14T07:00:00Z'),
        },
      ])
      .mockResolvedValueOnce([{ entity_type: 'ATTENDANCE', count: 4 }])
      .mockResolvedValueOnce([{ count: 2 }])
      .mockResolvedValueOnce([]);
    await service.drain();
    expect(email.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: [{ email: 'owner@example.com', name: 'Owner One' }],
        templateData: expect.objectContaining({
          sections: [
            expect.objectContaining({ title: 'Attendance', count: 4 }),
            expect.objectContaining({ title: 'Exams and results', count: 2 }),
          ],
        }),
      }),
    );
    expect(
      manager.query.mock.calls[manager.query.mock.calls.length - 1]?.[0],
    ).toContain('UPDATE "owner_email_digest_preferences"');
  });

  it('does not advance the delivery window when email fails', async () => {
    manager.query
      .mockResolvedValueOnce([
        {
          school_id: 'school-1',
          school_name: 'School',
          owner_user_id: 'owner-1',
          email: 'owner@example.com',
          first_name: 'Owner',
          last_name: 'One',
          frequency: 'daily',
          categories: ['attendance'],
          period_start_at: new Date('2026-10-14T07:00:00Z'),
        },
      ])
      .mockResolvedValueOnce([]);
    email.sendMail.mockRejectedValueOnce(new Error('SMTP unavailable'));
    await expect(service.drain()).resolves.toBeUndefined();
    expect(manager.query.mock.calls[2][0]).toContain(
      '"attempts" = "attempts" + 1',
    );
    expect(manager.query.mock.calls[2][0]).not.toContain('"last_sent_at"');
  });
});
