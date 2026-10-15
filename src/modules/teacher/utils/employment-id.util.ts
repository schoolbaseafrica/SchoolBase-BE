import { Repository } from 'typeorm';

import { schoolIdPattern } from '../../school/utils/school-id-format';
import { Teacher } from '../entities/teacher.entity';

/**
 * Generate a unique employment ID in the format EMP-YYYY-XXX
 * where YYYY is the current year and XXX is a sequential number (001, 002, etc.)
 */
export async function generateEmploymentId(
  teacherRepository: Repository<Teacher>,
  format?: string | null,
  prefix = 'EMP',
  schoolCode = '',
): Promise<string> {
  const pattern = schoolIdPattern(format, prefix, schoolCode, 3);
  const rows = (await teacherRepository.query(
    `SELECT COALESCE(MAX((regexp_match("employment_id", $1))[1]::bigint), 0) AS last
     FROM "teachers" WHERE "employment_id" ~ $1`,
    [pattern.regex],
  )) as { last: string | number }[];
  const last = Number(rows[0]?.last ?? 0);
  if (!Number.isSafeInteger(last))
    throw new Error('Teacher ID sequence is exhausted');
  return pattern.next(last + 1);
}
