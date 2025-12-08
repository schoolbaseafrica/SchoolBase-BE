import { MigrationInterface, QueryRunner } from 'typeorm';

import {
  AttendanceType,
  EditRequestStatus,
} from '../../modules/attendance/enums/attendance-status.enum';

export class AddAttendanceAutoLock1764500000000 implements MigrationInterface {
  name = 'AddAttendanceAutoLock1764500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add is_locked column to schedule_based_attendance
    await queryRunner.query(`
      ALTER TABLE "schedule_based_attendance" 
      ADD COLUMN "is_locked" boolean NOT NULL DEFAULT false
    `);

    // Add is_locked column to student_daily_attendance
    await queryRunner.query(`
      ALTER TABLE "student_daily_attendance" 
      ADD COLUMN "is_locked" boolean NOT NULL DEFAULT false
    `);

    // Create attendance_edit_requests table
    await queryRunner.query(`
      CREATE TABLE "attendance_edit_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        "attendance_id" uuid NOT NULL,
        "attendance_type" character varying NOT NULL,
        "requested_by" uuid NOT NULL,
        "proposed_changes" jsonb NOT NULL,
        "reason" text NOT NULL,
        "status" character varying NOT NULL DEFAULT 'pending',
        "reviewed_by" uuid,
        "reviewed_at" TIMESTAMP,
        "admin_comment" text,
        CONSTRAINT "PK_attendance_edit_requests" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_attendance_type" CHECK ("attendance_type" IN ('${AttendanceType.SCHEDULE_BASED}', '${AttendanceType.DAILY}')),
        CONSTRAINT "CHK_status" CHECK ("status" IN ('${EditRequestStatus.PENDING}', '${EditRequestStatus.APPROVED}', '${EditRequestStatus.REJECTED}'))
      )
    `);

    // Create indexes
    await queryRunner.query(`
      CREATE INDEX "IDX_attendance_edit_requests_attendance" 
      ON "attendance_edit_requests" ("attendance_id", "attendance_type")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_attendance_edit_requests_requested_by" 
      ON "attendance_edit_requests" ("requested_by")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_attendance_edit_requests_status" 
      ON "attendance_edit_requests" ("status")
    `);

    // Add foreign key constraints
    await queryRunner.query(`
      ALTER TABLE "attendance_edit_requests" 
      ADD CONSTRAINT "FK_attendance_edit_requests_requested_by" 
      FOREIGN KEY ("requested_by") REFERENCES "users"("id") 
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "attendance_edit_requests" 
      ADD CONSTRAINT "FK_attendance_edit_requests_reviewed_by" 
      FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") 
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key constraints
    await queryRunner.query(`
      ALTER TABLE "attendance_edit_requests" 
      DROP CONSTRAINT "FK_attendance_edit_requests_reviewed_by"
    `);

    await queryRunner.query(`
      ALTER TABLE "attendance_edit_requests" 
      DROP CONSTRAINT "FK_attendance_edit_requests_requested_by"
    `);

    // Drop indexes
    await queryRunner.query(`
      DROP INDEX "IDX_attendance_edit_requests_status"
    `);

    await queryRunner.query(`
      DROP INDEX "IDX_attendance_edit_requests_requested_by"
    `);

    await queryRunner.query(`
      DROP INDEX "IDX_attendance_edit_requests_attendance"
    `);

    // Drop table
    await queryRunner.query(`
      DROP TABLE "attendance_edit_requests"
    `);

    // Remove is_locked columns
    await queryRunner.query(`
      ALTER TABLE "student_daily_attendance" 
      DROP COLUMN "is_locked"
    `);

    await queryRunner.query(`
      ALTER TABLE "schedule_based_attendance" 
      DROP COLUMN "is_locked"
    `);
  }
}
