/**
 * Grading Utility
 *
 * Provides utilities for calculating grades, remarks, and other grading-related operations.
 * Uses the same grading scale as the grade module:
 * A (80-100), B (70-79), C (60-69), D (50-59), E (40-49), F (0-39)
 */

import { UserRole } from 'src/modules/shared/enums';

import {
  evaluateGradingPolicy,
  LEGACY_GRADING_POLICY,
} from '../policy/grading-policy';

export interface IGradingScale {
  min: number;
  grade: string;
  remark: string;
}

export interface IRequestWithUser extends Request {
  user: {
    id: string;
    userId: string;
    teacher_id?: string;
    student_id?: string;
    parent_id?: string;
    roles: UserRole[];
  };
}

export const GRADING_SCALE: IGradingScale[] = LEGACY_GRADING_POLICY.bands;

/**
 * Calculate grade letter based on total score
 */
export function calculateGradeLetter(totalScore: number | null): string | null {
  return (
    evaluateGradingPolicy(totalScore, LEGACY_GRADING_POLICY)?.grade ?? null
  );
}

/**
 * Get remark based on total score
 */
export function getRemark(totalScore: number | null): string | null {
  return (
    evaluateGradingPolicy(totalScore, LEGACY_GRADING_POLICY)?.remark ?? null
  );
}

/**
 * Get overall remark based on average score
 */
export function getOverallRemark(averageScore: number | null): string {
  if (averageScore === null || averageScore < 0) {
    return 'No grades available';
  }

  const remark = getRemark(averageScore);
  return remark || 'No grades available';
}
