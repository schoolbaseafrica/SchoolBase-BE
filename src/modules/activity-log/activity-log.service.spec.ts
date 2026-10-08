import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { ActivityLogService } from './activity-log.service';

describe('ActivityLogService', () => {
  let service: ActivityLogService;
  const dataSource = { query: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityLogService,
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = module.get(ActivityLogService);
    jest.clearAllMocks();
  });

  it('returns the exact paginated contract consumed by the activity-log page', async () => {
    const logs = [
      {
        id: 'log-id',
        action: 'UPDATE',
        user_name: 'Ada Admin',
        user_email: 'admin@example.test',
      },
    ];
    dataSource.query
      .mockResolvedValueOnce([{ total: 21 }])
      .mockResolvedValueOnce(logs);

    const result = await service.findAll({ page: 2, limit: 20 });

    expect(result.data).toEqual(logs);
    expect(result.pagination).toEqual({
      total: 21,
      page: 2,
      limit: 20,
      total_pages: 2,
      has_next: false,
      has_previous: true,
    });
    expect(dataSource.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('LEFT JOIN "users"'),
      [20, 20],
    );
  });

  it('parameterizes filters and treats the end date as inclusive', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    await service.findAll({
      page: 1,
      limit: 10,
      action: 'CREATE',
      start_date: '2026-09-01',
      end_date: '2026-09-14',
    });

    expect(dataSource.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        `log."created_at" < ($3::date + INTERVAL '1 day')`,
      ),
      ['CREATE', '2026-09-01', '2026-09-14'],
    );
  });

  it('loads filter choices from actual stored actions and entity types', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ value: 'FEE' }, { value: 'school' }])
      .mockResolvedValueOnce([
        { value: 'CREATE' },
        { value: 'TRANSFER_OWNER' },
      ]);
    await expect(service.filterOptions()).resolves.toEqual({
      entity_types: ['FEE', 'school'],
      actions: ['CREATE', 'TRANSFER_OWNER'],
    });
  });

  it('filters a custom audit action exactly and orders tied timestamps predictably', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([]);
    await service.findAll({ page: 1, limit: 20, action: 'TRANSFER_OWNER' });
    expect(dataSource.query.mock.calls[0][1]).toEqual(['TRANSFER_OWNER']);
    expect(dataSource.query.mock.calls[1][0]).toContain(
      'ORDER BY log."created_at" DESC, log."id" DESC',
    );
  });

  it('keeps activity logs when retention is unlimited', async () => {
    dataSource.query.mockResolvedValueOnce([{ days: null }]);
    await expect(service.purgeExpired()).resolves.toBe(0);
    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });

  it('deletes only logs older than the configured retention period', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ days: 90 }])
      .mockResolvedValueOnce([[], 3]);
    await expect(service.purgeExpired()).resolves.toBe(3);
    expect(dataSource.query.mock.calls[1][0]).toContain(
      '"created_at" < now() - ($1 * interval',
    );
    expect(dataSource.query.mock.calls[1][1]).toEqual([90]);
  });

  it('rejects an invalid negative retention setting without deleting', async () => {
    dataSource.query.mockResolvedValueOnce([{ days: -1 }]);
    await expect(service.purgeExpired()).rejects.toThrow(
      'Invalid activity log retention setting',
    );
    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });

  it('does not purge a restored school with a legacy zero-day setting', async () => {
    dataSource.query.mockResolvedValueOnce([{ days: 0 }]);
    await expect(service.purgeExpired()).rejects.toThrow(
      'Invalid activity log retention setting',
    );
    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });
});
