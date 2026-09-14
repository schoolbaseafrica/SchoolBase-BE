import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateActivityLogsTable1789412400000 implements MigrationInterface {
  name = 'CreateActivityLogsTable1789412400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "activity_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "entity_type" character varying(100) NOT NULL,
        "entity_id" uuid NOT NULL,
        "action" character varying(20) NOT NULL,
        "description" text,
        "old_values" jsonb,
        "new_values" jsonb,
        "metadata" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_activity_logs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_activity_logs_created_at" ON "activity_logs" ("created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_activity_logs_user_id" ON "activity_logs" ("user_id")`,
    );
  }

  public async down(): Promise<void> {
    // The table predates this migration in restored school databases, so a
    // rollback must preserve it and its audit history.
  }
}
