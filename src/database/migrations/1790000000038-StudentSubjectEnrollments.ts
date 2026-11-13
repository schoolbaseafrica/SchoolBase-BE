import { MigrationInterface, QueryRunner } from 'typeorm';

export class StudentSubjectEnrollments1790000000038 implements MigrationInterface {
  name = 'StudentSubjectEnrollments1790000000038';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "class_subjects" ADD COLUMN "is_elective" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(`CREATE TABLE "student_subject_enrollments" (
      "class_subject_id" uuid NOT NULL REFERENCES "class_subjects"("id") ON DELETE CASCADE,
      "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
      "term_id" uuid NOT NULL REFERENCES "terms"("id"),
      "created_at" timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY ("class_subject_id", "student_id", "term_id")
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_student_subject_enrollments_student_term"
      ON "student_subject_enrollments" ("student_id", "term_id")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "student_subject_enrollments"`);
    await queryRunner.query(
      `ALTER TABLE "class_subjects" DROP COLUMN "is_elective"`,
    );
  }
}
