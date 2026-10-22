import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { FeeDiscountService } from './fee-discount.service';

describe('FeeDiscountService money allocation', () => {
  const service = new FeeDiscountService({} as DataSource);

  it('allocates every cent of a total-bill discount without exceeding unpaid component balances', () => {
    const allocations = service['allocate'](
      [
        { id: 'tuition', amount: '100.00', paid: '90.00', discounted: '0' },
        { id: 'books', amount: '100.00', paid: '0', discounted: '0' },
      ],
      5001,
    );

    expect(allocations.reduce((sum, item) => sum + item.amount, 0)).toBe(5001);
    expect(allocations[0].amount).toBeLessThanOrEqual(1000);
    expect(allocations[1].amount).toBeLessThanOrEqual(10000);
  });

  it('rejects a discount larger than the remaining unpaid bill', () => {
    expect(() =>
      service['allocate'](
        [
          {
            id: 'tuition',
            amount: '100.00',
            paid: '90.00',
            discounted: '5.00',
          },
        ],
        501,
      ),
    ).toThrow(ConflictException);
  });
});
