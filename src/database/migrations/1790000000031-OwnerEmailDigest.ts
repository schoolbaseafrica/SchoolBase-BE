import { MigrationInterface, QueryRunner } from 'typeorm';

export class OwnerEmailDigest1790000000031 implements MigrationInterface {
  name = 'OwnerEmailDigest1790000000031';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "owner_email_digest_preferences" (
      "school_id" uuid PRIMARY KEY REFERENCES "schools"("id") ON DELETE CASCADE,
      "enabled" boolean NOT NULL DEFAULT false,
      "frequency" varchar(10) NOT NULL DEFAULT 'daily',
      "categories" jsonb NOT NULL DEFAULT '["students","attendance","fees","assessments","staff"]'::jsonb,
      "period_start_at" timestamptz,
      "next_due_at" timestamptz,
      "last_sent_at" timestamptz,
      "attempts" integer NOT NULL DEFAULT 0,
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "CHK_owner_digest_frequency" CHECK ("frequency" IN ('daily', 'weekly')),
      CONSTRAINT "CHK_owner_digest_categories" CHECK (jsonb_typeof("categories") = 'array')
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_owner_digest_due" ON "owner_email_digest_preferences" ("next_due_at") WHERE "enabled" = true`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "owner_email_digest_preferences"`);
  }
}
