import { MigrationInterface, QueryRunner } from 'typeorm';

export class IndexActivityLogFilters1790000000029 implements MigrationInterface {
  name = 'IndexActivityLogFilters1790000000029';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_activity_logs_entity_type" ON "activity_logs" ("entity_type")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_activity_logs_action" ON "activity_logs" ("action")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_activity_logs_action"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_activity_logs_entity_type"`,
    );
  }
}
