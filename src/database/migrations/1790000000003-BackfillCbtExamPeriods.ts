import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillCbtExamPeriods1790000000003 implements MigrationInterface {
  name = 'BackfillCbtExamPeriods1790000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE cbt_exams exam
      SET session_id = active_session.id
      FROM (
        SELECT id
        FROM academic_sessions
        WHERE status = 'Active' AND deleted_at IS NULL
        ORDER BY start_date DESC
        LIMIT 1
      ) active_session
      WHERE exam.session_id IS NULL
    `);

    await queryRunner.query(`
      UPDATE cbt_exams exam
      SET term_id = active_term.id
      FROM (
        SELECT id, session_id
        FROM terms
        WHERE is_current = true AND deleted_at IS NULL
      ) active_term
      WHERE exam.term_id IS NULL
        AND exam.session_id = active_term.session_id
    `);
  }

  public async down(): Promise<void> {
    // Period ownership cannot be safely inferred after later edits, so the
    // data backfill is intentionally retained on rollback.
  }
}
