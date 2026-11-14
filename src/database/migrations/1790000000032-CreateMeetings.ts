import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMeetings1790000000032 implements MigrationInterface {
  name = 'CreateMeetings1790000000032';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "meetings" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "title" varchar(160) NOT NULL,
      "description" text,
      "starts_at" timestamptz NOT NULL,
      "ends_at" timestamptz NOT NULL,
      "status" varchar(16) NOT NULL DEFAULT 'scheduled',
      "created_by" uuid NOT NULL REFERENCES "users"("id"),
      "audience_roles" text[] NOT NULL DEFAULT '{}',
      "audience_user_ids" uuid[] NOT NULL DEFAULT '{}',
      "audience_class_ids" uuid[] NOT NULL DEFAULT '{}',
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "CHK_meeting_window" CHECK ("ends_at" > "starts_at"),
      CONSTRAINT "CHK_meeting_status" CHECK ("status" IN ('scheduled','live','ended','cancelled'))
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_meetings_window" ON "meetings" ("starts_at", "ends_at")`,
    );
    await queryRunner.query(`CREATE TABLE "meeting_admissions" (
      "meeting_id" uuid NOT NULL REFERENCES "meetings"("id") ON DELETE CASCADE,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "status" varchar(12) NOT NULL DEFAULT 'pending',
      "requested_at" timestamptz NOT NULL DEFAULT now(),
      "decided_at" timestamptz,
      PRIMARY KEY ("meeting_id", "user_id"),
      CONSTRAINT "CHK_meeting_admission_status" CHECK ("status" IN ('pending','admitted','denied'))
    )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "meeting_admissions"`);
    await queryRunner.query(`DROP TABLE "meetings"`);
  }
}
