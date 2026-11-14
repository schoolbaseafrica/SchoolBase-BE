import { BadRequestException } from '@nestjs/common';

import { LEGACY_GRADING_POLICY, SIX_BAND_MERIT_POLICY } from './grading-policy';
import { GradingPolicyService } from './grading-policy.service';

describe('GradingPolicyService', () => {
  it('prefers a class rule, then a term rule, then the legacy default', async () => {
    const findOneBy = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'term-policy',
        version: 2,
        definition: SIX_BAND_MERIT_POLICY,
      })
      .mockResolvedValueOnce({
        id: 'class-policy',
        version: 3,
        definition: LEGACY_GRADING_POLICY,
      });
    const service = new GradingPolicyService(
      { findOneBy } as never,
      {} as never,
    );
    expect((await service.resolve('term', 'class')).id).toBeNull();
    expect((await service.resolve('term', 'class')).id).toBe('term-policy');
    expect((await service.resolve('term', 'class')).id).toBe('class-policy');
  });

  it('blocks activation when a grade submission already exists', async () => {
    const draft = {
      id: 'draft',
      termId: 'term',
      classId: null,
      status: 'DRAFT',
      definition: SIX_BAND_MERIT_POLICY,
    };
    const manager = {
      getRepository: jest.fn().mockReturnValue({
        findOneBy: jest.fn().mockResolvedValue(draft),
        save: jest.fn(),
      }),
      query: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'term' }])
        .mockResolvedValueOnce([{ id: 'submission' }])
        .mockResolvedValueOnce([]),
    };
    const service = new GradingPolicyService(
      {} as never,
      {
        transaction: (callback: (value: typeof manager) => unknown) =>
          callback(manager),
      } as never,
    );
    await expect(service.activate('draft', 'admin')).rejects.toThrow(
      BadRequestException,
    );
    expect(manager.getRepository().save).not.toHaveBeenCalled();
  });
});
