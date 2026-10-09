import { MigrationInterface, QueryRunner } from 'typeorm';

export class CorrectLegacyCbtExamPeriods1790000000006 implements MigrationInterface {
  name = 'CorrectLegacyCbtExamPeriods1790000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH exam_dates AS (
        SELECT exam_id, MIN(started_at)::date AS reference_date
        FROM cbt_attempts
        GROUP BY exam_id
      ), resolved_sessions AS (
        SELECT exam_dates.exam_id, academic_session.id AS session_id
        FROM exam_dates
        JOIN LATERAL (
          SELECT id
          FROM academic_sessions
          WHERE exam_dates.reference_date BETWEEN start_date AND end_date
            AND deleted_at IS NULL
          ORDER BY start_date DESC
          LIMIT 1
        ) academic_session ON true
      )
      UPDATE cbt_exams exam
      SET session_id = resolved_sessions.session_id
      FROM resolved_sessions
      WHERE exam.id = resolved_sessions.exam_id
        AND exam.session_id IS DISTINCT FROM resolved_sessions.session_id
    `);

    await queryRunner.query(`
      WITH exam_dates AS (
        SELECT exam_id, MIN(started_at)::date AS reference_date
        FROM cbt_attempts
        GROUP BY exam_id
      )
      UPDATE cbt_exams exam
      SET term_id = NULL
      FROM exam_dates
      WHERE exam.id = exam_dates.exam_id
    `);

    await queryRunner.query(`
      WITH exam_dates AS (
        SELECT exam_id, MIN(started_at)::date AS reference_date
        FROM cbt_attempts
        GROUP BY exam_id
      ), resolved_terms AS (
        SELECT exam_dates.exam_id, term.id AS term_id
        FROM exam_dates
        JOIN cbt_exams exam ON exam.id = exam_dates.exam_id
        JOIN LATERAL (
          SELECT id
          FROM terms
          WHERE session_id = exam.session_id
            AND exam_dates.reference_date BETWEEN start_date AND end_date
            AND deleted_at IS NULL
          ORDER BY start_date DESC
          LIMIT 1
        ) term ON true
      )
      UPDATE cbt_exams exam
      SET term_id = resolved_terms.term_id
      FROM resolved_terms
      WHERE exam.id = resolved_terms.exam_id
    `);
  }

  public async down(): Promise<void> {
    // The previous period assignments were inaccurate and are intentionally
    // not restored. Administrators can still change an exam's period later.
  }
}
