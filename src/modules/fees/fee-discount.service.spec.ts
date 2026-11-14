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

describe('FeeDiscountService revoked code reuse', () => {
  it('previews a revoked code use but blocks a currently active use', async () => {
    let hasActiveUse = false;
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM fee_discount_codes'))
        return [
          {
            id: 'code-id',
            code: 'RETRY',
            kind: 'PERCENT',
            value: '10',
            session_id: 'session-id',
            term_id: 'term-id',
            max_uses: 1,
            expires_at: null,
            is_active: true,
          },
        ];
      if (sql.includes('COUNT(*)::int')) return [{ count: 0 }];
      if (sql.includes('FROM fee_discount_redemptions')) {
        return hasActiveUse ? [1] : [];
      }
      if (sql.includes('FROM terms') || sql.includes('FROM students'))
        return [1];
      if (sql.includes('FROM fees fee'))
        return [
          { id: 'fee-id', amount: '50.00', paid: '35.00', discounted: '0' },
        ];
      throw new Error(`Unexpected query: ${sql}`);
    });
    const service = new FeeDiscountService({
      query,
      manager: { query },
    } as unknown as DataSource);

    await expect(
      service.preview('RETRY', 'student-id', 'session-id', 'term-id'),
    ).resolves.toMatchObject({ original: 50, discount: 5, balance: 10 });
    hasActiveUse = true;
    await expect(
      service.preview('RETRY', 'student-id', 'session-id', 'term-id'),
    ).rejects.toThrow(ConflictException);
    const redemptionQueries = query.mock.calls
      .map(([sql]) => sql)
      .filter((sql) => sql.includes('FROM fee_discount_redemptions'));
    expect(redemptionQueries).toHaveLength(5);
    expect(
      redemptionQueries.every((sql) => sql.includes("status <> 'REVOKED'")),
    ).toBe(true);
  });
});
