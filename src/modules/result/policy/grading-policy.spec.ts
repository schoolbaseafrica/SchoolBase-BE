import {
  evaluateGradingPolicy,
  IGradingPolicyDefinition,
  LEGACY_GRADING_POLICY,
  SIX_BAND_MERIT_POLICY,
  validateGradingPolicy,
} from './grading-policy';

const custom: IGradingPolicyDefinition = {
  minimumScore: 0,
  maximumScore: 100,
  bands: [
    { min: 75, grade: 'A1', remark: 'Distinction' },
    { min: 50, grade: 'C5', remark: 'Credit' },
    { min: 0, grade: 'F9', remark: 'Fail' },
  ],
};

describe('grading policy definition', () => {
  it('keeps the legacy policy valid and evaluates decimal boundaries', () => {
    expect(() => validateGradingPolicy(LEGACY_GRADING_POLICY)).not.toThrow();
    expect(evaluateGradingPolicy(79.5, LEGACY_GRADING_POLICY)?.grade).toBe('B');
    expect(evaluateGradingPolicy(0, LEGACY_GRADING_POLICY)?.grade).toBe('F');
  });

  it('supports a different school policy without changing the legacy one', () => {
    expect(() => validateGradingPolicy(custom)).not.toThrow();
    expect(evaluateGradingPolicy(74.99, custom)?.grade).toBe('C5');
    expect(evaluateGradingPolicy(74.99, LEGACY_GRADING_POLICY)?.grade).toBe(
      'B',
    );
  });

  it('uses the supplied six-band merit labels at exact and decimal boundaries', () => {
    expect(() => validateGradingPolicy(SIX_BAND_MERIT_POLICY)).not.toThrow();
    expect(evaluateGradingPolicy(80, SIX_BAND_MERIT_POLICY)).toMatchObject({
      grade: 'A',
      remark: 'Distinction',
      bandLabel: '1st percentile',
    });
    expect(evaluateGradingPolicy(79.99, SIX_BAND_MERIT_POLICY)?.grade).toBe(
      'B',
    );
    expect(evaluateGradingPolicy(49.5, SIX_BAND_MERIT_POLICY)?.remark).toBe(
      'Fair',
    );
    expect(evaluateGradingPolicy(0, SIX_BAND_MERIT_POLICY)?.grade).toBe('F');
  });

  it('rejects invalid or ambiguous policy definitions', () => {
    const invalidBands = [
      [{ min: 75, grade: 'A', remark: 'Good' }],
      [{ min: 0, grade: 'F', remark: '' }],
      [
        { min: 80, grade: 'A', remark: 'Excellent' },
        { min: 90, grade: 'B', remark: 'Good' },
        { min: 0, grade: 'F', remark: 'Fail' },
      ],
      [
        { min: 80, grade: 'A', remark: 'Excellent' },
        { min: 0, grade: 'A', remark: 'Fail' },
      ],
    ];
    for (const bands of invalidBands) {
      expect(() => validateGradingPolicy({ ...custom, bands })).toThrow();
    }
    expect(evaluateGradingPolicy(100.01, custom)).toBeNull();
  });
});
