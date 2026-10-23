import { MigrationInterface, QueryRunner } from 'typeorm';

export class RestoreSchoolSettings1790000000023 implements MigrationInterface {
  name = 'RestoreSchoolSettings1790000000023';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "activity_log_retention_days" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "school_code" varchar(20)`,
    );
    for (const type of ['student', 'teacher', 'parent', 'staff']) {
      const prefix = {
        student: 'STU',
        teacher: 'EMP',
        parent: 'PAR',
        staff: 'STF',
      }[type];
      await queryRunner.query(
        `ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "${type}_id_format" varchar(100)`,
      );
      await queryRunner.query(
        `ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "${type}_id_prefix" varchar(20) DEFAULT '${prefix}'`,
      );
      await queryRunner.query(
        `ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "allow_manual_${type}_ids" boolean NOT NULL DEFAULT true`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "landing_page_config" jsonb DEFAULT '{"hero_images":[],"gallery_images":[],"testimonials":[]}'::jsonb`,
    );
    await queryRunner.query(
      `UPDATE "schools" SET "landing_page_config" = '{"hero_images":[],"gallery_images":[],"testimonials":[]}'::jsonb WHERE "landing_page_config" IS NULL`,
    );
  }

  public async down(): Promise<void> {
    // These columns may predate this migration in restored school databases.
    // Retain school configuration rather than remove existing data.
  }
}
