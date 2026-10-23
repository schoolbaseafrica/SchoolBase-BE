import { MigrationInterface, QueryRunner } from 'typeorm';

export class RestoreNfcAttendance1790000000019 implements MigrationInterface {
  name = 'RestoreNfcAttendance1790000000019';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "nfc_card_id" varchar`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_schoolbase_students_nfc_card_id" ON "students" ("nfc_card_id") WHERE "nfc_card_id" IS NOT NULL`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "attendance_mobile_taps" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "client_event_id" uuid NOT NULL UNIQUE,
        "teacher_user_id" uuid NOT NULL,
        "student_id" uuid NOT NULL,
        "class_id" uuid NOT NULL,
        "session_id" uuid NOT NULL,
        "attendance_date" date NOT NULL,
        "captured_at" timestamptz NOT NULL,
        "received_at" timestamptz NOT NULL DEFAULT now(),
        "result" varchar(24) NOT NULL,
        CONSTRAINT "FK_mobile_tap_teacher" FOREIGN KEY ("teacher_user_id") REFERENCES "users"("id"),
        CONSTRAINT "FK_mobile_tap_student" FOREIGN KEY ("student_id") REFERENCES "students"("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_mobile_taps_class_date" ON "attendance_mobile_taps" ("class_id", "attendance_date")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "attendance_mobile_taps"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_schoolbase_students_nfc_card_id"`,
    );
    // Keep nfc_card_id: restored databases may contain issued card assignments.
  }
}
