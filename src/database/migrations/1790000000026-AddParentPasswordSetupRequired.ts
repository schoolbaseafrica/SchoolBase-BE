import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddParentPasswordSetupRequired1790000000026 implements MigrationInterface {
  name = 'AddParentPasswordSetupRequired1790000000026';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_setup_required" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `UPDATE "users" SET "password_setup_required" = true
       WHERE "reset_token" IS NOT NULL AND "password_setup_required" = false
         AND EXISTS (SELECT 1 FROM "parents" WHERE "parents"."user_id" = "users"."id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "password_setup_required"`,
    );
  }
}
