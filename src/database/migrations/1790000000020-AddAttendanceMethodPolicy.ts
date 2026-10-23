import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAttendanceMethodPolicy1790000000020 implements MigrationInterface {
  name = 'AddAttendanceMethodPolicy1790000000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "attendance_enabled_methods" jsonb NOT NULL DEFAULT '["NFC"]'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "fingerprint_provider" varchar(40) NOT NULL DEFAULT 'secugen'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "schools" DROP COLUMN IF EXISTS "fingerprint_provider"`,
    );
    await queryRunner.query(
      `ALTER TABLE "schools" DROP COLUMN IF EXISTS "attendance_enabled_methods"`,
    );
  }
}
