import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { InviteQueryDto } from '../dto/get-invites.dto';

describe('InviteQueryDto', () => {
  it('converts pagination values from URL query strings', async () => {
    const query = plainToInstance(InviteQueryDto, {
      page: '2',
      limit: '100',
      status: 'pending',
    });

    expect(await validate(query)).toEqual([]);
    expect(query.page).toBe(2);
    expect(query.limit).toBe(100);
  });
});
