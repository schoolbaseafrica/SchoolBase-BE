import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFirstSchoolOwner1790000000025 implements MigrationInterface {
  name = 'AddFirstSchoolOwner1790000000025';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "owner_user_id" uuid`,
    );
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_schools_owner_user_id') THEN
          ALTER TABLE "schools" ADD CONSTRAINT "FK_schools_owner_user_id"
            FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
        END IF;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "schools" DROP CONSTRAINT IF EXISTS "FK_schools_owner_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "schools" DROP COLUMN IF EXISTS "owner_user_id"`,
    );
  }
}
