import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAssignmentReminders1790000000018 implements MigrationInterface {
  name = 'AddAssignmentReminders1790000000018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "school_assignment_reminders" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "assignment_id" uuid NOT NULL, "student_id" uuid NOT NULL, "type" character varying(20) NOT NULL, "sent_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_school_assignment_reminder" UNIQUE ("assignment_id", "student_id", "type"), CONSTRAINT "PK_school_assignment_reminders" PRIMARY KEY ("id"), CONSTRAINT "FK_school_assignment_reminder_assignment" FOREIGN KEY ("assignment_id") REFERENCES "school_assignments"("id") ON DELETE CASCADE, CONSTRAINT "FK_school_assignment_reminder_student" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "school_assignment_reminders"`);
  }
}
