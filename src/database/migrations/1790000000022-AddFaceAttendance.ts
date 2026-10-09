import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFaceAttendance1790000000022 implements MigrationInterface {
  name = 'AddFaceAttendance1790000000022';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "face_photo_object_key" varchar(512)`,
    );
    await queryRunner.query(
      `ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "face_photo_approved_at" timestamptz`,
    );
    await queryRunner.query(
      `ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "face_photo_approved_by" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance_mobile_taps" ADD COLUMN IF NOT EXISTS "method" varchar(12) NOT NULL DEFAULT 'NFC'`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance_mobile_taps" ADD COLUMN IF NOT EXISTS "face_similarity" numeric(5,4)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "attendance_mobile_taps" DROP COLUMN IF EXISTS "face_similarity"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance_mobile_taps" DROP COLUMN IF EXISTS "method"`,
    );
    await queryRunner.query(
      `ALTER TABLE "students" DROP COLUMN IF EXISTS "face_photo_approved_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "students" DROP COLUMN IF EXISTS "face_photo_approved_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "students" DROP COLUMN IF EXISTS "face_photo_object_key"`,
    );
  }
}
