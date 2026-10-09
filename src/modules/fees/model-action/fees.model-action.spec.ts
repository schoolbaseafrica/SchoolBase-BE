import { Repository } from 'typeorm';

import { Fees } from '../entities/fees.entity';

import { FeesModelAction } from './fees.model-action';

describe('FeesModelAction.getTotalExpectedFees', () => {
  it('compares class enrollment session text to the fee UUID safely', async () => {
    const query = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ total: '3.00' }),
    };
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(query),
    } as unknown as Repository<Fees>;
    const action = new FeesModelAction(repository);

    await expect(
      action.getTotalExpectedFees('term-id', 'session-id'),
    ).resolves.toBe(3);
    expect(query.select.mock.calls[0][0]).toContain(
      'cs.session_id = CAST(fee.session_id AS text)',
    );
    expect(query.andWhere).toHaveBeenCalledTimes(2);
  });
});
