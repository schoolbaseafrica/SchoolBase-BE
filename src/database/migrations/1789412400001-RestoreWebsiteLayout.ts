import { MigrationInterface, QueryRunner } from 'typeorm';

export class RestoreWebsiteLayout1789412400001 implements MigrationInterface {
  name = 'RestoreWebsiteLayout1789412400001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "use_marketing_site" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "marketing_site_config" jsonb`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "schools"."use_marketing_site" IS 'When true, use the multi-page public website; when false, use the one-page website'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "schools"."marketing_site_config" IS 'Configuration for the multi-page public website'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "schools" DROP COLUMN IF EXISTS "marketing_site_config"`,
    );
    await queryRunner.query(
      `ALTER TABLE "schools" DROP COLUMN IF EXISTS "use_marketing_site"`,
    );
  }
}
