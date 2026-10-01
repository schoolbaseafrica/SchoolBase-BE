import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandCbtExamLifecycle1790000000005 implements MigrationInterface {
  name = 'ExpandCbtExamLifecycle1790000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "cbt_exam_status_enum" RENAME TO "cbt_exam_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "cbt_exam_status_enum" AS ENUM ('draft', 'review', 'scheduled', 'active', 'closed', 'published', 'archived')`,
    );
    await queryRunner.query(
      `ALTER TABLE "cbt_exams" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "cbt_exams" ALTER COLUMN "status" TYPE "cbt_exam_status_enum" USING "status"::text::"cbt_exam_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cbt_exams" ALTER COLUMN "status" SET DEFAULT 'draft'`,
    );
    await queryRunner.query(`DROP TYPE "cbt_exam_status_enum_old"`);
    await queryRunner.query(
      `UPDATE "cbt_exams" SET "status" = CASE WHEN "available_to" IS NOT NULL AND "available_to" < now() THEN 'closed'::"cbt_exam_status_enum" ELSE 'active'::"cbt_exam_status_enum" END WHERE "status" = 'published'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "cbt_exams" SET "status" = 'published' WHERE "status" IN ('review', 'scheduled', 'active', 'closed')`,
    );
    await queryRunner.query(
      `ALTER TYPE "cbt_exam_status_enum" RENAME TO "cbt_exam_status_enum_new"`,
    );
    await queryRunner.query(
      `CREATE TYPE "cbt_exam_status_enum" AS ENUM ('draft', 'published', 'archived')`,
    );
    await queryRunner.query(
      `ALTER TABLE "cbt_exams" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "cbt_exams" ALTER COLUMN "status" TYPE "cbt_exam_status_enum" USING "status"::text::"cbt_exam_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cbt_exams" ALTER COLUMN "status" SET DEFAULT 'draft'`,
    );
    await queryRunner.query(`DROP TYPE "cbt_exam_status_enum_new"`);
  }
}
