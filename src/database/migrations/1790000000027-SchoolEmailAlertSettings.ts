import { MigrationInterface, QueryRunner } from 'typeorm';

export class SchoolEmailAlertSettings1790000000027 implements MigrationInterface {
  name = 'SchoolEmailAlertSettings1790000000027';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const type of ['results', 'fees', 'attendance']) {
      await queryRunner.query(
        `ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "email_alert_${type}" boolean NOT NULL DEFAULT false`,
      );
    }
  }

  public async down(): Promise<void> {
    // Retain the school's saved choices during an application rollback.
  }
}
