import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateClassroomCollaboration1790000000010 implements MigrationInterface {
  name = 'CreateClassroomCollaboration1790000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "virtual_classroom_whiteboard_pages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "classroom_id" uuid NOT NULL,
        "page_key" varchar(80) NOT NULL,
        "title" varchar(120) NOT NULL,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_virtual_classroom_whiteboard_pages" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_virtual_classroom_whiteboard_page" UNIQUE ("classroom_id", "page_key"),
        CONSTRAINT "FK_virtual_classroom_whiteboard_page_room" FOREIGN KEY ("classroom_id") REFERENCES "virtual_classroom_sessions"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "virtual_classroom_whiteboard_updates" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "classroom_id" uuid NOT NULL,
        "page_key" varchar(80) NOT NULL,
        "sequence" bigint NOT NULL,
        "update_data" bytea NOT NULL,
        "created_by" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_virtual_classroom_whiteboard_updates" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_virtual_classroom_whiteboard_update_sequence" UNIQUE ("classroom_id", "page_key", "sequence"),
        CONSTRAINT "FK_virtual_classroom_whiteboard_update_room" FOREIGN KEY ("classroom_id") REFERENCES "virtual_classroom_sessions"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "virtual_classroom_whiteboard_snapshots" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "classroom_id" uuid NOT NULL,
        "page_key" varchar(80) NOT NULL,
        "sequence" bigint NOT NULL,
        "state_data" bytea NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_virtual_classroom_whiteboard_snapshots" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_virtual_classroom_whiteboard_snapshot_sequence" UNIQUE ("classroom_id", "page_key", "sequence"),
        CONSTRAINT "FK_virtual_classroom_whiteboard_snapshot_room" FOREIGN KEY ("classroom_id") REFERENCES "virtual_classroom_sessions"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_virtual_classroom_whiteboard_updates_sync" ON "virtual_classroom_whiteboard_updates" ("classroom_id", "page_key", "sequence")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_virtual_classroom_whiteboard_snapshots_sync" ON "virtual_classroom_whiteboard_snapshots" ("classroom_id", "page_key", "sequence" DESC)`,
    );
    await queryRunner.query(`
      INSERT INTO "virtual_classroom_whiteboard_pages" ("classroom_id", "page_key", "title")
      SELECT id, 'main', 'Board 1' FROM "virtual_classroom_sessions"
      ON CONFLICT ("classroom_id", "page_key") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "virtual_classroom_whiteboard_snapshots"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "virtual_classroom_whiteboard_updates"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "virtual_classroom_whiteboard_pages"`,
    );
  }
}
