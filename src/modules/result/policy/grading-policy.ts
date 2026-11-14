export interface IGradingBand {
  min: number;
  grade: string;
  remark: string;
  bandLabel?: string;
}

export interface IGradingPolicyDefinition {
  minimumScore: 0;
  maximumScore: 100;
  bands: IGradingBand[];
}

export const LEGACY_GRADING_POLICY: IGradingPolicyDefinition = {
  minimumScore: 0,
  maximumScore: 100,
  bands: [
    { min: 80, grade: 'A', remark: 'Excellent' },
    { min: 70, grade: 'B', remark: 'Very Good' },
    { min: 60, grade: 'C', remark: 'Good' },
    { min: 50, grade: 'D', remark: 'Fair' },
    { min: 40, grade: 'E', remark: 'Poor' },
    { min: 0, grade: 'F', remark: 'Fail' },
  ],
};

export const SIX_BAND_MERIT_POLICY: IGradingPolicyDefinition = {
  minimumScore: 0,
  maximumScore: 100,
  bands: [
    { min: 80, grade: 'A', bandLabel: '1st percentile', remark: 'Distinction' },
    { min: 70, grade: 'B', bandLabel: '2nd percentile', remark: 'Merit' },
    { min: 60, grade: 'C', bandLabel: '3rd percentile', remark: 'Good' },
    { min: 50, grade: 'D', bandLabel: '4th percentile', remark: 'Pass' },
    { min: 40, grade: 'E', bandLabel: '5th percentile', remark: 'Fair' },
    { min: 0, grade: 'F', bandLabel: '6th percentile', remark: 'Fail' },
  ],
};

export function validateGradingPolicy(policy: IGradingPolicyDefinition): void {
  if (!policy || policy.minimumScore !== 0 || policy.maximumScore !== 100) {
    throw new Error('Grading policies must cover scores from 0 to 100');
  }
  if (!Array.isArray(policy.bands) || policy.bands.length === 0) {
    throw new Error('At least one grading band is required');
  }
  const grades = new Set<string>();
  for (let index = 0; index < policy.bands.length; index++) {
    const band = policy.bands[index];
    if (
      !band ||
      !Number.isFinite(band.min) ||
      band.min < 0 ||
      band.min > 100 ||
      (index > 0 && band.min >= policy.bands[index - 1].min)
    ) {
      throw new Error('Grading band thresholds must descend within 0 to 100');
    }
    if (
      typeof band.grade !== 'string' ||
      !band.grade.trim() ||
      band.grade.trim().length > 2 ||
      grades.has(band.grade.trim())
    ) {
      throw new Error(
        'Grading bands need unique grade labels of at most two characters',
      );
    }
    if (typeof band.remark !== 'string' || !band.remark.trim()) {
      throw new Error('Every grading band needs a remark');
    }
    if (
      band.bandLabel !== undefined &&
      (typeof band.bandLabel !== 'string' || band.bandLabel.length > 80)
    ) {
      throw new Error('Band labels must be at most 80 characters');
    }
    grades.add(band.grade.trim());
  }
  if (policy.bands[policy.bands.length - 1].min !== 0) {
    throw new Error('The final grading band must begin at zero');
  }
}

export function evaluateGradingPolicy(
  score: number | null,
  policy: IGradingPolicyDefinition,
): IGradingBand | null {
  if (score === null || !Number.isFinite(score) || score < 0 || score > 100) {
    return null;
  }
  return policy.bands.find((band) => score >= band.min) ?? null;
}
