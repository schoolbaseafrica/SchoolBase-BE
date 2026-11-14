import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFeePeriodScope1790000000002 implements MigrationInterface {
  name = 'AddFeePeriodScope1790000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "fees" ADD COLUMN IF NOT EXISTS "period_type" varchar NOT NULL DEFAULT 'TERM'`,
    );
    await queryRunner.query(
      `ALTER TABLE "fees" ADD COLUMN IF NOT EXISTS "session_id" uuid`,
    );
    await queryRunner.query(
      `UPDATE "fees" fee SET "session_id" = term."session_id" FROM "terms" term WHERE fee."term_id" = term."id" AND fee."session_id" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "fees" ALTER COLUMN "session_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "fees" ALTER COLUMN "term_id" DROP NOT NULL`,
    );
    await queryRunner.query(`
      DO $migration$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'FK_fees_session'
            AND conrelid = '"fees"'::regclass
        ) THEN
          ALTER TABLE "fees" ADD CONSTRAINT "FK_fees_session"
            FOREIGN KEY ("session_id") REFERENCES "academic_sessions"("id") ON DELETE CASCADE;
        END IF;
      END
      $migration$;
    `);
    await queryRunner.query(`
      DO $migration$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'CHK_fees_period_scope'
            AND conrelid = '"fees"'::regclass
        ) THEN
          ALTER TABLE "fees" ADD CONSTRAINT "CHK_fees_period_scope"
            CHECK (("period_type" = 'TERM' AND "term_id" IS NOT NULL)
              OR ("period_type" = 'SESSION' AND "term_id" IS NULL));
        END IF;
      END
      $migration$;
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_fees_session_period" ON "fees" ("session_id", "period_type", "term_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fees_session_period"`);
    await queryRunner.query(
      `ALTER TABLE "fees" DROP CONSTRAINT IF EXISTS "CHK_fees_period_scope"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fees" DROP CONSTRAINT IF EXISTS "FK_fees_session"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fees" ALTER COLUMN "term_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "fees" DROP COLUMN IF EXISTS "session_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "fees" DROP COLUMN IF EXISTS "period_type"`,
    );
  }
}
