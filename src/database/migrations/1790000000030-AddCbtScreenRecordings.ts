import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCbtScreenRecordings1790000000030 implements MigrationInterface {
  name = 'AddCbtScreenRecordings1790000000030';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "cbt_screen_recordings" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      "attempt_id" uuid NOT NULL,
      "recording_id" uuid NOT NULL,
      "part_number" integer NOT NULL,
      "object_key" text NOT NULL,
      "mime_type" varchar(64) NOT NULL,
      "byte_size" integer NOT NULL,
      "duration_ms" integer NOT NULL,
      CONSTRAINT "PK_cbt_screen_recordings" PRIMARY KEY ("id"),
      CONSTRAINT "FK_cbt_screen_recordings_attempt" FOREIGN KEY ("attempt_id") REFERENCES "cbt_attempts"("id") ON DELETE CASCADE,
      CONSTRAINT "UQ_cbt_screen_recordings_part" UNIQUE ("attempt_id", "recording_id", "part_number")
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_cbt_screen_recordings_attempt" ON "cbt_screen_recordings" ("attempt_id", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "cbt_screen_recordings"`);
  }
}
