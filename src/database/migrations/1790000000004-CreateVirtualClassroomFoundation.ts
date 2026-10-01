import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVirtualClassroomFoundation1790000000004 implements MigrationInterface {
  name = 'CreateVirtualClassroomFoundation1790000000004';
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "virtual_classroom_sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "schedule_id" uuid NOT NULL, "class_id" uuid NOT NULL, "subject_id" uuid, "teacher_id" uuid NOT NULL, "session_id" uuid NOT NULL, "term_id" uuid, "title" varchar(255) NOT NULL, "starts_at" timestamptz NOT NULL, "ends_at" timestamptz NOT NULL, "status" varchar NOT NULL DEFAULT 'scheduled', "allow_student_chat" boolean NOT NULL DEFAULT true, "allow_student_draw" boolean NOT NULL DEFAULT false, "whiteboard_snapshot" jsonb, CONSTRAINT "PK_virtual_classroom_sessions" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_virtual_classroom_class" ON "virtual_classroom_sessions" ("class_id")`,
    );
    await queryRunner.query(
      `CREATE TABLE "virtual_classroom_participants" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "classroom_id" uuid NOT NULL, "user_id" uuid NOT NULL, "role" varchar NOT NULL, "joined_at" timestamptz NOT NULL, "left_at" timestamptz, "last_seen_at" timestamptz NOT NULL, CONSTRAINT "PK_virtual_classroom_participants" PRIMARY KEY ("id"), CONSTRAINT "FK_virtual_classroom_participant" FOREIGN KEY ("classroom_id") REFERENCES "virtual_classroom_sessions"("id") ON DELETE CASCADE)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_virtual_classroom_participant_room" ON "virtual_classroom_participants" ("classroom_id")`,
    );
    await queryRunner.query(
      `CREATE TABLE "virtual_classroom_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "classroom_id" uuid NOT NULL, "sender_id" uuid NOT NULL, "sender_role" varchar NOT NULL, "body" text NOT NULL, "deleted_at" timestamptz, CONSTRAINT "PK_virtual_classroom_messages" PRIMARY KEY ("id"), CONSTRAINT "FK_virtual_classroom_message" FOREIGN KEY ("classroom_id") REFERENCES "virtual_classroom_sessions"("id") ON DELETE CASCADE)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_virtual_classroom_message_room" ON "virtual_classroom_messages" ("classroom_id")`,
    );
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "virtual_classroom_messages"`);
    await queryRunner.query(`DROP TABLE "virtual_classroom_participants"`);
    await queryRunner.query(`DROP TABLE "virtual_classroom_sessions"`);
  }
}
