import {
  calculateGradeLetter,
  getOverallRemark,
  getRemark,
} from './grading.util';

describe('result grading boundaries', () => {
  it('uses continuous score bands for decimal totals and averages', () => {
    expect(calculateGradeLetter(79.5)).toBe('B');
    expect(getRemark(79.5)).toBe('Very Good');
    expect(calculateGradeLetter(69.99)).toBe('C');
    expect(getOverallRemark(69.99)).toBe('Good');
    expect(calculateGradeLetter(0)).toBe('F');
    expect(getRemark(0)).toBe('Fail');
  });

  it('does not turn out-of-range scores into a failing grade', () => {
    expect(calculateGradeLetter(-1)).toBeNull();
    expect(calculateGradeLetter(100.01)).toBeNull();
    expect(getRemark(Number.NaN)).toBeNull();
  });
});
