import { MigrationInterface, QueryRunner } from 'typeorm';

export class RestoreExternalCbtWorkflow1790000000001 implements MigrationInterface {
  name = 'RestoreExternalCbtWorkflow1790000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "cbt_attempt_event_type_enum" ADD VALUE IF NOT EXISTS 'visibility_hidden'`,
    );
    await queryRunner.query(
      `ALTER TYPE "cbt_attempt_event_type_enum" ADD VALUE IF NOT EXISTS 'visibility_visible'`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cbt_intakes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "name" varchar(255) NOT NULL,
        "application_open_from" timestamptz,
        "application_open_to" timestamptz,
        "archived_at" timestamptz,
        CONSTRAINT "PK_cbt_intakes" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cbt_applicants" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "intake_id" uuid NOT NULL,
        "full_name" varchar(255) NOT NULL,
        "email" varchar(320) NOT NULL,
        "phone" varchar(40),
        "admitted_at" timestamptz,
        "student_id" uuid,
        CONSTRAINT "PK_cbt_applicants" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cbt_entrance_invites" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "applicant_id" uuid NOT NULL,
        "exam_id" uuid NOT NULL,
        "token" varchar(64) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        CONSTRAINT "PK_cbt_entrance_invites" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_cbt_applicant_intake_email" ON "cbt_applicants" ("intake_id", lower("email"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_cbt_entrance_invite_token" ON "cbt_entrance_invites" ("token")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cbt_entrance_invite_lookup" ON "cbt_entrance_invites" ("exam_id", "applicant_id", "expires_at")`,
    );
    await this.addForeignKey(
      queryRunner,
      'FK_cbt_applicants_intake',
      'cbt_applicants',
      'intake_id',
      'cbt_intakes',
      'CASCADE',
    );
    await this.addForeignKey(
      queryRunner,
      'FK_cbt_applicants_student',
      'cbt_applicants',
      'student_id',
      'students',
      'SET NULL',
    );
    await this.addForeignKey(
      queryRunner,
      'FK_cbt_entrance_invites_applicant',
      'cbt_entrance_invites',
      'applicant_id',
      'cbt_applicants',
      'CASCADE',
    );
    await this.addForeignKey(
      queryRunner,
      'FK_cbt_entrance_invites_exam',
      'cbt_entrance_invites',
      'exam_id',
      'cbt_exams',
      'CASCADE',
    );
    await this.addForeignKey(
      queryRunner,
      'FK_cbt_attempts_applicant',
      'cbt_attempts',
      'applicant_id',
      'cbt_applicants',
      'SET NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cbt_attempts" DROP CONSTRAINT IF EXISTS "FK_cbt_attempts_applicant"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "cbt_entrance_invites"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cbt_applicants"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cbt_intakes"`);
  }

  private async addForeignKey(
    queryRunner: QueryRunner,
    name: string,
    table: string,
    column: string,
    referencedTable: string,
    onDelete: 'CASCADE' | 'SET NULL',
  ) {
    await queryRunner
      .query(
        `ALTER TABLE "${table}" ADD CONSTRAINT "${name}" FOREIGN KEY ("${column}") REFERENCES "${referencedTable}"("id") ON DELETE ${onDelete}`,
      )
      .catch(() => undefined);
  }
}
