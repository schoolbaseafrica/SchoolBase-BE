import { MigrationInterface, QueryRunner } from 'typeorm';

export class DeduplicateCbtQuestionBank1790000000007 implements MigrationInterface {
  name = 'DeduplicateCbtQuestionBank1790000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH ranked AS (
        SELECT id,
          ROW_NUMBER() OVER (
            PARTITION BY LOWER(REGEXP_REPLACE(BTRIM(body), '[[:space:]]+', ' ', 'g'))
            ORDER BY created_at ASC, id ASC
          ) AS duplicate_number
        FROM cbt_questions
        WHERE exam_id IS NULL AND is_archived = false
      )
      UPDATE cbt_questions question
      SET is_archived = true
      FROM ranked
      WHERE question.id = ranked.id
        AND ranked.duplicate_number > 1
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_cbt_question_bank_unique_wording"
      ON cbt_questions (
        LOWER(REGEXP_REPLACE(BTRIM(body), '[[:space:]]+', ' ', 'g'))
      )
      WHERE exam_id IS NULL AND is_archived = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_cbt_question_bank_unique_wording"`,
    );
  }
}
