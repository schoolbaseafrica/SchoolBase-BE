import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReportTemplateSettings1790000000039 implements MigrationInterface {
  name = 'ReportTemplateSettings1790000000039';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "report_template_settings" (
      "school_id" uuid PRIMARY KEY REFERENCES "schools"("id"),
      "template_id" varchar(80) NOT NULL CHECK ("template_id" IN ('schoolbase-current-default', 'academic-atlas')),
      "template_version" integer NOT NULL CHECK ("template_version" > 0),
      "updated_by" uuid NOT NULL REFERENCES "users"("id"),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "report_template_settings"`);
  }
}
