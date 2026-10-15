import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClassroomHealthEvents1790000000015 implements MigrationInterface {
  name = 'AddClassroomHealthEvents1790000000015';
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "virtual_classroom_health_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "classroom_id" uuid NOT NULL, "user_id" uuid NOT NULL, "category" varchar NOT NULL, "event_type" varchar NOT NULL, "severity" varchar NOT NULL DEFAULT 'info', "details" jsonb NOT NULL DEFAULT '{}', "occurred_at" timestamptz NOT NULL, CONSTRAINT "PK_virtual_classroom_health_events" PRIMARY KEY ("id"), CONSTRAINT "FK_virtual_classroom_health_room" FOREIGN KEY ("classroom_id") REFERENCES "virtual_classroom_sessions"("id") ON DELETE CASCADE)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_virtual_classroom_health_room_time" ON "virtual_classroom_health_events" ("classroom_id", "occurred_at" DESC)`,
    );
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "virtual_classroom_health_events"`);
  }
}
