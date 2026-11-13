import { MigrationInterface, QueryRunner } from 'typeorm';

export class GradingPolicyVersions1790000000036 implements MigrationInterface {
  name = 'GradingPolicyVersions1790000000036';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "grading_policy_versions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "policy_key" uuid NOT NULL,
      "version" integer NOT NULL CHECK ("version" > 0),
      "session_id" uuid NOT NULL REFERENCES "academic_sessions"("id"),
      "term_id" uuid NOT NULL REFERENCES "terms"("id"),
      "class_id" uuid REFERENCES "class"("id"),
      "status" varchar(12) NOT NULL CHECK ("status" IN ('DRAFT','ACTIVE','SUPERSEDED')),
      "definition" jsonb NOT NULL,
      "created_by" uuid NOT NULL REFERENCES "users"("id"),
      "activated_by" uuid REFERENCES "users"("id"),
      "activated_at" timestamptz,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_grading_policy_version" UNIQUE ("policy_key", "version")
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_grading_policy_active_default"
      ON "grading_policy_versions" ("term_id") WHERE "status" = 'ACTIVE' AND "class_id" IS NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_grading_policy_active_class"
      ON "grading_policy_versions" ("term_id", "class_id") WHERE "status" = 'ACTIVE' AND "class_id" IS NOT NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_grading_policy_draft_default"
      ON "grading_policy_versions" ("term_id") WHERE "status" = 'DRAFT' AND "class_id" IS NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_grading_policy_draft_class"
      ON "grading_policy_versions" ("term_id", "class_id") WHERE "status" = 'DRAFT' AND "class_id" IS NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "grades" ADD COLUMN "grading_policy_version_id" uuid REFERENCES "grading_policy_versions"("id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "results" ADD COLUMN "grading_policy_version_id" uuid REFERENCES "grading_policy_versions"("id")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Policy versions and their references are historical records. Roll forward instead.
    void queryRunner;
  }
}
