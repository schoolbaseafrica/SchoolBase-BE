import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAssignmentAttachments1790000000017 implements MigrationInterface {
  name = 'AddAssignmentAttachments1790000000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."notifications_type_enum" ADD VALUE IF NOT EXISTS 'ASSIGNMENT'`,
    );
    await queryRunner.query(
      `CREATE TABLE "school_assignment_attachments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "assignment_id" uuid NOT NULL, "student_id" uuid, "object_key" text NOT NULL, "original_name" character varying(255) NOT NULL, "mime_type" character varying(120) NOT NULL, "size" integer NOT NULL, "uploaded_by" uuid NOT NULL, CONSTRAINT "UQ_school_assignment_attachment_object" UNIQUE ("object_key"), CONSTRAINT "PK_school_assignment_attachments" PRIMARY KEY ("id"), CONSTRAINT "FK_school_attachment_assignment" FOREIGN KEY ("assignment_id") REFERENCES "school_assignments"("id") ON DELETE CASCADE, CONSTRAINT "FK_school_attachment_student" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_school_assignment_attachment_owner" ON "school_assignment_attachments" ("assignment_id", "student_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_school_assignment_attachment_owner"`,
    );
    await queryRunner.query(`DROP TABLE "school_assignment_attachments"`);
  }
}
