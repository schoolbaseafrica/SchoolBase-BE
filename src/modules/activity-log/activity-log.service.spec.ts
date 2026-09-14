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
});
