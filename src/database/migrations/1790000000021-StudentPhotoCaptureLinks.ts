import { MigrationInterface, QueryRunner } from 'typeorm';

export class StudentPhotoCaptureLinks1790000000021 implements MigrationInterface {
  name = 'StudentPhotoCaptureLinks1790000000021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "student_photo_capture_links" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
        "token_hash" char(64) NOT NULL UNIQUE,
        "state" varchar(12) NOT NULL DEFAULT 'pending',
        "expires_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "used_at" timestamptz
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_student_photo_links_student" ON "student_photo_capture_links" ("student_id", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "student_photo_capture_links"`,
    );
  }
}
