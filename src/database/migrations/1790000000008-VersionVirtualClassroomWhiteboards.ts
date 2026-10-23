import { MigrationInterface, QueryRunner } from 'typeorm';

export class VersionVirtualClassroomWhiteboards1790000000008 implements MigrationInterface {
  name = 'VersionVirtualClassroomWhiteboards1790000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "virtual_classroom_sessions" ADD COLUMN IF NOT EXISTS "whiteboard_version" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_virtual_classroom_schedule_start" ON "virtual_classroom_sessions" ("schedule_id", "starts_at") WHERE "status" <> 'cancelled'`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_virtual_classroom_participant_active" ON "virtual_classroom_participants" ("classroom_id", "user_id") WHERE "left_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_virtual_classroom_participant_active"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_virtual_classroom_schedule_start"`,
    );
    await queryRunner.query(
      `ALTER TABLE "virtual_classroom_sessions" DROP COLUMN IF EXISTS "whiteboard_version"`,
    );
  }
}
