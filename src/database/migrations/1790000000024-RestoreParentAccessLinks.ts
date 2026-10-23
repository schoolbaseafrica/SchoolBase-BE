import { MigrationInterface, QueryRunner } from 'typeorm';

export class RestoreParentAccessLinks1790000000024 implements MigrationInterface {
  name = 'RestoreParentAccessLinks1790000000024';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "parent_access_links" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "parent_id" uuid NOT NULL,
        "token_hash" varchar(255) NOT NULL,
        "created_by" uuid NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "used_at" timestamptz,
        "used_by_ip" varchar(45),
        "is_active" boolean NOT NULL DEFAULT true,
        "is_single_use" boolean NOT NULL DEFAULT true,
        "metadata" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_parent_access_links_token_hash" ON "parent_access_links" ("token_hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_parent_access_links_parent" ON "parent_access_links" ("parent_id", "created_at")`,
    );
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_parent_access_links_parent_id') THEN
          ALTER TABLE "parent_access_links" ADD CONSTRAINT "FK_parent_access_links_parent_id"
            FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_parent_access_links_created_by') THEN
          ALTER TABLE "parent_access_links" ADD CONSTRAINT "FK_parent_access_links_created_by"
            FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE;
        END IF;
      END $$
    `);
  }

  public async down(): Promise<void> {
    // Retain restored parent links and their audit history.
  }
}
