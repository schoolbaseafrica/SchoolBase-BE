import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ListActivityLogsQueryDto } from './list-activity-logs-query.dto';

describe('ListActivityLogsQueryDto', () => {
  it('accepts the page size and entity filter used by the admin activity page', async () => {
    const query = plainToInstance(ListActivityLogsQueryDto, {
      page: '1',
      limit: '20',
      entity_type: 'STUDENT',
      action: 'CREATE',
    });

    expect(await validate(query)).toEqual([]);
    expect(query.limit).toBe(20);
  });

  it('rejects excessive page sizes and entity names', async () => {
    const query = plainToInstance(ListActivityLogsQueryDto, {
      limit: '101',
      entity_type: 'X'.repeat(101),
    });

    const errors = await validate(query);
    expect(errors.map((error) => error.property).sort()).toEqual([
      'entity_type',
      'limit',
    ]);
  });
});
