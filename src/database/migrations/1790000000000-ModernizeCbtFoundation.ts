import { MigrationInterface, QueryRunner } from 'typeorm';

export class ModernizeCbtFoundation1790000000000 implements MigrationInterface {
  name = 'ModernizeCbtFoundation1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`DO $$ BEGIN
      CREATE TYPE "cbt_exam_type_enum" AS ENUM ('in_school', 'entrance');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await queryRunner.query(`DO $$ BEGIN
      CREATE TYPE "cbt_exam_status_enum" AS ENUM ('draft', 'published', 'archived');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await queryRunner.query(`DO $$ BEGIN
      CREATE TYPE "cbt_proctoring_mode_enum" AS ENUM ('none', 'human', 'recorded', 'both');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await queryRunner.query(`DO $$ BEGIN
      CREATE TYPE "cbt_question_type_enum" AS ENUM ('mcq', 'true_false', 'short_answer');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await queryRunner.query(
      `ALTER TYPE "cbt_question_type_enum" ADD VALUE IF NOT EXISTS 'multiple_response'`,
    );
    await queryRunner.query(
      `ALTER TYPE "cbt_question_type_enum" ADD VALUE IF NOT EXISTS 'essay'`,
    );
    await queryRunner.query(`DO $$ BEGIN
      CREATE TYPE "cbt_question_difficulty_enum" AS ENUM ('easy', 'medium', 'hard');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await queryRunner.query(`DO $$ BEGIN
      CREATE TYPE "cbt_attempt_status_enum" AS ENUM ('in_progress', 'submitted');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await queryRunner.query(`DO $$ BEGIN
      CREATE TYPE "cbt_attempt_event_type_enum" AS ENUM (
        'started', 'resumed', 'answer_saved', 'connection_lost',
        'connection_restored', 'submitted', 'auto_submitted'
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cbt_exams" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "name" varchar(255) NOT NULL,
        "instructions" text,
        "exam_type" "cbt_exam_type_enum" NOT NULL DEFAULT 'in_school',
        "term_id" uuid,
        "session_id" uuid,
        "intake_id" uuid,
        "subject_id" uuid,
        "time_limit_minutes" integer NOT NULL DEFAULT 60,
        "max_attempts" integer NOT NULL DEFAULT 1,
        "available_from" timestamptz,
        "available_to" timestamptz,
        "status" "cbt_exam_status_enum" NOT NULL DEFAULT 'draft',
        "created_by" uuid,
        "proctoring_mode" "cbt_proctoring_mode_enum" NOT NULL DEFAULT 'none',
        "pass_mark_percent" integer,
        CONSTRAINT "PK_cbt_exams" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "cbt_exams" ADD COLUMN IF NOT EXISTS "shuffle_questions" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "cbt_exams" ADD COLUMN IF NOT EXISTS "shuffle_options" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "cbt_exams" ADD COLUMN IF NOT EXISTS "show_result_immediately" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner
      .query(
        `ALTER TABLE "cbt_exams" ADD CONSTRAINT "CHK_cbt_exam_time_limit" CHECK ("time_limit_minutes" > 0) NOT VALID`,
      )
      .catch(() => undefined);
    await queryRunner
      .query(
        `ALTER TABLE "cbt_exams" ADD CONSTRAINT "CHK_cbt_exam_attempts" CHECK ("max_attempts" > 0) NOT VALID`,
      )
      .catch(() => undefined);
    await queryRunner
      .query(
        `ALTER TABLE "cbt_exams" ADD CONSTRAINT "CHK_cbt_exam_availability" CHECK ("available_from" IS NULL OR "available_to" IS NULL OR "available_to" > "available_from") NOT VALID`,
      )
      .catch(() => undefined);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cbt_exam_classes" (
        "exam_id" uuid NOT NULL,
        "class_id" uuid NOT NULL,
        CONSTRAINT "PK_cbt_exam_classes" PRIMARY KEY ("exam_id", "class_id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cbt_exam_classes_pair" ON "cbt_exam_classes" ("exam_id", "class_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cbt_exam_sections" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "exam_id" uuid NOT NULL,
        "title" varchar(255) NOT NULL,
        "instructions" text,
        "sort_order" integer NOT NULL DEFAULT 0,
        "question_limit" integer,
        CONSTRAINT "PK_cbt_exam_sections" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_cbt_exam_section_title" UNIQUE ("exam_id", "title"),
        CONSTRAINT "FK_cbt_exam_sections_exam" FOREIGN KEY ("exam_id") REFERENCES "cbt_exams"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cbt_questions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "exam_id" uuid,
        "type" "cbt_question_type_enum" NOT NULL DEFAULT 'mcq',
        "body" text NOT NULL,
        "options" jsonb,
        "correct_answer" varchar(500),
        "marks" numeric(8,2) NOT NULL DEFAULT 1,
        "sort_order" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_cbt_questions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "cbt_questions" ALTER COLUMN "exam_id" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "cbt_questions" ALTER COLUMN "correct_answer" TYPE text`,
    );
    await queryRunner.query(
      `ALTER TABLE "cbt_questions" ADD COLUMN IF NOT EXISTS "section_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "cbt_questions" ADD COLUMN IF NOT EXISTS "topic" varchar(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "cbt_questions" ADD COLUMN IF NOT EXISTS "difficulty" "cbt_question_difficulty_enum" NOT NULL DEFAULT 'medium'`,
    );
    await queryRunner.query(
      `ALTER TABLE "cbt_questions" ADD COLUMN IF NOT EXISTS "explanation" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "cbt_questions" ADD COLUMN IF NOT EXISTS "is_archived" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cbt_questions_exam_order" ON "cbt_questions" ("exam_id", "sort_order") WHERE "is_archived" = false`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cbt_attempts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "exam_id" uuid NOT NULL,
        "student_id" uuid,
        "applicant_id" uuid,
        "started_at" timestamptz NOT NULL,
        "submitted_at" timestamptz,
        "status" "cbt_attempt_status_enum" NOT NULL DEFAULT 'in_progress',
        "score" numeric(10,2),
        "metadata" jsonb,
        CONSTRAINT "PK_cbt_attempts" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "cbt_attempts" ADD COLUMN IF NOT EXISTS "last_saved_at" timestamptz`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cbt_attempt_student_exam" ON "cbt_attempts" ("student_id", "exam_id", "status")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cbt_answers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "attempt_id" uuid NOT NULL,
        "question_id" uuid NOT NULL,
        "selected_answer" text,
        "is_correct" boolean,
        "marks_awarded" numeric(8,2),
        CONSTRAINT "PK_cbt_answers" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "cbt_answers" ADD COLUMN IF NOT EXISTS "answer_data" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "cbt_answers" ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL DEFAULT 1`,
    );
    await queryRunner.query(
      `ALTER TABLE "cbt_answers" ADD COLUMN IF NOT EXISTS "saved_at" timestamptz`,
    );
    await queryRunner.query(
      `UPDATE "cbt_answers" SET "answer_data" = jsonb_build_object('value', "selected_answer"), "saved_at" = "updated_at" WHERE "answer_data" IS NULL AND "selected_answer" IS NOT NULL`,
    );
    await queryRunner.query(
      `DELETE FROM "cbt_answers" older USING "cbt_answers" newer WHERE older."attempt_id" = newer."attempt_id" AND older."question_id" = newer."question_id" AND (older."updated_at", older."id") < (newer."updated_at", newer."id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cbt_answer_attempt_question" ON "cbt_answers" ("attempt_id", "question_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cbt_attempt_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "attempt_id" uuid NOT NULL,
        "event_type" "cbt_attempt_event_type_enum" NOT NULL,
        "metadata" jsonb,
        CONSTRAINT "PK_cbt_attempt_events" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cbt_attempt_events_attempt" FOREIGN KEY ("attempt_id") REFERENCES "cbt_attempts"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cbt_attempt_events_timeline" ON "cbt_attempt_events" ("attempt_id", "created_at")`,
    );

    await this.addForeignKey(
      queryRunner,
      'FK_cbt_exam_classes_exam',
      'cbt_exam_classes',
      'exam_id',
      'cbt_exams',
    );
    await this.addForeignKey(
      queryRunner,
      'FK_cbt_exam_classes_class',
      'cbt_exam_classes',
      'class_id',
      'class',
    );
    await this.addForeignKey(
      queryRunner,
      'FK_cbt_questions_exam',
      'cbt_questions',
      'exam_id',
      'cbt_exams',
    );
    await this.addForeignKey(
      queryRunner,
      'FK_cbt_questions_section',
      'cbt_questions',
      'section_id',
      'cbt_exam_sections',
      'SET NULL',
    );
    await this.addForeignKey(
      queryRunner,
      'FK_cbt_attempts_exam',
      'cbt_attempts',
      'exam_id',
      'cbt_exams',
    );
    await this.addForeignKey(
      queryRunner,
      'FK_cbt_attempts_student',
      'cbt_attempts',
      'student_id',
      'students',
    );
    await this.addForeignKey(
      queryRunner,
      'FK_cbt_answers_attempt',
      'cbt_answers',
      'attempt_id',
      'cbt_attempts',
    );
    await this.addForeignKey(
      queryRunner,
      'FK_cbt_answers_question',
      'cbt_answers',
      'question_id',
      'cbt_questions',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "cbt_attempt_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cbt_exam_sections" CASCADE`);
    await queryRunner.query(
      `ALTER TABLE "cbt_answers" DROP COLUMN IF EXISTS "saved_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cbt_answers" DROP COLUMN IF EXISTS "revision"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cbt_answers" DROP COLUMN IF EXISTS "answer_data"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cbt_attempts" DROP COLUMN IF EXISTS "last_saved_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cbt_questions" DROP COLUMN IF EXISTS "is_archived"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cbt_questions" DROP COLUMN IF EXISTS "explanation"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cbt_questions" DROP COLUMN IF EXISTS "difficulty"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cbt_questions" DROP COLUMN IF EXISTS "topic"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cbt_questions" DROP COLUMN IF EXISTS "section_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cbt_exams" DROP COLUMN IF EXISTS "show_result_immediately"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cbt_exams" DROP COLUMN IF EXISTS "shuffle_options"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cbt_exams" DROP COLUMN IF EXISTS "shuffle_questions"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "cbt_attempt_event_type_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "cbt_question_difficulty_enum"`,
    );
  }

  private async addForeignKey(
    queryRunner: QueryRunner,
    constraint: string,
    table: string,
    column: string,
    targetTable: string,
    onDelete = 'CASCADE',
  ) {
    await queryRunner.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${constraint}') THEN
        ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}"
        FOREIGN KEY ("${column}") REFERENCES "${targetTable}"("id") ON DELETE ${onDelete};
      END IF;
    END $$`);
  }
}
