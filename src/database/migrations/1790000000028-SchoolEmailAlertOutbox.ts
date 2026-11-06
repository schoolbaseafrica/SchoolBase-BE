import { MigrationInterface, QueryRunner } from 'typeorm';

export class SchoolEmailAlertOutbox1790000000028 implements MigrationInterface {
  name = 'SchoolEmailAlertOutbox1790000000028';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "school_email_alert_outbox" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "alert_type" varchar(20) NOT NULL,
        "recipient_user_id" uuid NOT NULL,
        "subject" varchar(255) NOT NULL,
        "message" text NOT NULL,
        "metadata" jsonb,
        "dedupe_key" varchar(255) UNIQUE,
        "attempts" integer NOT NULL DEFAULT 0,
        "next_attempt_at" timestamptz NOT NULL DEFAULT now(),
        "sent_at" timestamptz,
        "discarded_at" timestamptz,
        "last_error" text,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_school_email_alert_pending" ON "school_email_alert_outbox" ("next_attempt_at") WHERE "sent_at" IS NULL AND "discarded_at" IS NULL`,
    );
  }

  public async down(): Promise<void> {
    // Pending and failed emails are operational records; preserve them on rollback.
  }
}
