import { ForbiddenException } from '@nestjs/common';

import {
  OwnerEmailDigestService,
  nextOwnerDigestTime,
} from './owner-email-digest.service';

describe('OwnerEmailDigestService', () => {
  const manager = { query: jest.fn() };
  const dataSource = {
    query: jest.fn(),
    transaction: jest.fn(
      async (callback: (tx: typeof manager) => Promise<unknown>) =>
        callback(manager),
    ),
  };
  const config = {
    get: jest.fn((key: string) =>
      key === 'mail.host' ? 'smtp.example.com' : 'owner@example.com',
    ),
  };
  const service = new OwnerEmailDigestService(
    dataSource as never,
    config as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('refuses a different admin before reading owner preferences', async () => {
    dataSource.query.mockResolvedValue([]);
    await expect(service.get('admin-2')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });

  it('reports the saved delivery schedule and retry count to the owner', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ id: 'school-1' }])
      .mockResolvedValueOnce([
        {
          enabled: true,
          frequency: 'daily',
          categories: ['attendance'],
          next_due_at: new Date('2026-10-22T07:00:00Z'),
          last_sent_at: null,
          attempts: 2,
        },
      ]);

    await expect(service.get('owner-1')).resolves.toMatchObject({
      enabled: true,
      attempts: 2,
      mail_configured: true,
      next_due_at: new Date('2026-10-22T07:00:00Z'),
    });
  });

  it('rechecks ownership under the write lock before saving', async () => {
    dataSource.query.mockResolvedValueOnce([{ id: 'school-1' }]);
    manager.query.mockResolvedValueOnce([{ owner_user_id: 'new-owner' }]);
    await expect(
      service.update('old-owner', {
        enabled: false,
        frequency: 'daily',
        categories: ['attendance'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(manager.query).toHaveBeenCalledTimes(1);
  });

  it('enables a selected daily summary without emailing anyone immediately', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ id: 'school-1' }])
      .mockResolvedValueOnce([{ email: 'owner@example.com' }])
      .mockResolvedValueOnce([{ id: 'school-1' }])
      .mockResolvedValueOnce([
        {
          enabled: true,
          frequency: 'daily',
          categories: ['fees'],
          next_due_at: new Date('2026-10-16T07:00:00Z'),
          last_sent_at: null,
        },
      ]);
    manager.query
      .mockResolvedValueOnce([{ owner_user_id: 'owner-1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValue([]);

    await expect(
      service.update('owner-1', {
        enabled: true,
        frequency: 'daily',
        categories: ['fees'],
      }),
    ).resolves.toMatchObject({ enabled: true, categories: ['fees'] });
    expect(manager.query.mock.calls[2][0]).toContain(
      'INSERT INTO "owner_email_digest_preferences"',
    );
    expect(manager.query.mock.calls[2][1]).toEqual([
      'school-1',
      true,
      'daily',
      '["fees"]',
      expect.any(Date),
      expect.any(Date),
      true,
    ]);
  });

  it('schedules daily delivery at 8 AM Lagos and weekly delivery on Monday', () => {
    expect(
      nextOwnerDigestTime(
        new Date('2026-10-15T06:00:00Z'),
        'daily',
      ).toISOString(),
    ).toBe('2026-10-16T07:00:00.000Z');
    expect(
      nextOwnerDigestTime(
        new Date('2026-10-15T06:00:00Z'),
        'weekly',
      ).toISOString(),
    ).toBe('2026-10-19T07:00:00.000Z');
  });
});
