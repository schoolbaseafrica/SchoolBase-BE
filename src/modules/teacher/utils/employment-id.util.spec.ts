import { Repository } from 'typeorm';

import { Teacher } from '../entities/teacher.entity';

import { generateEmploymentId } from './employment-id.util';

describe('generateEmploymentId', () => {
  it('queries the configured pattern and advances the numeric sequence', async () => {
    const query = jest.fn().mockResolvedValue([{ last: '9' }]);
    const repository = { query } as unknown as Repository<Teacher>;
    const year = new Date().getFullYear();
    await expect(
      generateEmploymentId(
        repository,
        '{SCHOOL_CODE}-{PREFIX}-{YEAR}-{SEQUENCE:3}',
        'EMP',
        'ABC',
      ),
    ).resolves.toBe(`ABC-EMP-${year}-010`);
    expect(query.mock.calls[0][1][0]).toContain('ABC-EMP-');
  });
});
