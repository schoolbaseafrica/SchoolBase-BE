import { MigrationInterface, QueryRunner } from 'typeorm';

export class FeeDiscounts1790000000033 implements MigrationInterface {
  name = 'FeeDiscounts1790000000033';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "fee_discount_codes" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "code" varchar(48) NOT NULL UNIQUE,
      "kind" varchar(10) NOT NULL CHECK ("kind" IN ('PERCENT', 'AMOUNT')),
      "value" numeric(12,2) NOT NULL CHECK ("value" > 0),
      "session_id" uuid NOT NULL REFERENCES "academic_sessions"("id"),
      "term_id" uuid NOT NULL REFERENCES "terms"("id"),
      "expires_at" timestamptz,
      "max_uses" integer CHECK ("max_uses" IS NULL OR "max_uses" > 0),
      "is_active" boolean NOT NULL DEFAULT true,
      "created_by" uuid NOT NULL REFERENCES "users"("id"),
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "CHK_fee_discount_percentage" CHECK ("kind" <> 'PERCENT' OR "value" <= 100)
    )`);
    await queryRunner.query(`CREATE TABLE "fee_discount_redemptions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "code_id" uuid NOT NULL REFERENCES "fee_discount_codes"("id"),
      "student_id" uuid NOT NULL REFERENCES "students"("id"),
      "session_id" uuid NOT NULL REFERENCES "academic_sessions"("id"),
      "term_id" uuid NOT NULL REFERENCES "terms"("id"),
      "base_total" numeric(12,2) NOT NULL CHECK ("base_total" >= 0),
      "bill_fingerprint" text NOT NULL,
      "discount_amount" numeric(12,2) NOT NULL CHECK ("discount_amount" >= 0),
      "status" varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN ('ACTIVE','PENDING_REVIEW','REVOKED')),
      "applied_by" uuid NOT NULL REFERENCES "users"("id"),
      "applied_at" timestamptz NOT NULL DEFAULT now(),
      "reviewed_by" uuid REFERENCES "users"("id"),
      "reviewed_at" timestamptz,
      "review_reason" text,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_fee_discount_student_period" ON "fee_discount_redemptions" ("student_id", "session_id", "term_id") WHERE "status" <> 'REVOKED'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fee_discount_code_usage" ON "fee_discount_redemptions" ("code_id") WHERE "status" <> 'REVOKED'`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_fee_discount_code_student" ON "fee_discount_redemptions" ("code_id", "student_id")`,
    );
    await queryRunner.query(`CREATE TABLE "fee_discount_allocations" (
      "redemption_id" uuid NOT NULL REFERENCES "fee_discount_redemptions"("id"),
      "fee_id" uuid NOT NULL REFERENCES "fees"("id"),
      "amount" numeric(12,2) NOT NULL CHECK ("amount" >= 0),
      PRIMARY KEY ("redemption_id", "fee_id")
    )`);
    await queryRunner.query(`CREATE TABLE "fee_discount_reviews" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "redemption_id" uuid NOT NULL REFERENCES "fee_discount_redemptions"("id"),
      "old_base_total" numeric(12,2) NOT NULL,
      "proposed_base_total" numeric(12,2) NOT NULL,
      "proposed_fingerprint" text NOT NULL,
      "old_discount_amount" numeric(12,2) NOT NULL,
      "proposed_discount_amount" numeric(12,2) NOT NULL,
      "status" varchar(10) NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','APPROVED','REJECTED')),
      "reason" text NOT NULL,
      "requested_at" timestamptz NOT NULL DEFAULT now(),
      "decided_by" uuid REFERENCES "users"("id"),
      "decided_at" timestamptz,
      "decision_reason" text
    )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_fee_discount_pending_review" ON "fee_discount_reviews" ("redemption_id") WHERE "status" = 'PENDING'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "fee_discount_reviews"`);
    await queryRunner.query(`DROP TABLE "fee_discount_allocations"`);
    await queryRunner.query(`DROP TABLE "fee_discount_redemptions"`);
    await queryRunner.query(`DROP TABLE "fee_discount_codes"`);
  }
}
