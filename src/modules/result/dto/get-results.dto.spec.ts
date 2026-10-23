import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { GetResultsQueryDto } from './get-results.dto';

describe('GetResultsQueryDto', () => {
  it('accepts the pagination sent by the results page for a selected session', async () => {
    const query = plainToInstance(GetResultsQueryDto, {
      academic_session_id: '00000000-0000-4000-8000-000000000001',
      page: '1',
      limit: '20',
    });

    expect(await validate(query)).toEqual([]);
    expect(query.page).toBe(1);
    expect(query.limit).toBe(20);
  });
});
