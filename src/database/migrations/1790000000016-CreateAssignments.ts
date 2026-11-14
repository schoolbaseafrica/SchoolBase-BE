import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAssignments1790000000016 implements MigrationInterface {
  name = 'CreateAssignments1790000000016';
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "school_assignment_status_enum" AS ENUM ('draft','published','closed','archived')`,
    );
    await queryRunner.query(
      `CREATE TYPE "school_assignment_submission_status_enum" AS ENUM ('draft','submitted','graded','returned')`,
    );
    await queryRunner.query(
      `CREATE TABLE "school_assignments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "title" character varying(180) NOT NULL, "instructions" text NOT NULL, "attachment_url" text, "due_at" TIMESTAMP WITH TIME ZONE, "total_marks" numeric(8,2) NOT NULL DEFAULT '100', "status" "school_assignment_status_enum" NOT NULL DEFAULT 'draft', "published_at" TIMESTAMP WITH TIME ZONE, "closed_at" TIMESTAMP WITH TIME ZONE, "class_id" uuid NOT NULL, "subject_id" uuid NOT NULL, "teacher_id" uuid NOT NULL, "academic_session_id" uuid NOT NULL, "academic_term_id" uuid, CONSTRAINT "PK_school_assignments" PRIMARY KEY ("id"), CONSTRAINT "FK_school_assignment_class" FOREIGN KEY ("class_id") REFERENCES "class"("id") ON DELETE RESTRICT, CONSTRAINT "FK_school_assignment_subject" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT, CONSTRAINT "FK_school_assignment_teacher" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT, CONSTRAINT "FK_school_assignment_session" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT, CONSTRAINT "FK_school_assignment_term" FOREIGN KEY ("academic_term_id") REFERENCES "terms"("id") ON DELETE RESTRICT)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_school_assignment_period" ON "school_assignments" ("class_id", "academic_session_id", "academic_term_id")`,
    );
    await queryRunner.query(
      `CREATE TABLE "school_assignment_submissions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "assignment_id" uuid NOT NULL, "student_id" uuid NOT NULL, "response_text" text, "attachment_url" text, "status" "school_assignment_submission_status_enum" NOT NULL DEFAULT 'draft', "submitted_at" TIMESTAMP WITH TIME ZONE, "is_late" boolean NOT NULL DEFAULT false, "marks_awarded" numeric(8,2), "feedback" text, "graded_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_school_assignment_student" UNIQUE ("assignment_id", "student_id"), CONSTRAINT "PK_school_assignment_submissions" PRIMARY KEY ("id"), CONSTRAINT "FK_school_submission_assignment" FOREIGN KEY ("assignment_id") REFERENCES "school_assignments"("id") ON DELETE CASCADE, CONSTRAINT "FK_school_submission_student" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT)`,
    );
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "school_assignment_submissions"`);
    await queryRunner.query(`DROP INDEX "IDX_school_assignment_period"`);
    await queryRunner.query(`DROP TABLE "school_assignments"`);
    await queryRunner.query(
      `DROP TYPE "school_assignment_submission_status_enum"`,
    );
    await queryRunner.query(`DROP TYPE "school_assignment_status_enum"`);
  }
}
