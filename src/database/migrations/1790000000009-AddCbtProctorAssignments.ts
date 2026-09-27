import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCbtProctorAssignments1790000000009 implements MigrationInterface {
  name = 'AddCbtProctorAssignments1790000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cbt_exam_proctors" (
        "exam_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "class_id" uuid NOT NULL,
        "assigned_by" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cbt_exam_proctors" PRIMARY KEY ("exam_id", "user_id", "class_id"),
        CONSTRAINT "FK_cbt_exam_proctors_exam" FOREIGN KEY ("exam_id") REFERENCES "cbt_exams"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cbt_exam_proctors_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cbt_exam_proctors_class" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cbt_exam_proctors_assigner" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cbt_exam_proctors_user" ON "cbt_exam_proctors" ("user_id", "exam_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "cbt_exam_proctors"`);
  }
}
