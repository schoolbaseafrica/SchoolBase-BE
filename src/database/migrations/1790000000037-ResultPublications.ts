import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResultPublications1790000000037 implements MigrationInterface {
  name = 'ResultPublications1790000000037';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "result_publications" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "result_id" uuid NOT NULL REFERENCES "results"("id"),
      "revision" integer NOT NULL CHECK ("revision" > 0),
      "snapshot" jsonb NOT NULL,
      "grading_policy_version_id" uuid REFERENCES "grading_policy_versions"("id"),
      "template_id" varchar(80) NOT NULL,
      "template_version" integer NOT NULL CHECK ("template_version" > 0),
      "published_by" uuid NOT NULL REFERENCES "users"("id"),
      "published_at" timestamptz NOT NULL DEFAULT now(),
      "correction_reason" text,
      CONSTRAINT "UQ_result_publication_revision" UNIQUE ("result_id", "revision")
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_result_publications_latest"
      ON "result_publications" ("result_id", "revision" DESC)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    void queryRunner; // Published revisions are historical records; roll forward.
  }
}
