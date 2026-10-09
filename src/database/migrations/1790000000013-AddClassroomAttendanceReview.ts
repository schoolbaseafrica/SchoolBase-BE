import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClassroomAttendanceReview1790000000013 implements MigrationInterface {
  name = 'AddClassroomAttendanceReview1790000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "virtual_classroom_attendance_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "classroom_id" uuid NOT NULL, "user_id" uuid NOT NULL, "event_type" varchar NOT NULL, "occurred_at" timestamptz NOT NULL, CONSTRAINT "PK_virtual_classroom_attendance_events" PRIMARY KEY ("id"), CONSTRAINT "FK_virtual_classroom_attendance_event_room" FOREIGN KEY ("classroom_id") REFERENCES "virtual_classroom_sessions"("id") ON DELETE CASCADE)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_virtual_classroom_attendance_event_room_user" ON "virtual_classroom_attendance_events" ("classroom_id", "user_id", "occurred_at")`,
    );
    await queryRunner.query(
      `CREATE TABLE "virtual_classroom_attendance_adjustments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "classroom_id" uuid NOT NULL, "student_user_id" uuid NOT NULL, "status" varchar NOT NULL, "reason" text NOT NULL, "corrected_by" uuid NOT NULL, CONSTRAINT "PK_virtual_classroom_attendance_adjustments" PRIMARY KEY ("id"), CONSTRAINT "FK_virtual_classroom_attendance_adjustment_room" FOREIGN KEY ("classroom_id") REFERENCES "virtual_classroom_sessions"("id") ON DELETE CASCADE)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_virtual_classroom_attendance_adjustment_latest" ON "virtual_classroom_attendance_adjustments" ("classroom_id", "student_user_id", "created_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE "virtual_classroom_attendance_adjustments"`,
    );
    await queryRunner.query(`DROP TABLE "virtual_classroom_attendance_events"`);
  }
}
